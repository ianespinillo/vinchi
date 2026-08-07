export interface Note {
  owner: string;        // Public key / Address of the owner
  amount: bigint;       // Amount in lUSDv (base units)
  maturesAt: bigint;    // Timestamp (in seconds) when the note matures
  rateBps: number;      // Promised yield rate in basis points (e.g. 500 = 5%)
  nonce: string;        // 32-byte Hex string / unique random string making commitment unique
}

export type NoteStatus = 'unspent' | 'spent' | 'materialized';

export interface WalletNote {
  id: string;           // Derived commitment
  note: Note;
  commitment: string;
  nullifier: string;
  status: NoteStatus;
  createdAt: number;
  blockTimestamp?: number;
}

export interface LocalNote {
  commitment: string;
  amount: string;
  batchId: string;
  encryptedMemo: string;
}

export interface Merchant {
  id: string;
  name: string;
  publicKey: string;
  category: string;
  isEnabled: boolean;
}

export interface MerkleProof {
  leaf: string;
  index: number;
  path: string[];
}

export interface PaymentProof {
  nullifiers: string[];          // Nullifiers of spent input notes
  outputCommitments: string[];    // Commitments of newly created notes
  merchantProof: MerkleProof;    // Proof that recipient merchant is enabled
  isValid: boolean;
  paddedInputsCount: number;     // Fixed to 4 for metadata leakage prevention (N3)
  paddedOutputsCount: number;    // Fixed to 2 for metadata leakage prevention (N3)
}

export interface DepositResult {
  txHash: string;
  note: Note;
  commitment: string;
  amount: bigint;
}

export interface PaymentResult {
  txHash: string;
  paidAmount: bigint;
  changeAmount: bigint;
  nullifiers: string[];
  outputNotes: Note[];
  recipientPublicKey: string;
  consumedBatches?: {
    batchId: string;
    amount: bigint;
    maturesAt: number;
  }[];
}

export interface ProtocolStats {
  totalCollateralUsdc: bigint;
  totalIssuedLusd: bigint;
  totalNotesCount: number;
  merchantCount: number;
  currentYieldIndex: bigint; // Ray precision (1e27)
}

export type FaucetTokenType = 'tNIGHT' | 'tUSDC' | 'lUSDv';

export interface FaucetClaimRequest {
  token: FaucetTokenType;
  recipientAddress: string;
  amount: bigint;
  networkId?: string;
}

export interface FaucetClaimResult {
  success: boolean;
  token: FaucetTokenType;
  amount: bigint;
  txHash?: string;
  commitment?: string;
  error?: string;
  requiresCaptcha?: boolean;
  documentationUrl?: string;
  requiredParameters?: string[];
  diagnosticDetails?: string;
}

export interface ServiceHealth {
  service: 'node' | 'indexer' | 'proofServer' | 'faucet' | 'backend';
  url: string;
  isOnline: boolean;
  latencyMs?: number;
  error?: string;
}

export interface ConnectionHealth {
  allHealthy: boolean;
  timestamp: string;
  services: ServiceHealth[];
}

export interface MidnightNetworkConfig {
  nodeUrl: string;
  indexerUrl: string;
  proofServerUrl: string;
  faucetUrl: string;
  backendUrl: string;
  networkId: string;
}

// ==========================================
// WALLET ADAPTER TYPES (Lace / Midnight)
// ==========================================

export type WalletType = 'lace' | 'midnight-extension' | 'mock';

export interface WalletSession {
  address: string;
  network: string;
  walletType: WalletType;
  connectedAt: number;
}

export interface MidnightBrowserProvider {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getAccounts(): Promise<string[]>;
  getNetwork(): Promise<string>;
  signMessage(message: Uint8Array): Promise<Uint8Array>;
  signTransaction(tx: Uint8Array): Promise<Uint8Array>;
  submitTransaction(tx: Uint8Array): Promise<string>;
  on(event: 'accountsChanged' | 'networkChanged', cb: Function): void;
}

export interface VinchiWalletAdapter {
  connect(): Promise<WalletSession>;
  disconnect(): Promise<void>;
  getAddress(): Promise<string>;
  getNetwork(): Promise<string>;
  signMessage(msg: Uint8Array): Promise<Uint8Array>;
  signTransaction(tx: Uint8Array): Promise<Uint8Array>;
  submitTransaction(tx: Uint8Array): Promise<string>;
  createNote?(data: { amount: bigint; owner: string }): Promise<string>;
}

// ==========================================
// DOMAIN SYSTEM TYPES (.midnight)
// ==========================================

export interface DomainRecord {
  name: string;
  nameHash: string;
  ownerCommitment: string;
  controllerKey: string;
  expiresAt: number;
  records: {
    payment?: string;
    encryption?: string;
    avatar?: string;
    profile?: string;
  };
  isVerified?: boolean;
}

export interface DomainResolveResult {
  name: string;
  controllerKey: string;
  ownerCommitment: string;
  records: Record<string, string>;
  isVerified: boolean;
  avatarUrl?: string;
}

// ==========================================
// BRIDGE & BATCHES TYPES (Yield -> Todo)
// ==========================================

export type BridgeState = 'PENDING' | 'SYNCED_TO_TODOMIDNIGHT' | 'MATURED' | 'REDEEMED' | 'FAILED';

export interface BatchInfo {
  batchId: string;
  principal: bigint;      // Monto original depositado en USDC
  expectedYield: bigint;  // Rendimiento futuro calculado (futureYield)
  createdAt: number;      // Timestamp de creación
  maturesAt: number;      // Timestamp de maduración
  owner: string;          // Dirección pública / commitment del usuario
  depositedAmount: bigint;
  remainingAmount: bigint;
  status: BridgeState;
  txHash?: string;
}

export interface BridgeEvent {
  id: string;
  batchId: string;
  eventType: 'BatchCreated' | 'SyncedToTodo' | 'MaturedBatchEvent' | 'Redeemed';
  payload: any;
  state: BridgeState;
  timestamp: number;
  retryCount: number;
}

export interface BridgeStatus {
  syncedEventsCount: number;
  pendingEventsCount: number;
  failedEventsCount: number;
  maturedEventsCount: number;
  lastSyncTimestamp: number;
}

// ==========================================
// PRIVATE HISTORY TRANSACTION RECORD
// ==========================================

export interface PrivateTransactionRecord {
  id: string;
  type: 'deposit' | 'payment_sent' | 'payment_received' | 'redemption';
  amount: bigint;
  token: 'lUSDv' | 'mUSDv' | 'USDC';
  timestamp: number;
  recipientDomain?: string;
  recipientAddress?: string;
  txHash: string;
  status: 'completed' | 'pending' | 'failed';
}


