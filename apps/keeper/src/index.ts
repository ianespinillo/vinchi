/**
 * Vinchi Keeper Service — Fase 11 & Fase 12
 * Automated yield collection, batch maturation & mUSDv globalIndex rebasing updates.
 *
 * Algoritmo Maturación (Fase 11):
 * for (batch of pendingBatches) {
 *   if (Date.now() >= batch.maturesAt) {
 *     snapshotYieldIndex(batch.id);
 *     markMature(batch.id);
 *   }
 * }
 * Regla: No convierte balances; solo marca batches maduros (status = MATURED).
 *
 * Algoritmo Rebasing (Fase 12):
 * Keeper actualiza globalIndex periódicamente.
 */

import { BatchInfo } from '@vinchi/shared';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';
let currentGlobalIndex = 10n ** 27n; // 1.000000 Ray

console.log('🤖 Vinchi Keeper Bot initializing...');
console.log(`🌐 Connected to Backend service: ${BACKEND_URL}`);
console.log('⚡ Monitoring maturing yield batches & updating mUSDv globalIndex every 60 seconds...');

export async function pokeGlobalYieldIndex(): Promise<bigint> {
  // Increment globalIndex by ray precision factor (simulating APY growth over time)
  const growthFactor = 1000000000000000n; // +0.000001 Ray per tick
  currentGlobalIndex += growthFactor;
  console.log(`[Keeper] 📈 Updated globalIndex (mUSDv rebasing index): ${(Number(currentGlobalIndex) / 1e27).toFixed(6)} RAY`);
  return currentGlobalIndex;
}

export async function snapshotYieldIndex(batchId: string): Promise<bigint> {
  console.log(`[Keeper] 📸 Snapshotting Yield Index for Batch ${batchId} at ${currentGlobalIndex.toString()}...`);
  return currentGlobalIndex;
}

export async function checkAndProcessMaturingBatches(batches: BatchInfo[]): Promise<number> {
  let maturedCount = 0;
  const now = Date.now();

  for (const batch of batches) {
    if (batch.status === 'PENDING' || batch.status === 'SYNCED_TO_TODOMIDNIGHT') {
      if (now >= batch.maturesAt) {
        console.log(`[Keeper] ⏰ Batch ${batch.batchId} has reached maturity! (maturesAt: ${new Date(batch.maturesAt).toISOString()})`);
        
        // 1. Snapshot Yield Index
        await snapshotYieldIndex(batch.batchId);
        
        // 2. Mark Batch as Matured (No balance conversion, only status update)
        batch.status = 'MATURED';
        maturedCount++;

        console.log(`[Keeper] ✅ Batch ${batch.batchId} successfully marked MATURED.`);
      }
    }
  }

  return maturedCount;
}

export function runKeeperLoop() {
  const checkLoop = async () => {
    try {
      console.log('[Keeper] 🔍 Running periodic maturation & rebasing index check...');
      
      // 1. Update mUSDv globalIndex
      await pokeGlobalYieldIndex();

      // 2. Process maturing batches
      const res = await fetch(`${BACKEND_URL}/batches/0x_user`).catch(() => null);
      if (res && res.ok) {
        const batches: BatchInfo[] = await res.json().catch(() => []);
        const processed = await checkAndProcessMaturingBatches(batches);
        if (processed > 0) {
          console.log(`[Keeper] ⚡ Processed and marked ${processed} matured batches.`);
        }
      }
    } catch (err: any) {
      console.warn('[Keeper] Check loop warning:', err.message);
    }
  };

  checkLoop();
  // Runs every 60 seconds (1 minute) as specified in Fase 11 & 12
  setInterval(checkLoop, 60000);
}

if (process.env.NODE_ENV !== 'test') {
  runKeeperLoop();
}
