export function checkRuntimeVersion(version: string): void {
  // Verifies compact runtime version compatibility (0.16.0)
}

export class CompactError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CompactError';
  }
}

export function assert(condition: boolean, message: string = 'Compact assertion failed'): void {
  if (!condition) {
    throw new CompactError(message);
  }
}

export function typeError(circuit: string, arg: string, loc: string, expected: string, val: any): never {
  throw new CompactError(`Compact type error in '${circuit}' at ${loc}: ${arg} expected ${expected}, got ${String(val)}`);
}

export function emptyRunningCost() {
  return { gas: 0n, cpu: 0n };
}

export function dummyContractAddress(): Uint8Array {
  return new Uint8Array(32);
}

export class CompactTypeUnsignedInteger {
  constructor(public max: bigint, public bytes: number) {}
  alignment() {
    return [{ type: 'Uint', bytes: this.bytes }];
  }
  toValue(val: bigint) {
    return [val];
  }
  fromValue(val: any) {
    if (Array.isArray(val)) return BigInt(val[0] || 0n);
    return BigInt(val || 0n);
  }
}

export class CompactTypeBytes {
  constructor(public size: number) {}
  alignment() {
    return [{ type: 'Bytes', size: this.size }];
  }
  toValue(val: Uint8Array) {
    return [val];
  }
  fromValue(val: any) {
    if (Array.isArray(val)) return val[0] || new Uint8Array(this.size);
    return val || new Uint8Array(this.size);
  }
}

export const CompactTypeBoolean = {
  alignment() {
    return [{ type: 'Boolean' }];
  },
  toValue(val: boolean) {
    return [val ? 1 : 0];
  },
  fromValue(val: any) {
    if (Array.isArray(val)) return Boolean(val[0]);
    return Boolean(val);
  }
};

export class ChargedState {
  constructor(public state: any = {}) {}
}

export class ContractOperation {
  constructor(public op: any = {}) {}
}

export class ContractState {
  public data: any;
  constructor(public state: any = {}) {
    this.data = state;
  }
}

export class CostModel {
  constructor(public model: any = {}) {}
  static initialCostModel() {
    return new CostModel({ gas: 0n, cpu: 0n });
  }
}

export class QueryContext {
  constructor(public state: any = {}, public address: any = new Uint8Array(32)) {}
}

export class StateValue {
  constructor(public val: any = {}) {}
  encode(): any {
    return this.val;
  }
  static newCell(val: any) {
    return new StateValue({ tag: 'cell', value: val });
  }
  static newArray(val: any) {
    return new StateValue({ tag: 'array', value: val });
  }
  static newNull() {
    return new StateValue({ tag: 'null' });
  }
}

export interface CircuitContext<PS = any> {
  currentQueryContext: {
    state: any;
    ledger?: any;
    queryData?: any;
  };
  originalState?: any;
  transactionContext?: any;
  gasCost?: { gas: bigint; cpu: bigint };
}

export interface CircuitResults<PS = any, R = any> {
  result: R;
  context: CircuitContext<PS>;
  proofData: any;
  gasCost: { gas: bigint; cpu: bigint };
}

export function queryLedgerState(context: any, queryFn?: any): any {
  const state = context?.currentQueryContext?.state || context?.currentQueryContext?.ledger || context;
  if (typeof queryFn === 'function') {
    return queryFn(state);
  }
  return state;
}

export function createCircuitContext<PS = any>(initialLedgerState: any = {}): CircuitContext<PS> {
  return {
    currentQueryContext: {
      state: initialLedgerState,
      ledger: initialLedgerState,
      queryData: {}
    },
    originalState: initialLedgerState,
    transactionContext: {},
    gasCost: emptyRunningCost()
  };
}
