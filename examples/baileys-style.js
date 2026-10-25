import makeWASocket, {
  useSafeAuthState,        
  fetchLatestBaileysVersion,
  DisconnectReason,
  Browsers,
  parseDisconnect,
  Backoff
} from "../src/index.js"
import pino from "pino"

const PAIRING_NUMBER = "5491112345678"
const logger = pino({ level: "silent" })
const backoff = new Backoff({ min: 1000, max: 30_000 })

async function connect() {
  const auth = await useSafeAuthState("session", { logger })
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth,                    
    logger,
    browser: Browsers.ubuntu("Chrome"),
    upserts: { print: true }
  })

  sock.ev.on("connection.update", async update => {
    const { connection, lastDisconnect, qr } = update

    if (qr && !sock.authState.creds.registered) {
      console.log("Pairing code:", await sock.requestPairingCode(PAIRING_NUMBER))
    }
    if (connection === "open") { backoff.reset(); console.log("Connected as", sock.user.id) }
    if (connection === "close") {
      const d = parseDisconnect(lastDisconnect)
      console.log("Closed:", d.reason)
      if (d.loggedOut) { await auth.clear(); return console.log("Logged out. Session removed.") }
      if (d.reconnect) setTimeout(connect, d.immediate ? 0 : backoff.next())
    }
  })

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return
    for (const m of messages) {
      const text = m.message?.conversation || m.message?.extendedTextMessage?.text
      if (!m.key.fromMe && text === "hola") {
        await sock.sendMessage(m.key.remoteJid, { text: "hola!" }, { quoted: m })
      }
      if (!m.key.fromMe && text === "menu") {
        await sock.sendMessage(m.key.remoteJid, {
          title: "Menu", text: "Pick one", footer: "miniwa",
          nativeFlow: [{ text: "Hola", id: "hola" }, { text: "Web", url: "https://example.com" }]
        }, { quoted: m })
      }
    }
  })
}

await connect()
