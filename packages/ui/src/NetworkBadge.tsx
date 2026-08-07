import React from 'react';

export interface NetworkBadgeProps {
  networkId: string;
}

export function NetworkBadge({ networkId }: NetworkBadgeProps) {
  const isPreview = networkId.toLowerCase() === 'preview';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        borderRadius: '9999px',
        fontSize: '12px',
        fontWeight: 600,
        backgroundColor: isPreview ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
        color: isPreview ? '#4ADE80' : '#F87171',
        border: `1px solid ${isPreview ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
      }}
    >
      <span
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: isPreview ? '#22C55E' : '#EF4444'
        }}
      />
      Midnight {networkId.toUpperCase()} {isPreview ? '✓' : '(⚠️ Cambiar a Preview)'}
    </span>
  );
}
