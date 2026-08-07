'use client';

import React, { useState, useEffect } from 'react';
import { VinchiSDK, isLaceAvailable, connectLaceWallet, LaceConnectionState } from '@vinchi/sdk';
import { VinchiWallet } from '@vinchi/wallet-core';
import {
  Merchant,
  WalletNote,
  ProtocolStats,
  formatTokenBalance,
  ConnectionHealth,
  FaucetClaimResult,
  FaucetTokenType,
  MidnightNetworkConfig
} from '@vinchi/shared';

export default function Home() {
  const [sdk] = useState(() => new VinchiSDK());
  const [wallet, setWallet] = useState<VinchiWallet | null>(null);
  
  // Seed & Keys state (dynamic, not hardcoded)
  const [seed, setSeed] = useState<string>(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('vinchi_seed')) {
      return localStorage.getItem('vinchi_seed')!;
    }
    return 'seed_vinchi_' + Math.random().toString(36).substring(2, 12);
  });
  const [publicKey, setPublicKey] = useState<string>('0x01827abc456def7890123456789abcdef0123456789abcdef0123456789abcd');

  // Wallet and Protocol State
  const [balance, setBalance] = useState<bigint>(BigInt(0));
  const [unspentNotes, setUnspentNotes] = useState<WalletNote[]>([]);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [stats, setStats] = useState<ProtocolStats | null>(null);

  // Connection & Health Diagnostics State
  const [networkConfig, setNetworkConfig] = useState<MidnightNetworkConfig>(sdk.getConfig());
  const [healthStatus, setHealthStatus] = useState<ConnectionHealth | null>(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);

  // Lace Wallet DApp Connector State
  const [laceState, setLaceState] = useState<LaceConnectionState>({
    isAvailable: false,
    isConnected: false,
    networkId: 'preview',
    unshieldedAddress: null,
    unshieldedBalance: null,
    api: null,
    error: null,
    detectedProviders: []
  });

  // Active UI Navigation Tab
  const [activeTab, setActiveTab] = useState<'wallet' | 'faucet' | 'connections' | 'compact' | 'lace' | 'pay' | 'audit' | 'recovery'>('wallet');

  // Form states
  const [depositAmount, setDepositAmount] = useState<string>('500');
  const [selectedMerchant, setSelectedMerchant] = useState<string>('');
  const [payAmount, setPayAmount] = useState<string>('120');

  // Faucet Form State
  const [faucetToken, setFaucetToken] = useState<FaucetTokenType>('tUSDC');
  const [faucetAmount, setFaucetAmount] = useState<string>('1000');
  const [faucetRecipient, setFaucetRecipient] = useState<string>('');
  const [faucetResult, setFaucetResult] = useState<FaucetClaimResult | null>(null);
  const [isFaucetClaiming, setIsFaucetClaiming] = useState(false);

  // Toast / Status Message
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);

  // Check Lace availability & connection health on client mount
  useEffect(() => {
    setLaceState(prev => ({ ...prev, isAvailable: isLaceAvailable() }));
    runHealthDiagnostics();
  }, []);

  // Initialize / Re-initialize Wallet when seed changes
  useEffect(() => {
    async function init() {
      if (typeof window !== 'undefined') {
        localStorage.setItem('vinchi_seed', seed);
      }
      const derivedKey = '0x' + Array.from(seed).reduce((acc, char) => acc + char.charCodeAt(0).toString(16), '').padEnd(64, '0').slice(0, 64);
      setPublicKey(derivedKey);

      const w = await VinchiWallet.create(seed, derivedKey);
      setWallet(w);
      setMerchants(sdk.getMerchants());
      if (sdk.getMerchants().length > 0) {
        setSelectedMerchant(sdk.getMerchants()[0].publicKey);
      }
      refreshState(w);
    }
    init();
  }, [seed]);

  // Update default Faucet recipient when Lace address is connected
  useEffect(() => {
    if (laceState.unshieldedAddress) {
      setFaucetRecipient(laceState.unshieldedAddress);
    } else if (wallet) {
      setFaucetRecipient(wallet.publicKey);
    }
  }, [laceState.unshieldedAddress, wallet]);

  const refreshState = async (currentWallet: VinchiWallet) => {
    setBalance(currentWallet.getBalance());
    setUnspentNotes(currentWallet.getUnspentNotes());
    const s = await sdk.getStats();
    setStats(s);
  };

  const runHealthDiagnostics = async () => {
    setIsCheckingHealth(true);
    const health = await sdk.checkConnectionHealth();
    setHealthStatus(health);
    setIsCheckingHealth(false);
  };

  const handleUpdateConfig = (field: keyof MidnightNetworkConfig, value: string) => {
    const updated = { ...networkConfig, [field]: value };
    setNetworkConfig(updated);
    sdk.updateConfig({ [field]: value });
  };

  const handleGenerateNewSeed = () => {
    const newSeed = 'seed_vinchi_' + Math.random().toString(36).substring(2, 12) + '_' + Date.now().toString(36);
    setSeed(newSeed);
    setStatusMsg({
      type: 'info',
      text: 'Nueva frase semilla generada y guardada localmente.'
    });
  };

  const handleConnectLace = async () => {
    setIsProcessing(true);
    setStatusMsg({ type: 'info', text: 'Solicitando conexión a la extensión Lace Wallet en la red Midnight...' });

    const res = await connectLaceWallet(networkConfig.networkId || 'preview');
    setLaceState(res);
    setIsProcessing(false);

    if (res.isConnected) {
      const formattedBal = res.unshieldedBalance !== null ? `${formatTokenBalance(res.unshieldedBalance, 6)} tNIGHT` : 'Saldo consultado';
      setStatusMsg({
        type: 'success',
        text: `¡Lace Wallet conectada en red ${res.networkId}! Dirección: ${res.unshieldedAddress} | Saldo: ${formattedBal}`
      });
      if (res.unshieldedAddress) {
        setFaucetRecipient(res.unshieldedAddress);
      }
    } else {
      setStatusMsg({
        type: 'error',
        text: res.error || 'No se pudo conectar a Lace Wallet.'
      });
    }
  };

  const handleFaucetClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wallet) return;
    const amountNum = BigInt(faucetAmount || '0');
    if (amountNum <= BigInt(0)) {
      setStatusMsg({ type: 'error', text: 'El monto a reclamar debe ser mayor a 0.' });
      return;
    }

    setIsFaucetClaiming(true);
    setFaucetResult(null);
    setStatusMsg({ type: 'info', text: `Verificando disponibilidad de Faucet de ${faucetToken} en red Midnight...` });

    try {
      let result: FaucetClaimResult;
      if (faucetToken === 'tNIGHT') {
        result = await sdk.claimTNightFaucet(faucetRecipient || laceState.unshieldedAddress || wallet.publicKey, amountNum);
      } else {
        result = await sdk.claimTUsdcFaucet(wallet, amountNum);
        await refreshState(wallet);
      }

      setFaucetResult(result);
      if (result.success) {
        setStatusMsg({
          type: 'success',
          text: `¡Reclamo exitoso! Se obtuvieron ${result.amount.toString()} ${result.token}. ${result.txHash ? `Tx: ${result.txHash}` : ''}`
        });
      } else {
        setStatusMsg({
          type: 'error',
          text: result.error || 'El Faucet no pudo ser completado directamente.'
        });
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Error en el reclamo de Faucet' });
    } finally {
      setIsFaucetClaiming(false);
    }
  };

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wallet) return;
    const amountNum = BigInt(depositAmount || '0');
    if (amountNum <= BigInt(0)) {
      setStatusMsg({ type: 'error', text: 'El monto de depósito debe ser mayor a 0.' });
      return;
    }

    setIsProcessing(true);
    setStatusMsg({ type: 'info', text: 'Generando compromiso criptográfico de Nota ZK...' });

    try {
      const result = await sdk.deposit(wallet, amountNum);
      await refreshState(wallet);
      setLastTxHash(result.txHash);
      setStatusMsg({
        type: 'success',
        text: `Depósito exitoso de ${amountNum} USDC. Nota creada (Commitment: ${result.commitment.slice(0, 14)}...)`
      });
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Error en el depósito' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wallet) return;
    const amountNum = BigInt(payAmount || '0');

    if (amountNum <= BigInt(0)) {
      setStatusMsg({ type: 'error', text: 'El monto a pagar debe ser mayor a 0.' });
      return;
    }

    if (amountNum > balance) {
      setStatusMsg({ type: 'error', text: 'Saldo insuficiente en billetera para este pago.' });
      return;
    }

    setIsProcessing(true);
    setStatusMsg({ type: 'info', text: 'Generando prueba ZK y nullifiers (Prevención de Doble Gasto)...' });

    try {
      const result = await sdk.pay(wallet, selectedMerchant, amountNum);
      await refreshState(wallet);
      setLastTxHash(result.txHash);
      setStatusMsg({
        type: 'success',
        text: `¡Pago ZK exitoso! Se enviaron ${amountNum} lUSDv al comercio. Vuelto recibido: ${result.changeAmount} lUSDv.`
      });
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Error en el pago' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRecovery = async () => {
    if (!wallet) return;
    setIsProcessing(true);
    setStatusMsg({ type: 'info', text: 'Escaneando árbol de Merkle con nonces deterministas de la seed...' });

    try {
      const recoveredCount = await wallet.scanAndRecoverNotes(new Set(), 20);
      await refreshState(wallet);
      setStatusMsg({
        type: 'success',
        text: `Escaneo completado. Billetera sincronizada correctamente.`
      });
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: 'Error en la recuperación de notas.' });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 p-4 md:p-8 font-sans">
      {/* Header Bar */}
      <header className="max-w-6xl mx-auto mb-8 pb-6 border-b border-zinc-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center font-bold text-xl text-white shadow-lg glow-purple">
              V
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                Vinchi <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-950 text-purple-300 border border-purple-800/50 font-normal">Midnight ZK</span>
              </h1>
              <p className="text-xs text-zinc-400">Protocolo de Pagos Privados y Faucet Multitoken (Nativo UTXO/Notas)</p>
            </div>
          </div>
        </div>

        {/* Header Actions: Lace Connector Button & Stats */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Quick Health Diagnostics Button */}
          <button
            onClick={() => setActiveTab('connections')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-2 border transition-all ${
              healthStatus?.allHealthy
                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
                : 'bg-amber-950/60 text-amber-300 border-amber-800'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${healthStatus?.allHealthy ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <span>{isCheckingHealth ? 'Comprobando...' : (healthStatus?.allHealthy ? 'Conexiones OK' : 'Diagnóstico Red')}</span>
          </button>

          {/* Lace Button */}
          <button
            onClick={handleConnectLace}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 border transition-all ${
              laceState.isConnected
                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                : 'bg-gradient-to-r from-purple-900 to-indigo-900 text-purple-200 border-purple-700 hover:border-purple-500 shadow-md'
            }`}
          >
            <span>✨</span>
            <span>
              {laceState.isConnected
                ? `Lace (${laceState.unshieldedAddress?.slice(0, 8)}...${laceState.unshieldedBalance !== null ? ` | ${formatTokenBalance(laceState.unshieldedBalance, 6)} tNIGHT` : ''})`
                : 'Conectar Lace Wallet'}
            </span>
          </button>

          {/* Global Protocol Stats Badge */}
          {stats && (
            <div className="flex items-center gap-3 bg-zinc-900/80 px-3.5 py-2 rounded-xl border border-zinc-800 text-xs">
              <div>
                <span className="text-zinc-500 block">Colateral</span>
                <span className="font-semibold text-emerald-400">{formatTokenBalance(stats.totalCollateralUsdc, 0)} USDC</span>
              </div>
              <div className="w-px h-6 bg-zinc-800" />
              <div>
                <span className="text-zinc-500 block">Emitido</span>
                <span className="font-semibold text-purple-400">{formatTokenBalance(stats.totalIssuedLusd, 0)} lUSDv</span>
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto space-y-6">
        {/* Status Toast Alert */}
        {statusMsg && (
          <div
            className={`p-4 rounded-xl text-sm flex justify-between items-center transition-all ${
              statusMsg.type === 'success'
                ? 'bg-emerald-950/60 border border-emerald-800/60 text-emerald-200'
                : statusMsg.type === 'error'
                ? 'bg-rose-950/60 border border-rose-800/60 text-rose-200'
                : 'bg-indigo-950/60 border border-indigo-800/60 text-indigo-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="font-semibold">
                {statusMsg.type === 'success' ? '✓' : statusMsg.type === 'error' ? '✕' : 'ℹ'}
              </span>
              <span>{statusMsg.text}</span>
            </div>
            <button onClick={() => setStatusMsg(null)} className="text-xs opacity-70 hover:opacity-100">
              Cerrar
            </button>
          </div>
        )}

        {/* Top Balance Summary Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Card 1: Local ZK Note Balance */}
          <div className="glass-panel p-6 rounded-2xl glow-purple relative overflow-hidden flex flex-col justify-between">
            <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-purple-600/10 rounded-full blur-3xl" />
            <div className="relative z-10 space-y-3">
              <span className="text-xs uppercase tracking-wider text-purple-400 font-semibold flex items-center gap-1.5">
                <span>🔒</span> Balance Privado ZK (Vinchi Notes)
              </span>
              <div className="text-4xl font-extrabold tracking-tight text-white">
                {formatTokenBalance(balance, 0)} <span className="text-2xl font-normal text-purple-300">lUSDv</span>
              </div>
              <p className="text-xs text-zinc-400">
                Suma calculada en cliente de tus billetes ZK en memoria sin exponer montos on-chain.
              </p>
            </div>
            <div className="flex gap-2 mt-4 relative z-10">
              <button
                onClick={() => setActiveTab('wallet')}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 font-medium text-xs text-white transition-all shadow-md"
              >
                + Depositar USDC
              </button>
              <button
                onClick={() => setActiveTab('faucet')}
                className="px-4 py-2 rounded-xl bg-indigo-900 hover:bg-indigo-800 font-medium text-xs text-indigo-200 border border-indigo-700 transition-all"
              >
                🚰 Faucet Tokens
              </button>
            </div>
          </div>

          {/* Card 2: Connected Lace Wallet Balance (tNIGHT) */}
          <div className="glass-panel p-6 rounded-2xl border border-zinc-800 relative overflow-hidden flex flex-col justify-between">
            <div className="relative z-10 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs uppercase tracking-wider text-emerald-400 font-semibold flex items-center gap-1.5">
                  <span>🦊</span> Lace Wallet (Midnight {laceState.networkId || 'Preview'})
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${laceState.isConnected ? 'bg-emerald-950 text-emerald-300 border-emerald-800' : 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>
                  {laceState.isConnected ? 'Conectado' : 'Desconectado'}
                </span>
              </div>
              <div className="text-4xl font-extrabold tracking-tight text-white">
                {laceState.isConnected
                  ? (laceState.unshieldedBalance !== null ? formatTokenBalance(laceState.unshieldedBalance, 6) : '0')
                  : '—'} <span className="text-2xl font-normal text-emerald-300">tNIGHT</span>
              </div>
              <p className="text-xs text-zinc-400">
                {laceState.isConnected
                  ? `Dirección: ${laceState.unshieldedAddress?.slice(0, 16)}... ${laceState.unshieldedBalance !== null ? `(${laceState.unshieldedBalance.toString()} unidades atómicas)` : ''}`
                  : 'Conecta tu extensión Lace Wallet para vincular tu saldo de la testnet.'}
              </p>
            </div>
            <div className="flex gap-2 mt-4 relative z-10">
              <button
                onClick={handleConnectLace}
                disabled={isProcessing}
                className="px-4 py-2 rounded-xl bg-emerald-900/80 hover:bg-emerald-800 text-emerald-200 font-medium text-xs border border-emerald-700 transition-all"
              >
                {laceState.isConnected ? '🔄 Sincronizar Lace' : '✨ Conectar Lace Wallet'}
              </button>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-zinc-800 gap-2 overflow-x-auto">
          {[
            { id: 'wallet', label: '💳 Mi Billetera & Billetes' },
            { id: 'faucet', label: '🚰 Faucet de Tokens' },
            { id: 'connections', label: '🔌 Conexiones & Red' },
            { id: 'compact', label: '📜 Contratos Compact' },
            { id: 'lace', label: '🦊 Conector Lace' },
            { id: 'pay', label: '🛍️ Terminal de Pago ZK' },
            { id: 'audit', label: '🔍 Auditoría Reservas' },
            { id: 'recovery', label: '🔑 Recuperación (N1)' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? 'border-purple-500 text-purple-300 bg-purple-950/20'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* TAB FAUCET: RECLAMO DE TOKENS Y DOCUMENTACION MIDNIGHT */}
        {activeTab === 'faucet' && (
          <div className="max-w-3xl mx-auto glass-card p-6 rounded-2xl border border-zinc-800 space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <span>🚰</span> Faucet de Tokens Testnet (tNIGHT & tUSDC / lUSDv)
              </h2>
              <p className="text-xs text-zinc-400 mt-1">
                Reclama tokens de prueba sin hardcoding utilizando los endpoints oficiales y evaluando la viabilidad según la documentación de Midnight.
              </p>
            </div>

            <form onSubmit={handleFaucetClaim} className="space-y-5">
              {/* Token Selector */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-2">Seleccionar Token a Reclamar</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setFaucetToken('tUSDC');
                      setFaucetAmount('1000');
                    }}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      faucetToken === 'tUSDC'
                        ? 'bg-purple-950/50 border-purple-600 text-white'
                        : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <div className="font-bold text-sm text-purple-300">tUSDC / lUSDv (Vinchi ZK)</div>
                    <div className="text-xs text-zinc-400 mt-1">Notas de privacidad para colateral y pagos en Vinchi</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setFaucetToken('tNIGHT');
                      setFaucetAmount('1000');
                    }}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      faucetToken === 'tNIGHT'
                        ? 'bg-emerald-950/50 border-emerald-600 text-white'
                        : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <div className="font-bold text-sm text-emerald-300">tNIGHT (Nativo Midnight)</div>
                    <div className="text-xs text-zinc-400 mt-1">Token nativo de testnet necesario para generar tDUST</div>
                  </button>
                </div>
              </div>

              {/* Amount Selection & Presets */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Monto a Reclamar</label>
                <input
                  type="number"
                  value={faucetAmount}
                  onChange={e => setFaucetAmount(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-white font-mono text-sm focus:outline-none focus:border-purple-500 mb-2"
                  placeholder="Ej: 1000"
                />

                <div className="grid grid-cols-4 gap-2">
                  {[100, 500, 1000, 5000].map(amt => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setFaucetAmount(amt.toString())}
                      className="px-2 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-300 border border-zinc-700 text-center"
                    >
                      {amt} {faucetToken}
                    </button>
                  ))}
                </div>
              </div>

              {/* Recipient Address */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Dirección de Destino</label>
                <input
                  type="text"
                  value={faucetRecipient}
                  onChange={e => setFaucetRecipient(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-white font-mono text-xs focus:outline-none focus:border-purple-500"
                  placeholder="Dirección Bech32m o Clave Pública"
                />
                <span className="text-[10px] text-zinc-500 mt-1 block">
                  {laceState.unshieldedAddress
                    ? `✓ Autocompletada con tu Lace Wallet (${laceState.unshieldedAddress.slice(0, 12)}...)`
                    : 'Puedes conectar Lace Wallet o ingresar la dirección manualmente.'}
                </span>
              </div>

              <button
                type="submit"
                disabled={isFaucetClaiming}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold text-sm transition-all shadow-lg glow-purple disabled:opacity-50"
              >
                {isFaucetClaiming ? 'Procesando Reclamo...' : `Reclamar ${faucetAmount} ${faucetToken}`}
              </button>
            </form>

            {/* Faucet Result & Midnight Documentation Diagnosis */}
            {faucetResult && (
              <div
                className={`p-5 rounded-2xl border space-y-3 transition-all ${
                  faucetResult.success
                    ? 'bg-emerald-950/40 border-emerald-800 text-emerald-200'
                    : 'bg-amber-950/40 border-amber-800 text-amber-200'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-sm">
                  <span>{faucetResult.success ? '✓ Reclamo Procesado Exitosamente' : '⚠️ Solicitud de Faucet con Verificación Requerida'}</span>
                </div>

                {faucetResult.txHash && (
                  <div className="text-xs font-mono text-zinc-300">
                    <strong>Transaction Hash:</strong> {faucetResult.txHash}
                  </div>
                )}

                {faucetResult.diagnosticDetails && (
                  <div className="text-xs whitespace-pre-line bg-zinc-950/60 p-3.5 rounded-xl border border-zinc-800 font-mono text-zinc-300">
                    {faucetResult.diagnosticDetails}
                  </div>
                )}

                {faucetResult.requiresCaptcha && (
                  <div className="p-4 rounded-xl bg-purple-950/40 border border-purple-800/60 space-y-2 text-xs">
                    <div className="font-semibold text-purple-200">📌 Verificación de Parámetros y Documentación Oficial de Midnight:</div>
                    <p className="text-purple-300/80">
                      Según la especificación oficial de Midnight (docs.midnight.network), los endpoints de testnet pública imponen Anti-Bot Captcha para la asignación de tNIGHT.
                    </p>

                    <div className="space-y-1">
                      <div className="font-semibold text-purple-200">Parámetros Requeridos para Reclamo Directo:</div>
                      <ul className="list-disc list-inside text-purple-300/80 text-[11px]">
                        {faucetResult.requiredParameters?.map((param, idx) => (
                          <li key={idx}>{param}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="pt-2 flex flex-wrap gap-3">
                      <a
                        href={faucetResult.documentationUrl || 'https://docs.midnight.network/'}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 rounded-lg bg-purple-900 hover:bg-purple-800 text-purple-100 font-medium text-xs border border-purple-700 transition-all"
                      >
                        📖 Ver Documentación Oficial
                      </a>
                      <a
                        href="https://faucet.preview.midnight.network/"
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 rounded-lg bg-emerald-900 hover:bg-emerald-800 text-emerald-100 font-medium text-xs border border-emerald-700 transition-all"
                      >
                        🌐 Portal Web Faucet Midnight
                      </a>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB CONNECTIONS & HEALTH DIAGNOSTICS */}
        {activeTab === 'connections' && (
          <div className="glass-card p-6 rounded-2xl border border-zinc-800 space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <span>🔌</span> Conexiones Permitidas de la Red Midnight (Sin Hardcoding)
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Verificación en tiempo real de todos los endpoints configurables del protocolo.
                </p>
              </div>
              <button
                onClick={runHealthDiagnostics}
                disabled={isCheckingHealth}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs text-purple-300 border border-zinc-700 transition-all"
              >
                {isCheckingHealth ? 'Diagnosticando...' : '🔄 Re-probar Conexiones'}
              </button>
            </div>

            {/* Health Services Grid */}
            {healthStatus && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {healthStatus.services.map(svc => (
                  <div
                    key={svc.service}
                    className={`p-4 rounded-xl border flex flex-col justify-between space-y-2 ${
                      svc.isOnline
                        ? 'bg-emerald-950/20 border-emerald-900/60'
                        : 'bg-amber-950/20 border-amber-900/60'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-sm text-white uppercase tracking-wider">{svc.service}</span>
                      <span
                        className={`text-[10px] px-2.5 py-0.5 rounded-full border ${
                          svc.isOnline
                            ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                            : 'bg-amber-950 text-amber-300 border-amber-800'
                        }`}
                      >
                        {svc.isOnline ? `Online (${svc.latencyMs}ms)` : 'Offline / Limitado'}
                      </span>
                    </div>

                    <div className="text-xs font-mono text-zinc-400 truncate">
                      {svc.url}
                    </div>

                    {svc.error && (
                      <div className="text-[11px] text-amber-300/80 bg-amber-950/40 p-2 rounded-lg border border-amber-900/50">
                        {svc.error}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Configurable Endpoints Form (Zero Hardcoding) */}
            <div className="pt-4 border-t border-zinc-800 space-y-4">
              <h3 className="text-sm font-bold text-white">Configuración Dinámica de Endpoints</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-zinc-400 mb-1">Midnight Node RPC URL</label>
                  <input
                    type="text"
                    value={networkConfig.nodeUrl}
                    onChange={e => handleUpdateConfig('nodeUrl', e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1">Midnight Indexer GraphQL URL</label>
                  <input
                    type="text"
                    value={networkConfig.indexerUrl}
                    onChange={e => handleUpdateConfig('indexerUrl', e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1">Proof Server URL</label>
                  <input
                    type="text"
                    value={networkConfig.proofServerUrl}
                    onChange={e => handleUpdateConfig('proofServerUrl', e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1">Midnight Faucet URL</label>
                  <input
                    type="text"
                    value={networkConfig.faucetUrl}
                    onChange={e => handleUpdateConfig('faucetUrl', e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB MIDNIGHT COMPACT SMART CONTRACTS */}
        {activeTab === 'compact' && (
          <div className="glass-card p-6 rounded-2xl border border-zinc-800 space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <span>📜</span> Framework de Smart Contracts Compact (Midnight Network)
              </h2>
              <p className="text-xs text-zinc-400 mt-1">
                Vinchi ejecuta la lógica funcional de circuito en lenguaje Compact nativo compilado a ZKIR (`.compact` / `.zkir`).
              </p>
            </div>

            {/* Compact Contracts Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-xl bg-zinc-900 border border-purple-900/40 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-purple-300 text-sm">VinchiNotes.compact</span>
                  <span className="px-2 py-0.5 rounded bg-purple-950 text-purple-300 text-[10px] border border-purple-800">Núcleo ZK</span>
                </div>
                <p className="text-zinc-400">Custodia del árbol de Merkle de notas (`noteTreeRoot`) y conjuntos de nullifiers (`lastNullifier`).</p>
                <div className="font-mono text-[11px] text-zinc-300 pt-1 border-t border-zinc-800">
                  Circuitos: <code className="text-purple-400">deposit()</code>, <code className="text-purple-400">pay()</code>, <code className="text-purple-400">materialize()</code>, <code className="text-purple-400">redeem()</code>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-zinc-900 border border-emerald-900/40 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-emerald-300 text-sm">MerchantRegistry.compact</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 text-[10px] border border-emerald-800">Membresía</span>
                </div>
                <p className="text-zinc-400">Registro de comercios habilitados (`merchantRoot`) para verificación en el circuito de pago.</p>
                <div className="font-mono text-[11px] text-zinc-300 pt-1 border-t border-zinc-800">
                  Circuito: <code className="text-emerald-400">updateMerchantRoot()</code>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-zinc-900 border border-indigo-900/40 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-indigo-300 text-sm">YieldIndex.compact</span>
                  <span className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 text-[10px] border border-indigo-800">Oráculo Yield</span>
                </div>
                <p className="text-zinc-400">Actualización y checkpoints del índice de rendimiento global acumulado (`currentIndex`).</p>
                <div className="font-mono text-[11px] text-zinc-300 pt-1 border-t border-zinc-800">
                  Circuito: <code className="text-indigo-400">poke()</code>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-zinc-900 border border-amber-900/40 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-amber-300 text-sm">Governance.compact</span>
                  <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-300 text-[10px] border border-amber-800">Pausas & Roles</span>
                </div>
                <p className="text-zinc-400">Interruptores de circuito (*circuit breaker*) de grano fino para seguridad del protocolo.</p>
                <div className="font-mono text-[11px] text-zinc-300 pt-1 border-t border-zinc-800">
                  Circuitos: <code className="text-amber-400">setDepositPaused()</code>, <code className="text-amber-400">setPayPaused()</code>
                </div>
              </div>
            </div>

            {/* Live Compact Ledger State Monitor */}
            <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-3 font-mono text-xs">
              <div className="font-bold text-sm text-white flex justify-between items-center">
                <span>Estado Público del Ledger Compact (On-Chain)</span>
                <span className="text-xs text-purple-400 font-normal">SDK `@vinchi/contracts`</span>
              </div>

              {(() => {
                const ledger = sdk.getCompactLedgerState();
                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-zinc-300 text-[11px]">
                    <div><strong>noteTreeRoot:</strong> <span className="text-purple-300">{ledger.noteTreeRoot}</span></div>
                    <div><strong>lastNullifier:</strong> <span className="text-purple-300">{ledger.lastNullifier}</span></div>
                    <div><strong>totalCollateral:</strong> <span className="text-emerald-400 font-bold">{ledger.totalCollateral.toString()} USDC</span></div>
                    <div><strong>totalIssued:</strong> <span className="text-purple-400 font-bold">{ledger.totalIssued.toString()} lUSDv</span></div>
                    <div><strong>merchantRoot:</strong> <span className="text-indigo-300">{ledger.merchantRoot}</span></div>
                    <div><strong>yieldIndex:</strong> <span className="text-indigo-300">{ledger.yieldIndex.toString()} RAY</span></div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* TAB WALLET & DEPOSIT */}
        {activeTab === 'wallet' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Deposit Form */}
            <div className="glass-card p-6 rounded-2xl border border-zinc-800 space-y-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span>➕</span> Depositar USDC y Emitir Nota ZK
              </h2>
              <p className="text-xs text-zinc-400">
                El depósito ingresa USDC al protocolo y emite una nota privada para tu billetera.
              </p>

              <form onSubmit={handleDeposit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Monto a Depositar (USDC)</label>
                  <input
                    type="number"
                    value={depositAmount}
                    onChange={e => setDepositAmount(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-purple-500 text-sm"
                    placeholder="Monto"
                  />
                </div>

                {/* Preset Buttons */}
                <div className="grid grid-cols-4 gap-2">
                  {[100, 500, 1000, 5000].map(amt => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setDepositAmount(amt.toString())}
                      className="px-2 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-300 border border-zinc-700 text-center"
                    >
                      ${amt}
                    </button>
                  ))}
                </div>

                <button
                  type="submit"
                  disabled={isProcessing}
                  className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-medium text-sm transition-all shadow-md"
                >
                  {isProcessing ? 'Procesando Depósito...' : 'Confirmar Depósito'}
                </button>
              </form>
            </div>

            {/* Note List */}
            <div className="lg:col-span-2 glass-card p-6 rounded-2xl border border-zinc-800 space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>🎟️</span> Mis Billetes / Notas Privadas ({unspentNotes.length})
                </h2>
                <span className="text-xs text-zinc-400">Modelo UTXO Zcash</span>
              </div>

              {unspentNotes.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-zinc-800 rounded-xl text-zinc-500 text-sm space-y-3">
                  <div>No tenés notas activas en tu billetera.</div>
                  <button
                    onClick={() => setActiveTab('faucet')}
                    className="px-4 py-2 rounded-xl bg-purple-900/60 hover:bg-purple-800 text-purple-200 text-xs font-semibold border border-purple-700 transition-all"
                  >
                    🚰 Ir al Faucet a reclamar tUSDC
                  </button>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  {unspentNotes.map(item => (
                    <div
                      key={item.id}
                      className="p-4 rounded-xl bg-zinc-900/90 border border-zinc-800 hover:border-purple-800/60 transition-all flex flex-col md:flex-row justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-base text-purple-300">{item.note.amount.toString()} lUSDv</span>
                          <span className="px-2 py-0.5 rounded-md bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px]">
                            {item.status}
                          </span>
                        </div>
                        <div className="text-zinc-400 font-mono">
                          Commitment: <span className="text-zinc-300">{item.commitment.slice(0, 24)}...</span>
                        </div>
                        <div className="text-zinc-500 font-mono">
                          Nullifier: <span className="text-zinc-400">{item.nullifier.slice(0, 24)}...</span>
                        </div>
                      </div>

                      <div className="text-right flex md:flex-col justify-between items-end text-zinc-400">
                        <span>Vence en 30 días</span>
                        <span className="text-[10px] text-zinc-500">Tasa: {item.note.rateBps / 100}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB LACE WALLET CONNECTOR */}
        {activeTab === 'lace' && (
          <div className="max-w-2xl mx-auto glass-card p-6 rounded-2xl border border-zinc-800 space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <span>🦊</span> Conector Oficial Lace Wallet (Midnight DApp Connector API)
              </h2>
              <p className="text-xs text-zinc-400 mt-1">
                Conecta la extensión oficial de Lace Wallet en la red <strong className="text-purple-300">Midnight Preview/Preprod</strong> mediante la API <code className="text-purple-300">window.midnight.mnLace</code>.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Objetos Inyectados en Navegador:</span>
                <span className="font-bold text-purple-300">
                  {laceState.detectedProviders.length > 0
                    ? laceState.detectedProviders.join(', ')
                    : 'Ninguno detectado en window'}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Midnight Lace (`window.midnight.mnLace`):</span>
                <span className={`font-bold ${laceState.isAvailable ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {laceState.isAvailable ? '✓ Detectado' : '⚠ Ausente'}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Estado de Conexión:</span>
                <span className={`font-bold ${laceState.isConnected ? 'text-emerald-400' : 'text-zinc-500'}`}>
                  {laceState.isConnected ? `Conectado a ${laceState.networkId}` : 'Desconectado'}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Saldo Unshielded en Lace Wallet:</span>
                <span className="font-bold text-emerald-300 font-mono">
                  {laceState.unshieldedBalance !== null ? `${formatTokenBalance(laceState.unshieldedBalance, 6)} tNIGHT` : 'No consultado / Sin fondos'}
                </span>
              </div>

              {laceState.unshieldedAddress && (
                <div className="pt-2 border-t border-zinc-800">
                  <span className="text-zinc-500 block">Dirección Pública Unshielded (Lace):</span>
                  <span className="font-mono text-purple-300 text-xs break-all">{laceState.unshieldedAddress}</span>
                </div>
              )}
            </div>

            <button
              onClick={handleConnectLace}
              disabled={isProcessing}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-medium text-sm transition-all shadow-lg glow-purple"
            >
              {isProcessing ? 'Conectando / Sincronizando...' : (laceState.isConnected ? '🔄 Reconsultar Saldo Lace' : 'Conectar Lace Wallet')}
            </button>
          </div>
        )}

        {/* TAB PAY TO MERCHANT */}
        {activeTab === 'pay' && (
          <div className="max-w-2xl mx-auto glass-card p-6 rounded-2xl border border-zinc-800 space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <span>🛍️</span> Terminal de Pago a Comercio
              </h2>
              <p className="text-xs text-zinc-400 mt-1">
                Envía dinero de forma 100% privada. El comercio recibe el pago sin ver tu identidad ni tu saldo total.
              </p>
            </div>

            <form onSubmit={handlePayment} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Seleccionar Comercio Receptor</label>
                <select
                  value={selectedMerchant}
                  onChange={e => setSelectedMerchant(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-purple-500 text-sm"
                >
                  {merchants.map(m => (
                    <option key={m.id} value={m.publicKey}>
                      [{m.category}] {m.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Monto a Pagar (lUSDv)</label>
                <input
                  type="number"
                  value={payAmount}
                  onChange={e => setPayAmount(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-purple-500 text-sm"
                  placeholder="Ej: 120"
                />
              </div>

              <button
                type="submit"
                disabled={isProcessing || balance < BigInt(payAmount || '0')}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white font-medium text-sm transition-all shadow-lg glow-purple"
              >
                {isProcessing ? 'Generando Prueba ZK...' : 'Pagar con Privacidad ZK'}
              </button>
            </form>
          </div>
        )}

        {/* TAB AUDIT */}
        {activeTab === 'audit' && stats && (
          <div className="glass-card p-6 rounded-2xl border border-zinc-800 space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <span>🔍</span> Auditoría Pública de Reservas (Transparencia Agregada)
              </h2>
              <p className="text-xs text-zinc-400 mt-1">
                Cualquier usuario o auditor puede verificar que el protocolo es 100% solvente sin violar la privacidad individual.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-5 rounded-xl bg-zinc-900 border border-zinc-800">
                <span className="text-xs text-zinc-500 block">Total Colateral en Custodia</span>
                <span className="text-2xl font-bold text-emerald-400">{stats.totalCollateralUsdc.toString()} USDC</span>
              </div>
              <div className="p-5 rounded-xl bg-zinc-900 border border-zinc-800">
                <span className="text-xs text-zinc-500 block">Total Notas Emitidas</span>
                <span className="text-2xl font-bold text-purple-400">{stats.totalIssuedLusd.toString()} lUSDv</span>
              </div>
              <div className="p-5 rounded-xl bg-zinc-900 border border-zinc-800">
                <span className="text-xs text-zinc-500 block">Hojas en Árbol de Merkle</span>
                <span className="text-2xl font-bold text-indigo-400">{stats.totalNotesCount} Notas</span>
              </div>
            </div>
          </div>
        )}

        {/* TAB SEED RECOVERY */}
        {activeTab === 'recovery' && (
          <div className="max-w-xl mx-auto glass-card p-6 rounded-2xl border border-zinc-800 space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <span>🔑</span> Recuperación Determinista de Notas (Mitigación N1)
              </h2>
              <p className="text-xs text-zinc-400 mt-1">
                Si perdés tu dispositivo, podés recuperar todos tus billetes escaneando el árbol de la cadena con tu Frase Semilla.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Frase Semilla (Seed Secret)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={seed}
                    onChange={e => setSeed(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-white font-mono text-xs focus:outline-none focus:border-purple-500"
                  />
                  <button
                    onClick={handleGenerateNewSeed}
                    className="px-3 py-2 rounded-xl bg-purple-950 text-purple-200 border border-purple-800 text-xs font-medium whitespace-nowrap"
                  >
                    🎲 Nueva Semilla
                  </button>
                </div>
              </div>

              <button
                onClick={handleRecovery}
                disabled={isProcessing}
                className="w-full py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-purple-300 font-medium text-sm transition-all border border-zinc-700"
              >
                {isProcessing ? 'Escaneando Cadena...' : 'Iniciar Escaneo y Recuperación'}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
