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

