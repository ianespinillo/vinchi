import { MerkleProof } from './types.js';

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

export async function hashPair(left: string, right: string): Promise<string> {
  const sorted = [left, right].sort();
  return '0x' + (await sha256Hex(`MERKLE_NODE:${sorted[0]}:${sorted[1]}`));
}

/**
 * In-Memory Sparse Merkle Tree implementation for client-side state & verification.
 */
export class MerkleTree {
  private depth: number;
  private leaves: string[] = [];

  constructor(depth: number = 32) {
    this.depth = depth;
  }

  public async insert(leaf: string): Promise<number> {
    const index = this.leaves.length;
    this.leaves.push(leaf);
    return index;
  }

  public getLeaves(): string[] {
    return [...this.leaves];
  }

  public async getRoot(): Promise<string> {
    if (this.leaves.length === 0) {
      return '0x0000000000000000000000000000000000000000000000000000000000000000';
    }
    let currentLevel = [...this.leaves];
    while (currentLevel.length > 1) {
      const nextLevel: string[] = [];
      for (let i = 0; i < currentLevel.length; i += 2) {
        const left = currentLevel[i];
        const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left;
        nextLevel.push(await hashPair(left, right));
      }
      currentLevel = nextLevel;
    }
    return currentLevel[0];
  }

  public async getProof(index: number): Promise<MerkleProof> {
    if (index < 0 || index >= this.leaves.length) {
      throw new Error(`Index ${index} out of bounds for Merkle Tree of size ${this.leaves.length}`);
    }

    const path: string[] = [];
    let currentLevel = [...this.leaves];
    let currentIndex = index;

    while (currentLevel.length > 1) {
      const isRight = currentIndex % 2 === 1;
      const siblingIndex = isRight ? currentIndex - 1 : currentIndex + 1;
      const sibling = siblingIndex < currentLevel.length ? currentLevel[siblingIndex] : currentLevel[currentIndex];
      path.push(sibling);

      const nextLevel: string[] = [];
      for (let i = 0; i < currentLevel.length; i += 2) {
        const left = currentLevel[i];
        const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left;
        nextLevel.push(await hashPair(left, right));
      }
      currentLevel = nextLevel;
      currentIndex = Math.floor(currentIndex / 2);
    }

    return {
      leaf: this.leaves[index],
      index,
      path
    };
  }

  public static async verifyProof(root: string, proof: MerkleProof): Promise<boolean> {
    let currentHash = proof.leaf;
    let currentIndex = proof.index;

    for (const sibling of proof.path) {
      currentHash = await hashPair(currentHash, sibling);
      currentIndex = Math.floor(currentIndex / 2);
    }

    return currentHash === root;
  }
}
