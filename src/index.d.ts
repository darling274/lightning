import type { EventEmitter } from "node:events"
import type { Logger } from "pino"
import type {
  WASocket, WAMessage, AnyMessageContent, MiscMessageGenerationOptions, AuthenticationCreds,
  SignalKeyStoreWithTransaction, UserFacingSocketConfig, proto, GroupMetadata, WAMessageKey
} from "./vendor/baileys/index.js"

export * from "./vendor/baileys/index.js"

export interface SessionRow { type: string; id: string }
export interface SessionWrite extends SessionRow { value: string }

export interface SessionDriver {
  name: string
  read(type: string, id: string): Promise<string | null>
  readMany(type: string, ids: string[]): Promise<Record<string, string>>
  apply(writes: SessionWrite[], removals: SessionRow[]): Promise<void>
  list(): Promise<SessionRow[]>
  clear(): Promise<void>
  close(): Promise<void>
}

export interface AuthResult {
  state: { creds: AuthenticationCreds; keys: SignalKeyStoreWithTransaction | any }
  driver: SessionDriver
  restoredFromBackup: boolean
  saveCreds(): Promise<void>
  flush(): Promise<void>
  clear(): Promise<void>
  close(): Promise<void>
  inspect(): Promise<{ registered: boolean; me: string | null; platform: string | null; backup: "ok" | "restored"; keys: Record<string, number>; total: number; driver: string }>
}

export interface AuthOptions { logger?: Logger | any; backupDelayMs?: number }
export interface MongoAuthOptions extends AuthOptions {
  session?: string; uri?: string; dbName?: string; db?: any; collection?: any; collectionName?: string; clientOptions?: object
}

export function useSafeAuthState(folder: string, opts?: AuthOptions): Promise<AuthResult>
export { useSafeAuthState as useMultiFileAuthState, useSafeAuthState as useFileAuthState }
export function useMongoAuthState(opts: MongoAuthOptions): Promise<AuthResult>
export function useMemoryAuthState(opts?: AuthOptions): Promise<AuthResult>
export function makeAuthState(driver: SessionDriver, opts?: AuthOptions): Promise<AuthResult>

export class FileDriver implements SessionDriver { constructor(folder: string, opts?: { logger?: any }); name: string; read: SessionDriver["read"]; readMany: SessionDriver["readMany"]; apply: SessionDriver["apply"]; list: SessionDriver["list"]; clear: SessionDriver["clear"]; close: SessionDriver["close"] }
export class MemoryDriver implements SessionDriver { constructor(name?: string); name: string; read: SessionDriver["read"]; readMany: SessionDriver["readMany"]; apply: SessionDriver["apply"]; list: SessionDriver["list"]; clear: SessionDriver["clear"]; close: SessionDriver["close"] }
export class MongoDriver implements SessionDriver { static create(opts: MongoAuthOptions): Promise<MongoDriver>; name: string; read: SessionDriver["read"]; readMany: SessionDriver["readMany"]; apply: SessionDriver["apply"]; list: SessionDriver["list"]; clear: SessionDriver["clear"]; close: SessionDriver["close"] }

export function exportSession(driver: SessionDriver): Promise<string>
export function importSession(driver: SessionDriver, blob: string): Promise<{ keys: number }>
export function migrateSession(from: SessionDriver, to: SessionDriver): Promise<{ keys: number; verified: boolean }>
export const KEY_TYPES: readonly string[]
export function isValidCreds(raw: string | null): boolean

export class SessionManager {
  constructor(root?: string)
  root: string
  path(name: string): string
  list(): string[]
  exists(name: string): boolean
  driver(name: string): FileDriver
  export(name: string): Promise<string>
  import(name: string, blob: string): Promise<{ keys: number }>
  remove(name: string): void
  info(name: string): Promise<{ name: string; valid: boolean; keys: number }>
}

export interface UpsertEntry {
  seq: number; at: Date; upsertType: "notify" | "append" | string; id: string; chat: string; sender: string
  fromMe: boolean; isGroup: boolean; isNewsletter: boolean; isStatus: boolean; msgType: string; text: string
  pushName: string; messageTimestamp: number; stub: number | null; requestId?: string | null
}
export function summarizeUpsert(raw: WAMessage, upsertType?: string, seq?: number): UpsertEntry
export function formatUpsert(entry: UpsertEntry): string

export class UpsertRecorder {
  constructor(opts?: { size?: number; print?: boolean | ((line: string) => void); sink?: (e: UpsertEntry, raw: WAMessage) => void; logger?: any })
  print: boolean | ((line: string) => void)
  record(upsert: { messages: WAMessage[]; type: string; requestId?: string }): UpsertEntry[]
  attach(ev: EventEmitter | any, opts?: { print?: boolean | ((line: string) => void) }): () => void
  addSink(fn: (e: UpsertEntry, raw: WAMessage) => void): this
  onEntry(fn: (e: UpsertEntry) => void): () => void
  last(n?: number): UpsertEntry[]
  find(query: Partial<Record<keyof UpsertEntry, any>>): UpsertEntry[]
  stats(): { total: number; notify: number; append: number; fromMe: number; byType: Record<string, number>; buffered: number }
  clear(): void
}

export interface MongoStoreOptions {
  uri?: string; dbName?: string; db?: any; clientOptions?: object; session?: string; prefix?: string
  messageTtlDays?: number; upsertTtlDays?: number; flushMs?: number; maxBatch?: number
  logUpserts?: boolean; memoryMessages?: number; logger?: any
}
export class MongoStore {
  static create(opts: MongoStoreOptions): Promise<MongoStore>
  recorder: UpsertRecorder
  saveMessage(msg: WAMessage): void
  getMessage(key: WAMessageKey): Promise<proto.IMessage | undefined>
  setGroup(jid: string, meta: GroupMetadata): void
  getGroup(jid: string): GroupMetadata | undefined
  dropGroup(jid: string): void
  loadMessages(chat: string, opts?: { limit?: number; before?: number }): Promise<WAMessage[]>
  recentUpserts(opts?: { limit?: number; chat?: string; msgType?: string; since?: Date }): Promise<UpsertEntry[]>
  countMessages(chat?: string): Promise<number>
  stats(): { written: number; flushes: number; errors: number; pending: number; memory: number }
  bind(ev: any): () => void
  flush(): Promise<void>
  close(): Promise<void>
}
export function connectMongo(opts: { uri: string; dbName?: string; clientOptions?: object }): Promise<{ client: any; db: any; close(): Promise<void> }>

export class MessageStore {
  constructor(opts?: { maxMessages?: number; groupTtl?: number })
  messages: Map<string, WAMessage>
  saveMessage(msg: WAMessage): void
  getMessage(key: WAMessageKey): proto.IMessage | undefined
  setGroup(jid: string, meta: GroupMetadata): void
  getGroup(jid: string): GroupMetadata | undefined
  dropGroup(jid: string): void
}

export interface MiniwaSocketConfig extends Omit<Partial<UserFacingSocketConfig>, "auth"> {
  auth: AuthResult | { creds: AuthenticationCreds; keys: any }
  store?: MongoStore | MessageStore
  upserts?: { size?: number; print?: boolean | ((l: string) => void) } | UpsertRecorder
  extend?: boolean
  cacheKeys?: boolean
}
export type MiniwaSocket = WASocket & {
  upserts: UpsertRecorder
  store: MongoStore | MessageStore
  miniwa: { groups: any; communities: any; channels: any; account: any; business: any; status: any }
  prepareMessage(jid: string, content: Record<string, any>, options?: Record<string, any>): Promise<{ fullMsg: WAMessage & { message: proto.IMessage }; content: Record<string, any>; relayOptions: Record<string, any> }>
  sendHD(jid: string, content: any, options?: any): Promise<WAMessage>
  sendImgVid(jid: string, content: any, options?: any): Promise<WAMessage>
  sendStatusMentions(jids: string[], content: any, options?: any): Promise<WAMessage>
}
export function makeMiniwaSocket(config: MiniwaSocketConfig): MiniwaSocket
export { makeMiniwaSocket as makeWASocket }
export default makeMiniwaSocket

export function parseDisconnect(lastDisconnect: any): { code?: number; reason: string; reconnect: boolean; fatal: boolean; loggedOut: boolean; immediate: boolean }
export class Backoff { constructor(opts?: { min?: number; max?: number; jitter?: number }); attempts: number; next(): number; reset(): void }
export function waitForOpen(sock: WASocket, timeoutMs?: number): Promise<any>
export function requestPairing(sock: WASocket, number: string, customCode?: string): Promise<string>

export type Source = string | Buffer | { url: string }
export interface Msg {
  bot: Bot; sock: MiniwaSocket; raw: WAMessage; key: WAMessageKey; id: string
  chat: string; sender: string; isGroup: boolean; fromMe: boolean; pushName: string; timestamp: number
  type?: string; text: string; mentions: string[]; isMedia: boolean
  quoted: null | { id: string; sender?: string; type?: string; text: string; isMedia: boolean; raw: any; download(): Promise<Buffer> }
  send(content: AnyMessageContent | Record<string, any>, options?: MiscMessageGenerationOptions): Promise<WAMessage>
  reply(content: string | AnyMessageContent | Record<string, any>, options?: MiscMessageGenerationOptions): Promise<WAMessage>
  react(emoji: string): Promise<WAMessage>
  edit(key: WAMessageKey, text: string): Promise<WAMessage>
  delete(key?: WAMessageKey): Promise<WAMessage>
  forward(msg: WAMessage, force?: boolean): Promise<WAMessage>
  pin(key?: WAMessageKey, seconds?: number): Promise<WAMessage>
  read(): Promise<void>
  typing(ms?: number): Promise<void>
  recording(ms?: number): Promise<void>
  image(src: Source, caption?: string, o?: any): Promise<WAMessage>
  video(src: Source, caption?: string, o?: any): Promise<WAMessage>
  audio(src: Source, ptt?: boolean, o?: any): Promise<WAMessage>
  sticker(src: Source, o?: any): Promise<WAMessage>
  document(src: Source, fileName: string, mimetype?: string, o?: any): Promise<WAMessage>
  album(items: { image?: Source; video?: Source; caption?: string }[]): Promise<WAMessage>
  location(lat: number, lng: number, name?: string, address?: string): Promise<WAMessage>
  contact(name: string, number: string): Promise<WAMessage>
  poll(name: string, values: string[], selectableCount?: number): Promise<WAMessage>
  richLink(url: string, opts?: Record<string, any>): Promise<WAMessage>
  mention(text: string, jids: string[]): Promise<WAMessage>
  tagAll(text: string): Promise<WAMessage>
  spoiler(content: string | Record<string, any>, o?: any): Promise<WAMessage>
  adReply(text: string, card: Parameters<typeof externalAdReply>[0], o?: any): Promise<WAMessage>
  fromChannel(text: string, newsletterJid: string, o?: { name?: string; serverMessageId?: number }): Promise<WAMessage>
  event(e: Parameters<typeof event>[0], o?: any): Promise<WAMessage>
  flow(fn: (b: NativeFlow) => void): Promise<WAMessage>
  buttons(fn: (b: LegacyButtons) => void): Promise<WAMessage>
  carousel(fn: (b: Carousel) => void): Promise<WAMessage>
  download(): Promise<Buffer>
  groupMetadata(): Promise<GroupMetadata | null>
}

export declare const State: Readonly<{ IDLE: "idle"; CONNECTING: "connecting"; OPEN: "open"; RECONNECTING: "reconnecting"; CLOSED: "closed"; LOGGED_OUT: "logged_out" }>

export interface BotOptions {
  session?: string
  pairingNumber?: string | null
  customPairingCode?: string | null
  auth?: AuthResult
  store?: MongoStore | MessageStore
  mongo?: { uri: string; dbName?: string; authCollection?: string; clientOptions?: object; store?: Partial<MongoStoreOptions> }
  debug?: { upserts?: boolean | ((line: string) => void) }
  ignoreOld?: boolean; ignoreSelf?: boolean; browser?: [string, string, string]
  minBackoff?: number; maxBackoff?: number; maxReconnectAttempts?: number; connectWatchdogMs?: number
  sendDelay?: number; sendJitter?: number; maxStoredMessages?: number; shutdownSignals?: boolean
  logger?: Logger | any
  socket?: Partial<UserFacingSocketConfig> | Record<string, any>
}

export interface BotEvents {
  message: (msg: Msg) => void
  upsert: (entry: UpsertEntry) => void
  pairing: (code: string) => void
  ready: (user: any) => void
  state: (now: string, prev: string) => void
  reconnecting: (info: { code?: number; delay: number; attempt: number }) => void
  close: (code?: number, error?: Error) => void
  logout: () => void
  fatal: (reason: number | string) => void
  error: (error: Error) => void
  participants: (update: { id: string; participants: any[]; action: string }) => void
  [event: string]: (...args: any[]) => void
}

export class Bot extends EventEmitter {
  constructor(options?: BotOptions)
  on<K extends keyof BotEvents>(event: K, listener: BotEvents[K]): this
  once<K extends keyof BotEvents>(event: K, listener: BotEvents[K]): this
  ev: EventEmitter
  sock: MiniwaSocket | null
  state: string
  store: MongoStore | MessageStore
  upserts: UpsertRecorder
  groups: any; communities: any; channels: any; account: any; business: any; status: any
  send(jid: string | string[], content: any, options?: any): Promise<WAMessage>
  typing(jid: string, ms?: number, kind?: "composing" | "recording"): Promise<void>
  groupMetadata(jid: string): Promise<GroupMetadata>
  health(): Record<string, any>
  start(): Promise<this>
  stop(): Promise<void>
  logout(): Promise<void>
}
export class SendQueue { constructor(opts?: { minDelay?: number; jitter?: number; maxPending?: number }); pending: number; run<T>(chatId: string, fn: () => Promise<T>): Promise<T> }
export class MiniwaError extends Error { code: string; meta: Record<string, any> }
export function serialize(bot: Bot, raw: WAMessage): Msg
export class NativeFlow {
  text(t: string): this; footer(t: string): this; title(t: string): this; subtitle(t: string): this
  image(src: Source, caption?: string): this; video(src: Source, caption?: string): this
  reply(text: string, id: string): this; url(text: string, url: string, useWebview?: boolean): this
  copy(text: string, code: string): this; call(text: string, phone: string): this
  list(text: string, sections: { title: string; rows: { title: string; description?: string; id: string }[] }[]): this
  offer(text: string, url: string, code: string, expiration?: number): this
  bottomSheet(buttonText: string, listTitle: string): this
  build(): Record<string, any>
}
export class LegacyButtons { text(t: string): this; footer(t: string): this; title(t: string): this; add(text: string, id: string): this; build(): Record<string, any> }
export class Carousel {
  text(t: string): this; footer(t: string): this
  card(c: { image?: Source; video?: Source; title?: string; caption?: string; footer?: string; buttons?: NativeFlow | any[] }): this
  build(): Record<string, any>
}
export function poll(name: string, values: string[], selectableCount?: number): { poll: any }
export function album(items: { image?: Source; video?: Source; caption?: string }[]): { album: any[] }
export function location(lat: number, lng: number, name?: string, address?: string): { location: any }
export function contact(name: string, number: string): { contacts: any }
export function richLink(url: string, opts?: { text?: string; title?: string; description?: string; image?: any; large?: boolean }): { richLink: any }
export function externalAdReply(o: { title?: string; body?: string; thumbnail?: Buffer; thumbnailUrl?: string; url?: string; large?: boolean; mediaUrl?: string; mediaType?: number }): { externalAdReply: any }
export function forwardedNewsletter(newsletterJid: string, o?: { name?: string; serverMessageId?: number; contentType?: string }): { forwardedNewsletter: any }
export function mentionAll(): { mentionAll: true }
export function groupMentions(groups: { groupJid: string; groupSubject?: string }[]): { groupMentions: any[] }
export function spoiler<T extends object>(content: T): T & { spoiler: true }
export function event(e: { name: string; description?: string; startDate: Date | number; endDate?: Date | number; location?: any; call?: "audio" | "video"; extraGuestsAllowed?: boolean }): { event: any }

export const EXTENDED_KEYS: readonly string[]
export function generateExtendedWAMessage(jid: string, content: Record<string, any>, options: { userJid: string; upload?: any; logger?: any; messageId?: string; getCallLink?: any; getProfilePicUrl?: any; [k: string]: any }): Promise<WAMessage & { message: proto.IMessage }>
export function generateExtendedWAMessageContent(content: Record<string, any>, options: Record<string, any>): Promise<proto.IMessage>
export function generateExtendedWAMessageFromContent(jid: string, message: proto.IMessage, options: { userJid: string; messageId?: string; timestamp?: Date; quoted?: WAMessage }): WAMessage
export function prepareExtendedWAMessageMedia(content: Record<string, any>, options: Record<string, any>): Promise<proto.IMessage>
export function protoSupport(): { scheduledMessages: boolean; eventInvite: boolean; pollAddOption: boolean; newsletterStatus: boolean }
export function getBizBinaryNode(message: proto.IMessage): any
export function shouldIncludeBizBinaryNode(message: proto.IMessage): boolean
export function isExtendedContent(content: any): boolean
export function extendSocket<T>(sock: T, opts?: { logger?: any }): T
export function extendApi<T>(sock: T, opts?: { logger?: any }): T
export function htmlMultiplayerPrelude(o: { url: string; room: string; seat?: string | number | null; reconnectMs?: number; maxReconnectMs?: number }): string
export function checkHtmlApp(html: string, opts?: { height?: number; maxBytes?: number }): any
export function wireBytes(html: string): number
export const HTML_APP_BYTE_LIMIT: number
export function makeGroups(sock: any): any
export function makeCommunities(sock: any): any
export function makeChannels(sock: any): any
export function makeAccount(sock: any): any
export function makeBusiness(sock: any): any
export function makeStatus(sock: any): any
