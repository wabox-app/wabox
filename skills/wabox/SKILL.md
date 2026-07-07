---
name: wabox
description: Read and reply to WhatsApp messages through a wabox inbox/outbox folder pair. Use when a wabox gateway is running and you need to process incoming WhatsApp messages (text or media), reply, react with an emoji, quote-reply, or send files over WhatsApp via the filesystem.
---

<!-- Generated from INTEGRATION.md by scripts/build-skill.mjs — do not edit by hand. -->

# wabox — WhatsApp via the filesystem

This document tells a **consumer** — the agent or process that reads the inbox
and writes the outbox — how to interact with wabox. wabox is just a bridge:
incoming WhatsApp messages become files in `inbox/`; you reply by writing job
files to `outbox/`. There is no API to call — only files.

> For where these folders live, run `wabox status`. Defaults:
> `~/.local/share/wabox/inbox` and `.../outbox` (Linux). All paths below are
> relative to those.

## The loop (read this first)

The recommended order is **read → remove → respond**:

1. A new message appears as `inbox/<stem>.json` (plus a media file if any).
2. **Pick it up:** read the JSON (and any media bytes) into memory, or move the
   files into your own working folder.
3. **Remove it from `inbox/` right away** — delete the `.json` (and its media)
   once you've captured it, or move them out. This is your "I've read this"
   signal: wabox immediately marks the message **read** on WhatsApp (blue
   checkmarks).
4. **Process and respond:** do your work and write the reply job to `outbox/`.

Removing on pickup (step 3) *before* processing (step 4) is deliberate: the
sender sees the blue checkmarks as soon as your agent has the message — not only
after a possibly slow reply is ready.

**You own cleanup.** wabox never deletes inbox files; removing each `.json` is
your job and is the only thing that sends the read receipt. Sending a reply does
**not** remove it. Just be sure you've captured the JSON *and* any media before
deleting — deletion removes the media file too. (Prefer **moving** the files to a
working folder if you want to keep them around while you process.)

## Reading: inbox message format

```json
{
  "id": "3A80DACFEEF3EEE1A448",
  "from": "277880256909343@lid",
  "number": "5511983426258",
  "participant": null,
  "pushName": "Rodrigo Couto",
  "fromMe": false,
  "timestamp": "2026-06-03T09:25:34.000Z",
  "text": "check this photo",
  "mentions": [],
  "mentionedMe": false,
  "quoted": null,
  "media": {
    "type": "image",
    "file": "20260603-062534_277880256909343lid_A1B2C3D4.jpg",
    "originalName": null,
    "mimetype": "image/jpeg"
  }
}
```

| Field         | Meaning                                                                 |
| ------------- | ---------------------------------------------------------------------- |
| `id`          | WhatsApp message id. Use it for `replyTo` / `react`.                    |
| `from`        | Chat JID. `…@s.whatsapp.net` or `…@lid` = a person; `…@g.us` = a group. |
| `number`      | The sender's real phone number (digits). Best thing to reply to in DMs. |
| `participant` | In groups, the sender's JID; `null` in 1:1 chats.                       |
| `pushName`    | The sender's display name.                                              |
| `fromMe`      | Usually `false` (your own messages are skipped by default).             |
| `timestamp`   | ISO 8601.                                                               |
| `text`        | Message text / media caption (may be empty).                           |
| `mentions`    | JIDs this message @-mentions, verbatim (`@s.whatsapp.net` or `@lid`); `[]` when none. |
| `mentionedMe` | `true` when one of *your* identities (phone or LID) is in `mentions`.    |
| `quoted`      | `null`, or the quoted message when this is a reply (below).             |
| `media`       | `null`, or an object describing an attachment (below).                  |

**Quoted:** when the message is a reply, `quoted` is `{ "id", "participant",
"fromMe", "text" }` — the quoted message's id, its author's JID, whether it was
one of *your* messages (`fromMe`), and a 200-char preview of its body. `null`
otherwise.

**Media:** when present, the file sits next to the JSON; open `inbox/<media.file>`
to read its bytes. `media.type` is one of `image`, `video`, `audio`, `document`,
`sticker`. If a download failed you'll see `{"type": ..., "error": "..."}`
instead of `file`.

### Groups: knowing when you're addressed

In a busy group you usually want to react only when someone is actually talking
to you. Two signals mean "addressed to me", and the envelope hands you both
pre-computed — no JID bookkeeping on your side:

```sh
# reply only when @-mentioned or when someone replies to one of your messages
jq -e '.mentionedMe or (.quoted.fromMe // false)' inbox/msg.json
```

`mentionedMe` and `quoted.fromMe` are decided by wabox against the session's own
identities (phone number **and** LID), so they hold even when the group routes
you as a `@lid`. `mentions` carries the raw JID list if you need more than the
boolean.

> **Older wabox:** these three fields are additive. A core that predates them
> simply omits them, so guard with `// false` / `// empty` (as above) and treat
> their absence as "can't tell — behave as you did before".

## Writing: outbox job format

To send something, write a `.json` file anywhere in `outbox/` (any filename
ending in `.json`):

```json
{
  "to": "5511983426258",
  "text": "Got it — here's the summary",
  "replyTo": { "id": "3A80DACFEEF3EEE1A448" },
  "react": { "emoji": "👍", "messageId": "3A80DACFEEF3EEE1A448" },
  "files": ["summary.pdf"]
}
```

| Field     | Required | Meaning                                                                 |
| --------- | -------- | ---------------------------------------------------------------------- |
| `to`      | yes      | Recipient. See "Choosing `to`" below.                                   |
| `text`    | no       | Body. Sent on its own with no files; otherwise the caption of file #1.  |
| `files`   | no       | Array of paths. Relative paths resolve against `outbox/`; absolute ok.  |
| `replyTo` | no       | Quote-reply. A message id string, or `{ "id", "participant", "text" }`. |
| `react`   | no       | `{ "emoji", "messageId", "participant" }`. Empty emoji removes it.      |

After processing, the job moves to `outbox/sent/` on success, or
`outbox/failed/` with a `.error.txt` sidecar on failure.

**Write atomically.** Create the file under a temp name and `rename` it into
`outbox/` (or write elsewhere and move it in). This guarantees the watcher never
reads a half-written job.

### Choosing `to`

- **DM:** use the inbox `number` (digits, country code, no `+`, e.g.
  `5511983426258`). A bare number is normalized to `…@s.whatsapp.net`.
- **Group:** use the inbox `from` (the `…@g.us` JID) to reply in the group.
- You may also pass any full JID directly.

### Replying and reacting

- **Quote a message:** set `replyTo` to the incoming `id`. In a group, also pass
  `participant` (copy it from the inbox JSON). `text` inside `replyTo` is just
  the preview shown in the quote bubble and is optional.
- **React:** `react` with the incoming `id` as `messageId`. A reaction can be the
  whole job (no `text`/`files`) or ride along with a reply. Send an empty
  `emoji` (`""`) to remove a previous reaction.

## Content you can send

| Kind        | How                                          | Extensions inferred                |
| ----------- | -------------------------------------------- | ---------------------------------- |
| Text        | `text`                                       | —                                  |
| Image       | a file in `files`                            | jpg, jpeg, png, gif, webp          |
| Video       | a file in `files`                            | mp4, mov, 3gp                      |
| Audio       | a file in `files` (sent as an audio file)    | ogg, mp3, m4a, wav                 |
| Document    | any other file                               | pdf, …everything else              |
| Reaction    | `react`                                      | single emoji                       |

The kind is inferred from the file extension. Multiple files in one job are sent
as separate messages, in order; `text` becomes the caption of the first.

Keep attachments within WhatsApp's limits (roughly ~16 MB for image/audio/video,
larger for documents). For long text, prefer sending a document over a giant
message.

## Formatting text (WhatsApp markup)

WhatsApp supports a small markup set — not Markdown:

- `*bold*` → **bold**
- `_italic_` → _italic_
- `~strikethrough~` → ~~strikethrough~~
- ```` ```monospace``` ```` (triple backticks) → monospace block
- Newlines are preserved; use blank lines to separate paragraphs.

Do **not** use Markdown headings (`#`) or links (`[text](url)`) — they won't
render. Paste raw URLs; WhatsApp auto-links them.

## Etiquette for agents

- **Chat, don't essay.** Keep replies short and conversational; split long
  answers or attach a document.
- **Acknowledge with reactions.** A 👍 / 👀 reaction is a cheap "got it /
  working on it" without cluttering the chat.
- **Match the sender's language.**
- **Acknowledge on pickup.** Capture the message (read it into memory or move it
  to your workspace), then remove the `.json` from `inbox/` *before* you start
  processing — that fires the read receipt right away, so the sender knows you've
  seen it even if the reply takes a while.
- **One concern per message** reads better than one long block.
- **Respect the allow list.** If a chat reaches you, it's already permitted; you
  don't manage access (that's `wabox allow`, run by the operator).

## Example jobs

Each block is a complete `outbox/<something>.json` file. `to` uses a bare number
for DMs; swap in a `…@g.us` JID for groups. Replace ids with the incoming `id`.

**Plain text reply (DM):**

```json
{ "to": "5511983426258", "text": "Done — your report is ready." }
```

**Quote-reply to a specific message:**

```json
{
  "to": "5511983426258",
  "text": "Yes, that one works.",
  "replyTo": { "id": "3A80DACFEEF3EEE1A448" }
}
```

**React only (acknowledge, no message):**

```json
{
  "to": "5511983426258",
  "react": { "emoji": "👀", "messageId": "3A80DACFEEF3EEE1A448" }
}
```

**React and reply in one job:**

```json
{
  "to": "5511983426258",
  "react": { "emoji": "✅", "messageId": "3A80DACFEEF3EEE1A448" },
  "text": "Processed and saved."
}
```

**Send a document with a caption:**

```json
{
  "to": "5511983426258",
  "text": "Here's the invoice (PDF).",
  "files": ["invoices/2026-06.pdf"]
}
```

**Send an image:**

```json
{ "to": "5511983426258", "files": ["charts/sales.png"] }
```

**Send several files (text becomes the caption of the first):**

```json
{
  "to": "5511983426258",
  "text": "Both versions attached.",
  "files": ["draft-v1.pdf", "draft-v2.pdf"]
}
```

**Reply inside a group, quoting the sender:**

```json
{
  "to": "120363012345678901@g.us",
  "text": "On it, @here.",
  "replyTo": {
    "id": "3A80DACFEEF3EEE1A448",
    "participant": "5511983426258@s.whatsapp.net"
  }
}
```

**Remove a reaction you set earlier:**

```json
{
  "to": "5511983426258",
  "react": { "emoji": "", "messageId": "3A80DACFEEF3EEE1A448" }
}
```

**Formatted text (WhatsApp markup):**

```json
{ "to": "5511983426258", "text": "*Status:* _running_\n~old~ → new" }
```

## Minimal pseudocode

```text
for each new inbox/*.json:
    msg = read(file)                              # 1. capture content first
    if msg.media: bytes = read(inbox/msg.media.file)

    delete(file)                                  # 2. remove on pickup
    if msg.media: delete(inbox/msg.media.file)    #    → marks read NOW (blue ticks)
    # (or: move both into a working folder instead of deleting)

    result = handle(msg, bytes)                   # 3. process after acking

    write_atomic(outbox/<uuid>.json, {            # 4. respond
        to: msg.number (or msg.from for groups),
        text: result.text,
        replyTo: { id: msg.id },
        files: result.files,
    })
```


---

Full reference: <https://github.com/wabox-app/wabox/blob/main/INTEGRATION.md>
