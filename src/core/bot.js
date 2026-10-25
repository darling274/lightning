import { EventEmitter } from "node:events"
import pino from "pino"
import { Browsers, DisconnectReason, fetchLatestBaileysVersion, S_WHATSAPP_NET } from "../vendor/baileys/index.js"
import { makeMiniwaSocket } from "../socket/make-socket.js"
import { useSafeAuthState, useMongoAuthState } from "../session/index.js"
import { MongoStore } from "../db/mongo-store.js"
import { connectMongo } from "../db/connect.js"
import { UpsertRecorder } from "../inspect/upserts.js"
import { MessageStore } from "./store.js"
import { SendQueue } from "./queue.js"
import { MiniwaError } from "./errors.js"
import { makeGroups, makeCommunities, makeChannels, makeAccount, makeBusiness, makeStatus } from "../api/facades.js"
import { serialize } from "../serialize.js"

const sleep = ms => new Promise(r => setTimeout(r, ms))
const digits = s => String(s || "").split("@")[0].split(":")[0].replace(/\D/g, "")

export const State = Object.freeze({
  IDLE: "idle", CONNECTING: "connecting", OPEN: "open",
  RECONNECTING: "reconnecting", CLOSED: "closed", LOGGED_OUT: "logged_out"
})

const DEFAULTS = {
  session: "session",
  pairingNumber: null,
  customPairingCode: null,     
  auth: null,              
  store: null,
  mongo: null,
  debug: { upserts: false },
  ignoreOld: true,
  ignoreSelf: true,
  browser: ["Ubuntu", "Chrome", "22.04.4"],
  minBackoff: 1000,
  maxBackoff: 30_000,
  maxReconnectAttempts: Infinity,
  connectWatchdogMs: 90_000,
  heartbeatMs: 45_000,
  heartbeatTimeoutMs: 20_000,
  heartbeatMaxMisses: 2,
  versionTtlMs: 6 * 3600_000,
  versionTimeoutMs: 5000,
  reconnectOnReplaced: false,
  sendDelay: 350,
  sendJitter: 150,
  maxStoredMessages: 5000,
  shutdownSignals: true,
  socket: {}
}


export class Bot extends EventEmitter {
  constructor(options = {}) {
    super()
    this.options = { ...DEFAULTS, ...options, debug: { ...DEFAULTS.debug, ...options.debug } }
    this.logger = options.logger || pino({ level: "silent" })
    this.state = State.IDLE
    this.sock = null
    this.store = options.store || new MessageStore({ maxMessages: this.options.maxStoredMessages })
    this.upserts = this.store.recorder || new UpsertRecorder({ logger: this.logger })
    this.queue = new SendQueue({ minDelay: this.options.sendDelay, jitter: this.options.sendJitter })
    this.ev = new EventEmitter().setMaxListeners(0)
    this.stats = { startedAt: 0, connectedAt: 0, reconnects: 0, received: 0, sent: 0, errors: 0 }
    this._attempts = 0
    this._epoch = 0
    this._pairingAsked = false
    this._seen = new Set()
    this._auth = null
    this._conn = null
    this._watchdog = null
    this._heartbeat = null
    this._misses = 0
    this._version = null
    this._signalsBound = false
    this.#wireRecorder()

    const live = new Proxy({}, {
      get: (_, k) => { const v = this.sock?.[k]; return typeof v === "function" ? v.bind(this.sock) : v }
    })
    this.groups = makeGroups(live)
    this.communities = makeCommunities(live)
    this.channels = makeChannels(live)
    this.account = makeAccount(live)
    this.business = makeBusiness(live)
    this.status = makeStatus(live)
  }

  async send(jid, content, options) {
    if (this.state !== State.OPEN) throw new MiniwaError("Bot is not connected", "NOT_CONNECTED")
    const key = Array.isArray(jid) ? "status@broadcast" : jid
    const msg = await this.queue.run(key, () => this.sock.sendMessage(jid, content, options))
    this.stats.sent++
    if (msg?.key) this.store.saveMessage(msg)
    return msg
  }

  async typing(jid, ms = 800, kind = "composing") {
    await this.sock.sendPresenceUpdate(kind, jid)
    await sleep(ms)
    await this.sock.sendPresenceUpdate("paused", jid)
  }

  async groupMetadata(jid) {
    const cached = this.store.getGroup(jid)
    if (cached) return cached
    const meta = await this.sock.groupMetadata(jid)
    this.store.setGroup(jid, meta)
    return meta
  }

  health() {
    return {
      state: this.state,
      user: this.sock?.user?.id || null,
      uptimeMs: this.stats.connectedAt ? Date.now() - this.stats.connectedAt : 0,
      queuePending: this.queue.pending,
      storedMessages: this.store.cache?.messages?.size ?? this.store.messages?.size ?? 0,
      store: this.store.stats?.() ?? null,
      upserts: this.upserts.stats(),
      ...this.stats
    }
  }

  async start() {
    if (this.state === State.CONNECTING || this.state === State.OPEN) return this
    this.stats.startedAt = Date.now()
    await this.#prepare()
    if (!this._auth.state.creds.registered && !this.options.pairingNumber) {
      throw new MiniwaError("New session: set pairingNumber to link with a pairing code", "PAIRING_REQUIRED")
    }
    if (this.options.shutdownSignals) this.#bindSignals()
    await this.#connect()
    return this
  }

  async stop() {
    this.#setState(State.CLOSED)
    this._epoch++
    clearTimeout(this._watchdog)
    this.#stopHeartbeat()
    try { this.sock?.end(undefined) } catch {}
    await this.#teardown()
  }

  async logout() {
    try { await this.sock?.logout() } catch {}
    await this._auth?.clear()
    this.#setState(State.LOGGED_OUT)
    this._epoch++
    await this.#teardown()
  }

  async #prepare() {
    const o = this.options
    if (o.mongo && !o.auth) {
      this._conn = await connectMongo(o.mongo)
      this._auth = await useMongoAuthState({ db: this._conn.db, session: o.session, collectionName: o.mongo.authCollection, logger: this.logger })
      if (!o.store) {
        this.store = await MongoStore.create({ db: this._conn.db, session: o.session, logger: this.logger, ...o.mongo.store })
        this.upserts = this.store.recorder
        this.#wireRecorder()
      }
    } else {
      this._auth = o.auth || await useSafeAuthState(o.session, { logger: this.logger })
    }
    const dbg = o.debug?.upserts
    if (dbg) this.upserts.print = dbg
  }

  #wireRecorder() {
    if (!Bot._wired) Bot._wired = new WeakMap()
    if (Bot._wired.get(this.upserts) === this) return
    Bot._wired.set(this.upserts, this)
    this.upserts.onEntry(e => this.emit("upsert", e))
  }

  async #teardown() {
    try { await this.store.flush?.() } catch {}
    try { await this._auth?.flush?.() } catch {}
    if (this._conn) {
      try { await this.store.close?.() } catch {}
      try { await this._conn.close() } catch {}
      this._conn = null
    }
  }

  #setState(next) {
    if (this.state === next) return
    const prev = this.state
    this.state = next
    this.emit("state", next, prev)
  }

  #bindSignals() {
    if (this._signalsBound) return
    this._signalsBound = true
    const bye = async sig => { this.emit("shutdown", sig); await this.stop(); process.exit(0) }
    process.once("SIGINT", () => bye("SIGINT"))
    process.once("SIGTERM", () => bye("SIGTERM"))
  }

  async #connect() {
    const epoch = ++this._epoch
    this.#setState(this._attempts ? State.RECONNECTING : State.CONNECTING)
    const o = this.options
    const version = await this.#resolveVersion()

    const sock = makeMiniwaSocket({
      version,
      logger: this.logger,
      browser: o.browser?.length ? o.browser : Browsers.ubuntu("Chrome"),
      auth: this._auth,
      store: this.store,
      upserts: this.upserts,
      ...o.socket
    })
    this.sock = sock

    clearTimeout(this._watchdog)
    this._watchdog = setTimeout(() => {
      if (epoch === this._epoch && this.state !== State.OPEN) {
        this.emit("watchdog", { epoch })
        try { sock.end(new Error("connect watchdog")) } catch {}
      }
    }, o.connectWatchdogMs)

    sock.ev.on("connection.update", u => { if (epoch === this._epoch) this.#onConnection(sock, u, epoch).catch(e => this.emit("error", e)) })
    sock.ev.on("messages.upsert", ({ messages, type }) => {
      if (epoch !== this._epoch || type !== "notify") return
      for (const raw of messages) this.#handle(raw)
    })
    sock.ev.process(events => { if (epoch === this._epoch) for (const [name, data] of Object.entries(events)) this.ev.emit(name, data) })

    const fwd = (from, to, fn = x => x) => sock.ev.on(from, d => epoch === this._epoch && this.emit(to, fn(d)))
    fwd("group-participants.update", "participants", d => { this.store.dropGroup(d.id); return d })
    fwd("groups.update", "groups", d => { for (const g of d) this.store.dropGroup(g.id); return d })
    fwd("groups.upsert", "groups.new")
    fwd("call", "call")
    fwd("messages.update", "message.update")
    fwd("messages.delete", "message.delete")
    fwd("messages.reaction", "reaction")
    fwd("presence.update", "presence")
    fwd("contacts.update", "contacts")
    fwd("chats.update", "chats")
    fwd("newsletter.reaction", "channel.reaction")
    fwd("newsletter.view", "channel.view")
    fwd("newsletter-participants.update", "channel.participants")
    fwd("newsletter-settings.update", "channel.settings")
  }

  async #resolveVersion() {
    const o = this.options
    const v = this._version
    if (v && Date.now() - v.at < o.versionTtlMs) return v.version
    try {
      const res = await Promise.race([
        fetchLatestBaileysVersion(),
        sleep(o.versionTimeoutMs).then(() => { throw new Error("version timeout") })
      ])
      if (res?.version?.length === 3) { this._version = { version: res.version, at: Date.now() }; return res.version }
    } catch (e) { this.logger.warn?.({ err: e.message }, "version lookup failed, using cached/bundled version") }
    return v?.version
  }

  #startHeartbeat(sock, epoch) {
    const o = this.options
    this.#stopHeartbeat()
    if (!o.heartbeatMs) return
    this._misses = 0
    this._heartbeat = setInterval(async () => {
      if (epoch !== this._epoch || this.state !== State.OPEN) return
      try {
        await sock.query({
          tag: "iq",
          attrs: { to: S_WHATSAPP_NET, type: "get", xmlns: "w:p" },
          content: [{ tag: "ping", attrs: {} }]
        }, o.heartbeatTimeoutMs)
        this._misses = 0
      } catch (e) {
        this._misses++
        this.emit("heartbeat.miss", { misses: this._misses, error: e })
        if (this._misses >= o.heartbeatMaxMisses) {
          this.#stopHeartbeat()
          this.emit("zombie", { epoch })
          try { sock.end(new Error("heartbeat lost")) } catch {}
        }
      }
    }, o.heartbeatMs)
    this._heartbeat.unref?.()
  }

  #stopHeartbeat() { clearInterval(this._heartbeat); this._heartbeat = null }

  async #onConnection(sock, update, epoch) {
    const { connection, lastDisconnect, qr } = update
    const o = this.options

    if (qr && o.pairingNumber && !sock.authState.creds.registered && !this._pairingAsked) {
      this._pairingAsked = true
      try { this.emit("pairing", await sock.requestPairingCode(digits(o.pairingNumber), o.customPairingCode || undefined)) }
      catch (e) { this._pairingAsked = false; this.emit("error", e) }
    }

    if (connection === "open") {
      clearTimeout(this._watchdog)
      if (this._attempts) this.stats.reconnects++
      this._attempts = 0
      this._pairingAsked = false
      this.stats.connectedAt = Date.now()
      this.#setState(State.OPEN)
      this.#startHeartbeat(sock, epoch)
      this.emit("ready", sock.user)
    }

    if (connection === "close") {
      clearTimeout(this._watchdog)
      this.#stopHeartbeat()
      const code = lastDisconnect?.error?.output?.statusCode
      this.emit("close", code, lastDisconnect?.error)
      if (this.state === State.CLOSED || this.state === State.LOGGED_OUT) return

      if (code === DisconnectReason.loggedOut) {
        await this._auth.clear()
        this.#setState(State.LOGGED_OUT)
        this.emit("logout")
        await this.#teardown()
        return
      }
      const fatalCodes = [DisconnectReason.forbidden, DisconnectReason.multideviceMismatch]
      if (!o.reconnectOnReplaced) fatalCodes.push(DisconnectReason.connectionReplaced)
      if (fatalCodes.includes(code)) {
        this.#setState(State.CLOSED); this.emit("fatal", code); return
      }
      if (this._attempts >= o.maxReconnectAttempts) { this.#setState(State.CLOSED); this.emit("fatal", "max_attempts"); return }

      const base = code === DisconnectReason.restartRequired ? 0 : Math.min(o.minBackoff * 2 ** this._attempts, o.maxBackoff)
      const delay = base ? base + Math.random() * 500 : 0
      this._attempts++
      this.#setState(State.RECONNECTING)
      this.emit("reconnecting", { code, delay, attempt: this._attempts })
      await sleep(delay)
      if (epoch === this._epoch && this.state === State.RECONNECTING) await this.#connect()
    }
  }

  #handle(raw) {
    try {
      if (!raw.message || raw.key.remoteJid === "status@broadcast") return
      const o = this.options
      if (o.ignoreOld && Number(raw.messageTimestamp) < Math.floor(this.stats.startedAt / 1000) - 5) return
      if (o.ignoreSelf && raw.key.fromMe) return
      const id = raw.key.id
      if (this._seen.has(id)) return
      this._seen.add(id)
      if (this._seen.size > 3000) this._seen.delete(this._seen.values().next().value)
      this.stats.received++
      this.emit("message", serialize(this, raw))
    } catch (e) { this.stats.errors++; this.emit("error", e) }
  }
}
