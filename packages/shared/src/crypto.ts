import { Note } from './types.js';

/**
 * SHA-256 helper supporting Node.js and Browser runtimes.
 */
async function sha256Hex(data: string): Promise<string> {
  if (typeof globalThis.crypto?.subtle !== 'undefined') {
    const encoder = new TextEncoder();
    const hashBuf = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(data));
    const hashArray = Array.from(new Uint8Array(hashBuf));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } else {
    const { createHash } = await import('node:crypto');
    return createHash('sha256').update(data).digest('hex');
  }
}

/**
 * Computes Note Commitment: hash(owner, amount, maturesAt, rateBps, nonce)
 * As defined in Vinchi Midnight specification (Part 1 - Note Model).
 */
export async function computeCommitment(note: Note): Promise<string> {
  const payload = [
    note.owner.toLowerCase(),
    note.amount.toString(),
    note.maturesAt.toString(),
    note.rateBps.toString(),
    note.nonce
  ].join(':');

  return '0x' + (await sha256Hex(`VINCHI_NOTE_COMMITMENT:${payload}`));
}

/**
 * Computes Nullifier: hash(nullifierKey, commitment)
 * Published on-chain when spending a note to prevent double-spending without revealing the note.
 */
export async function computeNullifier(nullifierKey: string, commitment: string): Promise<string> {
  return '0x' + (await sha256Hex(`VINCHI_NULLIFIER:${nullifierKey}:${commitment}`));
}

/**
 * Deterministic Nonce Derivation (HKDF-like) for N1 Fund Recovery:
 * nonce_i = hash(seed, "vinchi-note", index)
 * Allows full note scanning & recovery from seed alone.
 */
export async function deriveDeterministicNonce(seed: string, index: number): Promise<string> {
  return await sha256Hex(`VINCHI_NONCE:${seed}:${index}`);
}

/**
 * Derives user's Nullifier Secret Key from seed:
 * nullifierKey = hash(seed, "vinchi-nullifier-key")
 */
export async function deriveNullifierKey(seed: string): Promise<string> {
  return '0x' + (await sha256Hex(`VINCHI_NULLIFIER_KEY:${seed}`));
}

/**
 * Utility to generate a random 32-byte hex nonce
 */
export function generateRandomNonce(): string {
  if (typeof globalThis.crypto?.getRandomValues !== 'undefined') {
    const bytes = new Uint8Array(32);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('');
}
