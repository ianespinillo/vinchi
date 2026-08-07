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

## Actualizabilidad mediante Contract Maintenance Authority (CMA)

En Midnight Network, los contratos inteligentes están ligados al sistema de pruebas ZK (ZKIR y verifier keys). Para garantizar la continuidad a largo plazo y evitar que los contratos queden inoperativos ante evoluciones del sistema de pruebas ZK o del esquema de circuitos:

- **Habilitación de CMA**: Durante el despliegue (`deployContract`), se configura la clave del comité `signingKey: sampleSigningKey()`.
- **Inserción / Eliminación de Verifier Keys**:
  - `foundContract.circuitMaintenanceTx.<circuit>.insertVerifierKey(newVerifierKey)`
  - `foundContract.circuitMaintenanceTx.<circuit>.removeVerifierKey()`
- **Reemplazo de Autoridad**:
  - `foundContract.contractMaintenanceTx.replaceAuthority(newSigningKey)`

