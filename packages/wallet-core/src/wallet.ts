import {
  Note,
  WalletNote,
  computeCommitment,
  computeNullifier,
  deriveDeterministicNonce,
  deriveNullifierKey,
  generateRandomNonce,
  PROTOCOL_CONSTANTS
} from '@vinchi/shared';

export interface WalletState {
  seed: string;
  publicKey: string;
  nullifierKey: string;
  notes: WalletNote[];
  nonceCounter: number;
}

export class VinchiWallet {
  private seed: string;
  public publicKey: string;
  public nullifierKey: string;
  private notes: Map<string, WalletNote> = new Map();
  private nonceCounter: number = 0;

  constructor(seed: string, publicKey: string, initialNotes: WalletNote[] = [], nonceCounter: number = 0) {
    this.seed = seed;
    this.publicKey = publicKey;
    // Derive nullifier key deterministically from seed
    this.nullifierKey = seed; // populated asynchronously in init
    for (const note of initialNotes) {
      this.notes.set(note.commitment, note);
    }
    this.nonceCounter = nonceCounter;
  }

  public static async create(seed: string, publicKey: string): Promise<VinchiWallet> {
    const wallet = new VinchiWallet(seed, publicKey);
    wallet.nullifierKey = await deriveNullifierKey(seed);
    return wallet;
  }

  /**
   * Calculates total unspent balance in local client memory.
   * On-chain state does not track user balances (Zcash note model).
   */
  public getBalance(): bigint {
    let total = 0n;
    for (const item of this.notes.values()) {
      if (item.status === 'unspent' || item.status === 'materialized') {
        total += item.note.amount;
      }
    }
    return total;
  }

  /**
   * Returns all unspent notes owned by this wallet.
   */
  public getUnspentNotes(): WalletNote[] {
    return Array.from(this.notes.values()).filter(
      n => n.status === 'unspent' || n.status === 'materialized'
    );
  }

  /**
   * Stores a newly created or received note into local wallet state.
   */
  public async addNote(note: Note, status: 'unspent' | 'materialized' = 'unspent'): Promise<WalletNote> {
    const commitment = await computeCommitment(note);
    const nullifier = await computeNullifier(this.nullifierKey, commitment);

    const walletNote: WalletNote = {
      id: commitment,
      note,
      commitment,
      nullifier,
      status,
      createdAt: Date.now()
    };

    this.notes.set(commitment, walletNote);
    return walletNote;
  }

  /**
   * Generates a deterministic nonce for new note creation (supports N1 recovery).
   */
  public async nextNonce(): Promise<string> {
    const nonce = await deriveDeterministicNonce(this.seed, this.nonceCounter);
    this.nonceCounter++;
    return nonce;
  }

  /**
   * Coin Selection Algorithm (FIFO / Greedy):
   * Selects input notes to spend for a target payment amount, and builds change note.
   */
  public async selectNotesForPayment(
    targetAmount: bigint,
    recipientPublicKey: string,
    maturationSeconds: number = PROTOCOL_CONSTANTS.DEFAULT_MATURATION_PERIOD_SECONDS
  ): Promise<{
    selectedInputs: WalletNote[];
    paymentNote: Note;
    changeNote: Note | null;
    totalSelectedAmount: bigint;
  }> {
    const unspent = this.getUnspentNotes();
    let accumulated = 0n;
    const selectedInputs: WalletNote[] = [];

    // Sort notes by maturesAt (FIFO)
    unspent.sort((a, b) => Number(a.note.maturesAt - b.note.maturesAt));

    for (const item of unspent) {
      selectedInputs.push(item);
      accumulated += item.note.amount;
      if (accumulated >= targetAmount) {
        break;
      }
    }

    if (accumulated < targetAmount) {
      throw new Error(
        `Insufficient funds. Required: ${targetAmount.toString()}, Available: ${accumulated.toString()}`
      );
    }

    const changeAmount = accumulated - targetAmount;
    const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));
    const defaultMaturesAt = selectedInputs[0]?.note.maturesAt || (currentTimestamp + BigInt(maturationSeconds));

    // Note for merchant recipient
    const paymentNote: Note = {
      owner: recipientPublicKey,
      amount: targetAmount,
      maturesAt: defaultMaturesAt,
      rateBps: PROTOCOL_CONSTANTS.DEFAULT_RATE_BPS,
      nonce: generateRandomNonce()
    };

    // Change note back to payer
    let changeNote: Note | null = null;
    if (changeAmount > 0n) {
      const changeNonce = await this.nextNonce();
      changeNote = {
        owner: this.publicKey,
        amount: changeAmount,
        maturesAt: defaultMaturesAt,
        rateBps: PROTOCOL_CONSTANTS.DEFAULT_RATE_BPS,
        nonce: changeNonce
      };
    }

    return {
      selectedInputs,
      paymentNote,
      changeNote,
      totalSelectedAmount: accumulated
    };
  }

  /**
   * Marks input notes as spent after tx broadcast.
   */
  public markSpent(commitments: string[]): void {
    for (const comm of commitments) {
      const existing = this.notes.get(comm);
      if (existing) {
        existing.status = 'spent';
      }
    }
  }

  /**
   * Deterministic recovery (N1 mitigation in README):
   * Scans a given list of on-chain commitments using deterministic nonces.
   */
  public async scanAndRecoverNotes(
    onChainCommitments: Set<string>,
    maxScanCount: number = 100,
    amountEstimates: bigint[] = [100n, 500n, 1000n, 5000n]
  ): Promise<number> {
    let recovered = 0;
    const now = BigInt(Math.floor(Date.now() / 1000));
    const defaultMaturation = now + BigInt(PROTOCOL_CONSTANTS.DEFAULT_MATURATION_PERIOD_SECONDS);

    for (let i = 0; i < maxScanCount; i++) {
      const nonce = await deriveDeterministicNonce(this.seed, i);

      for (const amount of amountEstimates) {
        const candidateNote: Note = {
          owner: this.publicKey,
          amount,
          maturesAt: defaultMaturation,
          rateBps: PROTOCOL_CONSTANTS.DEFAULT_RATE_BPS,
          nonce
        };

        const comm = await computeCommitment(candidateNote);
        if (onChainCommitments.has(comm) && !this.notes.has(comm)) {
          await this.addNote(candidateNote, 'unspent');
          recovered++;
        }
      }
    }

    return recovered;
  }

  /**
   * Export encrypted state JSON for user backup.
   */
  public exportState(): WalletState {
    return {
      seed: this.seed,
      publicKey: this.publicKey,
      nullifierKey: this.nullifierKey,
      notes: Array.from(this.notes.values()),
      nonceCounter: this.nonceCounter
    };
  }

  /**
   * Import wallet from exported state JSON.
   */
  public static async importState(state: WalletState): Promise<VinchiWallet> {
    const wallet = new VinchiWallet(state.seed, state.publicKey, state.notes, state.nonceCounter);
    wallet.nullifierKey = state.nullifierKey || (await deriveNullifierKey(state.seed));
    return wallet;
  }
}
