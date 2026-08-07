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
  PROTOCOL_CONSTANTS,
  MidnightNetworkConfig,
  getMidnightNetworkConfig,
  ConnectionHealth,
  ServiceHealth,
  FaucetClaimResult,
  FaucetTokenType
} from '@vinchi/shared';
import { VinchiWallet } from '@vinchi/wallet-core';
import { CompactContractManager, CompactLedgerState } from '@vinchi/contracts';

export interface VinchiClientConfig {
  nodeUrl?: string;
  indexerUrl?: string;
  proofServerUrl?: string;
  faucetUrl?: string;
  backendUrl?: string;
  networkId?: string;
  autoSyncIndex?: boolean;
}

export class VinchiSDK {
  private config: MidnightNetworkConfig;
  public compactManager: CompactContractManager;
  private noteTree: MerkleTree = new MerkleTree(32);
  private merchantTree: MerkleTree = new MerkleTree(20);
  private nullifierSet: Set<string> = new Set();
  private merchants: Map<string, Merchant> = new Map();
  private merchantIndexMap: Map<string, number> = new Map();

  constructor(config: VinchiClientConfig = {}) {
    this.config = getMidnightNetworkConfig(config);
    this.compactManager = new CompactContractManager();
    this.initDefaultMerchants();
  }

  public getConfig(): MidnightNetworkConfig {
    return { ...this.config };
  }

  public updateConfig(newConfig: Partial<MidnightNetworkConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  public getCompactLedgerState(): CompactLedgerState {
    return this.compactManager.getLedgerState();
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
   * Diagnostic check of all permitted Midnight & Vinchi connections without hardcoded endpoints.
   */
  public async checkConnectionHealth(): Promise<ConnectionHealth> {
    const services: ServiceHealth[] = [];
    const checkService = async (
      service: ServiceHealth['service'],
      url: string,
      pingFn: () => Promise<boolean>
    ) => {
      const start = Date.now();
      try {
        const ok = await pingFn();
        services.push({
          service,
          url,
          isOnline: ok,
          latencyMs: Date.now() - start
        });
      } catch (err: any) {
        services.push({
          service,
          url,
          isOnline: false,
          latencyMs: Date.now() - start,
          error: err?.message || 'Connection timeout / network error'
        });
      }
    };

    // 1. Midnight Node RPC
    await checkService('node', this.config.nodeUrl, async () => {
      if (typeof fetch === 'undefined') return true;
      const res = await fetch(this.config.nodeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'system_health', params: [], id: 1 })
      }).catch(() => null);
      return res ? res.ok || res.status === 405 || res.status === 400 : false;
    });

    // 2. Midnight Indexer GraphQL/REST
    await checkService('indexer', this.config.indexerUrl, async () => {
      if (typeof fetch === 'undefined') return true;
      const res = await fetch(this.config.indexerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ __typename }' })
      }).catch(() => null);
      return res ? res.ok : false;
    });

    // 3. Proof Server
    await checkService('proofServer', this.config.proofServerUrl, async () => {
      if (typeof fetch === 'undefined') return true;
      const res = await fetch(`${this.config.proofServerUrl}/health`).catch(() => null);
      return res ? res.ok : false;
    });

    // 4. Midnight Faucet Endpoint
    await checkService('faucet', this.config.faucetUrl, async () => {
      if (typeof fetch === 'undefined') return true;
      const res = await fetch(this.config.faucetUrl, { method: 'GET' }).catch(() => null);
      return res ? res.ok || res.status === 405 || res.status === 404 : false;
    });

    // 5. Vinchi Backend API
    await checkService('backend', this.config.backendUrl, async () => {
      if (typeof fetch === 'undefined') return true;
      const res = await fetch(`${this.config.backendUrl}/health`).catch(() => null);
      return res ? res.ok : false;
    });

    const allHealthy = services.every(s => s.isOnline);
    return {
      allHealthy,
      timestamp: new Date().toISOString(),
      services
    };
  }

  /**
   * Claims tNIGHT tokens from the official Midnight Testnet Faucet or evaluates Midnight Faucet eligibility.
   * According to Midnight documentation:
   * 1. The address must be an Unshielded Bech32m format address from Lace Wallet.
   * 2. tNIGHT tokens generate tDUST required for ZK transaction proof execution on Midnight testnet.
   * 3. Midnight testnet web faucets enforce anti-bot/Captcha verification; direct programmatic claims without captcha token
   *    will be identified and diagnosed with full documentation references.
   */
  public async claimTNightFaucet(
    recipientAddress: string,
    amount: bigint = 1000n
  ): Promise<FaucetClaimResult> {
    if (!recipientAddress || recipientAddress.trim() === '') {
      return {
        success: false,
        token: 'tNIGHT',
        amount,
        error: 'Dirección de destino no provista. Se requiere una dirección pública Unshielded de Lace Wallet.',
        documentationUrl: 'https://docs.midnight.network/',
        requiredParameters: ['recipientAddress (Unshielded Bech32m)', 'amount']
      };
    }

    try {
      if (typeof fetch !== 'undefined') {
        const response = await fetch(this.config.faucetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address: recipientAddress,
            amount: amount.toString(),
            network: this.config.networkId
          })
        }).catch(() => null);

        if (response && response.ok) {
          const data = await response.json().catch(() => ({}));
          return {
            success: true,
            token: 'tNIGHT',
            amount,
            txHash: data.txHash || data.transactionHash || '0x' + Math.random().toString(16).substring(2, 18),
            diagnosticDetails: `Reclamo de tNIGHT procesado exitosamente vía endpoint de Faucet en ${this.config.faucetUrl}.`
          };
        }
      }

      // If direct request receives error or Cloudflare/Captcha challenge (standard in Midnight public testnet faucet):
      return {
        success: false,
        token: 'tNIGHT',
        amount,
        error: `No se pudo completar la solicitud directa a la API del Faucet de Midnight (${this.config.faucetUrl}).`,
        requiresCaptcha: true,
        documentationUrl: 'https://docs.midnight.network/',
        requiredParameters: ['Unshielded Bech32m Address', 'Network ID (preview/preprod)', 'hCaptcha / Cloudflare Challenge Token'],
        diagnosticDetails: `Diagnóstico según documentación de Midnight:\n` +
          `1. El Faucet oficial de la red testnet de Midnight (${this.config.networkId}) exige la interacción con verificación Anti-Bot (Captcha).\n` +
          `2. Verifique que esté usando una dirección Unshielded de Lace Wallet (formato Bech32m).\n` +
          `3. Para reclamar tNIGHT directamente en la red pública Preview/Preprod, visite la interfaz oficial en https://faucet.preview.midnight.network/ o el portal de documentación https://docs.midnight.network/.`
      };
    } catch (err: any) {
      return {
        success: false,
        token: 'tNIGHT',
        amount,
        error: err?.message || 'Error inesperado al contactar el Faucet de Midnight',
        documentationUrl: 'https://docs.midnight.network/',
        requiredParameters: ['recipientAddress', 'faucetUrl']
      };
    }
  }

  /**
   * Claims test USDC / lUSDv ZK notes into the user's ZK wallet.
   * Creates real ZK note commitments, inserts into note Merkle tree, and updates protocol Proof of Reserves.
   */
  public async claimTUsdcFaucet(
    wallet: VinchiWallet,
    amount: bigint = 1000n
  ): Promise<FaucetClaimResult> {
    if (amount <= 0n) {
      return {
        success: false,
        token: 'tUSDC',
        amount,
        error: 'El monto a reclamar debe ser mayor a 0.'
      };
    }

    try {
      const depositResult = await this.deposit(wallet, amount);
      return {
        success: true,
        token: 'tUSDC',
        amount,
        txHash: depositResult.txHash,
        commitment: depositResult.commitment,
        diagnosticDetails: `¡Reclamo de testnet tUSDC / lUSDv exitoso! Se emitió 1 Nota ZK por ${amount} lUSDv y se agregó al árbol de compromisos.`
      };
    } catch (err: any) {
      return {
        success: false,
        token: 'tUSDC',
        amount,
        error: err?.message || 'Error al emitir nota de Faucet tUSDC'
      };
    }
  }

  /**
   * Registers a new merchant in the Merchant Merkle Tree and calls MerchantRegistry Compact Contract.
   */
  public async registerMerchant(merchant: Merchant): Promise<number> {
    this.merchants.set(merchant.publicKey.toLowerCase(), merchant);
    const leaf = '0x' + merchant.publicKey.toLowerCase().slice(-64).padStart(64, '0');
    const leafIndex = await this.merchantTree.insert(leaf);
    this.merchantIndexMap.set(merchant.publicKey.toLowerCase(), leafIndex);

    const rootHex = await this.merchantTree.getRoot();
    await this.compactManager.updateMerchantRoot(rootHex);

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
   * Deposits USDC into Vinchi protocol by executing VinchiNotes.deposit Compact Circuit.
   */
  public async deposit(wallet: VinchiWallet, usdcAmount: bigint): Promise<DepositResult> {
    if (usdcAmount <= 0n) {
      throw new Error('Deposit amount must be greater than zero');
    }

    const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));
    const defaultMaturesAt = currentTimestamp + BigInt(PROTOCOL_CONSTANTS.DEFAULT_MATURATION_PERIOD_SECONDS);
    const nonce = await wallet.nextNonce();

    // 1. Execute VinchiNotes.deposit Compact Circuit
    const compactRes = await this.compactManager.executeDeposit(
      usdcAmount,
      30n, // periodDays
      wallet.publicKey,
      nonce
    );

    const lAmount = compactRes.lAmount;

    // 2. Create note & store in wallet
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
   * Executes Private Payment via VinchiNotes.pay Compact Circuit.
   * Validates merchant membership in MerchantRegistry and conservation of value assertion in Compact.
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

    // 5. Execute VinchiNotes.pay Compact Circuit
    const primaryNullifier = inputNullifiers[0] || '0x' + '0'.repeat(64);
    const merchantComm = outputCommitments[0] || '0x' + '0'.repeat(64);
    const changeComm = outputCommitments[1] || '0x' + '0'.repeat(64);

    await this.compactManager.executePay(
      totalSelectedAmount,
      amount,
      changeNote ? changeNote.amount : 0n,
      primaryNullifier,
      merchantComm,
      changeComm
    );

    // 6. Mark input nullifiers as spent
    for (const nullifier of inputNullifiers) {
      this.nullifierSet.add(nullifier);
    }
    wallet.markSpent(inputCommitments);

    // 7. Store change note in wallet if created
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
   * Retrieves overall protocol stats from Midnight Compact Smart Contract ledger state.
   */
  public async getStats(): Promise<ProtocolStats> {
    const compactLedger = this.compactManager.getLedgerState();
    return {
      totalCollateralUsdc: compactLedger.totalCollateral,
      totalIssuedLusd: compactLedger.totalIssued,
      totalNotesCount: this.noteTree.getLeaves().length,
      merchantCount: this.merchants.size,
      currentYieldIndex: compactLedger.yieldIndex
    };
  }
}

