import pino from "pino"
import makeWASocket, { Browsers, makeCacheableSignalKeyStore } from "../vendor/baileys/index.js"
import { extendSocket } from "../messages/extender.js"
import { extendApi } from "../api/extras.js"
import { makeGroups, makeCommunities, makeChannels, makeAccount, makeBusiness, makeStatus } from "../api/facades.js"
import { MessageStore } from "../core/store.js"
import { UpsertRecorder } from "../inspect/upserts.js"


export function makeMiniwaSocket(config = {}) {
  const { auth, store, upserts = {}, extend = true, cacheKeys = true, logger = pino({ level: "silent" }), ...rest } = config
  if (!auth) throw new Error("makeMiniwaSocket: `auth` is required (use useSafeAuthState / useMongoAuthState)")

  const wrapped = auth.state ? auth : null
  const state = wrapped ? wrapped.state : auth
  const keys = cacheKeys ? makeCacheableSignalKeyStore(state.keys, logger) : state.keys
  const memory = store || new MessageStore()

  const sock = makeWASocket({
    logger,
    browser: Browsers.ubuntu("Chrome"),
    printQRInTerminal: false,
    markOnlineOnConnect: false,
    syncFullHistory: false,
    keepAliveIntervalMs: 25_000,
    connectTimeoutMs: 60_000,
    defaultQueryTimeoutMs: 60_000,
    retryRequestDelayMs: 250,
    maxMsgRetryCount: 5,
    getMessage: async key => memory.getMessage(key),
    cachedGroupMetadata: async jid => memory.getGroup(jid),
    ...rest,
    auth: { creds: state.creds, keys }
  })

  const patched = extend ? extendApi(extendSocket(sock, { logger }), { logger }) : sock

  if (wrapped?.saveCreds) patched.ev.on("creds.update", wrapped.saveCreds)

  let recorder
  if (store?.bind) { store.bind(patched.ev); recorder = store.recorder; if (!(upserts instanceof UpsertRecorder)) { if (upserts.print !== undefined) recorder.print = upserts.print; if (upserts.size) recorder.size = upserts.size } }
  else {
    patched.ev.on("messages.upsert", ({ messages }) => { for (const m of messages) memory.saveMessage(m) })
    patched.ev.on("group-participants.update", d => memory.dropGroup(d.id))
    patched.ev.on("groups.update", d => { for (const g of d) memory.dropGroup(g.id) })
    recorder = upserts instanceof UpsertRecorder ? upserts : new UpsertRecorder(upserts)
    recorder.attach(patched.ev)
  }

  patched.upserts = recorder
  patched.store = memory
  patched.miniwa = {
    groups: makeGroups(patched), communities: makeCommunities(patched), channels: makeChannels(patched),
    account: makeAccount(patched), business: makeBusiness(patched), status: makeStatus(patched)
  }
  return patched
}

export default makeMiniwaSocket
