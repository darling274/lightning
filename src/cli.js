import fs from "node:fs"
import { SessionManager, exportSession, importSession, migrateSession, MongoDriver } from "./session/index.js"
import { MongoStore } from "./db/mongo-store.js"
import { formatUpsert } from "./inspect/upserts.js"

const HELP = `miniwa <command>

  sessions list    [--dir sessions]
  sessions info    <name> [--dir sessions]
  sessions export  <name> [--dir sessions]                 prints a portable string (it is your login: keep it secret)
  sessions import  <name> <string|@file> [--dir sessions]
  sessions remove  <name> [--dir sessions]
  sessions migrate <name> --to-mongo <uri> [--db <name>] [--session <id>] [--dir sessions]

  upserts --uri <mongo> [--db <name>] [--session <id>] [--limit 20] [--chat <jid>] [--type <msgType>] [--follow] [--json]

Environment: MONGODB_URI is used when --uri is omitted.`

export function parseArgs(argv) {
  const pos = [], flags = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith("--")) { pos.push(a); continue }
    const k = a.slice(2), next = argv[i + 1]
    if (next === undefined || next.startsWith("--")) flags[k] = true
    else { flags[k] = next; i++ }
  }
  return { pos, flags }
}

export async function main(argv, io = { out: s => console.log(s), err: s => console.error(s) }) {
  const { pos, flags } = parseArgs(argv)
  const [cmd, sub, name, extra] = pos
  try {
    if (!cmd || cmd === "help" || flags.help) { io.out(HELP); return 0 }

    if (cmd === "sessions") {
      const sm = new SessionManager(flags.dir || "sessions")
      if (sub === "list") { for (const n of sm.list()) io.out(`${n}${sm.exists(n) ? "" : "  (no creds)"}`); return 0 }
      if (!name) throw new Error("Missing session name")
      if (sub === "info") { io.out(JSON.stringify(await sm.info(name), null, 2)); return 0 }
      if (sub === "export") { io.out(await sm.export(name)); return 0 }
      if (sub === "import") {
        if (!extra) throw new Error("Missing session string (or @file)")
        const blob = extra.startsWith("@") ? fs.readFileSync(extra.slice(1), "utf8").trim() : extra
        const r = await importSession(sm.driver(name), blob)
        io.out(`Imported ${r.keys} keys into ${sm.path(name)}`); return 0
      }
      if (sub === "remove") { sm.remove(name); io.out(`Removed ${name}`); return 0 }
      if (sub === "migrate") {
        const uri = flags["to-mongo"] === true ? process.env.MONGODB_URI : flags["to-mongo"]
        if (!uri) throw new Error("--to-mongo needs a connection string")
        const to = await MongoDriver.create({ uri, dbName: flags.db, session: flags.session || name })
        try { const r = await migrateSession(sm.driver(name), to); io.out(`Migrated ${r.keys} keys to MongoDB (verified: ${r.verified}). Local folder was left untouched.`) }
        finally { await to.close() }
        return 0
      }
      throw new Error(`Unknown sessions command: ${sub}`)
    }

    if (cmd === "upserts") {
      const uri = flags.uri || process.env.MONGODB_URI
      if (!uri) throw new Error("Pass --uri or set MONGODB_URI")
      const store = await MongoStore.create({ uri, dbName: flags.db, session: flags.session || "default", logUpserts: false })
      const show = e => io.out(flags.json ? JSON.stringify(e) : formatUpsert(e))
      const q = { limit: Number(flags.limit) || 20, chat: flags.chat, msgType: flags.type }
      let rows = await store.recentUpserts(q)
      rows.forEach(show)
      if (!flags.follow) { await store.close(); return 0 }
      let since = rows.at(-1)?.at || new Date()
      process.once("SIGINT", async () => { await store.close(); process.exit(0) })
      for (;;) {
        await new Promise(r => setTimeout(r, 1000))
        rows = await store.recentUpserts({ ...q, limit: 200, since })
        for (const e of rows) { show(e); since = e.at }
      }
    }
    throw new Error(`Unknown command: ${cmd}`)
  } catch (e) { io.err(`miniwa: ${e.message}`); return 1 }
}
