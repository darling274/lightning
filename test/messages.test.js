import test from "node:test"
import assert from "node:assert/strict"
import { generateWAMessage } from "../src/messages/generator.js"
import { EXTENDED_KEYS, isExtendedContent, externalAdReply, forwardedNewsletter, mentionAll, groupMentions, spoiler, event, NativeFlow, htmlMultiplayerPrelude } from "../src/index.js"

const opts = { userJid: "519101089812:1@s.whatsapp.net", upload: async () => { throw new Error("offline") } }
const gen = (content, extra = {}) => generateWAMessage("5491111111111@s.whatsapp.net", content, { ...opts, ...extra })

test("keys the generator supports are routed to it (they used to be ignored)", () => {
  for (const k of ["externalAdReply", "forwardedNewsletter", "mentionAll", "groupMentions", "groupStatus", "spoiler"]) {
    assert.ok(EXTENDED_KEYS.includes(k), `${k} missing`)
    assert.equal(isExtendedContent({ text: "x", [k]: true }), true)
  }
  assert.equal(isExtendedContent({ text: "plain" }), false)
})

test("externalAdReply builder produces a card", async () => {
  const m = await gen({ text: "hola", ...externalAdReply({ title: "T", body: "B", thumbnail: Buffer.from("x"), url: "https://example.com" }) })
  const c = m.message.extendedTextMessage.contextInfo.externalAdReply
  assert.equal(c.title, "T")
  assert.equal(c.sourceUrl, "https://example.com")
  assert.equal(c.renderLargerThumbnail, true)
})

test("forwardedNewsletter marks the message as forwarded from a channel", async () => {
  const m = await gen({ text: "x", ...forwardedNewsletter("120363000000000000@newsletter", { name: "Canal", serverMessageId: 7 }) })
  const ci = m.message.extendedTextMessage.contextInfo
  assert.equal(ci.forwardedNewsletterMessageInfo.newsletterName, "Canal")
  assert.equal(ci.isForwarded, true)
})

test("mentionAll / groupMentions / spoiler / event / nativeFlow", async () => {
  assert.equal((await gen({ text: "@todos", ...mentionAll() })).message.extendedTextMessage.contextInfo.nonJidMentions, 1)
  const g = await gen({ text: "mira", ...{ groupMentions: groupMentions([{ groupJid: "120363111111111111@g.us", groupSubject: "G" }]).groupMentions } })
  assert.match(g.message.extendedTextMessage.text, /@120363111111111111@g\.us/)
  assert.ok((await gen(spoiler({ text: "shh" }))).message.spoilerMessage)
  const ev = await gen(event({ name: "Fiesta", description: "d", startDate: new Date(Date.now() + 3.6e6), call: "audio" }), { getCallLink: async () => "TOKEN123" })
  assert.match(ev.message.eventMessage.joinLink, /TOKEN123$/)
  const flow = new NativeFlow().text("Elige").reply("Hola", "hola").url("Web", "https://example.com").build()
  assert.ok((await gen(flow)).message.interactiveMessage)
})

test("htmlMultiplayerPrelude validates input and escapes config", () => {
  assert.throws(() => htmlMultiplayerPrelude({ url: "ws://insecure", room: "r" }), /wss/)
  assert.throws(() => htmlMultiplayerPrelude({ url: "wss://x.io", room: " " }), /room/)
  const html = htmlMultiplayerPrelude({ url: "wss://x.io", room: "</script>" })
  assert.ok(!html.includes("</script>\"") && html.includes("\\u003c/script\\u003e"))
})
