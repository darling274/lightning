# Credits and notices

miniwa is distributed under the MIT license (see `LICENSE`, which keeps the original notices).
These notices must accompany any distribution.

- **Baileys / WhiskeySockets** (MIT, Copyright (c) 2025 Rajeh Taher/WhiskeySockets): the connection engine, protocol, WAProto and Signal glue are VENDORED unmodified (v7.0.0-rc14) in `src/vendor/baileys` and `src/vendor/WAProto`. Its license is kept in `src/vendor/BAILEYS-LICENSE` and must accompany every distribution.
  Files adapted from it:
  - `src/api/extras.js`, `src/api/mex*.js`, `src/api/username.js`, `src/api/newsletter-status.js`.

  Only imports and the wiring to the WhiskeySockets socket (`src/compat.js`) were adapted.
  The session driver abstraction (`src/session/auth-state.js`, `src/session/drivers/mongo.js`) follows the design of
  elaina's `auth-store.js` and `use-mongo-auth-state.js`, re-implemented with crash safety, backups and migration tooling.
- **MessageBuilder (NIXCODE, by Nixel)**: NOT included. Its license forbids redistributing it as part of another product.
  elaina's `MessageBuilder/extras.js` and `MessageBuilder/metaai.js` import it, so they are not included either.
- **VoIP (ShellTear / baileys-caller)**: not included.

Everything else (socket factory, session drivers and manager, MongoDB store, upsert inspector, CLI, tests, types) is original to miniwa.
