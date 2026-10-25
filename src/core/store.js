export class MessageStore {
  constructor({ maxMessages = 5000, groupTtl = 5 * 60_000 } = {}) {
    this.maxMessages = maxMessages
    this.groupTtl = groupTtl
    this.messages = new Map()
    this.groups = new Map()
  }
  #k = key => `${key.remoteJid}:${key.id}`

  saveMessage(msg) {
    if (!msg?.key?.id || !msg.message) return
    this.messages.set(this.#k(msg.key), msg)
    if (this.messages.size > this.maxMessages) this.messages.delete(this.messages.keys().next().value)
  }
  getMessage(key) { return this.messages.get(this.#k(key))?.message }

  setGroup(jid, meta) { this.groups.set(jid, { meta, at: Date.now() }) }
  getGroup(jid) {
    const e = this.groups.get(jid)
    if (!e) return undefined
    if (Date.now() - e.at > this.groupTtl) { this.groups.delete(jid); return undefined }
    return e.meta
  }
  dropGroup(jid) { this.groups.delete(jid) }
}
