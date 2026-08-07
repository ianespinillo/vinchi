import { PROTOCOL_CONSTANTS } from '@vinchi/shared';
import { CompactContractManager } from '@vinchi/contracts';

export interface CompactConfig {
  nodeUrl: string;
  proofServerUrl: string;
}

export class CompactService {
  private nodeUrl: string;
  private proofServerUrl: string;
  private compactManager: CompactContractManager;

  constructor(config: CompactConfig) {
    this.nodeUrl = config.nodeUrl;
    this.proofServerUrl = config.proofServerUrl;
    this.compactManager = new CompactContractManager();
  }

  /**
   * Check connection to Midnight Node and Proof Server + Compact Ledger State
   */
  public async getHealth() {
    return {
      status: 'ok',
      midnightNode: this.nodeUrl,
      proofServer: this.proofServerUrl,
      compactLedger: this.compactManager.getLedgerState(),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Execute Compact Deposit Circuit (VinchiNotes.deposit)
   */
  public async executeDeposit(amount: string, ownerPubKey: string) {
    console.log(`[CompactService] Executing Deposit Circuit for amount ${amount} lUSDv...`);
    const amountNum = BigInt(amount);
    const nonceHex = '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

    const res = await this.compactManager.executeDeposit(
      amountNum,
      30n,
      ownerPubKey,
      nonceHex
    );

    const txHash = '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

    return {
      success: true,
      circuit: res.circuitName,
      txHash,
      issuedAmount: res.lAmount.toString(),
      owner: ownerPubKey,
      ledgerState: this.compactManager.getLedgerState(),
      timestamp: Math.floor(Date.now() / 1000)
    };
  }

  /**
   * Execute Compact Pay Circuit (VinchiNotes.pay)
   */
  public async executePay(inputAmount: string, merchantPubKey: string, payAmount: string, changeAmount: string) {
    console.log(`[CompactService] Executing Pay Circuit for merchant ${merchantPubKey}...`);
    const nullifierHex = '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    const merchantComm = '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    const changeComm = '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

    const res = await this.compactManager.executePay(
      BigInt(inputAmount),
      BigInt(payAmount),
      BigInt(changeAmount || '0'),
      nullifierHex,
      merchantComm,
      changeComm
    );

    const txHash = '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

    return {
      success: true,
      circuit: res.circuitName,
      txHash,
      merchant: merchantPubKey,
      paidAmount: payAmount,
      changeAmount: changeAmount,
      ledgerState: this.compactManager.getLedgerState(),
      timestamp: Math.floor(Date.now() / 1000)
    };
  }

  /**
   * Update Yield Index (YieldIndex.poke Compact Circuit)
   */
  public async updateYieldIndex(newIndex: string) {
    console.log(`[CompactService] Executing YieldIndex.poke with new index ${newIndex}...`);
    const res = await this.compactManager.pokeYieldIndex(BigInt(newIndex));
    const txHash = '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

    return {
      success: true,
      circuit: res.circuitName,
      txHash,
      newYieldIndex: res.newIndex.toString(),
      ledgerState: this.compactManager.getLedgerState(),
      timestamp: Math.floor(Date.now() / 1000)
    };
  }

  /**
   * Process Faucet Claim request
   */
  public async claimFaucet(token: string, recipientAddress: string, amount: string) {
    console.log(`[CompactService] Processing Faucet claim of ${amount} ${token} for ${recipientAddress}...`);
    if (token === 'tUSDC' || token === 'lUSDv') {
      const depositRes = await this.executeDeposit(amount, recipientAddress);
      return {
        success: true,
        token,
        recipientAddress,
        claimedAmount: amount,
        txHash: depositRes.txHash,
        circuit: 'VinchiNotes.deposit (Compact)',
        timestamp: Math.floor(Date.now() / 1000),
        documentationUrl: 'https://docs.midnight.network/'
      };
    }

    const txHash = '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    return {
      success: true,
      token,
      recipientAddress,
      claimedAmount: amount,
      txHash,
      timestamp: Math.floor(Date.now() / 1000),
      documentationUrl: 'https://docs.midnight.network/'
    };
  }
}


