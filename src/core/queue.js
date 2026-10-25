const sleep = ms => new Promise(r => setTimeout(r, ms))

export class SendQueue {
  constructor({ minDelay = 350, jitter = 150, maxPending = 200 } = {}) {
    this.minDelay = minDelay
    this.jitter = jitter
    this.maxPending = maxPending
    this.chains = new Map()
    this.pending = 0
  }
  run(chatId, fn) {
    if (this.pending >= this.maxPending) return Promise.reject(new Error('Cola de envio saturada'))
    this.pending++
    const prev = this.chains.get(chatId) || Promise.resolve()
    const next = prev
      .catch(() => {})
      .then(async () => {
        try { return await fn() }
        finally { await sleep(this.minDelay + Math.random() * this.jitter) }
      })
      .finally(() => {
        this.pending--
        if (this.chains.get(chatId) === next) this.chains.delete(chatId)
      })
    this.chains.set(chatId, next)
    return next
  }
}
