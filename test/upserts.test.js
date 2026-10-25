import test from "node:test"
import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import { UpsertRecorder, summarizeUpsert, formatUpsert } from "../src/index.js"

const dm = (id, message, fromMe = false) => ({ key: { remoteJid: "5491111111111@s.whatsapp.net", id, fromMe }, message, messageTimestamp: 1, pushName: "Ana" })
const grp = (id, message) => ({ key: { remoteJid: "120363@g.us", id, participant: "5492222222222@s.whatsapp.net" }, message, messageTimestamp: 1 })

test("summarizeUpsert understands text, captions, buttons and groups", () => {
  assert.equal(summarizeUpsert(dm("1", { conversation: "hola" })).text, "hola")
  assert.equal(summarizeUpsert(dm("2", { imageMessage: { caption: "foto" } })).msgType, "imageMessage")
  assert.equal(summarizeUpsert(dm("3", { buttonsResponseMessage: { selectedButtonId: "btn_1" } })).text, "btn_1")
  const g = summarizeUpsert(grp("4", { extendedTextMessage: { text: "grupo" } }))
  assert.equal(g.isGroup, true)
  assert.equal(g.sender, "5492222222222@s.whatsapp.net")
})

test("recorder counts notify/append/fromMe and keeps a ring buffer", () => {
  const r = new UpsertRecorder({ size: 3 })
  r.record({ type: "notify", messages: [dm("1", { conversation: "a" }), dm("2", { conversation: "b" }, true)] })
  r.record({ type: "append", messages: [dm("3", { conversation: "c" }), dm("4", { conversation: "d" })] })
  assert.equal(r.stats().total, 4)
  assert.equal(r.stats().notify, 2)
  assert.equal(r.stats().append, 2)
  assert.equal(r.stats().fromMe, 1)
  assert.equal(r.buffer.length, 3)
  assert.deepEqual(r.last(2).map(e => e.id), ["3", "4"])
  assert.equal(r.find({ upsertType: "append" }).length, 2)
})

test("attach() hooks messages.upsert and print is injectable", () => {
  const lines = []
  const r = new UpsertRecorder({ print: l => lines.push(l) })
  const ev = new EventEmitter()
  const off = r.attach(ev)
  ev.emit("messages.upsert", { type: "notify", messages: [grp("9", { conversation: "yo" })] })
  assert.equal(lines.length, 1)
  assert.match(lines[0], /notify\s+group/)
  assert.match(lines[0], /conversation "yo"/)
  off()
  ev.emit("messages.upsert", { type: "notify", messages: [grp("10", { conversation: "x" })] })
  assert.equal(lines.length, 1)
})

test("formatUpsert marks own messages and statuses", () => {
  const own = formatUpsert(summarizeUpsert(dm("5", { conversation: "me" }, true), "append", 1))
  assert.match(own, /append/)
  assert.match(own, /ME/)
})
