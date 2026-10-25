import { Bot } from "../src/index.js"

const bot = new Bot({
  session: "session",
  pairingNumber: "5491112345678",
  debug: { upserts: true }
})

bot.on("pairing", code => console.log("Pairing code:", code))
bot.on("ready", user => console.log("Connected as", user.id))
bot.on("state", (now, prev) => console.log(`state: ${prev} -> ${now}`))
bot.on("reconnecting", r => console.log(`reconnecting #${r.attempt} in ${Math.round(r.delay)}ms (code ${r.code})`))
bot.on("logout", () => console.log("Logged out: session removed, restart to link again"))
bot.on("error", e => console.error("[error]", e.message))

bot.on("message", async msg => {
  if (msg.text === "hola") await msg.reply("Hola " + msg.pushName)
  if (msg.text === "menu") {
    await msg.flow(f => f.title("Menu").text("Pick one").footer("miniwa")
      .reply("Hola", "hola").url("Web", "https://example.com").copy("Code", "ABC123"))
  }
  if (msg.text === "poll") await msg.poll("Favourite?", ["Node", "Bun", "Deno"])
  if (msg.text === "todos" && msg.isGroup) await msg.tagAll("Attention everyone!")
  if (msg.text === "spoiler") await msg.spoiler("The butler did it")
})

bot.ev.on("messages.reaction", r => console.log("reaction", r))

bot.on("upsert", e => { if (e.upsertType === "append") console.log("history/append:", e.msgType, e.chat) })

bot.on("participants", async ({ id, action, participants }) => {
  if (action === "add") await bot.send(id, { text: "Welcome!", mentions: participants })
})

await bot.start()
