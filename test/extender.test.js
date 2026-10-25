import test from "node:test"
import assert from "node:assert/strict"
import { extendSocket, album } from "../src/index.js"

function fakeSock() {
  const relayed = []
  const sock = {
    user: { id: "5491100000000:1@s.whatsapp.net" },
    sendMessage: async () => { throw new Error("should not reach Baileys") },
    relayMessage: async (jid, message, opts) => { relayed.push({ jid, message, opts }) },
    waUploadToServer: async () => ({ mediaUrl: "https://mmg.whatsapp.net/x", directPath: "/v/x", handle: "h" }),
    createCallLink: async () => "TOKEN"
  }
  return { sock, relayed }
}

test("album sends the header AND every item, associated to the header", async () => {
  const { sock, relayed } = fakeSock()
  extendSocket(sock)
  const items = [{ image: Buffer.from("a"), caption: "1" }, { image: Buffer.from("b"), caption: "2" }]
  const res = await sock.sendMessage("5491111111111@s.whatsapp.net", album(items).album ? album(items) : { album: items }, { delayMs: 1 })
  assert.equal(relayed.length, 3)
  assert.ok(relayed[0].message.albumMessage)
  assert.equal(relayed[0].message.albumMessage.expectedImageCount, 2)
  for (const child of relayed.slice(1)) {
    const a = child.message.messageContextInfo.messageAssociation
    assert.equal(a.parentMessageKey.id, res.key.id)
    assert.ok(child.message.imageMessage)
  }
})

import { generateExtendedWAMessage, getBizBinaryNode, shouldIncludeBizBinaryNode, isExtendedContent, locationSticker, encodeScheduledMessage, buildScheduledMsgMetaNode, generateExtendedWAMessageFromContent, protoSupport } from "../src/index.js"

test("relayMessage recipe: extended generator + biz node (what sendMessage does)", async () => {
  const { sock, relayed } = fakeSock()
  const jid = "5491111111111@s.whatsapp.net"
  const full = await generateExtendedWAMessage(jid, { text: "Pick", nativeFlow: [{ text: "Hi", id: "hi" }] }, { userJid: sock.user.id, upload: sock.waUploadToServer })
  const additionalNodes = shouldIncludeBizBinaryNode(full.message) ? [getBizBinaryNode(full.message)] : []
  await sock.relayMessage(jid, full.message, { messageId: full.key.id, additionalNodes })
  assert.ok(relayed[0].message.interactiveMessage)
  assert.equal(relayed[0].opts.additionalNodes[0].tag, "biz")
})

test("scheduled message recipe builds the conditional reveal message and meta node", { skip: !protoSupport().scheduledMessages && "installed Baileys lacks ConditionalRevealMessage" }, () => {
  const inner = { extendedTextMessage: { text: "later" } }
  const enc = encodeScheduledMessage(inner)
  const wrapped = generateExtendedWAMessageFromContent("5491111111111@s.whatsapp.net", enc.message, { userJid: "5491100000000:1@s.whatsapp.net" })
  assert.ok(wrapped.message.conditionalRevealMessage)
  const node = buildScheduledMsgMetaNode({ scheduledTimestampS: Math.floor(Date.now() / 1000) + 3600, revealKeyId: enc.revealKeyId, revealKey: enc.revealKey })
  assert.equal(node.tag, "meta")
  assert.equal(node.attrs.type, "scheduled_message")
})

test("status stickers and keep are routed to the extended generator", () => {
  assert.equal(isExtendedContent({ image: { url: "x" }, statusStickers: [locationSticker({ latitude: 1, longitude: 2, name: "x" })] }), true)
  assert.equal(isExtendedContent({ keep: { id: "A" }, type: 1 }), true)
})

test("unsupported proto features fail early with a clear error", async () => {
  const { sock } = fakeSock()
  extendSocket(sock)
  const sup = protoSupport()
  for (const [key, feature] of [["eventInvite", "eventInvite"], ["pollAddOption", "pollAddOption"]]) {
    if (sup[feature]) continue
    await assert.rejects(() => sock.sendMessage("5491111111111@s.whatsapp.net", { [key]: {} }), e => e.code === "UNSUPPORTED_PROTO")
  }
})

test("prepareMessage returns the exact relay options sendMessage would use", async () => {
  const { sock } = fakeSock()
  extendSocket(sock)
  const jid = "5491111111111@s.whatsapp.net"
  const flow = await sock.prepareMessage(jid, { text: "Pick", nativeFlow: [{ text: "Hi", id: "hi" }] })
  assert.equal(flow.relayOptions.messageId, flow.fullMsg.key.id)
  assert.equal(flow.relayOptions.additionalNodes[0].tag, "biz")
  const pin = await sock.prepareMessage(jid, { pin: { remoteJid: jid, id: "A" }, type: 1, time: 86400 })
  assert.equal(pin.relayOptions.additionalAttributes.edit, "2")
  const res = await sock.prepareMessage(jid, { pollResult: { name: "Q", votes: [{ name: "a", voteCount: 1 }] } })
  assert.equal(res.relayOptions.additionalNodes[0].attrs.polltype, "result_snapshot")
  const q = await sock.prepareMessage(jid, { question: { text: "What next?" } })
  assert.ok(q.fullMsg.message.questionMessage)
})
