import makeWASocket, { useSafeAuthState, UpsertRecorder, formatUpsert } from "../src/index.js"

const auth = await useSafeAuthState("session")
const recorder = new UpsertRecorder({
  size: 1000,
  print: line => console.log(line),
  sink: (entry, raw) => { if (entry.msgType === "stub") console.log("stub message", raw.messageStubType) }
})
const sock = makeWASocket({ auth, upserts: recorder })

setInterval(() => {
  const s = recorder.stats()
  console.log(`total=${s.total} notify=${s.notify} append=${s.append} fromMe=${s.fromMe}`)
  console.log(recorder.find({ isGroup: true }).slice(-3).map(formatUpsert).join("\n"))
}, 30_000)
