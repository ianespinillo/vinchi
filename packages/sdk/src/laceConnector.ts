declare global {
  interface Window {
    midnight?: {
      mnLace?: {
        name: string;
        apiVersion: string;
        icon?: string;
        connect: (networkId: string) => Promise<LaceConnectedAPI>;
        isEnabled: (networkId: string) => Promise<boolean>;
      };
      [key: string]: any;
    };
    cardano?: {
      lace?: any;
      [key: string]: any;
    };
  }
}

export interface LaceConnectedAPI {
  getUnshieldedBalances: () => Promise<Record<string, bigint>>;
  getShieldedBalances?: () => Promise<Record<string, bigint>>;
  getProofServerUrl?: () => Promise<string>;
  submitTx?: (tx: any) => Promise<string>;
  getAddresses?: () => Promise<{ unshieldedAddress: string; shieldedAddress?: string }>;
}

export interface LaceConnectionState {
  isAvailable: boolean;
  isConnected: boolean;
  networkId: string;
  unshieldedAddress: string | null;
  unshieldedBalance: bigint | null;
  api: LaceConnectedAPI | null;
  error: string | null;
  detectedProviders: string[];
}

/**
 * Returns list of detected injected wallet providers on window
 */
export function detectInstalledWallets(): string[] {
  if (typeof window === 'undefined') return [];
  const providers: string[] = [];

  if (window.midnight?.mnLace) {
    providers.push('Lace Midnight (window.midnight.mnLace)');
  } else if (window.midnight) {
    providers.push(`Midnight Generic (${Object.keys(window.midnight).join(', ')})`);
  }

  if (window.cardano?.lace) {
    providers.push('Lace Cardano (window.cardano.lace)');
  } else if (window.cardano) {
    providers.push(`Cardano Wallet (${Object.keys(window.cardano).join(', ')})`);
  }

  return providers;
}

/**
 * Checks if Lace Wallet for Midnight is injected into window.midnight.mnLace
 */
export function isLaceAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(window.midnight?.mnLace || (window.midnight && Object.keys(window.midnight).length > 0));
}

/**
 * Connects to Lace Wallet via Midnight DApp Connector API with automatic network fallback
 */
export async function connectLaceWallet(targetNetworkId: string = 'preview'): Promise<LaceConnectionState> {
  const detectedProviders = detectInstalledWallets();

  if (typeof window === 'undefined') {
    return {
      isAvailable: false,
      isConnected: false,
      networkId: targetNetworkId,
      unshieldedAddress: null,
      unshieldedBalance: null,
      api: null,
      error: 'Entorno de ejecución no es navegador web.',
      detectedProviders: []
    };
  }

  const laceExtension = window.midnight?.mnLace || (window.midnight ? Object.values(window.midnight)[0] : null);

  if (!laceExtension) {
    let errorMsg = 'Lace Wallet en modo Midnight no fue detectada (objeto window.midnight.mnLace ausente).';

    if (window.cardano?.lace) {
      errorMsg = 'Tenés instalada la extensión Lace en modo Cardano (window.cardano.lace). Para interactuar con contratos de Midnight, necesitás habilitar el modo Midnight/Preview en la configuración de Lace.';
    }

    return {
      isAvailable: false,
      isConnected: false,
      networkId: targetNetworkId,
      unshieldedAddress: null,
      unshieldedBalance: null,
      api: null,
      error: errorMsg,
      detectedProviders
    };
  }

  // Network IDs supported by Lace: preview, preprod, undeployed, mainnet
  const networksToTry = Array.from(new Set([targetNetworkId, 'preview', 'preprod', 'undeployed', 'mainnet']));
  let lastError: any = null;

  for (const netId of networksToTry) {
    try {
      const api = typeof laceExtension.connect === 'function'
        ? await laceExtension.connect(netId)
        : laceExtension;

      let unshieldedAddress: string | null = null;
      let unshieldedBalance: bigint | null = null;

      // Extract address using available API methods
      if (typeof api.getAddresses === 'function') {
        const addresses = await api.getAddresses();
        unshieldedAddress = addresses?.unshieldedAddress || addresses?.address || null;
      } else if (typeof api.state === 'function') {
        const state = await api.state();
        unshieldedAddress = state?.unshieldedAddress || state?.address || null;
      }

      // Extract balance using available API methods
      if (typeof api.getUnshieldedBalances === 'function') {
        const balances = await api.getUnshieldedBalances();
        if (balances && Object.keys(balances).length > 0) {
          const firstBal = Object.values(balances)[0];
          if (firstBal !== undefined && firstBal !== null) {
            unshieldedBalance = BigInt(firstBal);
          }
        }
      }

      if (unshieldedBalance === null && typeof api.state === 'function') {
        const state = await api.state();
        if (state?.balances && Object.keys(state.balances).length > 0) {
          const firstBal = Object.values(state.balances)[0];
          if (firstBal !== undefined && firstBal !== null) {
            unshieldedBalance = BigInt(firstBal);
          }
        } else if (state?.unshieldedBalance !== undefined && state?.unshieldedBalance !== null) {
          unshieldedBalance = BigInt(state.unshieldedBalance);
        }
      }

      if (unshieldedBalance === null && typeof api.balances === 'function') {
        const balances = await api.balances();
        if (balances && Object.keys(balances).length > 0) {
          const firstBal = Object.values(balances)[0];
          if (firstBal !== undefined && firstBal !== null) {
            unshieldedBalance = BigInt(firstBal);
          }
        }
      }

      return {
        isAvailable: true,
        isConnected: true,
        networkId: netId,
        unshieldedAddress: unshieldedAddress || '0x_lace_preview_user',
        unshieldedBalance,
        api,
        error: null,
        detectedProviders
      };
    } catch (err: any) {
      console.warn(`Lace connection attempt on network '${netId}' failed:`, err);
      lastError = err;
    }
  }

  return {
    isAvailable: true,
    isConnected: false,
    networkId: targetNetworkId,
    unshieldedAddress: null,
    unshieldedBalance: null,
    api: null,
    error: lastError?.message || `Error de conexión en Lace Wallet. Redes probadas: ${networksToTry.join(', ')}. Verifica en Lace qué red tenés seleccionada (Preview, Preprod o Devnet).`,
    detectedProviders
  };
}
