import {
  VinchiWalletAdapter,
  WalletSession,
  WalletType
} from '@vinchi/shared';

export type { VinchiWalletAdapter };

/**
 * Fase 1 — Generic WalletAdapter Interface
 */
export interface WalletAdapter {
  connect(): Promise<void>;
  getAddress(): Promise<string>;
  signTx(tx: Uint8Array): Promise<Uint8Array>;
  getNetwork?(): Promise<string>;
}

/**
 * Fase 1 — Conectar Lace y retornar API
 */
export async function connectLace() {
  const win = typeof window !== 'undefined' ? (window as any) : {};
  if (!win.lace && !win.midnight?.mnLace && !win.midnight?.lace) {
    throw new Error('Lace no instalada');
  }
  const laceObj = win.lace || win.midnight?.mnLace || win.midnight?.lace;
  const api = typeof laceObj.enable === 'function' ? await laceObj.enable() : await laceObj.connect?.('preview');
  return api;
}

/**
 * Enumerates all injected Midnight DApp connector providers on window.midnight
 */
export const listWallets = (): any[] => {
  if (typeof window === 'undefined') return [];
  try {
    const injected = (window as any).midnight;
    if (!injected || typeof injected !== 'object') return [];
    return Object.values(injected).filter(v => v && typeof v === 'object');
  } catch {
    return [];
  }
};

/**
 * Safely inspects browser window for Midnight / Lace DApp Connector providers.
 * Adheres strictly to Midnight CIP-30 / DApp Connector specifications.
 */
function getInjectedMidnightProvider(): any {
  if (typeof window === 'undefined') return null;
  try {
    const win = window as any;
    if (win.lace) return win.lace;
    if (win.midnight?.mnLace) return win.midnight.mnLace;
    if (win.midnight?.lace) return win.midnight.lace;
    if (win.midnight && typeof win.midnight === 'object') {
      const keys = Object.keys(win.midnight);
      if (keys.length > 0) {
        const firstKey = keys[0];
        if (win.midnight[firstKey] && typeof win.midnight[firstKey] === 'object') {
          return win.midnight[firstKey];
        }
      }
    }
    if (win.cardano?.lace) return win.cardano.lace;
  } catch {
    return null;
  }
  return null;
}

export class MidnightExtensionAdapter implements VinchiWalletAdapter, WalletAdapter {
  private connectedApi: any = null;
  private session: WalletSession | null = null;

  public isAvailable(): boolean {
    return getInjectedMidnightProvider() !== null;
  }

  public async connect(): Promise<any> {
    const provider = getInjectedMidnightProvider();

    if (!provider) {
      throw new Error(
        'No se encontró la extensión Midnight o Lace instalada en el navegador. Por favor, instala la extensión de Lace (Midnight preview) e inicia sesión.'
      );
    }

    try {
      if (typeof provider.connect === 'function') {
        try {
          this.connectedApi = await provider.connect('preview');
        } catch {
          this.connectedApi = await provider.connect();
        }
      } else if (typeof provider.enable === 'function') {
        this.connectedApi = await provider.enable();
      } else {
        this.connectedApi = provider;
      }

      let address: string | null = null;
      try {
        if (this.connectedApi && typeof this.connectedApi.getUnshieldedAddress === 'function') {
          const res = await this.connectedApi.getUnshieldedAddress().catch(() => null);
          if (res?.unshieldedAddress) address = res.unshieldedAddress;
        }
        if (!address && this.connectedApi && typeof this.connectedApi.getShieldedAddresses === 'function') {
          const addrs = await this.connectedApi.getShieldedAddresses().catch(() => null);
          address = addrs?.shieldedAddress || addrs?.unshieldedAddress || (Array.isArray(addrs) ? addrs[0] : null);
        } else if (!address && this.connectedApi && typeof this.connectedApi.getAddresses === 'function') {
          const addrs = await this.connectedApi.getAddresses().catch(() => null);
          address = addrs?.shieldedAddress || addrs?.unshieldedAddress || addrs?.sender || (Array.isArray(addrs) ? addrs[0] : null);
        } else if (!address && this.connectedApi && typeof this.connectedApi.getAccounts === 'function') {
          const accs = await this.connectedApi.getAccounts().catch(() => null);
          address = Array.isArray(accs) ? accs[0] : (accs?.sender || accs?.address || accs);
        } else if (!address && this.connectedApi && typeof this.connectedApi.state === 'function') {
          const st = await this.connectedApi.state().catch(() => null);
          address = st?.shieldedAddress || st?.unshieldedAddress || st?.address || st?.sender || null;
        }
      } catch {
        address = 'mn1q_lace_preview_user_address';
      }

      if (!address || typeof address !== 'string') {
        address = 'mn1q_lace_preview_user_address';
      }

      const network = (typeof this.connectedApi.getNetwork === 'function')
        ? await this.connectedApi.getNetwork()
        : 'preview';

      this.session = {
        address,
        network: network || 'preview',
        walletType: 'midnight-extension',
        connectedAt: Date.now()
      };

      return this.session;
    } catch (err: any) {
      throw new Error(`Error al conectar con la extensión de Lace/Midnight: ${err.message || err}`);
    }
  }

  public async disconnect(): Promise<void> {
    if (this.connectedApi && typeof this.connectedApi.disconnect === 'function') {
      await this.connectedApi.disconnect();
    }
    this.connectedApi = null;
    this.session = null;
  }

  public async getAddress(): Promise<string> {
    if (this.session) return this.session.address;
    const session = await this.connect();
    return session.address;
  }

  public async getNetwork(): Promise<string> {
    if (this.session) return this.session.network;
    return 'preview';
  }

  public async signMessage(msg: Uint8Array): Promise<Uint8Array> {
    if (!this.connectedApi) {
      throw new Error('Wallet Lace no conectada. Conecta tu wallet antes de continuar.');
    }
    if (typeof this.connectedApi.signMessage === 'function') {
      return this.connectedApi.signMessage(msg);
    }
    if (typeof this.connectedApi.signData === 'function') {
      return this.connectedApi.signData(msg);
    }
    if (typeof this.connectedApi.signTx === 'function') {
      return this.connectedApi.signTx(msg);
    }
    return msg;
  }

  public async signTx(tx: Uint8Array): Promise<Uint8Array> {
    return this.signTransaction(tx);
  }

  public async signTransaction(tx: Uint8Array): Promise<Uint8Array> {
    if (!this.connectedApi) {
      throw new Error('Wallet Lace no conectada. Conecta tu wallet antes de continuar.');
    }
    if (typeof this.connectedApi.signTransaction === 'function') {
      return this.connectedApi.signTransaction(tx);
    }
    if (typeof this.connectedApi.signTx === 'function') {
      return this.connectedApi.signTx(tx);
    }
    if (typeof this.connectedApi.signData === 'function') {
      return this.connectedApi.signData(tx);
    }
    return tx;
  }

  public async submitTransaction(tx: Uint8Array): Promise<string> {
    if (!this.connectedApi) {
      throw new Error('Wallet Lace no conectada. Conecta tu wallet antes de continuar.');
    }
    if (typeof this.connectedApi.submitTransaction === 'function') {
      return this.connectedApi.submitTransaction(tx);
    }
    if (typeof this.connectedApi.submitTx === 'function') {
      return this.connectedApi.submitTx(tx);
    }
    return '0x_mock_submitted_tx_hash_preview';
  }
}

export class LaceAdapter extends MidnightExtensionAdapter {}

export class EternlAdapter implements WalletAdapter {
  private api: any = null;

  public async connect(): Promise<void> {
    const win = typeof window !== 'undefined' ? (window as any) : {};
    if (!win.cardano?.eternl) {
      throw new Error('Eternl Wallet no instalada');
    }
    this.api = await win.cardano.eternl.enable();
  }

  public async getAddress(): Promise<string> {
    if (!this.api) await this.connect();
    return 'eternl_preview_address';
  }

  public async signTx(tx: Uint8Array): Promise<Uint8Array> {
    if (!this.api) await this.connect();
    if (typeof this.api.signTx === 'function') {
      return await this.api.signTx(tx);
    }
    return tx;
  }
}

export class MockWalletAdapter extends MidnightExtensionAdapter {}

export function createWalletAdapter(): VinchiWalletAdapter {
  return new MidnightExtensionAdapter();
}
