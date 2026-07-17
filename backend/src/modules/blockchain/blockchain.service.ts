import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type PactosContracts = Record<'registry'|'runtime'|'distribution'|'escrow'|'permission'|'treasury'|'audit', string>;
@Injectable()
export class BlockchainService {
  readonly contracts: PactosContracts;
  constructor(private readonly config: ConfigService) { this.contracts = { registry: this.config.get('PACTOS_REGISTRY_CONTRACT_ID',''), runtime: this.config.get('PACTOS_RUNTIME_CONTRACT_ID',''), distribution: this.config.get('PACTOS_DISTRIBUTION_CONTRACT_ID',''), escrow: this.config.get('PACTOS_ESCROW_CONTRACT_ID',''), permission: this.config.get('PACTOS_PERMISSION_CONTRACT_ID',''), treasury: this.config.get('PACTOS_TREASURY_CONTRACT_ID',''), audit: this.config.get('PACTOS_AUDIT_CONTRACT_ID','') }; }
  async rpc<T>(method: string, params: unknown): Promise<T> { const response = await fetch(this.config.getOrThrow<string>('STELLAR_RPC_URL'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: crypto.randomUUID(), method, params }) }); const payload = await response.json() as { result?: T; error?: { message: string } }; if (!response.ok || payload.error || !payload.result) throw new ServiceUnavailableException(payload.error?.message ?? 'Stellar RPC unavailable'); return payload.result; }
  async simulate(transactionXdr: string) { return this.rpc('simulateTransaction', { transaction: transactionXdr }); }
  async submit(transactionXdr: string) { return this.rpc('sendTransaction', { transaction: transactionXdr }); }
  async events(cursor?: string) { return this.rpc<{ events: unknown[]; latestLedger: number; cursor?: string }>('getEvents', { startLedger: cursor ? undefined : 'now', pagination: { limit: 100, cursor }, filters: [{ type: 'contract', contractIds: Object.values(this.contracts).filter(Boolean) }] }); }
}
