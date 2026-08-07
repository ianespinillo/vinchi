# Midnight Compact Smart Contracts Reference

## Resumen de Contratos Compact (Versión 0.23)

| Contrato | Archivo Compact | Descripción / Circuitos Clave |
| :--- | :--- | :--- |
| **USDCMint** | `contracts/usdc/USDCMint.compact` | Stablecoin de prueba con faucet admin, mint, transfer, approve, transferFrom |
| **Registry** | `contracts/registry/Registry.compact` | Registro de roles (USER, MERCHANT, PROVIDER, KEEPER, ADMIN) e `isWhitelisted(address)` |
| **Vault** | `contracts/vault/Vault.compact` | Bloqueo de colateral, `deposit(amount, maturityDays)` y `redeem(amount, sharesToBurn)` |
| **BatchManager** | `contracts/batch/BatchManager.compact` | Estructura `Batch`, `createBatch`, `splitBatch`, `consumeFIFO`, `isMatured` |
| **PrivateTransfer** | `contracts/privacy/PrivateTransfer.compact` | Privacidad ZK con `verifyProof` y `executePrivateTransfer(nullifiers, commitments, root)` |
| **DomainRegistry** | `contracts/domains/DomainRegistry.compact` | Sistema NNS `.midnight` con `registerDomain`, `resolve` y `reverse` |
| **YieldIndex** | `contracts/musdv/YieldIndex.compact` | mUSDv rebasing index con `poke(newIndex, timestamp)` |
| **BridgeEscrow** | `contracts/bridge/BridgeEscrow.compact` | Escrow para simulador Aave con `depositToBridgeEscrow` |
