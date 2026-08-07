import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { CompactService } from './services/compactService.js';

dotenv.config();

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

// 1. Health check endpoint
app.get('/health', async (req, res) => {
  const health = await compactService.getHealth();
  res.json(health);
});

// 2. Deposit Circuit API (VinchiNotes.deposit)
app.post('/api/compact/deposit', async (req, res) => {
  try {
    const { amount, ownerPubKey } = req.body;
    if (!amount || !ownerPubKey) {
      return res.status(400).json({ error: 'Missing required parameters: amount, ownerPubKey' });
    }
    const result = await compactService.executeDeposit(amount, ownerPubKey);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Pay Circuit API (VinchiNotes.pay)
app.post('/api/compact/pay', async (req, res) => {
  try {
    const { inputAmount, merchantPubKey, payAmount, changeAmount } = req.body;
    if (!inputAmount || !merchantPubKey || !payAmount) {
      return res.status(400).json({ error: 'Missing required parameters: inputAmount, merchantPubKey, payAmount' });
    }
    const result = await compactService.executePay(inputAmount, merchantPubKey, payAmount, changeAmount || '0');
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Yield Index Oracle API (YieldIndex.poke)
app.post('/api/compact/yield-index', async (req, res) => {
  try {
    const { newIndex } = req.body;
    if (!newIndex) {
      return res.status(400).json({ error: 'Missing required parameter: newIndex' });
    }
    const result = await compactService.updateYieldIndex(newIndex);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Faucet Claim API
app.post('/api/faucet/claim', async (req, res) => {
  try {
    const { token, recipientAddress, amount } = req.body;
    if (!token || !recipientAddress || !amount) {
      return res.status(400).json({
        error: 'Parametros requeridos ausentes: token, recipientAddress, amount',
        requiredParameters: ['token (tNIGHT | tUSDC)', 'recipientAddress', 'amount']
      });
    }
    const result = await compactService.claimFaucet(token, recipientAddress, String(amount));
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log('================================================');
  console.log(`🚀 Vinchi Compact Backend API Server running on port ${PORT}`);
  console.log(`🔗 Midnight Node: ${NODE_URL}`);
  console.log(`⚡ Proof Server: ${PROOF_SERVER_URL}`);
  console.log('================================================');
});
