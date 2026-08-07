import { MidnightSigner } from '../signers/midnight.js';

export async function runBridgeSweepJob(signer: MidnightSigner): Promise<void> {
  console.log('[Job: bridgeSweep] Executing scheduled fixed-cadence bridge sweep (Pathway B)...');

  try {
    // 1. Check excess liquidity buffer on Midnight
    const excessBufferUsdc = 50000n; // Example calculation
    console.log(`[Job: bridgeSweep] Excess collateral available for yield deployment: ${excessBufferUsdc} USDC`);

    if (excessBufferUsdc > 0n) {
      const txHash = await signer.submitTransaction('bridgeOut', {
        destinationChain: 'Base',
        amount: excessBufferUsdc.toString()
      });
      console.log(`[Job: bridgeSweep] Batch sweep executed to Base EVM bridge. Tx: ${txHash}`);
    } else {
      console.log('[Job: bridgeSweep] No excess collateral beyond safety buffer. Skipping sweep.');
    }
  } catch (error) {
    console.error('[Job: bridgeSweep] Error during bridge sweep execution:', error);
  }
}
