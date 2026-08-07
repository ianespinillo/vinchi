import { BatchInfo, BridgeEvent, BridgeState, BridgeStatus } from '@vinchi/shared';

function generateUniqueEventId(): string {
  return 'evt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

export class BridgeService {
  private batches: Map<string, BatchInfo> = new Map();
  private events: BridgeEvent[] = [];
  private lastSyncTimestamp: number = Date.now();

  constructor() {
    // Seed initial mock batch for testing & demo
    const defaultBatchId = 'batch_001_preview';
    const now = Math.floor(Date.now() / 1000);
    
    this.batches.set(defaultBatchId, {
      batchId: defaultBatchId,
      principal: BigInt('1000000000'),
      expectedYield: BigInt('5000000'),       // 5 lUSDv
      createdAt: now - 3600,
      maturesAt: now + 86400, // 24 hours maturity
      owner: '0x01827abc456def7890123456789abcdef0123456789abcdef0123456789abcd',
      depositedAmount: BigInt('1000000000'), // 1000 lUSDv
      remainingAmount: BigInt('1000000000'),
      status: 'SYNCED_TO_TODOMIDNIGHT',
      txHash: '0x01827abc456def7890123456789abcdef0123456789abcdef0123456789abcd'
    });

    this.events.push({
      id: generateUniqueEventId(),
      batchId: defaultBatchId,
      eventType: 'BatchCreated',
      payload: { amount: '1000', maturesAt: now + 86400 },
      state: 'SYNCED_TO_TODOMIDNIGHT',
      timestamp: Date.now() - 3600,
      retryCount: 0
    });
  }

  public createBatch(depositedAmount: bigint, expectedYield: bigint, maturationSeconds: number = 86400, owner: string = '0x_user'): BatchInfo {
    const batchId = 'batch_' + Date.now().toString(36);
    const now = Math.floor(Date.now() / 1000);
    const maturesAt = now + maturationSeconds;

    const batch: BatchInfo = {
      batchId,
      principal: depositedAmount,
      expectedYield,
      createdAt: now,
      maturesAt,
      owner,
      depositedAmount,
      remainingAmount: depositedAmount + expectedYield,
      status: 'PENDING',
      txHash: '0x' + Math.random().toString(16).slice(2).padStart(64, '0')
    };

    this.batches.set(batchId, batch);

    // Event Sourcing with guaranteed unique IDs
    const event: BridgeEvent = {
      id: generateUniqueEventId(),
      batchId,
      eventType: 'BatchCreated',
      payload: { depositedAmount: depositedAmount.toString(), expectedYield: expectedYield.toString(), maturesAt },
      state: 'PENDING',
      timestamp: Date.now(),
      retryCount: 0
    };
    this.events.push(event);

    // Auto-sync to TodoMidnight Layer
    this.syncBatchToTodo(batchId);

    return batch;
  }

  public syncBatchToTodo(batchId: string): BatchInfo {
    const batch = this.batches.get(batchId);
    if (!batch) throw new Error(`Lote ${batchId} no encontrado`);

    batch.status = 'SYNCED_TO_TODOMIDNIGHT';
    this.batches.set(batchId, batch);

    this.events.push({
      id: generateUniqueEventId(),
      batchId,
      eventType: 'SyncedToTodo',
      payload: { batchId, state: 'SYNCED_TO_TODOMIDNIGHT' },
      state: 'SYNCED_TO_TODOMIDNIGHT',
      timestamp: Date.now(),
      retryCount: 0
    });

    this.lastSyncTimestamp = Date.now();
    return batch;
  }

  public triggerMaturation(batchId: string): BatchInfo {
    const batch = this.batches.get(batchId);
    if (!batch) throw new Error(`Lote ${batchId} no encontrado`);

    batch.status = 'MATURED';
    this.batches.set(batchId, batch);

    this.events.push({
      id: generateUniqueEventId(),
      batchId,
      eventType: 'MaturedBatchEvent',
      payload: { batchId, state: 'MATURED' },
      state: 'MATURED',
      timestamp: Date.now(),
      retryCount: 0
    });

    return batch;
  }

  public getBatches(): BatchInfo[] {
    return Array.from(this.batches.values());
  }

  public getEvents(): BridgeEvent[] {
    return this.events;
  }

  public getStatus(): BridgeStatus {
    const all = Array.from(this.batches.values());
    return {
      syncedEventsCount: all.filter(b => b.status === 'SYNCED_TO_TODOMIDNIGHT').length,
      pendingEventsCount: all.filter(b => b.status === 'PENDING').length,
      failedEventsCount: all.filter(b => b.status === 'FAILED').length,
      maturedEventsCount: all.filter(b => b.status === 'MATURED').length,
      lastSyncTimestamp: this.lastSyncTimestamp
    };
  }
}
