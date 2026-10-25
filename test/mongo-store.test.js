import test from "node:test"
import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import { MongoStore } from "../src/index.js"
import { FakeDb } from "./helpers/fake-mongo.js"

const raw = (id, text, extra = {}) => ({
  key: { remoteJid: "5491111111111@s.whatsapp.net", id, fromMe: false },
  message: { conversation: text }, messageTimestamp: 1_700_000_000, pushName: "Sareth", ...extra
})

test("store persists upserts, messages and the upsert log", async () => {
  const db = new FakeDb()
  const store = await MongoStore.create({ db, session: "s1", flushMs: 5 })
  const ev = new EventEmitter()
  store.bind(ev)
  ev.emit("messages.upsert", { type: "notify", messages: [raw("A1", "hola"), raw("A2", "chau")] })
  await store.flush()
  assert.equal(await store.countMessages(), 2)
  const log = await store.recentUpserts({ limit: 10 })
  assert.equal(log.length, 2)
  assert.equal(log[0].upsertType, "notify")
  assert.equal(log[0].text, "hola")
  assert.equal(store.recorder.stats().total, 2)
})

test("getMessage falls back to MongoDB after a cold start", async () => {
  const db = new FakeDb()
  const a = await MongoStore.create({ db, session: "s1" })
  a.saveMessage(raw("B1", "persist me", { message: { conversation: "persist me", messageContextInfo: { deviceListMetadata: { senderKeyHash: Buffer.from("hash") } } } }))
  await a.flush()
  const b = await MongoStore.create({ db, session: "s1" })
  const m = await b.getMessage({ remoteJid: "5491111111111@s.whatsapp.net", id: "B1" })
  assert.equal(m.conversation, "persist me")
  assert.ok(Buffer.isBuffer(m.messageContextInfo.deviceListMetadata.senderKeyHash))
  assert.equal(await b.getMessage({ remoteJid: "x@s.whatsapp.net", id: "nope" }), undefined)
})

test("sessions are isolated and deletes/chats are handled", async () => {
  const db = new FakeDb()
  const a = await MongoStore.create({ db, session: "A" })
  const b = await MongoStore.create({ db, session: "B" })
  const ev = new EventEmitter(); a.bind(ev)
  ev.emit("messages.upsert", { type: "append", messages: [raw("C1", "x")] })
  ev.emit("chats.upsert", [{ id: "5491111111111@s.whatsapp.net", unreadCount: 3 }])
  await a.flush()
  assert.equal(await a.countMessages(), 1)
  assert.equal(await b.countMessages(), 0)
  assert.equal(db.collection("miniwa_chats").docs[0].data.unreadCount, 3)
  ev.emit("messages.delete", { keys: [{ remoteJid: "5491111111111@s.whatsapp.net", id: "C1" }] })
  await a.flush()
  assert.equal(await a.countMessages(), 0)
})

test("loadMessages returns chronological history and TTL indexes are optional", async () => {
  const db = new FakeDb()
  const s = await MongoStore.create({ db, session: "s", upsertTtlDays: 7, messageTtlDays: 30 })
  for (let i = 1; i <= 3; i++) s.saveMessage(raw(`D${i}`, `m${i}`, { messageTimestamp: 1_700_000_000 + i }))
  await s.flush()
  assert.deepEqual((await s.loadMessages("5491111111111@s.whatsapp.net", { limit: 2 })).map(m => m.message.conversation), ["m2", "m3"])
  const ttl = db.collection("miniwa_upserts").indexes.find(i => i.opts?.expireAfterSeconds)
  assert.equal(ttl.opts.expireAfterSeconds, 7 * 86400)
})
