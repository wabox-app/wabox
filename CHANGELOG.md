# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-07-07

### Added

- Inbox envelopes now carry mention & quoted-reply metadata: `mentions` (the
  @-mentioned JIDs, verbatim), `mentionedMe` (`true` when one of your own
  identities — phone or LID — is mentioned), and `quoted` (`{ id, participant,
  fromMe, text }` for reply messages, else `null`). These let a group consumer
  tell "addressed to me" from group noise via `mentionedMe || quoted.fromMe`,
  computed in core because only core knows the session's own identities. The
  fields are additive and always present. See
  [INTEGRATION.md](INTEGRATION.md#groups-knowing-when-youre-addressed).
- First unit test suite (`npm test`, `node --test`, no new dependencies),
  covering the pure envelope-parsing helpers.

## [0.1.11] - 2026-06-05

### Changed

- Replaced `examples/wabox-claude-code.sh` with a minimal
  `examples/echo-bridge.sh`. The full Claude Code bridge moved to its own
  project, [wabox-bot](https://github.com/wabox-app/wabox-bot), where it has
  room to grow as a pluggable agent framework (Claude Code by default;
  echo + room for aider, codex, raw-API, …). The new in-tree example is a
  ~30-line learning artifact for anyone writing their own consumer. For
  users of the old script, env vars, slash commands, and Claude session
  history all carry over automatically — see the
  [migration guide](https://github.com/wabox-app/wabox-bot/blob/main/docs/migrating-from-wabox-claude-code.md).
- Moved the project to the **wabox-app** GitHub organization. The `repository`,
  `homepage`, and issue links now point to `wabox-app/wabox`; the old
  `rodgco/wabox` URLs continue to redirect.

## [0.1.10] - 2026-06-04

### Fixed

- **"Waiting for this message. This may take a while."** — addressed three
  independent root causes that all surface as the same stuck-bubble symptom
  on the recipient's side:
  - *Missing `getMessage` callback.* Baileys' documented remedy for
    retry-receipts. Implemented against a disk-persisted LRU (cap 1000) of
    sent messages under `${dataDir}/sent-cache/`, so when a recipient can't
    decrypt one of our outbound messages we re-encrypt against the freshly
    negotiated session and resend.
  - *Torn signal-key writes on abrupt termination.* Baileys' bundled
    `useMultiFileAuthState` writes `session-<jid>.json` with
    truncate-and-write-in-place — a SIGKILL mid-write (typical under
    `node --watch` in dev, or any hot restart) tears the JSON. On next start
    `JSON.parse` throws, Baileys treats the session as absent, and every
    subsequent message to that contact sticks. Replaced with
    `useAtomicAuthState` (`src/authState.js`): write-to-tmp + atomic
    `rename`.
  - *Dual-identity routing for LID-routed contacts.* WhatsApp runs 1:1
    chats over two parallel identities (`<number>@s.whatsapp.net` and
    `<lid>@lid`) with independent Signal sessions. Receiving on `@lid` and
    replying on `@s.whatsapp.net` desyncs the recipient's counter from ours.
    Wabox now records the LID for every phone number we see on `@lid`
    (persisted to `${dataDir}/lid-map.json`) and the outbox auto-rewrites
    bare-number / `@s.whatsapp.net` reply targets to the known LID. Groups
    and explicit `@lid`/`@broadcast`/`@newsletter` targets pass through
    unchanged. The `examples/wabox-claude-code.sh` bridge was also updated
    to reply on `from` directly so any consumer using it gets the right
    routing for free.

  A fresh re-pair is recommended if you'd already accumulated stuck
  contacts from previous corrupted-state runs.

- `wabox config` / pairing no longer returns before WhatsApp on the phone
  has finished linking. Completion is now tied to Baileys'
  `receivedPendingNotifications: true` (with a 30s safety cap) instead of a
  1.5s post-open timer.

- Noisy 408 "Timed Out" in `init queries`. The post-open
  `fetchProps / fetchBlocklist / fetchPrivacySettings` batch exists for
  WhatsApp Web UI parity and is unused here. Disabled via
  `fireInitQueries: false`.

- Media re-upload option for `downloadMediaMessage` was silently dropped
  after Baileys renamed `reqMediaUpload` → `reuploadRequest`. Expired media
  URLs can be recovered again.

### Changed

- Baileys socket configuration aligned with 6.7.x best practices:
  `state.keys` wrapped in `makeCacheableSignalKeyStore` (in-memory read
  cache, fewer disk reads); `markOnlineOnConnect: false` (your phone keeps
  push-notifying while wabox runs); `shouldSyncHistoryMessage: () => false`
  (skip the history replay we don't use — `receivedPendingNotifications`
  lands in seconds instead of minutes on busy accounts).
- Reconnect uses 1s → 30s exponential backoff instead of immediate retry;
  resets on a healthy `open`.

## [0.1.9] - 2026-06-04

### Fixed

- Inbox envelopes are now published atomically (write to a hidden temp name,
  then rename), so fast consumers reacting in milliseconds can no longer
  delete a partially-written `.json` and lose the read receipt that would
  have marked the message read.

### Added

- New `examples/wabox-claude-code.sh` — a ready-to-run bridge between wabox
  and the Claude Code CLI, with slash commands (`/model`, `/mode`, `/system`,
  `/help`) for per-conversation overrides.

### Changed

- `PROCESSED_DIR` in the Claude Code bridge example is now configurable.

## [0.1.8] - 2026-06-03

### Added

- Installable agent skill at `skills/wabox` (Agent Skills / skills.sh standard):
  `npx skills add wabox-app/wabox` teaches a consumer agent the inbox/outbox
  contract and the read → remove → respond workflow.
- `INTEGRATION.md` — a guide for agents that consume the boxes (message/job
  formats, replies, reactions, content types, WhatsApp text formatting, the
  read-receipt lifecycle, and ready-to-use job examples). Shipped in the npm
  package.

## [0.1.7] - 2026-06-03

### Fixed

- `wabox update` could reinstall the version you already had because npm's cached
  `@latest` dist-tag was stale. It now resolves the concrete latest version with
  a fresh registry read and installs with `--prefer-online`.

## [0.1.6] - 2026-06-03

### Fixed

- Allow list now matches the sender's real phone number even when the chat is
  routed via a LID (`@lid`): it checks `senderPn`/`participantPn`, not just the
  chat JID. Previously messages from an allowed number could be wrongly rejected.

### Added

- Inbox records now include the sender's resolved `number`, and the rejection log
  shows the real phone number (not the LID).

## [0.1.5] - 2026-06-03

### Added

- Log rejected senders (phone number + name) at `info` level when the allow list
  blocks a message, so you can see who tried to reach a restricted inbox.

## [0.1.4] - 2026-06-03

### Added

- `wabox allow` command — manage who can reach the inbox by phone number
  (`list`/`add`/`remove`/`clear`), edited offline in `config.json` with the
  service restarted automatically.

## [0.1.3] - 2026-06-03

### Added

- Send a native WhatsApp read receipt (blue checkmarks) when a message's `.json`
  is removed from the inbox. The consumer owns inbox cleanup; deleting a file is
  the "message processed" signal.
- `wabox update` command — updates the global npm package and restarts the
  background service.

### Changed

- Quiet Baileys' chatty internal logs by giving it its own logger (default
  `warn`, tunable via `BAILEYS_LOG_LEVEL`), so harmless app-state resync and
  init-query timeouts no longer flood the journal.

> Note: version 0.1.2 was bumped during development but never published to npm;
> its logging change shipped as part of 0.1.3.

## [0.1.1] - 2026-06-03

### Fixed

- Complete WhatsApp pairing reliably: reconnect on stream error 515 ("restart
  required"), which WhatsApp sends right after the QR scan. Pairing previously
  stopped at this point and appeared to fail.

## [0.1.0] - 2026-06-03

Initial release.

### Added

- WhatsApp ↔ filesystem bridge built on [Baileys](https://github.com/WhiskeySockets/Baileys):
  QR pairing with a persisted session and automatic reconnect.
- Incoming messages (text + media) saved to an `inbox/` folder as JSON, with
  media downloaded alongside.
- Outbox folder watched for outgoing jobs — send text, files, quoted replies,
  and emoji reactions.
- Cross-platform CLI (`config`, `run`, `pair`, `status`, `uninstall`) with an
  interactive setup, native per-OS paths (XDG on Linux, Application Support on
  macOS, `%APPDATA%`/`%LOCALAPPDATA%` on Windows), and background-service
  install via systemd, launchd, or Windows Task Scheduler.
- MIT license and contribution guidelines, including an AI-assistance policy.

[Unreleased]: https://github.com/wabox-app/wabox/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/wabox-app/wabox/compare/v0.1.11...v0.2.0
[0.1.11]: https://github.com/wabox-app/wabox/compare/v0.1.10...v0.1.11
[0.1.10]: https://github.com/wabox-app/wabox/compare/v0.1.9...v0.1.10
[0.1.9]: https://github.com/wabox-app/wabox/compare/v0.1.8...v0.1.9
[0.1.8]: https://github.com/wabox-app/wabox/compare/v0.1.7...v0.1.8
[0.1.7]: https://github.com/wabox-app/wabox/compare/v0.1.6...v0.1.7
[0.1.6]: https://github.com/wabox-app/wabox/compare/v0.1.5...v0.1.6
[0.1.5]: https://github.com/wabox-app/wabox/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/wabox-app/wabox/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/wabox-app/wabox/compare/v0.1.1...v0.1.3
[0.1.1]: https://github.com/wabox-app/wabox/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/wabox-app/wabox/releases/tag/v0.1.0
