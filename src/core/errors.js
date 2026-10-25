export class MiniwaError extends Error {
  constructor(message, code = 'MINIWA_ERROR', meta = {}) {
    super(message)
    this.name = 'MiniwaError'
    this.code = code
    this.meta = meta
  }
}
