import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { main, parseArgs } from "../src/cli.js"
import { useSafeAuthState } from "../src/index.js"

const capture = () => { const out = [], err = []; return { out, err, io: { out: s => out.push(s), err: s => err.push(s) } } }

test("parseArgs separates positionals and flags", () => {
  assert.deepEqual(parseArgs(["sessions", "list", "--dir", "x", "--json"]), { pos: ["sessions", "list"], flags: { dir: "x", json: true } })
})

test("sessions list / info / export / import / remove", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "miniwa-cli-"))
  const a = await useSafeAuthState(path.join(dir, "bot")); await a.saveCreds(); await a.flush()

  let c = capture(); assert.equal(await main(["sessions", "list", "--dir", dir], c.io), 0); assert.deepEqual(c.out, ["bot"])
  c = capture(); assert.equal(await main(["sessions", "info", "bot", "--dir", dir], c.io), 0); assert.equal(JSON.parse(c.out[0]).valid, true)
  c = capture(); await main(["sessions", "export", "bot", "--dir", dir], c.io); const blob = c.out[0]; assert.ok(blob.length > 20)

  c = capture(); assert.equal(await main(["sessions", "import", "copy", blob, "--dir", dir], c.io), 0)
  c = capture(); await main(["sessions", "info", "copy", "--dir", dir], c.io); assert.equal(JSON.parse(c.out[0]).valid, true)

  c = capture(); assert.equal(await main(["sessions", "remove", "copy", "--dir", dir], c.io), 0)
  c = capture(); await main(["sessions", "list", "--dir", dir], c.io); assert.deepEqual(c.out, ["bot"])
})

test("errors return exit code 1 with a readable message", async () => {
  const c = capture()
  assert.equal(await main(["upserts"], c.io), 1)
  assert.match(c.err[0], /--uri|MONGODB_URI/)
  const d = capture()
  assert.equal(await main(["nope"], d.io), 1)
  assert.match(d.err[0], /Unknown command/)
})
