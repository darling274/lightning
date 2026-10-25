import { Bot } from "../src/index.js"

const bot = new Bot({
  session: "my-bot",
  pairingNumber: "5491112345678",
  mongo: {
    uri: process.env.MONGODB_URI,
    dbName: "whatsapp",
    store: { upsertTtlDays: 14, messageTtlDays: 60 }
  }
})

bot.on("pairing", code => console.log("Pairing code:", code))
bot.on("ready", () => console.log("Ready. Health:", bot.health()))

bot.on("message", async msg => {
  if (msg.text === "history") {
    const last = await bot.store.loadMessages(msg.chat, { limit: 5 })
    await msg.reply(last.map(m => m.message?.conversation || m.message?.extendedTextMessage?.text || "[media]").join("\n") || "empty")
  }
  if (msg.text === "stats") await msg.reply(JSON.stringify(bot.upserts.stats(), null, 2))
})

await bot.start()
