import { BufferJSON } from "../vendor/baileys/index.js"
import { MessageStore } from "../core/store.js"
import { UpsertRecorder, summarizeUpsert } from "../inspect/upserts.js"
import { connectMongo } from "./connect.js"

const plain = v => JSON.parse(JSON.stringify(v, BufferJSON.replacer))
const revive = s => JSON.parse(s, BufferJSON.reviver)

export class MongoStore {
  /**
   * @param {{ uri?:string, dbName?:string, db?:any, session?:string, prefix?:string,
   *           messageTtlDays?:number, upsertTtlDays?:number, flushMs?:number, maxBatch?:number,
   *           logUpserts?:boolean, memoryMessages?:number, logger?:any }} opts
   */
  static async create(opts = {}) {
    const s = new MongoStore(opts)
    await s.init()
    return s
  }

  constructor(opts = {}) {
    this.opts = { prefix: "darling", flushMs: 500, maxBatch: 200, logUpserts: true, memoryMessages: 2000, ...opts }
    this.session = opts.session ?? "default"
    this.logger = opts.logger
    this.cache = new MessageStore({ maxMessages: this.opts.memoryMessages })
    this.recorder = new UpsertRecorder({ logger: opts.logger })
    this.queue = new Map()
    this.timer = null
    this.stats_ = { written: 0, flushes: 0, errors: 0 }
    this._conn = null
  }

  async init() {
    const o = this.opts
    let db = o.db
    if (!db) { this._conn = await connectMongo({ uri: o.uri, dbName: o.dbName, clientOptions: o.clientOptions }); db = this._conn.db }
    this.db = db
    const c = n => db.collection(`${o.prefix}${n}`)
    this.messages = c("messages"); this.chats = c("chats"); this.contacts = c("contacts"); this.groups = c("groups"); this.upserts = c("upserts")
    const ttl = d => (d ? { expireAfterSeconds: Math.round(d * 86400) } : {})
    await Promise.all([
      this.messages.createIndex({ session: 1, chat: 1, id: 1 }, { unique: true }),
      this.messages.createIndex({ session: 1, chat: 1, timestamp: -1 }),
      this.messages.createIndex({ savedAt: 1 }, ttl(o.messageTtlDays)),
      this.chats.createIndex({ session: 1, id: 1 }, { unique: true }),
      this.contacts.createIndex({ session: 1, id: 1 }, { unique: true }),
      this.groups.createIndex({ session: 1, id: 1 }, { unique: true }),
      this.upserts.createIndex({ session: 1, at: -1 }),
      this.upserts.createIndex({ at: 1 }, ttl(o.upsertTtlDays))
    ])
    if (o.logUpserts) this.recorder.addSink(e => this.#enqueue(`u:${this.session}:${e.seq}:${Date.now()}`, this.upserts, { insertOne: { document: { ...e, session: this.session } } }))
    return this
  }

  saveMessage(msg) {
    if (!msg?.key?.id || !msg.message) return
    this.cache.saveMessage(msg)
    const chat = msg.key.remoteJid, id = msg.key.id
    const s = summarizeUpsert(msg)
    this.#enqueue(`m:${chat}:${id}`, this.messages, {
      updateOne: {
        filter: { session: this.session, chat, id },
        update: { $set: { fromMe: s.fromMe, sender: s.sender, msgType: s.msgType, text: s.text.slice(0, 2000), pushName: s.pushName, timestamp: s.messageTimestamp, raw: JSON.stringify(msg, BufferJSON.replacer), savedAt: new Date() } },
        upsert: true
      }
    })
  }

  async getMessage(key) {
    const hit = this.cache.getMessage(key)
    if (hit) return hit
    const doc = await this.messages.findOne({ session: this.session, chat: key.remoteJid, id: key.id }, { projection: { raw: 1 } })
    if (!doc) return undefined
    const msg = revive(doc.raw)
    this.cache.saveMessage(msg)
    return msg.message
  }

  setGroup(jid, meta) { this.cache.setGroup(jid, meta); this.#enqueue(`g:${jid}`, this.groups, { updateOne: { filter: { session: this.session, id: jid }, update: { $set: { data: plain(meta), updatedAt: new Date() } }, upsert: true } }) }
  getGroup(jid) { return this.cache.getGroup(jid) }
  dropGroup(jid) { this.cache.dropGroup(jid) }

  async loadMessages(chat, { limit = 25, before } = {}) {
    const q = { session: this.session, chat, ...(before ? { timestamp: { $lt: before } } : {}) }
    const docs = await this.messages.find(q, { projection: { raw: 1 } }).sort({ timestamp: -1 }).limit(limit).toArray()
    return docs.map(d => revive(d.raw)).reverse()
  }
  async recentUpserts({ limit = 20, chat, msgType, since } = {}) {
    const q = { session: this.session, ...(chat ? { chat } : {}), ...(msgType ? { msgType } : {}), ...(since ? { at: { $gt: since } } : {}) }
    return (await this.upserts.find(q).sort({ at: -1, seq: -1 }).limit(limit).toArray()).reverse()
  }
  async countMessages(chat) { return this.messages.countDocuments({ session: this.session, ...(chat ? { chat } : {}) }) }
  stats() { return { ...this.stats_, pending: this.queue.size, memory: this.cache.messages.size } }

  /** Bind to a Baileys emitter. Returns an unbind function. */
  bind(ev) {
    const on = (name, fn) => { ev.on(name, fn); return () => ev.off(name, fn) }
    const offs = [
      on("messages.upsert", u => { this.recorder.record(u); for (const m of u.messages) this.saveMessage(m) }),
      on("messages.update", list => { for (const { key, update } of list) if (update?.status !== undefined) this.#enqueue(`s:${key.remoteJid}:${key.id}`, this.messages, { updateOne: { filter: { session: this.session, chat: key.remoteJid, id: key.id }, update: { $set: { status: update.status, updatedAt: new Date() } } } }) }),
      on("messages.delete", d => { if (d.keys) for (const k of d.keys) this.#enqueue(`d:${k.remoteJid}:${k.id}`, this.messages, { deleteOne: { filter: { session: this.session, chat: k.remoteJid, id: k.id } } }); else if (d.all && d.jid) this.#enqueue(`da:${d.jid}`, this.messages, { deleteMany: { filter: { session: this.session, chat: d.jid } } }) }),
      on("chats.upsert", l => this.#upsertMany(this.chats, l)),
      on("chats.update", l => this.#upsertMany(this.chats, l)),
      on("contacts.upsert", l => this.#upsertMany(this.contacts, l)),
      on("contacts.update", l => this.#upsertMany(this.contacts, l)),
      on("groups.upsert", l => { for (const g of l) this.setGroup(g.id, g) }),
      on("messaging-history.set", h => { this.#upsertMany(this.chats, h.chats || []); this.#upsertMany(this.contacts, h.contacts || []); for (const m of h.messages || []) this.saveMessage(m) })
    ]
    return () => offs.forEach(f => f())
  }

  #upsertMany(col, list) {
    for (const item of list || []) if (item?.id) this.#enqueue(`${col.collectionName}:${item.id}`, col, { updateOne: { filter: { session: this.session, id: item.id }, update: { $set: Object.fromEntries(Object.entries(plain(item)).map(([k, v]) => [`data.${k}`, v])) }, upsert: true } })
  }

  #enqueue(id, col, op) {
    this.queue.set(id, { col, op })
    if (this.queue.size >= this.opts.maxBatch) return void this.flush()
    if (!this.timer) { this.timer = setTimeout(() => this.flush(), this.opts.flushMs); this.timer.unref?.() }
  }

  async flush() {
    clearTimeout(this.timer); this.timer = null
    if (!this.queue.size) return
    const batch = [...this.queue.values()]; this.queue.clear()
    const by = new Map()
    for (const { col, op } of batch) (by.get(col) || by.set(col, []).get(col)).push(op)
    for (const [col, ops] of by) {
      try { await col.bulkWrite(ops, { ordered: true }); this.stats_.written += ops.length; this.stats_.flushes++ }
      catch (e) { this.stats_.errors++; this.logger?.warn?.({ err: e.message, col: col.collectionName }, "mongo flush failed") }
    }
  }

  async close() { await this.flush(); await this._conn?.close() }
}
