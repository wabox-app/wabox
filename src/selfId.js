// The session's own identities. Isolated from inbox.js because outbound
// mentions (P2) will need the same set, and because deciding "was *I*
// mentioned" is core's job alone — only core knows the phone JID and LID the
// current session is logged in as.

import { bare } from './envelope.js';

// A Set of the session's own identities in bare form (no @server / :device):
// the phone-number JID (`sock.user.id`) and, when the Baileys build exposes it,
// the LID (`sock.user.lid`). Mentions and quoted authors may arrive on either
// identity, so compare against the whole set. Empty-safe: before the socket has
// a user, returns an empty Set (⇒ mentionedMe/fromMe read as false).
export function selfIds(sock) {
  const ids = new Set();
  for (const jid of [sock?.user?.id, sock?.user?.lid]) {
    const b = bare(jid);
    if (b) ids.add(b);
  }
  return ids;
}
