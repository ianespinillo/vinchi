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
