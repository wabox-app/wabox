// Pure message-parsing helpers, extracted from inbox.js so they can be unit
// tested without pulling in the socket/watcher stack (Baileys, chokidar). Every
// function here is pure: message-shape in, plain data out — no I/O, no deps.

import path from 'node:path';

// Maps the media message keys Baileys exposes to a friendly type label.
export const MEDIA_KEYS = {
  imageMessage: 'image',
  videoMessage: 'video',
  audioMessage: 'audio',
  documentMessage: 'document',
  stickerMessage: 'sticker',
};

// Minimal mimetype -> extension fallbacks for when no filename is provided.
export const MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'application/pdf': 'pdf',
};

// Some messages are wrapped (disappearing / view-once). Peel them.
export function unwrap(message) {
  if (!message) return message;
  if (message.ephemeralMessage) return unwrap(message.ephemeralMessage.message);
  if (message.viewOnceMessage) return unwrap(message.viewOnceMessage.message);
  if (message.viewOnceMessageV2) return unwrap(message.viewOnceMessageV2.message);
  if (message.documentWithCaptionMessage)
    return unwrap(message.documentWithCaptionMessage.message);
  return message;
}

export function extractText(message) {
  if (!message) return '';
  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
    ''
  );
}

export function findMedia(message) {
  for (const [key, type] of Object.entries(MEDIA_KEYS)) {
    if (message?.[key]) return { type, key, node: message[key] };
  }
  return null;
}

export function extFor(node, type) {
  if (node.fileName) {
    const e = path.extname(node.fileName).replace('.', '');
    if (e) return e;
  }
  if (node.mimetype && MIME_EXT[node.mimetype.split(';')[0]]) {
    return MIME_EXT[node.mimetype.split(';')[0]];
  }
  return type === 'audio' ? 'ogg' : 'bin';
}

// Local part of a JID, without the @server or :device suffix.
// "5511983426258:2@s.whatsapp.net" -> "5511983426258"
export function bare(jid) {
  return (jid || '').split('@')[0].split(':')[0];
}

// contextInfo (mentions + quoted-reply data) rides on whichever content node
// carries it: plain text on `extendedTextMessage`, a caption mention on the
// media node. Walk the candidate nodes of the unwrapped message and return the
// first `contextInfo` found, or null. Unwraps defensively so an ephemeral /
// view-once quote is handled the same as a bare one.
export function getContextInfo(message) {
  const msg = unwrap(message);
  if (!msg) return null;
  const nodes = [msg.extendedTextMessage, ...Object.keys(MEDIA_KEYS).map((k) => msg[k])];
  for (const node of nodes) {
    if (node?.contextInfo) return node.contextInfo;
  }
  return null;
}

// The JIDs the message @-mentions, verbatim as Baileys delivers them (may be
// `@s.whatsapp.net` or `@lid`; no normalization — see the design). Defensive:
// a missing or malformed `mentionedJid` reads as "no mentions".
export function extractMentions(ctx) {
  return Array.isArray(ctx?.mentionedJid) ? ctx.mentionedJid : [];
}

// A reply that quotes another message carries `stanzaId` + `participant` +
// `quotedMessage` in its contextInfo. Return a compact record, or null when the
// message isn't a quote-reply. `self` is the selfIds() set: `fromMe` marks a
// reply to one of our own messages — a "you were addressed" signal for group
// gating consumers. `text` is a 200-char preview of the quoted body.
export function quotedRecord(ctx, self) {
  if (!ctx?.stanzaId) return null;
  const participant = ctx.participant ?? null;
  return {
    id: ctx.stanzaId,
    participant,
    fromMe: self.has(bare(participant)),
    text: extractText(unwrap(ctx.quotedMessage)).slice(0, 200),
  };
}
