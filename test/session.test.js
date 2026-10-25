import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { useMultiFileAuthState } from "../src/vendor/baileys/index.js"
import {
  useSafeAuthState, useMemoryAuthState, useMongoAuthState, MemoryDriver, FileDriver, exportSession, importSession, migrateSession, SessionManager
} from "../src/index.js"
import { FakeDb } from "./helpers/fake-mongo.js"

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "miniwa-"))
const sampleKeys = () => ({
  "pre-key": { 1: { private: Buffer.from("priv"), public: Buffer.from("pub") } },
  session: { "5491111111111.0": Buffer.from("sess-bytes") },
  "sender-key": { "120363000000000000@g.us::5491111111111::0": Buffer.from("sk") },
  "device-list": { 5491111111111: ["0", "1"] }
})

test("memory auth state round-trips Buffers and removes keys", async () => {
  const a = await useMemoryAuthState()
  await a.state.keys.set(sampleKeys())
  const pre = await a.state.keys.get("pre-key", ["1"])
  assert.ok(Buffer.isBuffer(pre["1"].private))
  assert.equal(pre["1"].private.toString(), "priv")
  await a.state.keys.set({ "pre-key": { 1: null } })
  assert.deepEqual(await a.state.keys.get("pre-key", ["1"]), {})
})

test("file auth state is layout-compatible with Baileys useMultiFileAuthState", async () => {
  const dir = tmp()
  const ours = await useSafeAuthState(dir)
  await ours.state.keys.set(sampleKeys())
  await ours.saveCreds()
  await ours.flush()
  const theirs = await useMultiFileAuthState(dir)
  assert.equal(theirs.state.creds.noiseKey.public.toString("hex"), ours.state.creds.noiseKey.public.toString("hex"))
  const s = await theirs.state.keys.get("session", ["5491111111111.0"])
  assert.equal(Buffer.from(s["5491111111111.0"]).toString(), "sess-bytes")
})

test("corrupt creds.json is restored from backup", async () => {
  const dir = tmp()
  const a = await useSafeAuthState(dir)
  await a.saveCreds(); await a.flush()
  const noise = a.state.creds.noiseKey.public.toString("hex")
  fs.writeFileSync(path.join(dir, "creds.json"), "{broken")
  const b = await useSafeAuthState(dir)
  assert.equal(b.restoredFromBackup, true)
  assert.equal(b.state.creds.noiseKey.public.toString("hex"), noise)
})

test("a corrupt key file is quarantined instead of crashing", async () => {
  const dir = tmp()
  const a = await useSafeAuthState(dir)
  await a.state.keys.set({ session: { "x.0": Buffer.from("ok") } })
  fs.writeFileSync(path.join(dir, "session-x.0.json"), "{nope")
  assert.deepEqual(await a.state.keys.get("session", ["x.0"]), {})
  assert.ok(fs.readdirSync(dir).some(f => f.includes(".corrupt-")))
})

test("file driver list() restores sender-key ids", async () => {
  const dir = tmp()
  const a = await useSafeAuthState(dir)
  await a.state.keys.set(sampleKeys())
  const ids = (await a.driver.list()).filter(k => k.type === "sender-key").map(k => k.id)
  assert.deepEqual(ids, ["120363000000000000@g.us::5491111111111::0"])
})

test("export/import and migrate keep every key", async () => {
  const dir = tmp()
  const a = await useSafeAuthState(dir)
  await a.state.keys.set(sampleKeys()); await a.saveCreds(); await a.flush()
  const blob = await exportSession(a.driver)
  const mem = new MemoryDriver()
  const { keys } = await importSession(mem, blob)
  assert.equal(keys, 4)
  const m2 = new MemoryDriver()
  const r = await migrateSession(a.driver, m2)
  assert.equal(r.verified, true)
  assert.equal((await m2.list()).length, 4)
})

test("mongo auth state: persistence, isolation per session, clear", async () => {
  const db = new FakeDb()
  const a = await useMongoAuthState({ db, session: "bot-a" })
  const b = await useMongoAuthState({ db, session: "bot-b" })
  await a.state.keys.set(sampleKeys()); await a.saveCreds(); await a.flush()
  const again = await useMongoAuthState({ db, session: "bot-a" })
  assert.equal(again.state.creds.noiseKey.public.toString("hex"), a.state.creds.noiseKey.public.toString("hex"))
  assert.deepEqual(await b.state.keys.get("session", ["5491111111111.0"]), {})
  assert.equal((await again.state.keys.get("session", ["5491111111111.0"]))["5491111111111.0"].toString(), "sess-bytes")
  await a.clear()
  assert.equal((await a.driver.list()).length, 0)
  assert.ok((await b.inspect()).driver === "mongo")
})

test("SessionManager lists, exports and removes", async () => {
  const root = tmp()
  const sm = new SessionManager(root)
  const a = await useSafeAuthState(sm.path("one")); await a.saveCreds(); await a.flush()
  assert.deepEqual(sm.list(), ["one"])
  assert.equal(sm.exists("one"), true)
  assert.equal((await sm.info("one")).valid, true)
  assert.ok((await sm.export("one")).length > 20)
  sm.remove("one")
  assert.deepEqual(sm.list(), [])
})
