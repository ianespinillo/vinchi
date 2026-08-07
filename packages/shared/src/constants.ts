export const PROTOCOL_CONSTANTS = {
  // Fixed size padding for ZK payment circuits to prevent transaction size metadata leakage (N3)
  PADDED_INPUT_COUNT: 4,
  PADDED_OUTPUT_COUNT: 2,

  // Default maturation period (e.g. 30 days in seconds)
  DEFAULT_MATURATION_PERIOD_SECONDS: 30 * 24 * 60 * 60,

  // Standardized deposit amounts (USDC 6 decimals -> lUSDv 18 decimals)
  STANDARD_DEPOSIT_AMOUNTS: [100n, 500n, 1000n, 5000n],

  // Protocol fee basis points (e.g. 20 = 0.2%)
  PROTOCOL_FEE_BPS: 20,

  // Ray precision for yield index (1e27)
  RAY: 10n ** 27n,

  // Default rate for MVP (0% yield in MVP Phase 0/1)
  DEFAULT_RATE_BPS: 0,
  // Default fixed APR for hackathon yield calculation (12%)
  DEFAULT_APR: 0.12,
};

/**
 * Fase 5 — Motor de Rendimiento Adelantado (APR Fijo Hackathon)
 * Formula:
 * futureYield = amount * apr * days / 365
 * minted = amount + futureYield
 *
 * Ejemplo:
 * 1000 USDC, 12% APR (0.12), 30 días:
 * futureYield = 1000 * 0.12 * 30 / 365 = 9.86 USDC
 * minted = 1009.86 lUSDv
 */
export function calculateAdvancedYield(
  amount: bigint,
  days: number = 30,
  apr: number = 0.12
): {
  principal: bigint;
  expectedYield: bigint;
  mintedAmount: bigint;
  aprPercent: number;
} {
  if (amount <= 0n || days <= 0) {
    return {
      principal: amount,
      expectedYield: 0n,
      mintedAmount: amount,
      aprPercent: apr * 100
    };
  }

  const aprBps = BigInt(Math.floor(apr * 10000)); // 12% APR -> 1200 BPS
  const daysBig = BigInt(days);

  const expectedYield = (amount * aprBps * daysBig) / (365n * 10000n);
  const mintedAmount = amount + expectedYield;

  return {
    principal: amount,
    expectedYield,
    mintedAmount,
    aprPercent: apr * 100
  };
}

export const DEFAULT_MIDNIGHT_ENDPOINTS = {
  NODE_URL: 'http://localhost:9944',
  INDEXER_URL: 'https://indexer.preview.midnight.network/api/v1/graphql',
  PROOF_SERVER_URL: 'http://localhost:6300',
  FAUCET_URL: 'https://faucet.preview.midnight.network/',
  BACKEND_URL: 'http://localhost:4000',
  NETWORK_ID: 'preview',
  DOCS_URL: 'https://docs.midnight.network/'
};

export function getMidnightNetworkConfig(overrides: Record<string, any> = {}) {
  const env = typeof process !== 'undefined' ? process.env || {} : {};
  return {
    nodeUrl: String(overrides.nodeUrl || env.NEXT_PUBLIC_MIDNIGHT_NODE_URL || env.MIDNIGHT_NODE_URL || DEFAULT_MIDNIGHT_ENDPOINTS.NODE_URL),
    indexerUrl: String(overrides.indexerUrl || env.NEXT_PUBLIC_MIDNIGHT_INDEXER_URL || env.MIDNIGHT_INDEXER_URL || DEFAULT_MIDNIGHT_ENDPOINTS.INDEXER_URL),
    proofServerUrl: String(overrides.proofServerUrl || env.NEXT_PUBLIC_PROOF_SERVER_URL || env.PROOF_SERVER_URL || DEFAULT_MIDNIGHT_ENDPOINTS.PROOF_SERVER_URL),
    faucetUrl: String(overrides.faucetUrl || env.NEXT_PUBLIC_MIDNIGHT_FAUCET_URL || env.MIDNIGHT_FAUCET_URL || DEFAULT_MIDNIGHT_ENDPOINTS.FAUCET_URL),
    backendUrl: String(overrides.backendUrl || env.NEXT_PUBLIC_BACKEND_URL || env.BACKEND_URL || DEFAULT_MIDNIGHT_ENDPOINTS.BACKEND_URL),
    networkId: String(overrides.networkId || env.NEXT_PUBLIC_NETWORK_ID || env.NETWORK_ID || DEFAULT_MIDNIGHT_ENDPOINTS.NETWORK_ID),
  };
}


/**
 * Formats raw token balance from base/atomic units (e.g. 6 decimals for tNIGHT/Cardano/USDC)
 * into a human-readable string (e.g., 5000000000n -> "5,000" or "5,000.50").
 */
export function formatTokenBalance(rawAmount: bigint | number | string | null | undefined, decimals: number = 6): string {
  if (rawAmount === null || rawAmount === undefined) return '0';

  try {
    const bigVal = typeof rawAmount === 'bigint' ? rawAmount : BigInt(rawAmount.toString());
    const divisor = BigInt(10 ** decimals);

    if (bigVal >= divisor) {
      const integerPart = bigVal / divisor;
      const remainderPart = bigVal % divisor;

      if (remainderPart === 0n) {
        return integerPart.toLocaleString('en-US');
      } else {
        const remainderStr = remainderPart.toString().padStart(decimals, '0').replace(/0+$/, '');
        return `${integerPart.toLocaleString('en-US')}.${remainderStr.slice(0, 4)}`;
      }
    }

    return bigVal.toLocaleString('en-US');
  } catch {
    return '0';
  }
}

