import {
  downloadMediaMessage, extractMessageContent, getContentType, jidNormalizedUser
} from './vendor/baileys/index.js'
import { NativeFlow, LegacyButtons, Carousel, poll, album, location, contact, richLink, externalAdReply, forwardedNewsletter, mentionAll, event } from './messages/builders.js'

const MEDIA = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage', 'ptvMessage']

function readText(content, type) {
  const c = content?.[type]
  switch (type) {
    case 'conversation': return c
    case 'extendedTextMessage': return c?.text
    case 'imageMessage': case 'videoMessage': case 'documentMessage': return c?.caption
    case 'buttonsResponseMessage': return c?.selectedButtonId
    case 'listResponseMessage': return c?.singleSelectReply?.selectedRowId
    case 'templateButtonReplyMessage': return c?.selectedId
    case 'interactiveResponseMessage':
      try { return JSON.parse(c?.nativeFlowResponseMessage?.paramsJson || '{}').id } catch { return undefined }
    default: return undefined
  }
}

export function serialize(bot, raw) {
  const sock = bot.sock
  const key = raw.key
  const chat = key.remoteJid
  const isGroup = chat?.endsWith('@g.us')
  const content = extractMessageContent(raw.message)
  const type = content ? getContentType(content) : undefined
  const text = (readText(content, type) || '').toString()
  const rawSender = key.fromMe ? sock.user.id : isGroup ? (key.participantAlt || key.participant || raw.participant) : (key.remoteJidAlt || chat)
  const sender = rawSender ? jidNormalizedUser(rawSender) : undefined
  const info = content?.[type]?.contextInfo
  const qc = info?.quotedMessage ? extractMessageContent(info.quotedMessage) : undefined
  const qt = qc ? getContentType(qc) : undefined

  const send = (c, o) => bot.send(chat, c, o)
  const msg = {
    bot, sock, raw, key, chat, sender, isGroup, type, text,
    id: key.id, fromMe: !!key.fromMe, pushName: raw.pushName || '',
    timestamp: Number(raw.messageTimestamp) || 0,
    mentions: info?.mentionedJid || [],
    isMedia: MEDIA.includes(type),
    quoted: qc ? {
      id: info.stanzaId, sender: info.participant && jidNormalizedUser(info.participant),
      type: qt, text: readText(qc, qt) || '', isMedia: MEDIA.includes(qt),
      raw: { key: { remoteJid: chat, id: info.stanzaId, participant: info.participant }, message: info.quotedMessage },
      download: () => downloadMediaMessage({ key: { remoteJid: chat, id: info.stanzaId }, message: info.quotedMessage }, 'buffer', {}, { logger: bot.logger, reuploadRequest: sock.updateMediaMessage })
    } : null,

    send,
    reply: (c, o) => send(typeof c === 'string' ? { text: c } : c, { quoted: raw, ...o }),
    react: emoji => send({ react: { text: emoji, key } }),
    edit: (msgKey, newText) => send({ text: newText, edit: msgKey }),
    delete: (msgKey = key) => send({ delete: msgKey }),
    forward: (msg, force = false) => send({ forward: msg, force }),
    pin: (msgKey = key, seconds = 86400) => send({ pin: msgKey, type: 1, time: seconds }),
    read: () => sock.readMessages([key]),
    typing: ms => bot.typing(chat, ms),
    recording: ms => bot.typing(chat, ms, 'recording'),

    image: (src, caption, o) => send({ image: typeof src === 'string' ? { url: src } : src, caption }, { quoted: raw, ...o }),
    video: (src, caption, o) => send({ video: typeof src === 'string' ? { url: src } : src, caption }, { quoted: raw, ...o }),
    audio: (src, ptt = false, o) => send({ audio: typeof src === 'string' ? { url: src } : src, ptt, mimetype: 'audio/ogg; codecs=opus' }, { quoted: raw, ...o }),
    sticker: (src, o) => send({ sticker: typeof src === 'string' ? { url: src } : src }, { quoted: raw, ...o }),
    document: (src, fileName, mimetype = 'application/octet-stream', o) => send({ document: typeof src === 'string' ? { url: src } : src, fileName, mimetype }, { quoted: raw, ...o }),
    album: items => send(album(items), { quoted: raw }),
    location: (lat, lng, name, addr) => send(location(lat, lng, name, addr), { quoted: raw }),
    contact: (name, number) => send(contact(name, number), { quoted: raw }),
    poll: (name, values, n = 1) => send(poll(name, values, n)),
    richLink: (url, opts) => send(richLink(url, opts), { quoted: raw }),
    mention: (t, jids) => send({ text: t, mentions: jids }, { quoted: raw }),
    tagAll: t => send({ text: t, ...mentionAll() }, { quoted: raw }),
    spoiler: (c, o) => send({ ...(typeof c === 'string' ? { text: c } : c), spoiler: true }, { quoted: raw, ...o }),
    adReply: (text, card, o) => send({ text, ...externalAdReply(card) }, { quoted: raw, ...o }),
    fromChannel: (text, newsletterJid, o) => send({ text, ...forwardedNewsletter(newsletterJid, o) }, { quoted: raw }),
    event: (e, o) => send(event(e), { quoted: raw, ...o }),

    flow: fn => { const b = new NativeFlow(); fn(b); return send(b.build(), { quoted: raw }) },
    buttons: fn => { const b = new LegacyButtons(); fn(b); return send(b.build(), { quoted: raw }) },
    carousel: fn => { const b = new Carousel(); fn(b); return send(b.build(), { quoted: raw }) },

    download: () => downloadMediaMessage(raw, 'buffer', {}, { logger: bot.logger, reuploadRequest: sock.updateMediaMessage }),
    groupMetadata: async () => (isGroup ? bot.groupMetadata(chat) : null)
  }

  return msg
}
