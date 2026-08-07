import {
  Note,
  Merchant,
  DepositResult,
  PaymentResult,
  PaymentProof,
  ProtocolStats,
  MerkleTree,
  computeCommitment,
  computeNullifier,
  generateRandomNonce,
  PROTOCOL_CONSTANTS
} from '@vinchi/shared';
import { VinchiWallet } from '@vinchi/wallet-core';

export interface VinchiClientConfig {
  networkUrl?: string;
  proofServerUrl?: string;
  autoSyncIndex?: boolean;
}

export class VinchiSDK {
  private noteTree: MerkleTree = new MerkleTree(32);
  private merchantTree: MerkleTree = new MerkleTree(20);
  private nullifierSet: Set<string> = new Set();
  private merchants: Map<string, Merchant> = new Map();
  private merchantIndexMap: Map<string, number> = new Map();

  private totalCollateral: bigint = 0n;
  private totalIssued: bigint = 0n;
  private yieldIndex: bigint = PROTOCOL_CONSTANTS.RAY; // 1e27

  constructor(config: VinchiClientConfig = {}) {
    // Initialize default demo merchants for hackathon
    this.initDefaultMerchants();
  }

  private async initDefaultMerchants() {
    await this.registerMerchant({
      id: 'merchant_cafeteria_01',
      name: 'Café & Co. Midnight',
      publicKey: '0x03a1f893d8b2c890123456789abcdef0123456789abcdef0123456789abcdef012',
      category: 'Food & Beverage',
      isEnabled: true
    });

    await this.registerMerchant({
      id: 'merchant_tech_02',
      name: 'Crypto Tech Store',
      publicKey: '0x02b9e847c123456789abcdef0123456789abcdef0123456789abcdef012345678',
      category: 'Electronics',
      isEnabled: true
    });
  }

  /**
   * Registers a new merchant in the Merchant Merkle Tree.
   */
  public async registerMerchant(merchant: Merchant): Promise<number> {
    this.merchants.set(merchant.publicKey.toLowerCase(), merchant);
    const leaf = '0x' + merchant.publicKey.toLowerCase().slice(-64).padStart(64, '0');
    const leafIndex = await this.merchantTree.insert(leaf);
    this.merchantIndexMap.set(merchant.publicKey.toLowerCase(), leafIndex);
    return leafIndex;
  }

  /**
   * Returns merchant details by public key.
   */
  public getMerchant(publicKey: string): Merchant | undefined {
    return this.merchants.get(publicKey.toLowerCase());
  }

  /**
   * Returns list of all registered merchants.
   */
  public getMerchants(): Merchant[] {
    return Array.from(this.merchants.values());
  }

  /**
   * Deposits USDC into Vinchi protocol (Deposit Circuit).
   * Minting lUSDv note 1:1 for MVP.
   */
  public async deposit(wallet: VinchiWallet, usdcAmount: bigint): Promise<DepositResult> {
    if (usdcAmount <= 0n) {
      throw new Error('Deposit amount must be greater than zero');
    }

    const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));
    const defaultMaturesAt = currentTimestamp + BigInt(PROTOCOL_CONSTANTS.DEFAULT_MATURATION_PERIOD_SECONDS);
    const nonce = await wallet.nextNonce();

    // 1. Calculate lAmount (net yield = 0 in MVP)
    const lAmount = usdcAmount;

    // 2. Create note
    const note: Note = {
      owner: wallet.publicKey,
      amount: lAmount,
      maturesAt: defaultMaturesAt,
      rateBps: PROTOCOL_CONSTANTS.DEFAULT_RATE_BPS,
      nonce
    };

    // 3. Compute commitment & insert into note Merkle tree
    const commitment = await computeCommitment(note);
    await this.noteTree.insert(commitment);

    // 4. Update protocol aggregates (Proof of Reserves)
    this.totalCollateral += usdcAmount;
    this.totalIssued += lAmount;

    // 5. Store note in wallet
    await wallet.addNote(note, 'unspent');

    const txHash = '0x' + Math.random().toString(16).substring(2, 10) + Math.random().toString(16).substring(2, 10);

    return {
      txHash,
      note,
      commitment,
      amount: lAmount
    };
  }

  /**
   * Executes Private Payment (Pay Circuit in VinchiNotes.compact).
   * Generates Zero-Knowledge proof inputs/outputs with 4-input padding (N3 mitigation)
   * and verifies merchant inclusion proof in merchantTree.
   */
  public async pay(
    wallet: VinchiWallet,
    recipientMerchantPublicKey: string,
    amount: bigint
  ): Promise<PaymentResult> {
    const merchant = this.merchants.get(recipientMerchantPublicKey.toLowerCase());
    if (!merchant || !merchant.isEnabled) {
      throw new Error(`Merchant ${recipientMerchantPublicKey} is not registered or disabled`);
    }

    // 1. Merchant Merkle proof
    const merchantIndex = this.merchantIndexMap.get(recipientMerchantPublicKey.toLowerCase());
    if (merchantIndex === undefined) {
      throw new Error(`Merchant index not found for ${recipientMerchantPublicKey}`);
    }
    const merchantRoot = await this.merchantTree.getRoot();
    const merchantProof = await this.merchantTree.getProof(merchantIndex);
    const isMerchantValid = await MerkleTree.verifyProof(merchantRoot, merchantProof);
    if (!isMerchantValid) {
      throw new Error('Failed to verify merchant Merkle proof');
    }

    // 2. Coin Selection
    const { selectedInputs, paymentNote, changeNote, totalSelectedAmount } =
      await wallet.selectNotesForPayment(amount, recipientMerchantPublicKey);

    // 3. Compute Nullifiers for input notes (spend prevention)
    const inputNullifiers: string[] = [];
    const inputCommitments: string[] = [];
    for (const input of selectedInputs) {
      if (this.nullifierSet.has(input.nullifier)) {
        throw new Error(`Double spend attempt! Nullifier ${input.nullifier} already exists on-chain`);
      }
      inputNullifiers.push(input.nullifier);
      inputCommitments.push(input.commitment);
    }

    // 4. Create commitments for output notes
    const outputNotes: Note[] = [paymentNote];
    if (changeNote) {
      outputNotes.push(changeNote);
    }

    const outputCommitments: string[] = [];
    for (const outNote of outputNotes) {
      const comm = await computeCommitment(outNote);
      outputCommitments.push(comm);
      await this.noteTree.insert(comm);
    }

    // 5. Mark input nullifiers as spent
    for (const nullifier of inputNullifiers) {
      this.nullifierSet.add(nullifier);
    }
    wallet.markSpent(inputCommitments);

    // 6. Store change note in wallet if created
    if (changeNote) {
      await wallet.addNote(changeNote, 'unspent');
    }

    const txHash = '0x' + Math.random().toString(16).substring(2, 10) + Math.random().toString(16).substring(2, 10);

    return {
      txHash,
      paidAmount: amount,
      changeAmount: changeNote ? changeNote.amount : 0n,
      nullifiers: inputNullifiers,
      outputNotes,
      recipientPublicKey: recipientMerchantPublicKey
    };
  }

  /**
   * Retrieves overall protocol stats (Public Proof of Reserves).
   */
  public async getStats(): Promise<ProtocolStats> {
    return {
      totalCollateralUsdc: this.totalCollateral,
      totalIssuedLusd: this.totalIssued,
      totalNotesCount: this.noteTree.getLeaves().length,
      merchantCount: this.merchants.size,
      currentYieldIndex: this.yieldIndex
    };
  }
}
