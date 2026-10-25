# Changelog

## 4.1.0

### Changed
- **No more `@whiskeysockets/baileys` dependency**: the engine (v7.0.0-rc14, MIT) and WAProto are vendored in `src/vendor`
  with their license. Its transitive packages (`ws`, `libsignal`, `protobufjs`, ...) are now direct dependencies.

### Added (durability)
- Heartbeat ping while open; two lost pings force a reconnect (`heartbeatMs`, `heartbeatTimeoutMs`, `heartbeatMaxMisses`).
- WhatsApp Web version cached with timeout and fallback, so reconnects never hang on a slow lookup.
- Session files are fsynced before the atomic rename.
- `connectionReplaced` (440) no longer loops between two instances (`reconnectOnReplaced`).

## 4.0.0

### Added
- **Baileys-style entry point**: `import makeWASocket from "miniwa"` (also `makeMiniwaSocket`). Same `sock.ev` and
  `sock.sendMessage` shape, same `messages.upsert` payloads. Every `@whiskeysockets/baileys` export is re-exported.
- **MongoDB**: `useMongoAuthState` (sessions), `MongoStore` (messages for retries, chats, contacts, groups, upsert log),
  `connectMongo`, optional TTL expiry, batched writes. `Bot({ mongo })` wires everything over one connection.
- **Sessions**: driver architecture (`FileDriver`, `MongoDriver`, `MemoryDriver`, or your own), atomic writes, per-file write
  queues, corrupt-file quarantine, automatic creds backup and restore, `flush()` / `clear()` / `close()` / `inspect()`,
  `exportSession` / `importSession` / `migrateSession`, `SessionManager`.
- **Upsert inspector**: `UpsertRecorder`, `summarizeUpsert`, `formatUpsert`, `sock.upserts`, `bot.upserts`,
  `bot.on("upsert")`, `debug: { upserts: true }`, and a persistent upsert log in MongoDB.
- **CLI**: `miniwa sessions list|info|export|import|remove|migrate`, `miniwa upserts --follow`.
- **Messages**: `externalAdReply`, `forwardedNewsletter`, `mentionAll`, `groupMentions`, `groupStatus`, `spoiler`,
  `interactiveAsTemplate`, `bloksWidget`, `shopSurface`, `audioFooter` and `isLottie` are now routed to the extended generator.
  Before, `sendMessage` handed them to Baileys, which ignored them silently. New builders and `msg.*` shortcuts: `adReply`,
  `fromChannel`, `tagAll`, `spoiler`, `event`. New `htmlMultiplayerPrelude`.
- `sock.prepareMessage(jid, content, options)`: builds an extended message and returns `{ fullMsg, relayOptions }` so you can call
  `sock.relayMessage` yourself with the exact nodes and attributes `sendMessage` would use. `generateExtendedWAMessage` and friends
  are exported too, plus `getBizBinaryNode` / `shouldIncludeBizBinaryNode`.
- `protoSupport()` and early `UNSUPPORTED_PROTO` errors for message types that need a newer WAProto than the installed Baileys
  (`eventInvite`, `pollAddOption`, `newsletterStatus`, scheduled messages).
- `bot.ev`: every raw Baileys event under its original name, persistent across reconnects.
- TypeScript declarations (`src/index.d.ts`) and a test suite (`npm test`).

### Fixed
- `album` now sends the header **and every item** (associated to it). Before, only the header was relayed.
- `statusStickers`, `interactiveAnnotations` and `keep` are routed to the extended generator (they were silently dropped).

### Changed
- `useMultiFileAuthState` exported by miniwa is the crash-safe implementation (same folder layout, existing sessions keep working).
- `clear()` on an auth result and `Bot` shutdown are async and flush pending writes.
- Extended `sendMessage` passes `getCallLink` to the generator (calls attached to events).
- `@whiskeysockets/baileys` is a caret range instead of `latest`; `mongodb` is an optional peer dependency.

## 3.0.1
- Initial public layout: Bot, extended messages, API facades.
