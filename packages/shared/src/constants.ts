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
};

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

