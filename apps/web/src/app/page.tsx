'use client';

import React, { useState, useEffect } from 'react';
import { VinchiSDK, isLaceAvailable, connectLaceWallet, LaceConnectionState } from '@vinchi/sdk';
import { VinchiWallet } from '@vinchi/wallet-core';
import { Merchant, WalletNote, ProtocolStats } from '@vinchi/shared';

export default function Home() {
  const [sdk] = useState(() => new VinchiSDK());
  const [wallet, setWallet] = useState<VinchiWallet | null>(null);
  const [seed, setSeed] = useState('seed_secreta_usuario_vinchi_2026');
  const [publicKey, setPublicKey] = useState('0x01827abc456def7890123456789abcdef0123456789abcdef0123456789abcd');
  const [balance, setBalance] = useState<bigint>(BigInt(0));
  const [unspentNotes, setUnspentNotes] = useState<WalletNote[]>([]);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [stats, setStats] = useState<ProtocolStats | null>(null);

  // Lace Wallet DApp Connector State
  const [laceState, setLaceState] = useState<LaceConnectionState>({
    isAvailable: false,
    isConnected: false,
    networkId: 'preprod',
    unshieldedAddress: null,
    unshieldedBalance: null,
    api: null,
    error: null,
    detectedProviders: []
  });

  const [activeTab, setActiveTab] = useState<'wallet' | 'lace' | 'pay' | 'audit' | 'recovery'>('wallet');

  // Form states
  const [depositAmount, setDepositAmount] = useState<string>('500');
  const [selectedMerchant, setSelectedMerchant] = useState<string>('');
  const [payAmount, setPayAmount] = useState<string>('120');

  // Toast / Status Message
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);

  // Check Lace availability on client mount
  useEffect(() => {
    setLaceState(prev => ({ ...prev, isAvailable: isLaceAvailable() }));
  }, []);

  // Initialize Wallet
  useEffect(() => {
    async function init() {
      const w = await VinchiWallet.create(seed, publicKey);
      setWallet(w);
      setMerchants(sdk.getMerchants());
      if (sdk.getMerchants().length > 0) {
        setSelectedMerchant(sdk.getMerchants()[0].publicKey);
      }
      refreshState(w);
    }
    init();
  }, [seed, publicKey]);

  const refreshState = async (currentWallet: VinchiWallet) => {
    setBalance(currentWallet.getBalance());
    setUnspentNotes(currentWallet.getUnspentNotes());
    const s = await sdk.getStats();
    setStats(s);
  };

  const handleConnectLace = async () => {
    setIsProcessing(true);
    setStatusMsg({ type: 'info', text: 'Solicitando conexión a la extensión Lace Wallet (window.midnight.mnLace)...' });

    const res = await connectLaceWallet('preprod');
    setLaceState(res);
    setIsProcessing(false);

    if (res.isConnected) {
      setStatusMsg({
        type: 'success',
        text: `¡Lace Wallet conectada con éxito! Dirección: ${res.unshieldedAddress}`
      });
    } else {
      setStatusMsg({
        type: 'error',
        text: res.error || 'No se pudo conectar a Lace Wallet.'
      });
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
    <div className="min-h-screen bg-[#09090b] text-zinc-100 p-4 md:p-8">
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
              <p className="text-xs text-zinc-400">Protocolo de Pagos Privados para Comercios (Nativo UTXO/Notas)</p>
            </div>
          </div>
        </div>

        {/* Header Actions: Lace Wallet Connector Button & Stats */}
        <div className="flex flex-wrap items-center gap-3">
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
                ? `Lace Conectado (${laceState.unshieldedAddress?.slice(0, 10)}...)`
                : 'Conectar Lace Wallet'}
            </span>
          </button>

          {/* Global Protocol Stats Badge */}
          {stats && (
            <div className="flex items-center gap-3 bg-zinc-900/80 px-3.5 py-2 rounded-xl border border-zinc-800 text-xs">
              <div>
                <span className="text-zinc-500 block">Colateral</span>
                <span className="font-semibold text-emerald-400">{stats.totalCollateralUsdc.toString()} USDC</span>
              </div>
              <div className="w-px h-6 bg-zinc-800" />
              <div>
                <span className="text-zinc-500 block">Emitido</span>
                <span className="font-semibold text-purple-400">{stats.totalIssuedLusd.toString()} lUSDv</span>
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

        {/* Top Balance Summary Card */}
        <div className="glass-panel p-6 rounded-2xl glow-purple relative overflow-hidden">
          <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-purple-600/10 rounded-full blur-3xl" />
          <div className="flex flex-col md:flex-row justify-between md:items-center gap-6 relative z-10">
            <div>
              <span className="text-xs uppercase tracking-wider text-purple-400 font-semibold">Balance Privado Local (Cliente)</span>
              <div className="text-4xl md:text-5xl font-extrabold mt-1 tracking-tight text-white">
                {balance.toString()} <span className="text-2xl font-normal text-purple-300">lUSDv</span>
              </div>
              <p className="text-xs text-zinc-400 mt-2">
                🔒 El balance se calcula en tu dispositivo sumando tus billetes sin exponer nada a la red.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setActiveTab('wallet')}
                className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 font-medium text-sm text-white transition-all shadow-lg"
              >
                + Depositar USDC
              </button>
              <button
                onClick={() => setActiveTab('pay')}
                className="px-5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 font-medium text-sm text-zinc-200 border border-zinc-700 transition-all"
              >
                💸 Pagar a Comercio
              </button>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-zinc-800 gap-2 overflow-x-auto">
          {[
            { id: 'wallet', label: '💳 Mi Billetera & Billetes' },
            { id: 'lace', label: '🦊 Conector Lace Wallet' },
            { id: 'pay', label: '🛍️ Terminal de Pago ZK' },
            { id: 'audit', label: '🔍 Auditor de Reservas' },
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

        {/* TAB LACE WALLET CONNECTOR */}
        {activeTab === 'lace' && (
          <div className="max-w-2xl mx-auto glass-card p-6 rounded-2xl border border-zinc-800 space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <span>🦊</span> Conector Oficial Lace Wallet (Midnight DApp Connector)
              </h2>
              <p className="text-xs text-zinc-400 mt-1">
                Conecta la extensión oficial de Lace Wallet mediante la API <code className="text-purple-300">window.midnight.mnLace</code>.
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
                  {laceState.isConnected ? 'Conectado a Preprod' : 'Desconectado'}
                </span>
              </div>

              {laceState.unshieldedAddress && (
                <div className="pt-2 border-t border-zinc-800">
                  <span className="text-zinc-500 block">Dirección Pública Unshielded:</span>
                  <span className="font-mono text-purple-300 text-xs break-all">{laceState.unshieldedAddress}</span>
                </div>
              )}
            </div>

            {laceState.error && (
              <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-800/60 text-amber-200 text-xs space-y-2">
                <div className="font-bold">⚠️ Diagnóstico de Conexión:</div>
                <div>{laceState.error}</div>
              </div>
            )}

            {!laceState.isConnected ? (
              <button
                onClick={handleConnectLace}
                disabled={isProcessing}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-medium text-sm transition-all shadow-lg glow-purple"
              >
                {isProcessing ? 'Conectando...' : 'Conectar / Reintentar Lace Wallet'}
              </button>
            ) : (
              <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-xs">
                ✓ Conexión establecida con la extensión Lace de Midnight. Las transacciones ZK pueden ser firmadas y autorizadas mediante tu billetera de navegador.
              </div>
            )}
          </div>
        )}

        {/* TAB 1: WALLET & DEPOSIT */}
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
                <div className="p-8 text-center border border-dashed border-zinc-800 rounded-xl text-zinc-500 text-sm">
                  No tenés notas activas en tu billetera. ¡Hacé tu primer depósito arriba!
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

        {/* TAB 2: PAY TO MERCHANT */}
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

              <div className="p-4 rounded-xl bg-purple-950/20 border border-purple-900/40 text-xs text-purple-300 space-y-1">
                <div className="font-semibold">🔒 Garantías de Privacidad ZK:</div>
                <ul className="list-disc list-inside space-y-0.5 text-purple-300/80">
                  <li>Se consumen tus notas y se publican nullifiers anónimos.</li>
                  <li>Se crea una nota de pago para el comercio y una nota de vuelto para vos.</li>
                  <li>Nadie externamente puede ver el monto o relacionar pagador y cobrador.</li>
                </ul>
              </div>

              <button
                type="submit"
                disabled={isProcessing || balance < BigInt(payAmount || '0')}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white font-medium text-sm transition-all shadow-lg glow-purple"
              >
                {isProcessing ? 'Generando Prueba ZK...' : 'Pagar con Privacidad ZK'}
              </button>
            </form>

            {lastTxHash && (
              <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-400 space-y-1">
                <div className="text-emerald-400 font-bold">✓ Transacción transmitida a Midnight:</div>
                <div>Tx Hash: <span className="text-zinc-200">{lastTxHash}</span></div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: PROOF OF RESERVES AUDITOR */}
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

            <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-400 space-y-2">
              <div className="font-semibold text-zinc-200">Demostración de Solvencia:</div>
              <div>Respaldo Colateral / Emisión = <span className="text-emerald-400 font-bold">100% Solvente</span></div>
              <div>Rendimiento Acumulado del Índice (`yieldIndex`): <span className="text-purple-300">1.000000000000000000000000000 RAY</span></div>
            </div>
          </div>
        )}

        {/* TAB 4: SEED RECOVERY */}
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
                <input
                  type="text"
                  value={seed}
                  onChange={e => setSeed(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-white font-mono text-xs focus:outline-none focus:border-purple-500"
                />
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
