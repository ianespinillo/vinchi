import React from 'react';

export interface WalletButtonProps {
  isConnected: boolean;
  address?: string | null;
  network?: string | null;
  onConnect: () => void;
  onDisconnect?: () => void;
  isLoading?: boolean;
}

export function WalletButton({
  isConnected,
  address,
  network = 'preview',
  onConnect,
  onDisconnect,
  isLoading = false
}: WalletButtonProps) {
  if (isConnected && address) {
    const shortened = `${address.slice(0, 6)}...${address.slice(-4)}`;
    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
        <button
          onClick={onDisconnect}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            backgroundColor: '#1E293B',
            color: '#38BDF8',
            border: '1px solid #334155',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          🔮 {shortened} ({network || 'Preview'})
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={onConnect}
      disabled={isLoading}
      style={{
        padding: '8px 18px',
        borderRadius: '8px',
        background: 'linear-gradient(135deg, #A855F7 0%, #6366F1 100%)',
        color: '#FFFFFF',
        fontWeight: 600,
        border: 'none',
        cursor: 'pointer'
      }}
    >
      {isLoading ? 'Conectando Lace...' : 'Conectar Wallet'}
    </button>
  );
}
