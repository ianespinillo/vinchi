import { MidnightSigner } from './signers/midnight.js';
import { runPokeIndexJob } from './jobs/pokeIndex.js';
import { runBridgeSweepJob } from './jobs/bridgeSweep.js';

const NODE_RPC_URL = process.env.MIDNIGHT_NODE_URL || 'http://localhost:9944';
const PROOF_SERVER_URL = process.env.PROOF_SERVER_URL || 'http://localhost:6300';
const WORKER_KEY = process.env.WORKER_PRIVATE_KEY || '0x_default_worker_private_key';
const POKE_INTERVAL_MS = parseInt(process.env.POKE_INTERVAL_MS || '60000', 10); // 1 minute
const ENABLE_BRIDGE = process.env.ENABLE_PATHWAY_B_BRIDGE === 'true';

async function main() {
  console.log('================================================');
  console.log('       Vinchi Midnight Off-Chain Worker         ');
  console.log('================================================');
  console.log(`Node RPC: ${NODE_RPC_URL}`);
  console.log(`Proof Server: ${PROOF_SERVER_URL}`);
  console.log(`Pathway B Bridge Enabled: ${ENABLE_BRIDGE}`);
  console.log(`Poke Index Interval: ${POKE_INTERVAL_MS}ms\n`);

  const signer = new MidnightSigner({
    nodeRpcUrl: NODE_RPC_URL,
    proofServerUrl: PROOF_SERVER_URL,
    privateKey: WORKER_KEY
  });

  await signer.connect();

  // Initial execution
  console.log('\n[Worker] Running startup jobs...');
  await runPokeIndexJob(signer);

  if (ENABLE_BRIDGE) {
    await runBridgeSweepJob(signer);
  }

  // Periodic scheduler loop
  setInterval(async () => {
    await runPokeIndexJob(signer);
  }, POKE_INTERVAL_MS);

  if (ENABLE_BRIDGE) {
    const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
    setInterval(async () => {
      await runBridgeSweepJob(signer);
    }, TWELVE_HOURS_MS);
  }

  console.log('\n[Worker] Daemon is running and listening for scheduled jobs.');
}

main().catch(err => {
  console.error('[Worker Fatal Error]:', err);
  process.exit(1);
});
