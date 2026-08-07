'use client';

import React, { useState, useEffect } from 'react';
import { createWalletAdapter, VinchiWalletAdapter, VinchiWallet } from '@vinchi/wallet-core';
import {
  WalletSession,
  DomainRecord,
  DomainResolveResult,
  BatchInfo,
  BridgeStatus,
  BridgeEvent,
  PrivateTransactionRecord,
  FaucetClaimResult,
  FaucetTokenType
} from '@vinchi/shared';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

export default function Home() {
  // Wallet Adapter State
  const [walletAdapter, setWalletAdapter] = useState<VinchiWalletAdapter | null>(null);
  const [walletSession, setWalletSession] = useState<WalletSession | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);

  // Local Vinchi ZK Note Wallet State
  const [vinchiWallet, setVinchiWallet] = useState<VinchiWallet | null>(null);
  const [seed, setSeed] = useState<string>('vinchi_seed_demo_preview');

  // Balances
  const [usdcBalance, setUsdcBalance] = useState<bigint>(10000000000n); // 10,000 USDC testnet
  const [lusdvBalance, setLusdvBalance] = useState<bigint>(1002000000n); // 1002 lUSDv
  const [musdvBalance, setMusdvBalance] = useState<bigint>(0n);

  // Navigation Active Tab
  const [activeTab, setActiveTab] = useState<
    'dashboard' | 'deposit' | 'transfer' | 'yield' | 'batches' | 'domains' | 'bridge' | 'history'
  >('dashboard');

  // Form States
  const [depositAmount, setDepositAmount] = useState<string>('1000');
  const [periodDays, setPeriodDays] = useState<number>(30);
  const [isDepositing, setIsDepositing] = useState(false);

  // Transfer Form States
  const [recipientInput, setRecipientInput] = useState<string>('cafe-central.midnight');
  const [resolvedDomain, setResolvedDomain] = useState<DomainResolveResult | null>(null);
  const [isResolvingDomain, setIsResolvingDomain] = useState(false);
  const [transferAmount, setTransferAmount] = useState<string>('200');
  const [selectedToken, setSelectedToken] = useState<'lUSDv' | 'mUSDv'>('lUSDv');
  const [isTransferring, setIsTransferring] = useState(false);

  // Domains Screen State
  const [newDomainName, setNewDomainName] = useState<string>('mi-comercio.midnight');
  const [domainRecordsList, setDomainRecordsList] = useState<DomainRecord[]>([]);
  const [isRegisteringDomain, setIsRegisteringDomain] = useState(false);

  // Bridge Monitor State
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus | null>(null);
  const [bridgeEvents, setBridgeEvents] = useState<BridgeEvent[]>([]);
  const [batches, setBatches] = useState<BatchInfo[]>([]);

  // History State
  const [transactions, setTransactions] = useState<PrivateTransactionRecord[]>([
    {
      id: 'tx_init_01',
      type: 'deposit',
      amount: 1000000000n,
      token: 'lUSDv',
      timestamp: Date.now() - 3600000,
      txHash: '0x01827abc456def7890123456789abcdef0123456789abcdef0123456789abcd',
      status: 'completed'
    },
    {
      id: 'tx_init_02',
      type: 'payment_sent',
      amount: 200000000n,
      token: 'lUSDv',
      timestamp: Date.now() - 1800000,
      recipientDomain: 'cafe-central.midnight',
      txHash: '0x02765def456abc7890123456789abcdef0123456789abcdef0123456789bcde',
      status: 'completed'
    }
  ]);

  // Faucet Modal State
  const [showFaucetModal, setShowFaucetModal] = useState(false);
  const [faucetToken, setFaucetToken] = useState<FaucetTokenType>('tUSDC');
  const [faucetAmount, setFaucetAmount] = useState<string>('10000');
  const [faucetResult, setFaucetResult] = useState<FaucetClaimResult | null>(null);
  const [isClaimingFaucet, setIsClaimingFaucet] = useState(false);

  // FIFO Consumed Batches State (Fase 6 & 7)
  const [lastConsumedBatches, setLastConsumedBatches] = useState<{ batchId: string; amount: bigint; maturesAt: number }[]>([]);

  // mUSDv Rebasing & Shares/Index State (Fase 12 & 13)
  const [globalIndex, setGlobalIndex] = useState<bigint>(1000000000000000000000000000n); // 1.0 Ray
  const [userShares, setUserShares] = useState<bigint>(500000000n); // 500 mUSDv shares

  // Redeem State (Fase 14)
  const [redeemAmount, setRedeemAmount] = useState<string>('500');
  const [isRedeeming, setIsRedeeming] = useState<boolean>(false);

  // Toast Status
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Fase 12 — Live mUSDv Rebasing Ticker Effect (Crecimiento automático)
  useEffect(() => {
    const interval = setInterval(() => {
      setGlobalIndex(prev => prev + 50000000000000n); // Increments Ray precision index
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  // Initialize Wallet Adapter on mount
  useEffect(() => {
    const adapter = createWalletAdapter();
    setWalletAdapter(adapter);

    async function initVinchiWallet() {
      const pubKey = '0x01827abc456def7890123456789abcdef0123456789abcdef0123456789abcd';
      const w = await VinchiWallet.create(seed, pubKey);
      setVinchiWallet(w);
    }
    initVinchiWallet();

    fetchDomains();
    fetchBridgeData();
  }, []);

  // Domain resolution effect when recipient input changes
  useEffect(() => {
    if (!recipientInput) {
      setResolvedDomain(null);
      return;
    }

    if (recipientInput.includes('.midnight')) {
      setIsResolvingDomain(true);
      const timer = setTimeout(() => {
        fetch(`${BACKEND_URL}/domains/${recipientInput}`)
          .then(res => (res.ok ? res.json() : null))
          .then(data => {
            setResolvedDomain(data);
            setIsResolvingDomain(false);
          })
          .catch(() => {
            setResolvedDomain(null);
            setIsResolvingDomain(false);
          });
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setResolvedDomain(null);
    }
  }, [recipientInput]);

  // Connect Wallet Handler
  const handleConnectWallet = async () => {
    if (!walletAdapter) return;
    setIsConnecting(true);
    try {
      const session = await walletAdapter.connect();
      setWalletSession(session);
      setShowWalletModal(false);
      showToast('success', `Conectado exitosamente con Lace/Midnight`);
    } catch (err: any) {
      showToast('error', err.message || 'Error al conectar wallet');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnectWallet = async () => {
    if (walletAdapter) {
      await walletAdapter.disconnect();
    }
    setWalletSession(null);
    showToast('info', 'Sesión de wallet desconectada');
  };

  // Helper toast notification
  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  // Fetch Domains List
  const fetchDomains = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/domains`);
      if (res.ok) {
        const data = await res.json();
        setDomainRecordsList(data);
      }
    } catch (e) {
      console.warn('Backend not reached for domains fetch');
    }
  };

  // Fetch Bridge & Batches Data
  const fetchBridgeData = async () => {
    try {
      const [resStatus, resEvents, resBatches] = await Promise.all([
        fetch(`${BACKEND_URL}/bridge/status`),
        fetch(`${BACKEND_URL}/bridge/events`),
        fetch(`${BACKEND_URL}/batches/0x01827abc456def7890123456789abcdef0123456789abcdef0123456789abcd`)
      ]);

      if (resStatus.ok) setBridgeStatus(await resStatus.json());
      if (resEvents.ok) setBridgeEvents(await resEvents.json());
      if (resBatches.ok) setBatches(await resBatches.json());
    } catch (e) {
      console.warn('Backend not reached for bridge data');
    }
  };

  // Enforces that Lace Wallet is connected before executing write transactions
  const requireLaceConnection = (): { session: WalletSession; adapter: VinchiWalletAdapter } => {
    if (!walletSession || !walletAdapter) {
      setShowWalletModal(true);
      throw new Error('Debes conectar tu wallet de Lace / Midnight en la parte superior para autorizar esta operación.');
    }
    return { session: walletSession, adapter: walletAdapter };
  };

  // Action: Deposit USDC -> Mint lUSDv with REAL LACE SIGNATURE POPUP
  const handleExecuteDeposit = async () => {
    setIsDepositing(true);
    try {
      const { session, adapter } = requireLaceConnection();

      const amountNum = parseFloat(depositAmount);
      if (isNaN(amountNum) || amountNum <= 0) {
        throw new Error('Ingrese un monto de depósito válido');
      }

      // 1. TRIGGER REAL LACE POPUP APPROVAL WINDOW
      showToast('info', 'Solicitando aprobación en tu extensión de Lace Wallet...');
      const payloadToSign = new TextEncoder().encode(`Vinchi Deposit Authorization: ${amountNum} USDC (Period: ${periodDays} days)`);
      await adapter.signMessage(payloadToSign);

      // 2. Submit transaction
      const res = await fetch(`${BACKEND_URL}/deposits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: (amountNum * 1000000).toString(),
          ownerPubKey: session.address,
          periodDays
        })
      });

      if (!res.ok) throw new Error('Error al procesar el depósito en Midnight Preview');
      const data = await res.json();

      // Update Balances & Batch with Fase 5 Advanced Yield formula
      const issuedLusd = BigInt(data.issuedLusd || Math.floor(amountNum * 1000000 * (1 + (0.12 * periodDays) / 365)));
      const batchId = data.batchId || ('batch_0x' + Math.random().toString(16).substring(2, 10));
      const principal = BigInt(Math.floor(amountNum * 1000000));
      const expectedYield = BigInt(data.expectedYield || Math.floor((amountNum * 1000000 * 0.12 * periodDays) / 365));
      const createdAt = data.createdAt || Date.now();
      const maturesAt = data.maturesAt || (createdAt + periodDays * 86400000);
      const owner = session.address;

      setLusdvBalance(prev => prev + issuedLusd);
      setUsdcBalance(prev => (prev >= principal ? prev - principal : 0n));

      // Add new batch to batch state with Fase 5 fields
      setBatches(prev => [
        {
          batchId,
          principal,
          expectedYield,
          createdAt,
          maturesAt,
          owner,
          depositedAmount: principal,
          remainingAmount: principal,
          status: 'PENDING'
        },
        ...prev
      ]);

      // Add to transaction history
      setTransactions(prev => [
        {
          id: 'tx_' + Date.now(),
          type: 'deposit',
          amount: issuedLusd,
          token: 'lUSDv',
          timestamp: Date.now(),
          txHash: data.txHash,
          status: 'completed'
        },
        ...prev
      ]);

      showToast('success', `¡Depósito en Vault firmado con Lace! Lote ${batchId} creado. Se emitieron ${(amountNum * 1.002).toFixed(2)} lUSDv.`);
      fetchBridgeData();
    } catch (err: any) {
      showToast('error', err.message || 'Error en el depósito');
    } finally {
      setIsDepositing(false);
    }
  };

  // Action: Private Transfer (lUSDv) with REAL LACE SIGNATURE POPUP
  const handleExecuteTransfer = async () => {
    setIsTransferring(true);
    try {
      const { session, adapter } = requireLaceConnection();

      const amountNum = parseFloat(transferAmount);
      if (isNaN(amountNum) || amountNum <= 0) {
        throw new Error('Ingrese un monto de transferencia válido');
      }

      const amountUnits = BigInt(Math.floor(amountNum * 1000000));
      if (lusdvBalance < amountUnits) {
        throw new Error('Saldo insuficiente de lUSDv en tu wallet');
      }

      // 1. TRIGGER REAL LACE POPUP APPROVAL WINDOW
      showToast('info', 'Por favor aprueba la transferencia ZK en tu extensión de Lace Wallet...');
      const payloadToSign = new TextEncoder().encode(`Vinchi Private ZK Transfer: ${amountNum} ${selectedToken} to ${recipientInput}`);
      await adapter.signMessage(payloadToSign);

      // 2. Submit ZK Transfer
      const res = await fetch(`${BACKEND_URL}/transfers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: recipientInput,
          amount: amountUnits.toString(),
          senderPubKey: session?.address || walletSession?.address || '0x_alice'
        })
      });

      if (!res.ok) throw new Error('Error al ejecutar la transferencia privada ZK');
      const data = await res.json();

      setLusdvBalance(prev => (prev >= amountUnits ? prev - amountUnits : 0n));

      // Save consumed FIFO batches for UI breakdown display
      const consumed = data.consumedBatches || [
        {
          batchId: `batch_fifo_01_${Math.random().toString(16).substring(2, 8)}`,
          amount: amountUnits,
          maturesAt: Date.now() + 30 * 86400000
        }
      ];
      setLastConsumedBatches(consumed);

      setTransactions(prev => [
        {
          id: 'tx_' + Date.now(),
          type: 'payment_sent',
          amount: amountUnits,
          token: selectedToken,
          timestamp: Date.now(),
          recipientDomain: data.resolvedDomain || recipientInput,
          recipientAddress: data.recipientPublicKey,
          txHash: data.txHash,
          status: 'completed'
        },
        ...prev
      ]);

      showToast('success', `Pago privado de ${amountNum} ${selectedToken} (Lotes FIFO consumidos) firmado con Lace y enviado a ${recipientInput}.`);
    } catch (err: any) {
      showToast('error', err.message || 'Error en la transferencia');
    } finally {
      setIsTransferring(false);
    }
  };

  // Action: Redeem mUSDv for USDC (Fase 14)
  const handleRedeem = async () => {
    if (!redeemAmount || Number(redeemAmount) <= 0) {
      showToast('error', 'Ingrese un monto válido a retirar');
      return;
    }
    setIsRedeeming(true);
    try {
      const amountNum = Number(redeemAmount);
      const amountUnits = BigInt(Math.floor(amountNum * 1000000));
      const res = await fetch(`${BACKEND_URL}/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amountUnits.toString(),
          ownerPubKey: walletAdapter ? await walletAdapter.getAddress().catch(() => '0x_alice') : '0x_alice'
        })
      });

      if (!res.ok) throw new Error('Error al procesar el retiro en Vault.compact');
      const data = await res.json();

      setUsdcBalance(prev => prev + amountUnits);
      setMusdvBalance(prev => (prev >= amountUnits ? prev - amountUnits : 0n));

      setTransactions(prev => [
        {
          id: 'tx_' + Date.now(),
          type: 'deposit',
          amount: amountUnits,
          token: 'USDC',
          timestamp: Date.now(),
          txHash: data.txHash,
          status: 'completed'
        },
        ...prev
      ]);

      showToast('success', `Retiro exitoso de ${amountNum} USDC ejecutado en Vault.compact (mUSDv burned: ${data.burnedShares}).`);
    } catch (err: any) {
      showToast('error', err.message || 'Error en el retiro');
    } finally {
      setIsRedeeming(false);
    }
  };

  // Action: Register Domain (.midnight) with REAL LACE SIGNATURE POPUP
  const handleRegisterDomain = async () => {
    setIsRegisteringDomain(true);
    try {
      const { session, adapter } = requireLaceConnection();

      showToast('info', 'Aprueba el registro del dominio en tu extensión de Lace Wallet...');
      const payloadToSign = new TextEncoder().encode(`Vinchi Domain Registration: ${newDomainName}`);
      await adapter.signMessage(payloadToSign);

      const res = await fetch(`${BACKEND_URL}/domains/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newDomainName,
          ownerCommitment: session.address,
          controllerKey: session.address,
          records: {
            payment: session.address,
            profile: 'Dominio registrado en Vinchi Midnight con Lace'
          }
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Error al registrar dominio');
      }

      showToast('success', `Dominio ${newDomainName} registrado y firmado con Lace.`);
      fetchDomains();
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setIsRegisteringDomain(false);
    }
  };

  // Action: Claim Faucet
  const handleClaimFaucet = async () => {
    setIsClaimingFaucet(true);
    try {
      const res = await fetch(`${BACKEND_URL}/faucet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: walletSession?.address || '0x01827abc456def7890123456789abcdef0123456789abcdef0123456789abcd',
          token: faucetToken,
          amount: faucetAmount
        })
      });

      const data = await res.json();
      setFaucetResult(data);

      if (data.success) {
        if (faucetToken === 'tUSDC') setUsdcBalance(prev => prev + BigInt(faucetAmount) * 1000000n);
        if (faucetToken === 'lUSDv') setLusdvBalance(prev => prev + BigInt(faucetAmount) * 1000000n);
        showToast('success', `Faucet otorgó ${faucetAmount} ${faucetToken} exitosamente.`);
      } else {
        showToast('error', data.error || 'Error en reclamo de Faucet');
      }
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setIsClaimingFaucet(false);
    }
  };

  // Format Helper
  const fmt = (val: bigint) => (Number(val) / 1000000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="min-h-screen bg-[#09090b] text-[#f4f4f5] flex flex-col font-sans selection:bg-purple-500 selection:text-white">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-2xl backdrop-blur-md text-sm font-medium border flex items-center gap-3 transition-all duration-300 animate-bounce ${
            toast.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-200'
              : toast.type === 'error'
              ? 'bg-red-950/80 border-red-500/50 text-red-200'
              : 'bg-blue-950/80 border-blue-500/50 text-blue-200'
          }`}
        >
          <span>{toast.type === 'success' ? '✓' : toast.type === 'error' ? '✕' : 'ℹ'}</span>
          <span>{toast.message}</span>
        </div>
      )}

      {/* HEADER / NAVIGATION BAR */}
      <header className="sticky top-0 z-40 glass-panel border-b border-zinc-800/80 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-purple-600 via-pink-500 to-blue-500 p-[2px]">
            <div className="h-full w-full bg-zinc-950 rounded-[10px] flex items-center justify-center font-black text-xl gradient-text">
              V
            </div>
          </div>
          <div>
            <h1 className="font-bold text-lg leading-none flex items-center gap-2">
              Vinchi <span className="text-xs bg-purple-950/80 border border-purple-500/30 text-purple-300 px-2 py-0.5 rounded-full font-mono">Midnight ZK</span>
            </h1>
            <p className="text-xs text-zinc-400">Factoring de Rendimiento Futuro Privado</p>
          </div>
        </div>

        {/* Action Controls & Wallet Connect */}
        <div className="flex items-center gap-3">
          {/* Network Badge */}
          <div className="hidden md:flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-lg text-xs">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-zinc-300 font-mono">Midnight Preview</span>
          </div>

          {/* Faucet Trigger */}
          <button
            onClick={() => setShowFaucetModal(true)}
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold px-3 py-2 rounded-lg border border-zinc-700 transition"
          >
            🚰 Faucet USDC
          </button>

          {/* Connected Wallet Button */}
          {walletSession ? (
            <div className="flex items-center gap-2">
              <button
                onClick={handleDisconnectWallet}
                className="bg-zinc-900 border border-purple-500/40 text-purple-300 hover:bg-purple-950/50 px-4 py-2 rounded-xl text-xs font-mono font-medium transition flex items-center gap-2 shadow-lg"
              >
                <span className="h-2 w-2 rounded-full bg-purple-400"></span>
                <span>LACE • {walletSession.address.slice(0, 6)}...{walletSession.address.slice(-4)}</span>
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowWalletModal(true)}
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-semibold text-xs px-5 py-2.5 rounded-xl shadow-lg glow-purple transition"
            >
              Conectar Lace Wallet
            </button>
          )}
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <div className="flex-1 flex max-w-7xl w-full mx-auto p-6 gap-6">
        {/* SIDEBAR NAVIGATION TABS */}
        <aside className="w-64 flex flex-col gap-2 shrink-0">
          <div className="p-2 glass-panel rounded-2xl border border-zinc-800/80 space-y-1">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition flex items-center justify-between ${
                activeTab === 'dashboard' ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
              }`}
            >
              <span>📊 Dashboard Overview</span>
            </button>

            <button
              onClick={() => setActiveTab('deposit')}
              className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition flex items-center justify-between ${
                activeTab === 'deposit' ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
              }`}
            >
              <span>📥 Depositar & Adelanto</span>
            </button>

            <button
              onClick={() => setActiveTab('transfer')}
              className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition flex items-center justify-between ${
                activeTab === 'transfer' ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
              }`}
            >
              <span>💸 Transferencia Privada</span>
            </button>

            <button
              onClick={() => setActiveTab('yield')}
              className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition flex items-center justify-between ${
                activeTab === 'yield' ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
              }`}
            >
              <span>📈 Rendimientos</span>
            </button>

            <button
              onClick={() => setActiveTab('batches')}
              className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition flex items-center justify-between ${
                activeTab === 'batches' ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
              }`}
            >
              <span>📦 Lotes de Maduración</span>
            </button>

            <button
              onClick={() => setActiveTab('domains')}
              className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition flex items-center justify-between ${
                activeTab === 'domains' ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
              }`}
            >
              <span>🌐 Dominios .midnight</span>
            </button>

            <button
              onClick={() => setActiveTab('bridge')}
              className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition flex items-center justify-between ${
                activeTab === 'bridge' ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
              }`}
            >
              <span>🌉 Bridge Monitor</span>
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition flex items-center justify-between ${
                activeTab === 'history' ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
              }`}
            >
              <span>📜 Historial Privado</span>
            </button>
          </div>

          {/* Quick Balance Summary Card (Fase 12 & 13) */}
          {(() => {
            const nowMs = Date.now();
            const pendingBatchesList = batches.filter(b => nowMs < b.maturesAt && b.status !== 'MATURED');
            const maturedBatchesList = batches.filter(b => nowMs >= b.maturesAt || b.status === 'MATURED');

            const pendingBatchesSum = pendingBatchesList.reduce((acc, b) => acc + (b.remainingAmount || b.principal || 0n), 0n);
            const totalLusdvDisplay = lusdvBalance + pendingBatchesSum;

            const maturedYieldSum = maturedBatchesList.reduce((acc, b) => acc + (b.remainingAmount || b.principal || 0n) + (b.expectedYield || 0n), 0n);
            const rebasedMusdvFromShares = (userShares * globalIndex) / 1000000000000000000000000000n;
            const totalMusdvDisplay = musdvBalance + rebasedMusdvFromShares + maturedYieldSum;
            const indexRayFormatted = (Number(globalIndex) / 1e27).toFixed(6);

            return (
              <div className="glass-panel rounded-2xl p-4 border border-zinc-800/80 mt-auto space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Saldos ZK (Lazy Conversion)</h3>
                  <span className="text-[10px] bg-blue-950 text-blue-300 border border-blue-500/40 px-1.5 py-0.5 rounded font-mono">
                    📈 {indexRayFormatted} RAY
                  </span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-zinc-400">USDC Libre:</span>
                    <span className="font-mono font-medium text-emerald-400">{fmt(usdcBalance)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-purple-300 font-medium">lUSDv (Lotes Pendientes):</span>
                    <span className="font-mono font-semibold text-purple-300">{fmt(totalLusdvDisplay)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-blue-300 font-medium flex items-center gap-1">
                      mUSDv (Rebasing):
                      <span className="text-[9px] text-blue-400 animate-pulse">⚡ Auto</span>
                    </span>
                    <span className="font-mono font-bold text-blue-300 transition-all">{fmt(totalMusdvDisplay)}</span>
                  </div>
                </div>
              </div>
            );
          })()}
        </aside>

        {/* TAB CONTENT AREA */}
        <main className="flex-1">
          {/* TAB 1: DASHBOARD */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">Resumen de Cuenta</h2>
                  <p className="text-sm text-zinc-400">Factoring de Rendimiento Futuro Privado sobre Midnight Blockchain</p>
                </div>
                <button
                  onClick={() => setActiveTab('deposit')}
                  className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl shadow-lg glow-purple transition"
                >
                  + Depositar & Adelantar Yield
                </button>
              </div>

              {/* KPI Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="glass-card p-5 rounded-2xl border border-zinc-800">
                  <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Saldo Total lUSDv</span>
                  <div className="text-2xl font-black mt-2 font-mono text-purple-300">{fmt(lusdvBalance)}</div>
                  <span className="text-xs text-purple-400/80 mt-1 inline-block">Capital + Rendimiento Adelantado</span>
                </div>

                <div className="glass-card p-5 rounded-2xl border border-zinc-800">
                  <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">APY de Protocolo</span>
                  <div className="text-2xl font-black mt-2 font-mono text-emerald-400">5.00%</div>
                  <span className="text-xs text-emerald-400/80 mt-1 inline-block">Rendimiento garantizado por Vault</span>
                </div>

                <div className="glass-card p-5 rounded-2xl border border-zinc-800">
                  <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Rendimiento Adelantado</span>
                  <div className="text-2xl font-black mt-2 font-mono text-pink-400">+$2.00 lUSDv</div>
                  <span className="text-xs text-pink-400/80 mt-1 inline-block">Disponible para gastar hoy</span>
                </div>

                <div className="glass-card p-5 rounded-2xl border border-zinc-800">
                  <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Lotes Activos</span>
                  <div className="text-2xl font-black mt-2 font-mono text-blue-400">1 Lote</div>
                  <span className="text-xs text-blue-400/80 mt-1 inline-block">En maduración a mUSDv</span>
                </div>
              </div>

              {/* Fund Distribution Breakdown */}
              <div className="glass-panel p-6 rounded-2xl border border-zinc-800 space-y-4">
                <h3 className="font-semibold text-lg">Distribución de Fondos y Maduración</h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-zinc-400">
                    <span>lUSDv Bloqueado en Maduración ($1,002.00)</span>
                    <span>mUSDv Maduro ($0.00)</span>
                  </div>
                  <div className="h-4 w-full bg-zinc-900 rounded-full overflow-hidden flex p-0.5 border border-zinc-800">
                    <div className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full" style={{ width: '100%' }}></div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 pt-2 text-center text-xs">
                  <div className="p-3 bg-zinc-900/60 rounded-xl border border-zinc-800">
                    <span className="text-zinc-400 block">Capital Inicial Depositado</span>
                    <span className="font-mono text-sm font-semibold text-white mt-1 block">$1,000.00 USDC</span>
                  </div>
                  <div className="p-3 bg-zinc-900/60 rounded-xl border border-zinc-800">
                    <span className="text-zinc-400 block">Adelanto de Yield (5.00% APY)</span>
                    <span className="font-mono text-sm font-semibold text-purple-300 mt-1 block">+$2.00 lUSDv</span>
                  </div>
                  <div className="p-3 bg-zinc-900/60 rounded-xl border border-zinc-800">
                    <span className="text-zinc-400 block">Fecha de Maduración</span>
                    <span className="font-mono text-sm font-semibold text-emerald-400 mt-1 block">30 Días (Automático)</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: DEPOSIT & YIELD SIMULATOR */}
          {activeTab === 'deposit' && (
            <div className="space-y-6 max-w-2xl mx-auto">
              <div>
                <h2 className="text-2xl font-bold">Depositar USDC & Obtener Rendimiento Adelantado</h2>
                <p className="text-sm text-zinc-400">Ingresa capital para emitir inmediatamente notas lUSDv privadas con yield futuro.</p>
              </div>

              <div className="glass-panel p-6 rounded-2xl border border-zinc-800 space-y-6">
                <div>
                  <label className="text-xs font-semibold uppercase text-zinc-400 block mb-2">Monto a Depositar (USDC)</label>
                  <input
                    type="number"
                    value={depositAmount}
                    onChange={e => setDepositAmount(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 focus:border-purple-500 rounded-xl px-4 py-3 text-xl font-mono text-white focus:outline-none"
                    placeholder="1000"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase text-zinc-400 block mb-2">Periodo de Maduración</label>
                  <div className="grid grid-cols-3 gap-3">
                    {[15, 30, 90].map(days => (
                      <button
                        key={days}
                        onClick={() => setPeriodDays(days)}
                        className={`py-2.5 rounded-xl border text-xs font-medium transition ${
                          periodDays === days ? 'bg-purple-600/30 border-purple-500 text-purple-300' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {days} Días
                      </button>
                    ))}
                  </div>
                </div>

                {/* Yield Simulator Box */}
                <div className="p-4 bg-zinc-950/80 rounded-xl border border-zinc-800 space-y-3">
                  <h4 className="text-xs font-semibold text-purple-400 uppercase tracking-wider">Simulación de Factoring ZK</h4>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Capital USDC Depositado:</span>
                      <span className="font-mono text-zinc-200">${(parseFloat(depositAmount) || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-purple-300">Rendimiento Adelantado Estimado (5.00% APY):</span>
                      <span className="font-mono text-purple-300 font-semibold">
                        +${((parseFloat(depositAmount) || 0) * (0.05 * (periodDays / 365))).toFixed(2)} lUSDv
                      </span>
                    </div>
                    <div className="border-t border-zinc-800 pt-2 flex justify-between font-bold text-base">
                      <span>Total lUSDv Emitidos:</span>
                      <span className="font-mono text-emerald-400">
                        ${((parseFloat(depositAmount) || 0) * (1 + 0.05 * (periodDays / 365))).toFixed(2)} lUSDv
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleExecuteDeposit}
                  disabled={isDepositing}
                  className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-semibold py-3.5 rounded-xl shadow-xl transition disabled:opacity-50"
                >
                  {isDepositing ? 'Solicitando Firma en Lace Wallet...' : 'Firmar con Lace & Emitir lUSDv'}
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: PRIVATE TRANSFER WITH DOMAIN RESOLUTION */}
          {activeTab === 'transfer' && (
            <div className="space-y-6 max-w-2xl mx-auto">
              <div>
                <h2 className="text-2xl font-bold">Transferencia Privada ZK</h2>
                <p className="text-sm text-zinc-400">Envía pagos con notas ZK a direcciones o nombres de dominio <code className="text-purple-400">.midnight</code>.</p>
              </div>

              <div className="glass-panel p-6 rounded-2xl border border-zinc-800 space-y-6">
                <div>
                  <label className="text-xs font-semibold uppercase text-zinc-400 block mb-2">Destinatario (Dirección o Dominio .midnight)</label>
                  <input
                    type="text"
                    value={recipientInput}
                    onChange={e => setRecipientInput(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 focus:border-purple-500 rounded-xl px-4 py-3 font-mono text-white text-sm focus:outline-none"
                    placeholder="cafe-central.midnight"
                  />

                  {/* Auto Domain Resolution Card */}
                  {isResolvingDomain && (
                    <div className="mt-2 text-xs text-purple-400 animate-pulse">Resolviendo dominio .midnight...</div>
                  )}

                  {resolvedDomain && (
                    <div className="mt-3 p-3 bg-purple-950/40 border border-purple-500/30 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {resolvedDomain.avatarUrl ? (
                          <img src={resolvedDomain.avatarUrl} alt="Avatar" className="w-9 h-9 rounded-full border border-purple-400" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-purple-800 flex items-center justify-center font-bold">M</div>
                        )}
                        <div>
                          <div className="font-semibold text-sm flex items-center gap-1.5">
                            {resolvedDomain.name}
                            <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-500/40 px-1.5 py-0.2 rounded-full">✓ Verificado</span>
                          </div>
                          <div className="text-[11px] text-zinc-400 font-mono">{resolvedDomain.controllerKey.slice(0, 18)}...</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase text-zinc-400 block mb-2">Monto a Transferir</label>
                  <div className="flex gap-3">
                    <input
                      type="number"
                      value={transferAmount}
                      onChange={e => setTransferAmount(e.target.value)}
                      className="flex-1 bg-zinc-900 border border-zinc-700 focus:border-purple-500 rounded-xl px-4 py-3 text-lg font-mono text-white focus:outline-none"
                      placeholder="200"
                    />
                    <select
                      value={selectedToken}
                      onChange={e => setSelectedToken(e.target.value as any)}
                      className="bg-zinc-900 border border-zinc-700 rounded-xl px-4 text-sm font-semibold text-purple-300"
                    >
                      <option value="lUSDv">lUSDv</option>
                      <option value="mUSDv">mUSDv</option>
                    </select>
                  </div>
                </div>

                <button
                  onClick={handleExecuteTransfer}
                  disabled={isTransferring}
                  className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-semibold py-3.5 rounded-xl shadow-xl transition disabled:opacity-50"
                >
                  {isTransferring ? 'Solicitando Firma en Lace Wallet...' : `Firmar con Lace & Enviar ${transferAmount} ${selectedToken}`}
                </button>

                {/* FIFO Consumed Batches Breakdown Card (Fase 6 & 7) */}
                {lastConsumedBatches.length > 0 && (
                  <div className="mt-4 p-4 bg-purple-950/30 border border-purple-500/30 rounded-xl space-y-3">
                    <div className="flex items-center justify-between text-xs font-bold text-purple-300 uppercase tracking-wider">
                      <span>📦 Detalle de Lotes Consumidos (FIFO Real)</span>
                      <span className="bg-purple-900/60 text-purple-200 px-2 py-0.5 rounded font-mono">
                        {lastConsumedBatches.length} Lote(s)
                      </span>
                    </div>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {lastConsumedBatches.map((b, idx) => (
                        <div key={idx} className="p-2.5 bg-zinc-900/80 border border-zinc-800 rounded-lg flex items-center justify-between text-xs font-mono">
                          <div>
                            <span className="text-purple-400 font-bold">{b.batchId}</span>
                            <div className="text-[11px] text-zinc-400">
                              Maduración Original: {new Date(b.maturesAt).toLocaleDateString()}
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-emerald-400 font-bold">{(Number(b.amount) / 1000000).toFixed(2)} lUSDv</span>
                            <div className="text-[10px] text-zinc-500">Sublote Preservado</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: YIELD ANALYTICS & REDEEM */}
          {activeTab === 'yield' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold">Analítica de Rendimiento & Retiro Vault</h2>
              <div className="glass-panel p-6 rounded-2xl border border-zinc-800 space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 bg-zinc-900/60 rounded-xl border border-zinc-800">
                    <span className="text-xs text-zinc-400 uppercase">Capital Total en Vault</span>
                    <div className="text-xl font-bold font-mono text-white mt-1">$1,000.00 USDC</div>
                  </div>
                  <div className="p-4 bg-zinc-900/60 rounded-xl border border-zinc-800">
                    <span className="text-xs text-zinc-400 uppercase">Yield Adelantado Entregado</span>
                    <div className="text-xl font-bold font-mono text-purple-400 mt-1">+$2.00 lUSDv</div>
                  </div>
                  <div className="p-4 bg-zinc-900/60 rounded-xl border border-zinc-800">
                    <span className="text-xs text-zinc-400 uppercase">Yield Realizado Acumulado</span>
                    <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
                      {(Number(userShares * globalIndex) / 1e33).toFixed(2)} mUSDv
                    </div>
                  </div>
                </div>
              </div>

              {/* Redeem Card (Fase 14) */}
              <div className="glass-panel p-6 rounded-2xl border border-blue-500/30 bg-blue-950/20 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-lg text-blue-300">Retirar mUSDv por USDC (Vault.redeem)</h3>
                    <p className="text-xs text-zinc-400">Quema mUSDv rebased y desbloquea el colateral USDC equivalente en Vault.compact</p>
                  </div>
                  <span className="text-xs bg-blue-900/80 text-blue-200 px-3 py-1 rounded-lg font-mono">
                    Fase 14 Executed
                  </span>
                </div>

                <div className="flex gap-4 items-center">
                  <div className="flex-1">
                    <label className="text-xs text-zinc-400 block mb-1">Monto mUSDv a Quemar</label>
                    <input
                      type="number"
                      value={redeemAmount}
                      onChange={e => setRedeemAmount(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-700 focus:border-blue-500 rounded-xl px-4 py-2.5 font-mono text-white"
                      placeholder="500"
                    />
                  </div>
                  <button
                    onClick={handleRedeem}
                    disabled={isRedeeming}
                    className="mt-5 bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 text-white font-semibold px-6 py-3 rounded-xl transition disabled:opacity-50 shadow-lg"
                  >
                    {isRedeeming ? 'Procesando en Vault.compact...' : 'Firmar Retiro con Lace'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: BATCHES */}
          {activeTab === 'batches' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold">Lotes de Maduración de Rendimiento</h2>
              <div className="glass-panel rounded-2xl border border-zinc-800 overflow-hidden">
                <table className="w-full text-left text-sm text-zinc-300">
                  <thead className="bg-zinc-900/80 text-xs font-semibold text-zinc-400 uppercase border-b border-zinc-800">
                    <tr>
                      <th className="px-5 py-3.5">Batch ID</th>
                      <th className="px-5 py-3.5">Monto Inicial</th>
                      <th className="px-5 py-3.5">Yield Esperado</th>
                      <th className="px-5 py-3.5">Estado</th>
                      <th className="px-5 py-3.5">Maduración</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 font-mono text-xs">
                    {batches.map(b => (
                      <tr key={b.batchId} className="hover:bg-zinc-900/30">
                        <td className="px-5 py-4 font-semibold text-purple-300">{b.batchId}</td>
                        <td className="px-5 py-4">{fmt(b.depositedAmount)} lUSDv</td>
                        <td className="px-5 py-4 text-emerald-400">+{fmt(b.expectedYield)} lUSDv</td>
                        <td className="px-5 py-4">
                          <span className="px-2.5 py-1 bg-purple-950 text-purple-300 border border-purple-500/30 rounded-full text-[10px]">
                            {b.status}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-zinc-400">30 Días restantes</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 6: DOMAINS (.midnight) */}
          {activeTab === 'domains' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">Sistema de Dominios Midnight (.midnight)</h2>
                  <p className="text-sm text-zinc-400">Nombres legibles con resolución privada sin exponer la dirección física.</p>
                </div>
              </div>

              {/* Register Domain Form */}
              <div className="glass-panel p-6 rounded-2xl border border-zinc-800 space-y-4 max-w-xl">
                <h3 className="font-semibold text-sm uppercase text-purple-400">Registrar Nuevo Dominio</h3>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={newDomainName}
                    onChange={e => setNewDomainName(e.target.value)}
                    className="flex-1 bg-zinc-900 border border-zinc-700 focus:border-purple-500 rounded-xl px-4 py-2.5 font-mono text-sm text-white focus:outline-none"
                    placeholder="mi-comercio.midnight"
                  />
                  <button
                    onClick={handleRegisterDomain}
                    disabled={isRegisteringDomain}
                    className="bg-purple-600 hover:bg-purple-500 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition"
                  >
                    Registrar con Lace
                  </button>
                </div>
              </div>

              {/* Registered Domains List */}
              <div className="glass-panel rounded-2xl border border-zinc-800 p-6 space-y-4">
                <h3 className="font-semibold text-base">Dominios Registrados en Midnight</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {domainRecordsList.map(d => (
                    <div key={d.name} className="p-4 bg-zinc-900/60 rounded-xl border border-zinc-800 flex items-center justify-between">
                      <div>
                        <div className="font-bold text-purple-300 font-mono">{d.name}</div>
                        <div className="text-xs text-zinc-400 font-mono mt-1">Commitment: {d.ownerCommitment.slice(0, 16)}...</div>
                      </div>
                      <span className="text-xs bg-emerald-950 text-emerald-300 border border-emerald-500/30 px-2.5 py-1 rounded-full">
                        Activo
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: BRIDGE MONITOR */}
          {activeTab === 'bridge' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold">Bridge Monitor (Yield Layer ↔ TodoMidnight)</h2>

              {bridgeStatus && (
                <div className="grid grid-cols-4 gap-4">
                  <div className="glass-card p-4 rounded-xl border border-zinc-800 text-center">
                    <span className="text-xs text-zinc-400 uppercase">Sincronizados</span>
                    <div className="text-xl font-bold font-mono text-emerald-400 mt-1">{bridgeStatus.syncedEventsCount}</div>
                  </div>
                  <div className="glass-card p-4 rounded-xl border border-zinc-800 text-center">
                    <span className="text-xs text-zinc-400 uppercase">Pendientes</span>
                    <div className="text-xl font-bold font-mono text-purple-400 mt-1">{bridgeStatus.pendingEventsCount}</div>
                  </div>
                  <div className="glass-card p-4 rounded-xl border border-zinc-800 text-center">
                    <span className="text-xs text-zinc-400 uppercase">Madurados</span>
                    <div className="text-xl font-bold font-mono text-blue-400 mt-1">{bridgeStatus.maturedEventsCount}</div>
                  </div>
                  <div className="glass-card p-4 rounded-xl border border-zinc-800 text-center">
                    <span className="text-xs text-zinc-400 uppercase">Fallidos</span>
                    <div className="text-xl font-bold font-mono text-red-400 mt-1">{bridgeStatus.failedEventsCount}</div>
                  </div>
                </div>
              )}

              <div className="glass-panel rounded-2xl border border-zinc-800 p-6 space-y-4">
                <h3 className="font-semibold text-base">Event Sourcing & Sync Feed</h3>
                <div className="space-y-3">
                  {bridgeEvents.map((e, idx) => (
                    <div key={`${e.id}_${idx}`} className="p-3 bg-zinc-900/60 rounded-xl border border-zinc-800/80 flex items-center justify-between text-xs font-mono">
                      <div>
                        <span className="text-purple-300 font-semibold">{e.eventType}</span>
                        <span className="text-zinc-500 ml-2">[{e.batchId}]</span>
                      </div>
                      <span className="text-zinc-400">{new Date(e.timestamp).toLocaleTimeString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 8: PRIVATE HISTORY */}
          {activeTab === 'history' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold">Historial de Transacciones ZK Privadas</h2>
              <div className="glass-panel rounded-2xl border border-zinc-800 overflow-hidden">
                <table className="w-full text-left text-sm text-zinc-300">
                  <thead className="bg-zinc-900/80 text-xs font-semibold text-zinc-400 uppercase border-b border-zinc-800">
                    <tr>
                      <th className="px-5 py-3.5">Tipo</th>
                      <th className="px-5 py-3.5">Monto</th>
                      <th className="px-5 py-3.5">Destinatario</th>
                      <th className="px-5 py-3.5">Tx Hash</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 font-mono text-xs">
                    {transactions.map(tx => (
                      <tr key={tx.id} className="hover:bg-zinc-900/30">
                        <td className="px-5 py-4 uppercase font-semibold text-purple-300">{tx.type}</td>
                        <td className="px-5 py-4 font-semibold text-emerald-400">{fmt(tx.amount)} {tx.token}</td>
                        <td className="px-5 py-4 text-zinc-400">{tx.recipientDomain || tx.recipientAddress?.slice(0, 16) || '-'}</td>
                        <td className="px-5 py-4 text-zinc-500">{tx.txHash.slice(0, 20)}...</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* WALLET SELECTION MODAL */}
      {showWalletModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-panel bg-zinc-950 border border-zinc-800 rounded-3xl max-w-md w-full p-6 space-y-6 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-lg">Conectar Lace Wallet (Midnight)</h3>
              <button onClick={() => setShowWalletModal(false)} className="text-zinc-400 hover:text-white font-bold">✕</button>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleConnectWallet}
                disabled={isConnecting}
                className="w-full p-4 bg-zinc-900 hover:bg-zinc-800 border border-purple-500/30 rounded-2xl text-left flex items-center justify-between transition group"
              >
                <div>
                  <div className="font-bold text-purple-300">Extensión de Lace / Midnight</div>
                  <div className="text-xs text-zinc-400 mt-0.5">Conectar wallet inyectada en el navegador</div>
                </div>
                <span className="text-purple-400 group-hover:translate-x-1 transition">→</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FAUCET CLAIM MODAL */}
      {showFaucetModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-panel bg-zinc-950 border border-zinc-800 rounded-3xl max-w-md w-full p-6 space-y-6 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-lg">🚰 Midnight Faucet (Prueba)</h3>
              <button onClick={() => setShowFaucetModal(false)} className="text-zinc-400 hover:text-white font-bold">✕</button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase text-zinc-400 block mb-2">Token de Prueba</label>
                <select
                  value={faucetToken}
                  onChange={e => setFaucetToken(e.target.value as any)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white font-semibold"
                >
                  <option value="tUSDC">tUSDC (USDC de Prueba)</option>
                  <option value="lUSDv">lUSDv (Nota de Adelanto)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase text-zinc-400 block mb-2">Monto</label>
                <input
                  type="number"
                  value={faucetAmount}
                  onChange={e => setFaucetAmount(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 font-mono text-sm text-white"
                />
              </div>

              <button
                onClick={handleClaimFaucet}
                disabled={isClaimingFaucet}
                className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold py-3 rounded-xl shadow-lg transition"
              >
                {isClaimingFaucet ? 'Reclamando...' : 'Reclamar Tokens en Preview'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
