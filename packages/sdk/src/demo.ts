import { VinchiSDK } from './client.js';
import { VinchiWallet } from '@vinchi/wallet-core';

async function runDemo() {
  console.log('=== Vinchi Private Payments SDK Demo ===\n');

  // 1. Initialize Vinchi SDK
  const sdk = new VinchiSDK();
  console.log('1. Vinchi SDK initialized.');

  // 2. Register / list merchants
  const merchants = sdk.getMerchants();
  console.log(`2. Registered Merchants (${merchants.length}):`);
  merchants.forEach(m => console.log(`   - [${m.category}] ${m.name} (${m.publicKey.slice(0, 16)}...)`));

  // 3. Create User Wallet (Zcash / Midnight Note model)
  const userSeed = 'hackathon_secret_seed_vinchi_2026_user1';
  const userPublicKey = '0x01827abc456def7890123456789abcdef0123456789abcdef0123456789abcd';
  const wallet = await VinchiWallet.create(userSeed, userPublicKey);
  console.log('\n3. User Wallet created.');
  console.log(`   Public Key: ${wallet.publicKey}`);
  console.log(`   Initial Balance: ${wallet.getBalance()} lUSDv`);

  // 4. Deposit 1000 USDC into Vinchi Protocol
  console.log('\n4. Executing Deposit (1000 USDC)...');
  const depositRes = await sdk.deposit(wallet, 1000n);
  console.log(`   Deposit Tx: ${depositRes.txHash}`);
  console.log(`   Note Commitment: ${depositRes.commitment.slice(0, 20)}...`);
  console.log(`   Updated Wallet Balance: ${wallet.getBalance()} lUSDv`);

  // 5. Make a Private Payment of 340 lUSDv to "Café & Co. Midnight"
  const merchant = merchants[0];
  console.log(`\n5. Executing Private Payment of 340 lUSDv to merchant "${merchant.name}"...`);
  const paymentRes = await sdk.pay(wallet, merchant.publicKey, 340n);

  console.log(`   Payment Tx: ${paymentRes.txHash}`);
  console.log(`   Paid Amount: ${paymentRes.paidAmount} lUSDv`);
  console.log(`   Change Note Amount returned to User: ${paymentRes.changeAmount} lUSDv`);
  console.log(`   Input Nullifiers published on-chain (${paymentRes.nullifiers.length}):`);
  paymentRes.nullifiers.forEach(n => console.log(`     - Nullifier: ${n.slice(0, 24)}...`));
  console.log(`   Remaining Wallet Balance: ${wallet.getBalance()} lUSDv`);

  // 6. Inspect Protocol Stats (Public Proof of Reserves)
  const stats = await sdk.getStats();
  console.log('\n6. Protocol Aggregate Stats (Proof of Reserves):');
  console.log(`   Total Collateral Custodied: ${stats.totalCollateralUsdc} USDC`);
  console.log(`   Total lUSDv Issued: ${stats.totalIssuedLusd} lUSDv`);
  console.log(`   Total Notes in Merkle Tree: ${stats.totalNotesCount}`);

  console.log('\n=== Demo Completed Successfully! ===');
}

runDemo().catch(err => {
  console.error('Demo Error:', err);
});
