import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { CompactService } from './services/compactService.js';
import { DomainService } from './services/domainService.js';
import { BridgeService } from './services/bridgeService.js';

dotenv.config();

// BigInt JSON serializer polyfill for Express
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

const app = express();
const PORT = process.env.PORT || 4000;
const NODE_URL = process.env.MIDNIGHT_NODE_URL || 'http://localhost:9944';
const PROOF_SERVER_URL = process.env.PROOF_SERVER_URL || 'http://localhost:6300';

app.use(cors({ origin: '*' }));
app.use(express.json());

const compactService = new CompactService({
  nodeUrl: NODE_URL,
  proofServerUrl: PROOF_SERVER_URL
});

const domainService = new DomainService();
const bridgeService = new BridgeService();

// Mock store for transactions and user balances
const userHistoryMap: Map<string, any[]> = new Map();

// 1. Health check endpoint
app.get('/health', async (req, res) => {
  const health = await compactService.getHealth();
  res.json(health);
});

// 2. Faucet API (Mint USDC / tNIGHT / lUSDv)
app.post('/faucet', async (req, res) => {
  try {
    const { address, token = 'tUSDC', amount = '1000' } = req.body;
    if (!address) {
      return res.status(400).json({ error: 'Falta parametro obligatorio: address' });
    }
    const result = await compactService.claimFaucet(token, address, String(amount));
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Deprecated endpoint fallback
app.post('/api/faucet/claim', async (req, res) => {
  try {
    const { token, recipientAddress, amount } = req.body;
    const result = await compactService.claimFaucet(token || 'tUSDC', recipientAddress, String(amount || '1000'));
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Wallet API
app.get('/wallet/:address', async (req, res) => {
  const { address } = req.params;
  const history = userHistoryMap.get(address) || [];
  res.json({
    address,
    network: 'preview',
    usdcBalance: '1000000000', // 1000 USDC
    lusdvBalance: '1002000000', // 1002 lUSDv
    musdvBalance: '0',
    historyCount: history.length
  });
});

// 4. Deposits API
app.post('/deposits', async (req, res) => {
  try {
    const { amount, ownerPubKey, periodDays = 30 } = req.body;
    if (!amount || !ownerPubKey) {
      return res.status(400).json({ error: 'Faltan parámetros requeridos: amount, ownerPubKey' });
    }

    const depositedBigInt = BigInt(amount);
    const expectedYield = (depositedBigInt * 5n) / 1000n; // 0.5% advance yield
    const issuedLusd = depositedBigInt + expectedYield;

    // Create Batch in Bridge
    const batch = bridgeService.createBatch(depositedBigInt, expectedYield);

    // Call Compact deposit circuit
    const compactResult = await compactService.executeDeposit(amount, ownerPubKey);

    // Record history
    const history = userHistoryMap.get(ownerPubKey) || [];
    history.unshift({
      id: 'tx_' + Date.now(),
      type: 'deposit',
      amount: amount,
      token: 'lUSDv',
      timestamp: Date.now(),
      txHash: compactResult.txHash,
      status: 'completed'
    });
    userHistoryMap.set(ownerPubKey, history);

    res.json({
      success: true,
      batchId: batch.batchId,
      depositedAmount: amount,
      expectedYield: expectedYield.toString(),
      issuedLusd: issuedLusd.toString(),
      maturesAt: batch.maturesAt,
      txHash: compactResult.txHash
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Transfers API (Private Pay)
app.post('/transfers', async (req, res) => {
  try {
    const { recipient, amount, senderPubKey } = req.body || {};
    if (!recipient || !amount || !senderPubKey) {
      return res.status(400).json({ error: 'Faltan parámetros: recipient, amount, senderPubKey' });
    }

    let finalRecipientPubKey = recipient;
    let resolvedDomain = undefined;

    if (recipient.endsWith('.midnight')) {
      const resolved = domainService.resolveDomain(recipient);
      if (!resolved) {
        return res.status(404).json({ error: `No se pudo resolver el dominio ${recipient}` });
      }
      finalRecipientPubKey = resolved.controllerKey;
      resolvedDomain = recipient;
    }

    const payResult = await compactService.executePay(amount, finalRecipientPubKey, amount, '0');

    // Record history
    const history = userHistoryMap.get(senderPubKey) || [];
    history.unshift({
      id: 'tx_' + Date.now(),
      type: 'payment_sent',
      amount: amount,
      token: 'lUSDv',
      timestamp: Date.now(),
      recipientDomain: resolvedDomain,
      recipientAddress: finalRecipientPubKey,
      txHash: payResult.txHash,
      status: 'completed'
    });
    userHistoryMap.set(senderPubKey, history);

    res.json({
      success: true,
      paidAmount: amount,
      recipientPublicKey: finalRecipientPubKey,
      resolvedDomain,
      txHash: payResult.txHash,
      nullifiers: (payResult as any).nullifiers || []
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 6. Batches API
app.get('/batches/:address', (req, res) => {
  const batches = bridgeService.getBatches();
  res.json(batches);
});

// 7. Yield API
app.get('/yield/:address', (req, res) => {
  const batches = bridgeService.getBatches();
  const totalDeposited = batches.reduce((acc, b) => acc + b.depositedAmount, 0n);
  const totalAdvanceYield = batches.reduce((acc, b) => acc + b.expectedYield, 0n);

  res.json({
    totalDeposited: totalDeposited.toString(),
    totalAdvanceYield: totalAdvanceYield.toString(),
    realizedYield: '0',
    currentApyBps: 500, // 5.00% APY
    activeBatchesCount: batches.length
  });
});

// 8. Domains API
app.post('/domains/register', (req, res) => {
  try {
    const { name, ownerCommitment, controllerKey, records, expiresInDays } = req.body;
    if (!name || !ownerCommitment) {
      return res.status(400).json({ error: 'Faltan parámetros: name, ownerCommitment' });
    }
    const domain = domainService.registerDomain({
      name,
      ownerCommitment,
      controllerKey: controllerKey || ownerCommitment,
      records,
      expiresInDays
    });
    res.json(domain);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/domains/:name', (req, res) => {
  const { name } = req.params;
  const resolved = domainService.resolveDomain(name);
  if (!resolved) {
    return res.status(404).json({ error: `Dominio ${name} no encontrado` });
  }
  res.json(resolved);
});

app.get('/domains/reverse/:address', (req, res) => {
  const { address } = req.params;
  const domain = domainService.reverseResolve(address);
  if (!domain) {
    return res.status(404).json({ error: `No se encontró dominio asociado a ${address}` });
  }
  res.json(domain);
});

app.get('/domains', (req, res) => {
  res.json(domainService.getAllDomains());
});

app.post('/domains/transfer', (req, res) => {
  try {
    const { name, newOwnerCommitment } = req.body;
    const domain = domainService.transferDomain(name, newOwnerCommitment);
    res.json(domain);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/domains/records', (req, res) => {
  try {
    const { name, records } = req.body;
    const domain = domainService.updateRecords(name, records);
    res.json(domain);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 9. Bridge API
app.get('/bridge/status', (req, res) => {
  res.json(bridgeService.getStatus());
});

app.get('/bridge/events', (req, res) => {
  res.json(bridgeService.getEvents());
});

// 10. Redeem API (Fase 14)
app.post('/redeem', async (req, res) => {
  try {
    const { amount, ownerPubKey } = req.body;
    if (!amount || !ownerPubKey) {
      return res.status(400).json({ error: 'Faltan parámetros requeridos: amount, ownerPubKey' });
    }

    const amountNum = BigInt(amount);
    const ray = 10n ** 27n;
    const globalIndex = 10n ** 27n;
    const sharesToBurn = (amountNum * ray) / globalIndex;

    const txHash = '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

    res.json({
      success: true,
      circuit: 'Vault.redeem (Compact 0.23)',
      txHash,
      redeemedUsdc: amount,
      burnedShares: sharesToBurn.toString(),
      owner: ownerPubKey,
      timestamp: Math.floor(Date.now() / 1000)
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log('================================================');
  console.log(`🚀 Vinchi Core API Server running on port ${PORT}`);
  console.log(`🔗 Midnight Node: ${NODE_URL}`);
  console.log(`⚡ Proof Server: ${PROOF_SERVER_URL}`);
  console.log('================================================');
});
