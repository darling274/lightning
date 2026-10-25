import test from "node:test"
import assert from "node:assert/strict"
import * as miniwa from "../src/index.js"
import * as baileys from "../src/vendor/baileys/index.js"
import { SendQueue } from "../src/core/queue.js"
import { parseDisconnect, Backoff } from "../src/socket/connection.js"

test("every Baileys export is available from miniwa", () => {
  const missing = Object.keys(baileys).filter(k => k !== "default" && !(k in miniwa))
  assert.deepEqual(missing, [])
})

test("default export and makeWASocket are the extended socket factory", () => {
  assert.equal(typeof miniwa.default, "function")
  assert.equal(miniwa.makeWASocket, miniwa.makeMiniwaSocket)
  assert.throws(() => miniwa.makeMiniwaSocket({}), /auth/)
})

test("parseDisconnect classifies reasons", () => {
  const e = code => ({ error: { output: { statusCode: code } } })
  assert.equal(parseDisconnect(e(baileys.DisconnectReason.loggedOut)).fatal, true)
  assert.equal(parseDisconnect(e(baileys.DisconnectReason.restartRequired)).immediate, true)
  const lost = parseDisconnect(e(baileys.DisconnectReason.connectionClosed))
  assert.equal(lost.reconnect, true)
  assert.equal(lost.fatal, false)
  assert.equal(typeof lost.reason, "string")
})

test("Backoff grows and resets", () => {
  const b = new Backoff({ min: 100, max: 1000, jitter: 0 })
  assert.deepEqual([b.next(), b.next(), b.next(), b.next(), b.next()], [100, 200, 400, 800, 1000])
  b.reset()
  assert.equal(b.next(), 100)
})

test("SendQueue keeps per-chat order", async () => {
  const q = new SendQueue({ minDelay: 1, jitter: 0 })
  const out = []
  await Promise.all([1, 2, 3].map(n => q.run("chat", async () => { await new Promise(r => setTimeout(r, 4 - n)); out.push(n) })))
  assert.deepEqual(out, [1, 2, 3])
})

test("Bot rejects a new session without pairingNumber", async () => {
  const { Bot } = miniwa
  const bot = new Bot({ auth: await miniwa.useMemoryAuthState(), shutdownSignals: false })
  await assert.rejects(() => bot.start(), e => e.code === "PAIRING_REQUIRED")
})
