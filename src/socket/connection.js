import { DisconnectReason } from "../vendor/baileys/index.js"

const NAMES = Object.fromEntries(Object.entries(DisconnectReason).filter(([, v]) => typeof v === "number").map(([k, v]) => [v, k]))


export function parseDisconnect(lastDisconnect) {
  const code = lastDisconnect?.error?.output?.statusCode
  const reason = NAMES[code] || (code ? `code_${code}` : "unknown")
  const loggedOut = code === DisconnectReason.loggedOut
  const fatal = loggedOut || [DisconnectReason.forbidden, DisconnectReason.multideviceMismatch].includes(code)
  return { code, reason, reconnect: !fatal, fatal, loggedOut, immediate: code === DisconnectReason.restartRequired }
}

export class Backoff {
  constructor({ min = 1000, max = 30_000, jitter = 500 } = {}) { Object.assign(this, { min, max, jitter, attempts: 0 }) }
  next() { const d = Math.min(this.min * 2 ** this.attempts++, this.max); return d + Math.random() * this.jitter }
  reset() { this.attempts = 0 }
}


export function waitForOpen(sock, timeoutMs = 60_000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { sock.ev.off("connection.update", h); reject(new Error("waitForOpen timeout")) }, timeoutMs)
    const h = ({ connection, lastDisconnect }) => {
      if (connection === "open") { clearTimeout(t); sock.ev.off("connection.update", h); resolve(sock.user) }
      else if (connection === "close") { clearTimeout(t); sock.ev.off("connection.update", h); reject(lastDisconnect?.error || new Error("closed")) }
    }
    sock.ev.on("connection.update", h)
  })
}

const digits = s => String(s || "").split("@")[0].split(":")[0].replace(/\D/g, "")

export function requestPairing(sock, number, custom) {
  return new Promise((resolve, reject) => {
    if (sock.authState.creds.registered) return reject(new Error("session already registered"))
    const h = async ({ qr, connection }) => {
      if (!qr && connection !== "connecting") return
      sock.ev.off("connection.update", h)
      try { resolve(await sock.requestPairingCode(digits(number), custom || undefined)) } catch (e) { reject(e) }
    }
    sock.ev.on("connection.update", h)
  })
}
