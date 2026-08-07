# Vinchi Documentation

Welcome to the **Vinchi Protocol** documentation.

## Architecture Overview

- **`apps/web`**: Next.js 15 Frontend web application with Lace Wallet integration.
- **`apps/keeper`**: Automated yield keeper service on Midnight Preview network.
- **`contracts/`**: Compact 0.23 ZK Smart Contracts.
  - `usdc/`: Mock USDC token contracts.
  - `registry/`: Merchant Merkle Tree registry.
  - `vault/`: Yield Vault contracts.
  - `batch/`: Yield batching logic.
  - `lusdv/`: Non-rebase lUSDv ZK Note contract.
  - `musdv/`: Yield index mUSDv contract.
  - `privacy/`: Governance and pause safety controls.
  - `bridge/`: Cross-chain Yield -> Todo bridge connector.
  - `domains/`: `.midnight` private name service registry.
- **`packages/sdk`**: TypeScript SDK for connecting to Lace and Midnight network.
- **`packages/ui`**: Shared UI component library.

## Network Target

- **Midnight Preview Network**
- **DApp Connector Specification**: CIP-30 / Midnight DApp Connector API (`window.midnight.mnLace` & `window.lace`)
