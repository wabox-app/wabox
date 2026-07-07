// First unit suite in the repo. Covers the pure mention / quoted-reply helpers
// against captured Baileys message shapes. Run with `node --test` (no deps: it
// imports only src/envelope.js and src/selfId.js, which pull in nothing heavy).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  getContextInfo,
  extractMentions,
  quotedRecord,
} from '../src/envelope.js';
import { selfIds } from '../src/selfId.js';

// A stub socket for a session logged in as this phone JID + LID.
const sock = {
  user: { id: '5511999990000:12@s.whatsapp.net', lid: '111122223333@lid' },
};
const self = selfIds(sock);

// --- selfIds -------------------------------------------------------------

test('selfIds collects bare phone + lid identities', () => {
  assert.deepEqual([...self].sort(), ['111122223333', '5511999990000']);
});

test('selfIds is empty-safe before the socket has a user', () => {
  assert.equal(selfIds({}).size, 0);
  assert.equal(selfIds(undefined).size, 0);
  assert.equal(selfIds({ user: {} }).size, 0);
});

// --- getContextInfo ------------------------------------------------------

test('getContextInfo reads contextInfo from extendedTextMessage', () => {
  const ctx = { mentionedJid: ['5511888887777@s.whatsapp.net'] };
  const message = { extendedTextMessage: { text: 'oi @fulano', contextInfo: ctx } };
  assert.equal(getContextInfo(message), ctx);
});

test('getContextInfo reads contextInfo from a media caption node', () => {
  const ctx = { mentionedJid: ['5511888887777@s.whatsapp.net'] };
  const message = { imageMessage: { caption: 'olha @fulano', contextInfo: ctx } };
  assert.equal(getContextInfo(message), ctx);
});

test('getContextInfo unwraps ephemeral/view-once wrappers', () => {
  const ctx = { stanzaId: 'X', participant: '5511888887777@s.whatsapp.net' };
  const message = {
    ephemeralMessage: {
      message: { extendedTextMessage: { text: 'reply', contextInfo: ctx } },
    },
  };
  assert.equal(getContextInfo(message), ctx);
});

test('getContextInfo returns null when no node carries contextInfo', () => {
  assert.equal(getContextInfo({ conversation: 'plain text' }), null);
  assert.equal(getContextInfo(null), null);
});

// --- extractMentions -----------------------------------------------------

test('extractMentions returns mentionedJid verbatim', () => {
  const ctx = { mentionedJid: ['5511888887777@s.whatsapp.net', '111122223333@lid'] };
  assert.deepEqual(extractMentions(ctx), [
    '5511888887777@s.whatsapp.net',
    '111122223333@lid',
  ]);
});

test('extractMentions is defensive: missing/forwarded/malformed => []', () => {
  assert.deepEqual(extractMentions(null), []);
  assert.deepEqual(extractMentions({ isForwarded: true }), []); // forwarded, no mentions
  assert.deepEqual(extractMentions({ mentionedJid: 'nope' }), []); // non-array
});

test('mentionedMe matches an own identity on either phone or LID form', () => {
  const mentionedMe = (jids) =>
    extractMentions({ mentionedJid: jids }).some((j) =>
      self.has(j.split('@')[0].split(':')[0]),
    );
  assert.equal(mentionedMe(['5511999990000@s.whatsapp.net']), true); // phone form
  assert.equal(mentionedMe(['111122223333@lid']), true); // LID form
  assert.equal(mentionedMe(['5511888887777@s.whatsapp.net']), false); // someone else
});

// --- quotedRecord --------------------------------------------------------

test('quotedRecord flags a reply to our own message as fromMe', () => {
  const ctx = {
    stanzaId: '3A80DACFEEF3EEE1A448',
    participant: '5511999990000@s.whatsapp.net',
    quotedMessage: { conversation: 'my earlier message' },
  };
  assert.deepEqual(quotedRecord(ctx, self), {
    id: '3A80DACFEEF3EEE1A448',
    participant: '5511999990000@s.whatsapp.net',
    fromMe: true,
    text: 'my earlier message',
  });
});

test("quotedRecord flags another author's quoted message as not fromMe", () => {
  const ctx = {
    stanzaId: 'ABC',
    participant: '5511888887777@s.whatsapp.net',
    quotedMessage: { conversation: 'their message' },
  };
  const q = quotedRecord(ctx, self);
  assert.equal(q.fromMe, false);
  assert.equal(q.participant, '5511888887777@s.whatsapp.net');
});

test('quotedRecord returns null when the message is not a quote-reply', () => {
  assert.equal(quotedRecord(null, self), null);
  assert.equal(quotedRecord({ isForwarded: true }, self), null); // forwarded, no stanzaId
});

test('quotedRecord caps the quoted preview at 200 chars', () => {
  const ctx = {
    stanzaId: 'ID',
    participant: null,
    quotedMessage: { conversation: 'x'.repeat(500) },
  };
  const q = quotedRecord(ctx, self);
  assert.equal(q.text.length, 200);
  assert.equal(q.fromMe, false); // null participant never matches self
});

test('quotedRecord tolerates an unavailable quoted body', () => {
  const q = quotedRecord({ stanzaId: 'ID', participant: null }, self);
  assert.equal(q.text, '');
});
