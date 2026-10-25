export * from "./vendor/baileys/index.js"

export { makeMiniwaSocket, makeMiniwaSocket as makeWASocket, default } from "./socket/make-socket.js"
export { parseDisconnect, Backoff, waitForOpen, requestPairing } from "./socket/connection.js"

export {
  useSafeAuthState, useSafeAuthState as useMultiFileAuthState, useFileAuthState, useMongoAuthState, useMemoryAuthState,
  makeAuthState, FileDriver, MongoDriver, MemoryDriver, SessionManager, exportSession, importSession, migrateSession,
  KEY_TYPES, isValidCreds
} from "./session/index.js"


export { MongoStore } from "./db/mongo-store.js"
export { connectMongo } from "./db/connect.js"
export { UpsertRecorder, summarizeUpsert, formatUpsert } from "./inspect/upserts.js"


export { Bot, State } from "./core/bot.js"
export { MessageStore } from "./core/store.js"
export { SendQueue } from "./core/queue.js"
export { MiniwaError } from "./core/errors.js"
export { serialize } from "./serialize.js"

export { extendSocket, EXTENDED_KEYS, isExtendedContent } from "./messages/extender.js"

export {
  generateWAMessage as generateExtendedWAMessage,
  generateWAMessageContent as generateExtendedWAMessageContent,
  generateWAMessageFromContent as generateExtendedWAMessageFromContent,
  prepareWAMessageMedia as prepareExtendedWAMessageMedia
} from "./messages/generator.js"
export { protoSupport } from "./messages/support.js"
export { getBizBinaryNode, shouldIncludeBizBinaryNode } from "./messages/biz.js"
export * from "./messages/builders.js"
export * from "./messages/native-flow.js"
export * from "./messages/payment-messages.js"
export * from "./messages/status-stickers.js"
export * from "./messages/scheduled-message.js"
export * from "./messages/link-preview-metadata.js"
export * from "./messages/modern-messages.js"
export { checkHtmlApp, wireBytes, HTML_APP_BYTE_LIMIT } from "./messages/html-app.js"
export { htmlMultiplayerPrelude } from "./messages/html-multiplayer.js"

export { extendApi, SPAM_FLOWS } from "./api/extras.js"
export { makeGroups, makeCommunities, makeChannels, makeAccount, makeBusiness, makeStatus } from "./api/facades.js"
export * from "./api/newsletter-status.js"
