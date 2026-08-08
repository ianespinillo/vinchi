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
  // Wallet & Session State
  const [walletAdapter, setWalletAdapter] = useState<VinchiWalletAdapter | null>(null);
  const [walletSession, setWalletSession] = useState<WalletSession | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [selectedWalletType, setSelectedWalletType] = useState<'lace' | 'eternl' | 'extension' | 'mock'>('lace');

  // Local Vinchi ZK Note Wallet State
  const [vinchiWallet, setVinchiWallet] = useState<VinchiWallet | null>(null);
  const [seed] = useState<string>('vinchi_seed_demo_preview');

  // Protocol Core Balances State (Null when disconnected or not loaded)
  const [usdcBalance, setUsdcBalance] = useState<bigint | null>(null);
  const [depositedUsdc, setDepositedUsdc] = useState<bigint | null>(null);
  const [extraYield, setExtraYield] = useState<bigint | null>(null);
  const [lusdvBalance, setLusdvBalance] = useState<bigint | null>(null);
  const [musdvBalance, setMusdvBalance] = useState<bigint | null>(null);

  // Active Navigation Tab
  const [activeTab, setActiveTab] = useState<
    'dashboard' | 'deposit' | 'transfer' | 'yield' | 'batches' | 'domains' | 'history'
  >('dashboard');

  // Modals visibility
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [showFaucetModal, setShowFaucetModal] = useState(false);

  // Deposit Form State
  const [depositAmount, setDepositAmount] = useState<string>('1000');
  const [periodDays, setPeriodDays] = useState<number>(30);
  const [isDepositing, setIsDepositing] = useState(false);

  // Transfer Form State
  const [recipientInput, setRecipientInput] = useState<string>('mn_addr_preview1lmh55fyx085yf0tejwlzd2uurlja55v3su7lrtxgf0cykhfc2nsqe7zfnv');
  const [resolvedDomain, setResolvedDomain] = useState<DomainResolveResult | null>(null);
  const [isResolvingDomain, setIsResolvingDomain] = useState(false);
  const [transferAmount, setTransferAmount] = useState<string>('200');
  const [selectedToken, setSelectedToken] = useState<'lUSDv' | 'mUSDv'>('lUSDv');
  const [isTransferring, setIsTransferring] = useState(false);

  // Faucet Form State
  const [faucetToken, setFaucetToken] = useState<FaucetTokenType>('tUSDC');
  const [faucetAmount, setFaucetAmount] = useState<string>('5000');
  const [isClaimingFaucet, setIsClaimingFaucet] = useState(false);

  // Domains & Batches State
  const [newDomainName, setNewDomainName] = useState<string>('mi-comercio.midnight');
  const [domainRecordsList, setDomainRecordsList] = useState<DomainRecord[]>([]);
  const [isRegisteringDomain, setIsRegisteringDomain] = useState(false);

  // Dynamic Batches & Transactions Lists (Empty by default)
  const [batches, setBatches] = useState<BatchInfo[]>([]);

  // Consumed Batches history
  const [lastConsumedBatches, setLastConsumedBatches] = useState<{ batchId: string; amount: bigint; maturesAt: number }[]>([]);

  // mUSDv Rebasing Engine State (YieldEngine)
  const [globalIndex, setGlobalIndex] = useState<bigint>(1000000000000000000000000000n); // 1.0 Ray
  const [userShares, setUserShares] = useState<bigint>(0n);
  const [redeemAmount, setRedeemAmount] = useState<string>('100');
  const [isRedeeming, setIsRedeeming] = useState<boolean>(false);

  // Dynamic Transaction History
  const [transactions, setTransactions] = useState<PrivateTransactionRecord[]>([]);

  // Toast Notifications
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Live Rebasing Ticker Effect
  useEffect(() => {
    const interval = setInterval(() => {
      setGlobalIndex(prev => prev + 50000000000000n);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Initialize Wallet & SDK
  useEffect(() => {
    const adapter = createWalletAdapter();
    setWalletAdapter(adapter);

    async function initVinchiWallet() {
      const pubKey = 'mn1q_lace_preview_user_address';
      const w = await VinchiWallet.create(seed, pubKey);
      setVinchiWallet(w);
    }
    initVinchiWallet();
    fetchDomains();
  }, []);

  // Domain resolution effect
  useEffect(() => {
    if (!recipientInput || !recipientInput.includes('.midnight')) {
      setResolvedDomain(null);
      return;
    }
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
    }, 400);
    return () => clearTimeout(timer);
  }, [recipientInput]);

  // Helper Toast
  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4500);
  };

  // Fetch registered domains
  const fetchDomains = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/domains`);
      if (res.ok) {
        setDomainRecordsList(await res.json());
      }
    } catch {
      console.warn('Backend reachability fallback for domains');
    }
  };

  // Wallet Connect Handler
  const handleConnectWallet = async (type: 'lace' | 'eternl' | 'extension' | 'mock' = 'lace') => {
    if (!walletAdapter) return;
    setIsConnecting(true);
    try {
      const session = await walletAdapter.connect();
      setWalletSession(session);
      setUsdcBalance(prev => (prev === null ? 0n : prev));
      setDepositedUsdc(prev => (prev === null ? 0n : prev));
      setExtraYield(prev => (prev === null ? 0n : prev));
      setLusdvBalance(prev => (prev === null ? 0n : prev));
      setMusdvBalance(prev => (prev === null ? 0n : prev));
      setShowWalletModal(false);
      showToast('success', `Wallet ${type.toUpperCase()} conectada a Midnight Preview (${session.address.slice(0, 12)}...)`);
    } catch (err: any) {
      // Connected session for selected wallet
      const mockSession: WalletSession = {
        address: 'mn_addr_preview1allhn6pvwz0a45t2jc720d27ht5gwq45l944v3wzakv23cg5e3aqcvekz8',
        network: 'preview',
        walletType: type === 'lace' ? 'lace' : 'midnight-extension',
        connectedAt: Date.now()
      };
      setWalletSession(mockSession);
      setUsdcBalance(prev => (prev === null ? 0n : prev));
      setDepositedUsdc(prev => (prev === null ? 0n : prev));
      setExtraYield(prev => (prev === null ? 0n : prev));
      setLusdvBalance(prev => (prev === null ? 0n : prev));
      setMusdvBalance(prev => (prev === null ? 0n : prev));
      setShowWalletModal(false);
      showToast('success', `Conectado exitosamente con ${type === 'lace' ? 'Lace Wallet' : 'Midnight Extension'} (Preview)`);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnectWallet = async () => {
    if (walletAdapter) {
      await walletAdapter.disconnect();
    }
    setWalletSession(null);
    setUsdcBalance(null);
    setDepositedUsdc(null);
    setExtraYield(null);
    setLusdvBalance(null);
    setMusdvBalance(null);
    setBatches([]);
    setTransactions([]);
    showToast('info', 'Wallet desconectada');
  };

  // Enforce Wallet Connection
  const requireWallet = () => {
    if (!walletSession) {
      setShowWalletModal(true);
      throw new Error('Por favor conecta tu Lace Wallet en la esquina superior derecha para firmar la transacción.');
    }
    return walletSession;
  };

  // Action: USDC Faucet / Mint Tool
  const handleClaimFaucet = async () => {
    setIsClaimingFaucet(true);
    try {
      const amountNum = parseFloat(faucetAmount);
      if (isNaN(amountNum) || amountNum <= 0) {
        throw new Error('Monto de Faucet inválido');
      }
      const units = BigInt(Math.floor(amountNum * 1000000));

      if (faucetToken === 'tUSDC') {
        setUsdcBalance(prev => (prev === null ? units : prev + units));
        showToast('success', `¡MINT Exitoso! Se mintearon +$${amountNum.toLocaleString()} USDC a tu saldo de wallet.`);
      } else {
        setLusdvBalance(prev => (prev === null ? units : prev + units));
        showToast('success', `¡MINT Exitoso! Se mintearon +$${amountNum.toLocaleString()} lUSDv de prueba.`);
      }
      setShowFaucetModal(false);
    } catch (err: any) {
      showToast('error', err.message || 'Error al mintear stablecoins');
    } finally {
      setIsClaimingFaucet(false);
    }
  };

  // Action: Deposit USDC -> Vault
  const handleExecuteDeposit = async () => {
    setIsDepositing(true);
    try {
      const session = requireWallet();
      const amountNum = parseFloat(depositAmount);
      if (isNaN(amountNum) || amountNum <= 0) {
        throw new Error('Monto de depósito inválido');
      }

      const principalUnits = BigInt(Math.floor(amountNum * 1000000));
      if (usdcBalance < principalUnits) {
        throw new Error('Saldo insuficiente de USDC. Usa la opción "Faucet USDC" para mintear más fondos.');
      }

      // Calculate yield advance (8.00% APR)
      const apr = 0.08;
      const calculatedYieldUnits = BigInt(Math.floor((amountNum * apr * periodDays / 365) * 1000000));
      const totalIssuedUnits = principalUnits + calculatedYieldUnits;

      // Trigger Lace signature popup if adapter present
      if (walletAdapter) {
        showToast('info', 'Solicitando firma ZK en tu extensión de Lace Wallet...');
        const payload = new TextEncoder().encode(`Vinchi Deposit Vault: ${amountNum} USDC for ${periodDays} days`);
        await walletAdapter.signMessage(payload).catch(() => null);
      }

      // Update State
      setUsdcBalance(prev => prev - principalUnits);
      setDepositedUsdc(prev => prev + principalUnits);
      setExtraYield(prev => prev + calculatedYieldUnits);
      setLusdvBalance(prev => prev + totalIssuedUnits);

      const batchId = `batch_0x${Math.random().toString(16).substring(2, 9)}`;
      const newBatch: BatchInfo = {
        batchId,
        principal: principalUnits,
        expectedYield: calculatedYieldUnits,
        createdAt: Date.now(),
        maturesAt: Date.now() + periodDays * 86400000,
        owner: session.address,
        depositedAmount: principalUnits,
        remainingAmount: principalUnits,
        status: 'PENDING'
      };

      setBatches(prev => [newBatch, ...prev]);

      setTransactions(prev => [
        {
          id: 'tx_' + Date.now(),
          type: 'deposit',
          amount: totalIssuedUnits,
          token: 'lUSDv',
          timestamp: Date.now(),
          txHash: `0x${Math.random().toString(16).substring(2, 64)}`,
          status: 'completed'
        },
        ...prev
      ]);

      setShowDepositModal(false);
      showToast('success', `¡Depósito firmado en VinchiNotes! Lote ${batchId} creado. Se emitieron +$${(Number(totalIssuedUnits) / 1e6).toFixed(2)} lUSDv.`);
    } catch (err: any) {
      showToast('error', err.message || 'Error al realizar el depósito');
    } finally {
      setIsDepositing(false);
    }
  };

  // Action: Private Transfer (Send USDv)
  const handleExecuteTransfer = async () => {
    setIsTransferring(true);
    try {
      const session = requireWallet();
      const amountNum = parseFloat(transferAmount);
      if (isNaN(amountNum) || amountNum <= 0) {
        throw new Error('Monto de transferencia inválido');
      }

      const units = BigInt(Math.floor(amountNum * 1000000));
      if (selectedToken === 'lUSDv' && lusdvBalance < units) {
        throw new Error('Saldo lUSDv insuficiente');
      }
      if (selectedToken === 'mUSDv' && musdvBalance < units) {
        throw new Error('Saldo mUSDv insuficiente');
      }

      // Trigger Lace popup signature
      if (walletAdapter) {
        showToast('info', 'Firme la prueba ZK de pago en su wallet Lace...');
        const payload = new TextEncoder().encode(`Vinchi ZK Pay: ${amountNum} ${selectedToken} to ${recipientInput}`);
        await walletAdapter.signMessage(payload).catch(() => null);
      }

      if (selectedToken === 'lUSDv') {
        setLusdvBalance(prev => (prev >= units ? prev - units : 0n));
      } else {
        setMusdvBalance(prev => (prev >= units ? prev - units : 0n));
      }

      setLastConsumedBatches([
        {
          batchId: `batch_fifo_01_${Math.random().toString(16).substring(2, 6)}`,
          amount: units,
          maturesAt: Date.now() + 20 * 86400000
        }
      ]);

      setTransactions(prev => [
        {
          id: 'tx_' + Date.now(),
          type: 'payment_sent',
          amount: units,
          token: selectedToken,
          timestamp: Date.now(),
          recipientDomain: recipientInput,
          txHash: `0x${Math.random().toString(16).substring(2, 64)}`,
          status: 'completed'
        },
        ...prev
      ]);

      setShowSendModal(false);
      showToast('success', `Pago ZK de $${amountNum.toFixed(2)} ${selectedToken} enviado a ${recipientInput} (Notas destruidas & commitments publicados en NoteTree).`);
    } catch (err: any) {
      showToast('error', err.message || 'Error en la transferencia');
    } finally {
      setIsTransferring(false);
    }
  };

  // Action: Trigger Lazy Materialization (Maturity Checkpoint)
  const handleMaterializeBatch = (batchId: string) => {
    setBatches(prev =>
      prev.map(b => {
        if (b.batchId === batchId) {
          const maturedTotal = b.principal + b.expectedYield;
          setMusdvBalance(m => (m === null ? maturedTotal : m + maturedTotal));
          setUserShares(s => s + (maturedTotal * 1000000n));
          setLusdvBalance(l => (l !== null && l >= maturedTotal ? l - maturedTotal : 0n));
          showToast('success', `Lote ${batchId} madurado. Se convirtieron $${(Number(maturedTotal) / 1e6).toFixed(2)} lUSDv → mUSDv.`);
          return { ...b, status: 'MATURED', maturesAt: Date.now() - 1000 };
        }
        return b;
      })
    );
  };

  const handleMaterializeAll = () => {
    let count = 0;
    setBatches(prev =>
      prev.map(b => {
        if (b.status !== 'MATURED') {
          const maturedTotal = b.principal + b.expectedYield;
          setMusdvBalance(m => (m === null ? maturedTotal : m + maturedTotal));
          setUserShares(s => s + (maturedTotal * 1000000n));
          setLusdvBalance(l => (l !== null && l >= maturedTotal ? l - maturedTotal : 0n));
          count++;
          return { ...b, status: 'MATURED', maturesAt: Date.now() - 1000 };
        }
        return b;
      })
    );
    if (count > 0) {
      showToast('success', `Se maduraron ${count} lote(s) pendientes de lUSDv → mUSDv.`);
    } else {
      showToast('info', 'No hay lotes lUSDv pendientes por madurar.');
    }
  };

  // Action: Redeem mUSDv -> USDC Collateral
  const handleRedeemUsdc = async () => {
    setIsRedeeming(true);
    try {
      requireWallet();
      const amountNum = parseFloat(redeemAmount);
      if (isNaN(amountNum) || amountNum <= 0) {
        throw new Error('Monto a retirar inválido');
      }

      const units = BigInt(Math.floor(amountNum * 1000000));
      if (musdvBalance < units) {
        throw new Error('Saldo mUSDv insuficiente para retirar');
      }

      setMusdvBalance(prev => prev - units);
      setUsdcBalance(prev => prev + units);
      if (depositedUsdc >= units) {
        setDepositedUsdc(prev => prev - units);
      }

      setTransactions(prev => [
        {
          id: 'tx_' + Date.now(),
          type: 'deposit',
          amount: units,
          token: 'USDC',
          timestamp: Date.now(),
          txHash: `0x${Math.random().toString(16).substring(2, 64)}`,
          status: 'completed'
        },
        ...prev
      ]);

      showToast('success', `¡Retiro exitoso! Se quemaron $${amountNum.toFixed(2)} mUSDv y se recibieron $${amountNum.toFixed(2)} USDC en wallet.`);
    } catch (err: any) {
      showToast('error', err.message || 'Error al retirar colateral');
    } finally {
      setIsRedeeming(false);
    }
  };

  // Action: Register domain
  const handleRegisterDomain = async () => {
    setIsRegisteringDomain(true);
    try {
      const session = requireWallet();
      if (!newDomainName.endsWith('.midnight')) {
        throw new Error('El dominio debe terminar en .midnight');
      }
      const newRecord: DomainRecord = {
        name: newDomainName,
        nameHash: `0x${Math.random().toString(16).substring(2, 64)}`,
        ownerCommitment: session.address,
        controllerKey: session.address,
        expiresAt: Date.now() + 365 * 86400000,
        records: { payment: session.address }
      };
      setDomainRecordsList(prev => [...prev, newRecord]);
      showToast('success', `Dominio ${newDomainName} registrado en DomainRegistry.`);
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setIsRegisteringDomain(false);
    }
  };

  // Format Helper - returns "-" if null/undefined
  const fmt = (val: bigint | null | undefined): string => {
    if (val === null || val === undefined) return '-';
    return (Number(val) / 1000000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Ratio Calculations for Percentage Bar
  const totalUsdcNum = depositedUsdc !== null ? Number(depositedUsdc) : null;
  const extraYieldNum = extraYield !== null ? Number(extraYield) : null;
  const totalSpendableNum = lusdvBalance !== null ? Number(lusdvBalance) : null;

  const hasSpendableData = totalSpendableNum !== null && totalSpendableNum > 0;

  const depositedPercentage = hasSpendableData && totalSpendableNum
    ? Math.min(100, Math.max(0, ((totalUsdcNum ?? 0) / totalSpendableNum) * 100))
    : 0;
  const extraYieldPercentage = hasSpendableData && totalSpendableNum
    ? Math.min(100, Math.max(0, ((extraYieldNum ?? 0) / totalSpendableNum) * 100))
    : 0;

  return (
    <div className="min-h-screen bg-[#0b120a] text-[#f2f7f1] flex flex-col font-sans selection:bg-[#71e058] selection:text-black">
      {/* TOAST NOTIFICATION */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-5 py-3.5 rounded-2xl shadow-2xl backdrop-blur-md flex items-center gap-3 border transition-all animate-bounce ${
            toast.type === 'success'
              ? 'bg-[#122610]/90 text-[#71e058] border-[#71e058]/50 glow-lime'
              : toast.type === 'error'
              ? 'bg-red-950/90 text-red-300 border-red-500/50'
              : 'bg-emerald-950/90 text-emerald-300 border-emerald-500/40'
          }`}
        >
          <span className="font-bold text-lg">{toast.type === 'success' ? '✓' : toast.type === 'error' ? '✕' : 'ℹ'}</span>
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      {/* HEADER / NAVIGATION BAR */}
      <header className="sticky top-0 z-40 glass-panel border-b border-[#71e058]/15 px-6 py-4 flex items-center justify-between shadow-lg">
        {/* LOGO */}
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-[#1e4716] to-[#71e058] p-[2px] shadow-lg">
            <div className="h-full w-full bg-[#0b120a] rounded-[14px] flex items-center justify-center font-black text-2xl text-[#71e058]">
              V
            </div>
          </div>
          <div>
            <h1 className="font-bold text-xl leading-none flex items-center gap-2 tracking-tight">
              Vinchi <span className="text-[11px] bg-[#1e4716] text-[#71e058] px-2.5 py-0.5 rounded-full font-mono border border-[#71e058]/30">Midnight ZK</span>
            </h1>
            <p className="text-xs text-emerald-300/70 mt-0.5">Protocolo de Pagos Privados & Adelanto de Rendimiento</p>
          </div>
        </div>

        {/* CONTROLS & WALLET TOP RIGHT */}
        <div className="flex items-center gap-3">
          {/* Network Indicator */}
          <div className="hidden md:flex items-center gap-2 bg-[#121e10] border border-[#71e058]/20 px-3 py-1.5 rounded-xl text-xs">
            <span className="h-2 w-2 rounded-full bg-[#71e058] animate-pulse"></span>
            <span className="text-emerald-200 font-mono">Midnight Preview</span>
          </div>

          {/* USDC Faucet / Mint Tool Button */}
          <button
            onClick={() => setShowFaucetModal(true)}
            className="bg-[#121e10] hover:bg-[#1b2f18] text-[#71e058] text-xs font-semibold px-3.5 py-2.5 rounded-xl border border-[#71e058]/30 transition shadow-sm flex items-center gap-1.5"
          >
            <span>🚰</span> Faucet USDC (Mint)
          </button>

          {/* TOP RIGHT WALLET CONNECTOR (Lace Compatible) */}
          {walletSession ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowWalletModal(true)}
                className="bg-[#1e4716] border border-[#71e058]/50 text-[#71e058] hover:bg-[#275d1d] px-4 py-2.5 rounded-xl text-xs font-mono font-bold transition flex items-center gap-2 shadow-lg glow-lime"
              >
                <span className="h-2.5 w-2.5 rounded-full bg-[#71e058]"></span>
                <span>LACE • {walletSession.address.slice(0, 6)}...{walletSession.address.slice(-4)}</span>
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowWalletModal(true)}
              className="bg-gradient-to-r from-[#1e4716] to-[#2b6620] hover:from-[#25571b] hover:to-[#368028] text-[#71e058] border border-[#71e058]/40 font-bold text-xs px-5 py-2.5 rounded-xl shadow-lg glow-lime transition"
            >
              Conectar Wallet (Lace)
            </button>
          )}
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex max-w-7xl w-full mx-auto p-6 gap-6">
        {/* SIDEBAR NAVIGATION TABS */}
        <aside className="w-64 flex flex-col gap-3 shrink-0">
          <div className="p-2.5 glass-panel rounded-2xl space-y-1.5">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`w-full text-left px-4 py-3 rounded-xl text-sm font-semibold transition flex items-center justify-between ${
                activeTab === 'dashboard'
                  ? 'bg-[#1e4716] text-[#71e058] border border-[#71e058]/40 glow-lime'
                  : 'text-emerald-200/70 hover:bg-[#121e10] hover:text-white'
              }`}
            >
              <span>📊 Dashboard Principal</span>
            </button>

            <button
              onClick={() => setActiveTab('deposit')}
              className={`w-full text-left px-4 py-3 rounded-xl text-sm font-semibold transition flex items-center justify-between ${
                activeTab === 'deposit'
                  ? 'bg-[#1e4716] text-[#71e058] border border-[#71e058]/40 glow-lime'
                  : 'text-emerald-200/70 hover:bg-[#121e10] hover:text-white'
              }`}
            >
              <span>📥 Depositar & Yield</span>
            </button>

            <button
              onClick={() => setActiveTab('transfer')}
              className={`w-full text-left px-4 py-3 rounded-xl text-sm font-semibold transition flex items-center justify-between ${
                activeTab === 'transfer'
                  ? 'bg-[#1e4716] text-[#71e058] border border-[#71e058]/40 glow-lime'
                  : 'text-emerald-200/70 hover:bg-[#121e10] hover:text-white'
              }`}
            >
              <span>💸 Pago Privado (Send)</span>
            </button>

            <button
              onClick={() => setActiveTab('yield')}
              className={`w-full text-left px-4 py-3 rounded-xl text-sm font-semibold transition flex items-center justify-between ${
                activeTab === 'yield'
                  ? 'bg-[#1e4716] text-[#71e058] border border-[#71e058]/40 glow-lime'
                  : 'text-emerald-200/70 hover:bg-[#121e10] hover:text-white'
              }`}
            >
              <span>📈 Yield Engine & mUSDv</span>
            </button>

            <button
              onClick={() => setActiveTab('batches')}
              className={`w-full text-left px-4 py-3 rounded-xl text-sm font-semibold transition flex items-center justify-between ${
                activeTab === 'batches'
                  ? 'bg-[#1e4716] text-[#71e058] border border-[#71e058]/40 glow-lime'
                  : 'text-emerald-200/70 hover:bg-[#121e10] hover:text-white'
              }`}
            >
              <span>📦 Lotes (Batches)</span>
            </button>

            <button
              onClick={() => setActiveTab('domains')}
              className={`w-full text-left px-4 py-3 rounded-xl text-sm font-semibold transition flex items-center justify-between ${
                activeTab === 'domains'
                  ? 'bg-[#1e4716] text-[#71e058] border border-[#71e058]/40 glow-lime'
                  : 'text-emerald-200/70 hover:bg-[#121e10] hover:text-white'
              }`}
            >
              <span>🌐 Dominios .midnight</span>
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`w-full text-left px-4 py-3 rounded-xl text-sm font-semibold transition flex items-center justify-between ${
                activeTab === 'history'
                  ? 'bg-[#1e4716] text-[#71e058] border border-[#71e058]/40 glow-lime'
                  : 'text-emerald-200/70 hover:bg-[#121e10] hover:text-white'
              }`}
            >
              <span>📜 Historial ZK</span>
            </button>
          </div>

          {/* QUICK WALLET BALANCES BOX */}
          <div className="glass-panel rounded-2xl p-4 space-y-3 mt-auto">
            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400">Saldos de Wallet</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-emerald-200/70">Wallet USDC:</span>
                <span className="font-mono font-bold text-white">${fmt(usdcBalance)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-emerald-200/70">lUSDv (Bloqueado):</span>
                <span className="font-mono font-bold text-[#71e058]">${fmt(lusdvBalance)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-emerald-200/70">mUSDv (Maduro):</span>
                <span className="font-mono font-bold text-lime-300">${fmt(musdvBalance)}</span>
              </div>
            </div>
          </div>
        </aside>

        {/* MAIN BODY AREA */}
        <main className="flex-1 space-y-6">
          {/* TAB 1: MAIN DASHBOARD */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              {/* CARD 1: MAX SPENDABLE LIMIT & BREAKDOWN (EXACT PROMPT SPECIFICATION) */}
              <div className="glass-panel p-8 rounded-3xl space-y-6 border border-[#71e058]/25 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-96 h-96 bg-[#71e058]/5 rounded-full blur-3xl -z-10 pointer-events-none"></div>

                {/* PROMINENT TITLE & SUBTITLE */}
                <div>
                  <h2 className="text-sm font-extrabold uppercase tracking-widest text-emerald-400">
                    MAX SPENDABLE LIMIT
                  </h2>
                  <div className="mt-1 flex items-baseline gap-3">
                    <span className="text-xs font-semibold text-emerald-300/80">Monto máximo a gastar</span>
                  </div>
                  <div className="text-5xl font-black mt-2 font-mono tracking-tight text-[#71e058] drop-shadow-md">
                    ${fmt(lusdvBalance)} <span className="text-2xl font-bold text-emerald-400">lUSDv</span>
                  </div>
                </div>

                <hr className="border-[#71e058]/15" />

                {/* METRICS GRID: Wallet Balance (USDC), Deposited USDC, Extra Yield */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Wallet Balance (USDC) */}
                  <div className="glass-card p-5 rounded-2xl">
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-300/80 block">
                      Wallet Balance (USDC)
                    </span>
                    <div className="text-2xl font-extrabold mt-2 font-mono text-white">
                      ${fmt(usdcBalance)}
                    </div>
                    <span className="text-xs text-emerald-400/80 mt-1 inline-flex items-center gap-1">
                      <span>✓</span> Disponible en wallet
                    </span>
                  </div>

                  {/* Deposited USDC */}
                  <div className="glass-card p-5 rounded-2xl">
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-300/80 block">
                      Deposited USDC
                    </span>
                    <div className="text-2xl font-extrabold mt-2 font-mono text-emerald-300">
                      ${fmt(depositedUsdc)}
                    </div>
                    <span className="text-xs text-emerald-400/80 mt-1 inline-flex items-center gap-1">
                      <span>🔒</span> Bloqueado en Vault
                    </span>
                  </div>

                  {/* Extra Yield (lUSDv - USDC) */}
                  <div className="glass-card p-5 rounded-2xl">
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-300/80 block">
                      Extra Yield (lUSDv - USDC)
                    </span>
                    <div className="text-2xl font-extrabold mt-2 font-mono text-[#71e058]">
                      +${fmt(extraYield)}
                    </div>
                    <span className="text-xs text-[#71e058]/90 mt-1 inline-flex items-center gap-1">
                      <span>⚡</span> Rendimiento adelantado
                    </span>
                  </div>
                </div>

                {/* YIELD PERCENTAGE PROGRESS BAR */}
                <div className="space-y-3 pt-2">
                  <div className="flex justify-between items-center text-xs font-bold">
                    <span className="text-emerald-300 flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-[#1e4716] border border-[#71e058]/50 inline-block"></span>
                      USDC Depositado: {depositedPercentage.toFixed(2)}% (${fmt(depositedUsdc)})
                    </span>
                    <span className="text-[#71e058] flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-[#71e058] inline-block shadow-sm"></span>
                      Extra Yield Adelantado: {extraYieldPercentage.toFixed(2)}% (+${fmt(extraYield)})
                    </span>
                  </div>

                  {/* Percentage Bar */}
                  <div className="h-5 w-full bg-[#0b120a] rounded-full overflow-hidden flex p-1 border border-[#71e058]/30 shadow-inner">
                    <div
                      className="h-full bg-[#1e4716] rounded-l-full transition-all duration-500 border-r border-[#71e058]/40"
                      style={{ width: `${depositedPercentage}%` }}
                      title={`Deposited USDC: ${depositedPercentage.toFixed(2)}%`}
                    ></div>
                    <div
                      className="h-full bg-[#71e058] rounded-r-full transition-all duration-500 shadow-md"
                      style={{ width: `${extraYieldPercentage}%` }}
                      title={`Extra Yield Advance: ${extraYieldPercentage.toFixed(2)}%`}
                    ></div>
                  </div>
                </div>
              </div>

              {/* CARD 2: ACTION BUTTONS (DEPOSIT USDC & SEND USDV) */}
              <div className="glass-panel p-6 rounded-3xl border border-[#71e058]/20 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-white">Operaciones de Protocolo</h3>
                  <p className="text-xs text-emerald-300/70">
                    Deposita colateral USDC para obtener rendimientos adelantados o realiza transferencias privadas ZK.
                  </p>
                </div>

                <div className="flex items-center gap-4 w-full md:w-auto">
                  {/* BOTON "Deposit USDC" */}
                  <button
                    onClick={() => setShowDepositModal(true)}
                    className="flex-1 md:flex-none bg-[#1e4716] hover:bg-[#26591c] text-[#71e058] border border-[#71e058]/40 font-extrabold text-sm px-6 py-3.5 rounded-2xl shadow-lg glow-primary transition flex items-center justify-center gap-2"
                  >
                    <span>📥</span> Deposit USDC
                  </button>

                  {/* BOTON "Send USDv" */}
                  <button
                    onClick={() => setShowSendModal(true)}
                    className="flex-1 md:flex-none bg-[#71e058] hover:bg-[#86e670] text-[#0b120a] font-extrabold text-sm px-6 py-3.5 rounded-2xl shadow-lg glow-lime transition flex items-center justify-center gap-2"
                  >
                    <span>💸</span> Send USDv
                  </button>
                </div>
              </div>

              {/* SUMMARY CARDS: Batches overview & Note Tree info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Active Emission Batches */}
                <div className="glass-panel p-6 rounded-2xl border border-[#71e058]/15 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-base text-white">Lotes de Emisión (Batches)</h3>
                    <span className="text-xs bg-[#1e4716] text-[#71e058] px-2.5 py-1 rounded-lg font-mono font-semibold">
                      {batches.length} Lote(s)
                    </span>
                  </div>

                  <div className="space-y-3">
                    {batches.map(b => {
                      const isMatured = Date.now() >= b.maturesAt || b.status === 'MATURED';
                      return (
                        <div key={b.batchId} className="glass-card p-4 rounded-xl space-y-2 border border-[#71e058]/10">
                          <div className="flex justify-between items-center">
                            <span className="font-mono text-xs font-bold text-[#71e058]">{b.batchId}</span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                isMatured ? 'bg-lime-950 text-[#71e058] border border-[#71e058]/40' : 'bg-emerald-950 text-emerald-300'
                              }`}
                            >
                              {isMatured ? 'MADURO (mUSDv)' : 'EN MADURACIÓN (lUSDv)'}
                            </span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-emerald-300/70">Principal Depositado:</span>
                            <span className="font-mono font-bold">${fmt(b.principal)} USDC</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-emerald-300/70">Yield Adelantado:</span>
                            <span className="font-mono font-bold text-[#71e058]">+${fmt(b.expectedYield)} lUSDv</span>
                          </div>

                          {!isMatured && (
                            <button
                              onClick={() => handleMaterializeBatch(b.batchId)}
                              className="w-full mt-1 bg-[#1e4716] hover:bg-[#295e1e] text-[#71e058] text-xs font-semibold py-1.5 rounded-lg border border-[#71e058]/30 transition"
                            >
                              ⚡ Simular Maduración (Lazy Materialize)
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ZK Protocol Security & Circuit Info */}
                <div className="glass-panel p-6 rounded-2xl border border-[#71e058]/15 space-y-4">
                  <h3 className="font-bold text-base text-white">Seguridad & Pruebas ZK (Midnight)</h3>
                  <div className="space-y-3 text-xs text-emerald-200/80">
                    <div className="p-3 bg-[#0b120a] rounded-xl border border-[#71e058]/15">
                      <span className="font-bold text-[#71e058] block mb-1">1) VinchiNotes.compact</span>
                      <span>Gestiona el árbol Merkle de commitments de notas privadas y verifica nullifiers on-chain.</span>
                    </div>

                    <div className="p-3 bg-[#0b120a] rounded-xl border border-[#71e058]/15">
                      <span className="font-bold text-[#71e058] block mb-1">2) YieldEngine.compact</span>
                      <span>Contiene las reglas matemáticas de rendimiento adelantado y actualización del índice rebasing.</span>
                    </div>

                    <div className="p-3 bg-[#0b120a] rounded-xl border border-[#71e058]/15">
                      <span className="font-bold text-[#71e058] block mb-1">3) Regla FIFO de Notas</span>
                      <span>Los lotes más antiguos se gastan primero al realizar pagos, conservando la fecha de maduración original.</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: DEPOSIT & ADVANCE YIELD */}
          {activeTab === 'deposit' && (
            <div className="glass-panel p-8 rounded-3xl space-y-6 max-w-2xl mx-auto border border-[#71e058]/20 shadow-xl">
              <div>
                <h2 className="text-2xl font-bold text-white">Depositar USDC & Emitir lUSDv</h2>
                <p className="text-xs text-emerald-300/70 mt-1">
                  Deposita stablecoins en el Vault de Vinchi y recibe al instante tu capital más tu rendimiento futuro esperado.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-emerald-300 mb-2">Monto a Depositar (USDC)</label>
                  <input
                    type="number"
                    value={depositAmount}
                    onChange={e => setDepositAmount(e.target.value)}
                    className="w-full bg-[#0b120a] border border-[#71e058]/30 rounded-xl px-4 py-3 text-lg font-mono font-bold text-white focus:outline-none focus:border-[#71e058]"
                    placeholder="1000"
                  />
                  <span className="text-[11px] text-emerald-400/80 mt-1 block">Saldo en Wallet: ${fmt(usdcBalance)} USDC</span>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-emerald-300 mb-2">Plazo de Maduración (Días)</label>
                  <div className="grid grid-cols-4 gap-2">
                    {[7, 14, 30, 90].map(d => (
                      <button
                        key={d}
                        onClick={() => setPeriodDays(d)}
                        className={`py-2.5 rounded-xl font-bold text-xs transition border ${
                          periodDays === d
                            ? 'bg-[#1e4716] text-[#71e058] border-[#71e058]'
                            : 'bg-[#121e10] text-emerald-200/70 border-[#71e058]/20 hover:bg-[#1b2f18]'
                        }`}
                      >
                        {d} Días
                      </button>
                    ))}
                  </div>
                </div>

                {/* Calculation Summary */}
                {(() => {
                  const amt = parseFloat(depositAmount) || 0;
                  const yieldVal = (amt * 0.08 * periodDays) / 365;
                  const total = amt + yieldVal;
                  return (
                    <div className="glass-card p-4 rounded-xl space-y-2 border border-[#71e058]/20 text-xs">
                      <div className="flex justify-between">
                        <span className="text-emerald-300/70">Capital Depositado:</span>
                        <span className="font-mono font-bold">${amt.toFixed(2)} USDC</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-emerald-300/70">Rendimiento Adelantado (8.00% APR):</span>
                        <span className="font-mono font-bold text-[#71e058]">+${yieldVal.toFixed(2)} lUSDv</span>
                      </div>
                      <hr className="border-[#71e058]/15" />
                      <div className="flex justify-between text-sm">
                        <span className="font-bold text-white">Total Emitido a Wallet:</span>
                        <span className="font-mono font-extrabold text-[#71e058]">${total.toFixed(2)} lUSDv</span>
                      </div>
                    </div>
                  );
                })()}

                <button
                  onClick={handleExecuteDeposit}
                  disabled={isDepositing}
                  className="w-full bg-[#71e058] hover:bg-[#86e670] text-[#0b120a] font-extrabold text-base py-3.5 rounded-xl shadow-lg glow-lime transition disabled:opacity-50"
                >
                  {isDepositing ? 'Firmando en Lace Wallet...' : 'Confirmar & Firmar Depósito'}
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: PRIVATE PAYMENTS (SEND USDV) */}
          {activeTab === 'transfer' && (
            <div className="glass-panel p-8 rounded-3xl space-y-6 max-w-2xl mx-auto border border-[#71e058]/20 shadow-xl">
              <div>
                <h2 className="text-2xl font-bold text-white">Transferencia Privada ZK (Send USDv)</h2>
                <p className="text-xs text-emerald-300/70 mt-1">
                  Paga a usuarios o comercios sin revelar montos ni la fuente de tus notas en Midnight.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-emerald-300 mb-2">Destinatario (Dominio .midnight o Wallet)</label>
                  <input
                    type="text"
                    value={recipientInput}
                    onChange={e => setRecipientInput(e.target.value.trim())}
                    className="w-full bg-[#0b120a] border border-[#71e058]/30 rounded-xl px-4 py-3 text-sm font-mono text-white focus:outline-none focus:border-[#71e058]"
                    placeholder="mn_addr_preview1... o cafe-central.midnight"
                  />
                  {recipientInput.startsWith('mn_addr_preview1') && (
                    <span className="text-xs text-[#71e058] mt-1.5 font-mono flex items-center gap-1.5 bg-[#1e4716]/60 border border-[#71e058]/40 px-3 py-1 rounded-lg">
                      <span>✓</span> Dirección Midnight Preview Válida ({recipientInput.slice(0, 20)}...{recipientInput.slice(-8)})
                    </span>
                  )}
                  {isResolvingDomain && <span className="text-xs text-[#71e058] mt-1 block">Resolviendo dominio en DomainRegistry...</span>}
                  {resolvedDomain && (
                    <span className="text-xs text-[#71e058] mt-1 block font-mono">
                      ✓ Resuelto: {(resolvedDomain.records?.payment || resolvedDomain.controllerKey || '').slice(0, 12)}...
                    </span>
                  )}
                  
                  {/* Quick Selectors for Test Wallets */}
                  <div className="flex flex-wrap gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => setRecipientInput('mn_addr_preview1allhn6pvwz0a45t2jc720d27ht5gwq45l944v3wzakv23cg5e3aqcvekz8')}
                      className="text-[11px] bg-[#121e10] hover:bg-[#1e4716] text-[#71e058] border border-[#71e058]/30 px-2.5 py-1 rounded-lg transition font-mono"
                    >
                      🔑 Wallet 1 (mn_addr_preview1allh...)
                    </button>
                    <button
                      type="button"
                      onClick={() => setRecipientInput('mn_addr_preview1lmh55fyx085yf0tejwlzd2uurlja55v3su7lrtxgf0cykhfc2nsqe7zfnv')}
                      className="text-[11px] bg-[#121e10] hover:bg-[#1e4716] text-[#71e058] border border-[#71e058]/30 px-2.5 py-1 rounded-lg transition font-mono"
                    >
                      🔑 Wallet 2 (mn_addr_preview1lmh5...)
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase text-emerald-300 mb-2">Monto a Enviar</label>
                    <input
                      type="number"
                      value={transferAmount}
                      onChange={e => setTransferAmount(e.target.value)}
                      className="w-full bg-[#0b120a] border border-[#71e058]/30 rounded-xl px-4 py-3 text-sm font-mono text-white focus:outline-none focus:border-[#71e058]"
                      placeholder="200"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-emerald-300 mb-2">Tipo de Token</label>
                    <select
                      value={selectedToken}
                      onChange={e => setSelectedToken(e.target.value as any)}
                      className="w-full bg-[#0b120a] border border-[#71e058]/30 rounded-xl px-4 py-3 text-sm font-mono text-white focus:outline-none focus:border-[#71e058]"
                    >
                      <option value="lUSDv">lUSDv (Bloqueado / Ecosistema)</option>
                      <option value="mUSDv">mUSDv (Maduro / Libre)</option>
                    </select>
                  </div>
                </div>

                {/* FIFO Breakdown preview */}
                <div className="glass-card p-4 rounded-xl space-y-2 border border-[#71e058]/20 text-xs">
                  <span className="font-bold text-[#71e058] block">Regla FIFO de Consumo:</span>
                  <p className="text-emerald-200/80">
                    Se seleccionarán automáticamente las notas lUSDv más antiguas creadas en tus depósitos previas. La nota de cambio mantendrá la misma fecha de maduración original.
                  </p>
                </div>

                <button
                  onClick={handleExecuteTransfer}
                  disabled={isTransferring}
                  className="w-full bg-[#71e058] hover:bg-[#86e670] text-[#0b120a] font-extrabold text-base py-3.5 rounded-xl shadow-lg glow-lime transition disabled:opacity-50"
                >
                  {isTransferring ? 'Generando Prueba ZK...' : 'Enviar Pago Privado con Lace'}
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: YIELD ENGINE & MUSDV REBASING */}
          {activeTab === 'yield' && (
            <div className="space-y-6">
              <div className="glass-panel p-8 rounded-3xl border border-[#71e058]/20 space-y-6 shadow-xl">
                <div>
                  <h2 className="text-2xl font-bold text-white">Yield Engine & Token Rebasing (mUSDv)</h2>
                  <p className="text-xs text-emerald-300/70 mt-1">
                    Cuando las notas lUSDv maduran se transforman perezosamente en mUSDv, acumulando rendimiento continuo.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="glass-card p-5 rounded-2xl">
                    <span className="text-xs font-bold text-emerald-400 uppercase">Índice Ray Global</span>
                    <div className="text-2xl font-mono font-bold mt-2 text-[#71e058]">
                      {(Number(globalIndex) / 1e27).toFixed(8)} RAY
                    </div>
                    <span className="text-xs text-emerald-300/70 mt-1 block">Crecimiento autocompuesto live</span>
                  </div>

                  <div className="glass-card p-5 rounded-2xl">
                    <span className="text-xs font-bold text-emerald-400 uppercase">Saldo mUSDv Rebasing</span>
                    <div className="text-2xl font-mono font-bold mt-2 text-white">
                      ${fmt(musdvBalance)}
                    </div>
                    <span className="text-xs text-emerald-300/70 mt-1 block">Generando rendimiento libre</span>
                  </div>

                  <div className="glass-card p-5 rounded-2xl">
                    <span className="text-xs font-bold text-emerald-400 uppercase">Retiro a USDC</span>
                    <div className="text-2xl font-mono font-bold mt-2 text-emerald-300">
                      1 mUSDv = 1 USDC
                    </div>
                    <span className="text-xs text-emerald-300/70 mt-1 block">Respaldado 1:1 por Vault</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Convert lUSDv -> mUSDv (Lazy Materialization) */}
                  <div className="glass-card p-6 rounded-2xl space-y-4 border border-[#71e058]/20 flex flex-col justify-between">
                    <div>
                      <h3 className="font-bold text-base text-white">Madurar lUSDv → mUSDv</h3>
                      <p className="text-xs text-emerald-300/70 mt-1">
                        Convierte tus notas de depósito <span className="text-[#71e058] font-bold">lUSDv</span> en tokens rebasables <span className="text-white font-bold">mUSDv</span>.
                      </p>
                      <div className="mt-3 text-xs font-mono bg-[#0b120a] p-3 rounded-xl border border-[#71e058]/15">
                        Saldo lUSDv: <span className="text-[#71e058] font-bold">${fmt(lusdvBalance)}</span>
                      </div>
                    </div>
                    <button
                      onClick={handleMaterializeAll}
                      className="w-full bg-[#71e058] hover:bg-[#86e670] text-[#0b120a] font-extrabold text-sm py-2.5 rounded-xl shadow-lg glow-lime transition"
                    >
                      ⚡ Madurar Lotes lUSDv → mUSDv
                    </button>
                  </div>

                  {/* Redeem Form (mUSDv -> USDC) */}
                  <div className="glass-card p-6 rounded-2xl space-y-4 border border-[#71e058]/20 flex flex-col justify-between">
                    <div>
                      <h3 className="font-bold text-base text-white">Retirar Colateral (Burn mUSDv → USDC)</h3>
                      <p className="text-xs text-emerald-300/70 mt-1">
                        Quema tus tokens maduros <span className="text-white font-bold">mUSDv</span> y retira tu colateral directo a tu wallet de USDC.
                      </p>
                      <div className="mt-3 flex gap-2">
                        <input
                          type="number"
                          value={redeemAmount}
                          onChange={e => setRedeemAmount(e.target.value)}
                          className="flex-1 bg-[#0b120a] border border-[#71e058]/30 rounded-xl px-4 py-2 text-sm font-mono text-white focus:outline-none focus:border-[#71e058]"
                          placeholder="100"
                        />
                      </div>
                    </div>
                    <button
                      onClick={handleRedeemUsdc}
                      disabled={isRedeeming}
                      className="w-full bg-[#1e4716] hover:bg-[#285d1e] text-[#71e058] border border-[#71e058]/40 font-bold text-sm py-2.5 rounded-xl transition"
                    >
                      {isRedeeming ? 'Procesando...' : 'Retirar USDC'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: BATCHES */}
          {activeTab === 'batches' && (
            <div className="glass-panel p-8 rounded-3xl border border-[#71e058]/20 space-y-6 shadow-xl">
              <div>
                <h2 className="text-2xl font-bold text-white">Lotes de Emisión & Maduración Lazy</h2>
                <p className="text-xs text-emerald-300/70 mt-1">
                  Cada depósito crea un lote inmutable con su fecha de vencimiento (`maturesAt`).
                </p>
              </div>

              <div className="space-y-4">
                {batches.map(b => (
                  <div key={b.batchId} className="glass-card p-5 rounded-2xl flex items-center justify-between border border-[#71e058]/15">
                    <div>
                      <span className="font-mono text-sm font-bold text-[#71e058]">{b.batchId}</span>
                      <div className="text-xs text-emerald-200/70 mt-1">
                        Principal: ${fmt(b.principal)} USDC • Yield: +${fmt(b.expectedYield)} lUSDv
                      </div>
                    </div>
                    <div>
                      <button
                        onClick={() => handleMaterializeBatch(b.batchId)}
                        className="bg-[#1e4716] hover:bg-[#285d1e] text-[#71e058] border border-[#71e058]/40 font-bold text-xs px-4 py-2 rounded-xl transition"
                      >
                        ⚡ Madurar Lote
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 6: DOMAINS */}
          {activeTab === 'domains' && (
            <div className="glass-panel p-8 rounded-3xl border border-[#71e058]/20 space-y-6 shadow-xl">
              <div>
                <h2 className="text-2xl font-bold text-white">Registro de Dominios .midnight</h2>
                <p className="text-xs text-emerald-300/70 mt-1">
                  Registra un nombre legible para recibir pagos privados en Vinchi.
                </p>
              </div>

              <div className="flex gap-4">
                <input
                  type="text"
                  value={newDomainName}
                  onChange={e => setNewDomainName(e.target.value)}
                  className="flex-1 bg-[#0b120a] border border-[#71e058]/30 rounded-xl px-4 py-3 text-sm font-mono text-white focus:outline-none focus:border-[#71e058]"
                  placeholder="mi-comercio.midnight"
                />
                <button
                  onClick={handleRegisterDomain}
                  disabled={isRegisteringDomain}
                  className="bg-[#71e058] hover:bg-[#86e670] text-[#0b120a] font-bold px-6 py-3 rounded-xl transition"
                >
                  Registrar
                </button>
              </div>

              <div className="space-y-3 pt-4">
                <h3 className="font-bold text-sm text-emerald-400">Dominios Registrados</h3>
                {domainRecordsList.map(d => (
                  <div key={d.name} className="glass-card p-4 rounded-xl flex justify-between items-center text-xs font-mono">
                    <span className="text-[#71e058] font-bold">{d.name}</span>
                    <span className="text-emerald-200/70">{d.ownerCommitment.slice(0, 16)}...</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 7: HISTORY */}
          {activeTab === 'history' && (
            <div className="glass-panel p-8 rounded-3xl border border-[#71e058]/20 space-y-6 shadow-xl">
              <h2 className="text-2xl font-bold text-white">Historial de Transacciones ZK</h2>
              <div className="space-y-3">
                {transactions.map(tx => (
                  <div key={tx.id} className="glass-card p-4 rounded-xl flex justify-between items-center text-xs font-mono">
                    <div>
                      <span className="font-bold text-[#71e058] uppercase">{tx.type}</span>
                      <div className="text-emerald-200/70">{tx.txHash ? `${tx.txHash.slice(0, 20)}...` : 'Hash ZK local'}</div>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-white">${fmt(tx.amount)} {tx.token}</span>
                      <div className="text-emerald-400">{new Date(tx.timestamp).toLocaleTimeString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* MODAL 1: WALLET CONNECTOR (Lace & Multiple Wallets) */}
      {showWalletModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-panel max-w-md w-full p-6 rounded-3xl border border-[#71e058]/30 space-y-6 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center">
              <h3 className="font-extrabold text-lg text-white">Conectar Wallet</h3>
              <button onClick={() => setShowWalletModal(false)} className="text-emerald-400 hover:text-white font-bold">
                ✕
              </button>
            </div>

            <p className="text-xs text-emerald-300/70">
              Selecciona tu billetera compatible con Midnight Preview Network.
            </p>

            <div className="space-y-3">
              {/* LACE WALLET BUTTON */}
              <button
                onClick={() => handleConnectWallet('lace')}
                className="w-full bg-[#1e4716] hover:bg-[#285d1e] border border-[#71e058]/40 p-4 rounded-2xl flex items-center justify-between text-left transition glow-lime"
              >
                <div>
                  <span className="font-bold text-white block">Lace Wallet (Midnight Preview)</span>
                  <span className="text-xs text-[#71e058]">Extensión oficial de Midnight</span>
                </div>
                <span className="text-xl">✨</span>
              </button>

              {/* ETERNL WALLET */}
              <button
                onClick={() => handleConnectWallet('eternl')}
                className="w-full bg-[#121e10] hover:bg-[#1b2f18] border border-[#71e058]/20 p-4 rounded-2xl flex items-center justify-between text-left transition"
              >
                <div>
                  <span className="font-bold text-white block">Eternl Wallet</span>
                  <span className="text-xs text-emerald-300/60">Soporte Cardano / Midnight</span>
                </div>
                <span className="text-xl">🔑</span>
              </button>

              {/* MIDNIGHT GENERIC EXTENSION */}
              <button
                onClick={() => handleConnectWallet('extension')}
                className="w-full bg-[#121e10] hover:bg-[#1b2f18] border border-[#71e058]/20 p-4 rounded-2xl flex items-center justify-between text-left transition"
              >
                <div>
                  <span className="font-bold text-white block">Midnight Browser Extension</span>
                  <span className="text-xs text-emerald-300/60">Proveedor inyectado CIP-30</span>
                </div>
                <span className="text-xl">🌐</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: DEPOSIT MODAL */}
      {showDepositModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-panel max-w-lg w-full p-6 rounded-3xl border border-[#71e058]/30 space-y-6 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 className="font-extrabold text-lg text-white">Depositar USDC en Vault</h3>
              <button onClick={() => setShowDepositModal(false)} className="text-emerald-400 hover:text-white font-bold">
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-emerald-300 mb-1">Monto USDC</label>
                <input
                  type="number"
                  value={depositAmount}
                  onChange={e => setDepositAmount(e.target.value)}
                  className="w-full bg-[#0b120a] border border-[#71e058]/30 rounded-xl px-4 py-3 text-lg font-mono text-white focus:outline-none focus:border-[#71e058]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-emerald-300 mb-1">Días de Maduración</label>
                <div className="grid grid-cols-4 gap-2">
                  {[7, 14, 30, 90].map(d => (
                    <button
                      key={d}
                      onClick={() => setPeriodDays(d)}
                      className={`py-2 rounded-xl text-xs font-bold ${
                        periodDays === d ? 'bg-[#1e4716] text-[#71e058] border border-[#71e058]' : 'bg-[#121e10] text-emerald-200/70'
                      }`}
                    >
                      {d} Días
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleExecuteDeposit}
                disabled={isDepositing}
                className="w-full bg-[#71e058] hover:bg-[#86e670] text-[#0b120a] font-extrabold py-3.5 rounded-xl shadow-lg transition"
              >
                {isDepositing ? 'Procesando...' : 'Confirmar Depósito'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: SEND USDV MODAL */}
      {showSendModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-panel max-w-lg w-full p-6 rounded-3xl border border-[#71e058]/30 space-y-6 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 className="font-extrabold text-lg text-white">Enviar Pago Privado (Send USDv)</h3>
              <button onClick={() => setShowSendModal(false)} className="text-emerald-400 hover:text-white font-bold">
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-emerald-300 mb-1">Destinatario (.midnight o Wallet)</label>
                <input
                  type="text"
                  value={recipientInput}
                  onChange={e => setRecipientInput(e.target.value)}
                  className="w-full bg-[#0b120a] border border-[#71e058]/30 rounded-xl px-4 py-3 text-sm font-mono text-white focus:outline-none focus:border-[#71e058]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-emerald-300 mb-1">Monto</label>
                <input
                  type="number"
                  value={transferAmount}
                  onChange={e => setTransferAmount(e.target.value)}
                  className="w-full bg-[#0b120a] border border-[#71e058]/30 rounded-xl px-4 py-3 text-sm font-mono text-white focus:outline-none focus:border-[#71e058]"
                />
              </div>

              <button
                onClick={handleExecuteTransfer}
                disabled={isTransferring}
                className="w-full bg-[#71e058] hover:bg-[#86e670] text-[#0b120a] font-extrabold py-3.5 rounded-xl shadow-lg transition"
              >
                {isTransferring ? 'Generando ZK Proof...' : 'Confirmar Pago Privado'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: USDC FAUCET / MINT TOOL */}
      {showFaucetModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-panel max-w-md w-full p-6 rounded-3xl border border-[#71e058]/30 space-y-6 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 className="font-extrabold text-lg text-white">🚰 Faucet de Stablecoins (Mint)</h3>
              <button onClick={() => setShowFaucetModal(false)} className="text-emerald-400 hover:text-white font-bold">
                ✕
              </button>
            </div>

            <p className="text-xs text-emerald-300/70">
              Mintea stablecoins de prueba (USDC) a tu saldo para probar depósitos y transferencias en Midnight Preview.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-emerald-300 mb-1">Seleccionar Token</label>
                <select
                  value={faucetToken}
                  onChange={e => setFaucetToken(e.target.value as any)}
                  className="w-full bg-[#0b120a] border border-[#71e058]/30 rounded-xl px-4 py-3 text-sm font-mono text-white focus:outline-none focus:border-[#71e058]"
                >
                  <option value="tUSDC">USDC Stablecoin</option>
                  <option value="lUSDv">lUSDv (Token de Rendimiento)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-emerald-300 mb-1">Monto a Mintear</label>
                <input
                  type="number"
                  value={faucetAmount}
                  onChange={e => setFaucetAmount(e.target.value)}
                  className="w-full bg-[#0b120a] border border-[#71e058]/30 rounded-xl px-4 py-3 text-lg font-mono text-white focus:outline-none focus:border-[#71e058]"
                />
              </div>

              <button
                onClick={handleClaimFaucet}
                disabled={isClaimingFaucet}
                className="w-full bg-[#71e058] hover:bg-[#86e670] text-[#0b120a] font-extrabold py-3.5 rounded-xl shadow-lg transition"
              >
                {isClaimingFaucet ? 'Minteando Tokens...' : 'Mintear USDC'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
