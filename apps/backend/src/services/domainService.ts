import { DomainRecord, DomainResolveResult } from '@vinchi/shared';
import crypto from 'crypto';



export class DomainService {
  private domains: Map<string, DomainRecord> = new Map();

  constructor() {
    // Seed initial system domains
    this.registerDomain({
      name: 'alice.midnight',
      ownerCommitment: '0x01827abc456def7890123456789abcdef0123456789abcdef0123456789abcd',
      controllerKey: '0x01827abc456def7890123456789abcdef0123456789abcdef0123456789abcd',
      records: {
        payment: '0x01827abc456def7890123456789abcdef0123456789abcdef0123456789abcd',
        avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
        profile: 'Alice - Early Supporter'
      }
    });

    this.registerDomain({
      name: 'cafe-central.midnight',
      ownerCommitment: '0x02765def456abc7890123456789abcdef0123456789abcdef0123456789bcde',
      controllerKey: '0x02765def456abc7890123456789abcdef0123456789abcdef0123456789bcde',
      records: {
        payment: '0x02765def456abc7890123456789abcdef0123456789abcdef0123456789bcde',
        avatar: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=150',
        profile: 'Café Central - Pagos Rápidos y Privados'
      }
    });
  }

  public normalizeName(name: string): string {
    let cleaned = name.trim().toLowerCase();
    if (!cleaned.endsWith('.midnight')) {
      cleaned += '.midnight';
    }
    return cleaned;
  }

  public hashName(name: string): string {
    const norm = this.normalizeName(name);
    // Simple SHA256 simulation for domain hash
    let hash = 0;
    for (let i = 0; i < norm.length; i++) {
      hash = (hash << 5) - hash + norm.charCodeAt(i);
      hash |= 0;
    }
    return '0x' + Math.abs(hash).toString(16).padStart(64, '0');
  }

  public registerDomain(params: {
    name: string;
    ownerCommitment: string;
    controllerKey: string;
    records?: Record<string, string>;
    expiresInDays?: number;
  }): DomainRecord {
    const normName = this.normalizeName(params.name);
    if (this.domains.has(normName)) {
      throw new Error(`El dominio ${normName} ya se encuentra registrado.`);
    }

    const expiresAt = Date.now() + (params.expiresInDays || 365) * 24 * 60 * 60 * 1000;
    const nameHash = this.hashName(normName);

    const record: DomainRecord = {
      name: normName,
      nameHash,
      ownerCommitment: params.ownerCommitment,
      controllerKey: params.controllerKey,
      expiresAt,
      records: params.records || {},
      isVerified: true
    };

    this.domains.set(normName, record);
    return record;
  }

  public resolveDomain(name: string): DomainResolveResult | null {
    const normName = this.normalizeName(name);
    const domain = this.domains.get(normName);

    if (!domain) {
      return null;
    }

    return {
      name: domain.name,
      controllerKey: domain.controllerKey,
      ownerCommitment: domain.ownerCommitment,
      records: domain.records,
      isVerified: domain.isVerified ?? true,
      avatarUrl: domain.records.avatar
    };
  }

  public transferDomain(name: string, newOwnerCommitment: string): DomainRecord {
    const normName = this.normalizeName(name);
    const domain = this.domains.get(normName);
    if (!domain) {
      throw new Error(`Dominio ${normName} no encontrado.`);
    }

    domain.ownerCommitment = newOwnerCommitment;
    domain.controllerKey = newOwnerCommitment;
    this.domains.set(normName, domain);
    return domain;
  }

  public updateRecords(name: string, records: Record<string, string>): DomainRecord {
    const normName = this.normalizeName(name);
    const domain = this.domains.get(normName);
    if (!domain) {
      throw new Error(`Dominio ${normName} no encontrado.`);
    }

    domain.records = { ...domain.records, ...records };
    this.domains.set(normName, domain);
    return domain;
  }

  public getAllDomains(): DomainRecord[] {
    return Array.from(this.domains.values());
  }

  public reverseResolve(address: string): DomainRecord | null {
    if (!address) return null;
    const cleanAddr = address.toLowerCase();
    for (const domain of this.domains.values()) {
      if (
        domain.controllerKey.toLowerCase() === cleanAddr ||
        domain.ownerCommitment.toLowerCase() === cleanAddr ||
        domain.records.payment?.toLowerCase() === cleanAddr
      ) {
        return domain;
      }
    }
    return null;
  }
}
