import { MidnightSigner } from '../signers/midnight.js';

export async function runPokeIndexJob(signer: MidnightSigner): Promise<void> {
  const timestamp = Math.floor(Date.now() / 1000);
  console.log(`[Job: pokeIndex] Running yield index checkpoint densification at timestamp ${timestamp}...`);

  try {
    const txHash = await signer.submitTransaction('pokeIndex', {
      timestamp,
      currentIndex: '100000000000000000000000e27'
    });
    console.log(`[Job: pokeIndex] Checkpoint updated successfully. Tx: ${txHash}`);
  } catch (error) {
    console.error('[Job: pokeIndex] Failed to update yield index checkpoint:', error);
  }
}
