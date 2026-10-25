import { extractMessageContent, getContentType, jidNormalizedUser } from "../vendor/baileys/index.js"

const pad = n => String(n).padStart(2, "0")
const clock = d => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

export function summarizeUpsert(raw, upsertType = "notify", seq = 0) {
  const key = raw?.key || {}
  const chat = key.remoteJid || ""
  const content = extractMessageContent(raw?.message)
  const msgType = content ? getContentType(content) : raw?.messageStubType ? "stub" : "empty"
  const c = content?.[msgType]
  const text = (typeof c === "string" ? c : c?.text || c?.caption || c?.selectedButtonId || c?.singleSelectReply?.selectedRowId || "") || ""
  const sender = key.fromMe ? "me" : key.participantAlt || key.participant || key.remoteJidAlt || chat
  return {
    seq, at: new Date(), upsertType, id: key.id, chat,
    sender: sender && sender !== "me" ? jidNormalizedUser(sender) : sender,
    fromMe: !!key.fromMe, isGroup: chat.endsWith("@g.us"), isNewsletter: chat.endsWith("@newsletter"),
    isStatus: chat === "status@broadcast", msgType, text: String(text), pushName: raw?.pushName || "",
    messageTimestamp: Number(raw?.messageTimestamp) || 0, stub: raw?.messageStubType ?? null
  }
}

export function formatUpsert(e) {
  const where = e.isStatus ? "status" : e.isNewsletter ? "channel" : e.isGroup ? "group" : "dm"
  const who = e.fromMe ? "ME" : e.sender?.split("@")[0]
  const body = e.text ? ` "${clip(e.text.replace(/\s+/g, " "), 60)}"` : ""
  return `[${clock(e.at)}] #${e.seq} ${e.upsertType.padEnd(6)} ${where.padEnd(7)} ${who} › ${e.chat.split("@")[0]}  ${e.msgType}${body}`
}


export class UpsertRecorder {
  constructor({ size = 500, print = false, sink = null, logger = null } = {}) {
    this.size = size
    this.print = print
    this.sinks = sink ? [sink] : []
    this.logger = logger
    this.buffer = []
    this.seq = 0
    this.counters = { total: 0, notify: 0, append: 0, fromMe: 0, byType: {} }
    this.listeners = new Set()
  }

  addSink(fn) { this.sinks.push(fn); return this }
  onEntry(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn) }

  record({ messages, type, requestId }) {
    const out = []
    for (const raw of messages || []) {
      const e = { ...summarizeUpsert(raw, type, ++this.seq), requestId: requestId ?? null }
      this.buffer.push(e)
      if (this.buffer.length > this.size) this.buffer.shift()
      const c = this.counters
      c.total++; c[type] = (c[type] || 0) + 1; if (e.fromMe) c.fromMe++
      c.byType[e.msgType] = (c.byType[e.msgType] || 0) + 1
      if (this.print) (typeof this.print === "function" ? this.print : console.log)(formatUpsert(e))
      for (const s of this.sinks) { try { s(e, raw) } catch (err) { this.logger?.warn?.({ err: err.message }, "upsert sink failed") } }
      for (const l of this.listeners) { try { l(e) } catch {} }
      out.push(e)
    }
    return out
  }

  attach(ev, opts = {}) {
    if (opts.print !== undefined) this.print = opts.print
    const h = u => this.record(u)
    ev.on("messages.upsert", h)
    return () => ev.off("messages.upsert", h)
  }

  last(n = 20) { return this.buffer.slice(-n) }
  find(q = {}) {
    return this.buffer.filter(e => Object.entries(q).every(([k, v]) => (v instanceof RegExp ? v.test(e[k]) : e[k] === v)))
  }
  stats() { return { ...this.counters, buffered: this.buffer.length } }
  clear() { this.buffer = [] }
}
