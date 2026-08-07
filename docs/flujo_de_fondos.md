# Flujo de Fondos (Yield Layer & Factorización)

## Diagrama de Flujo de Fondos

```mermaid
sequenceDiagram
    autonumber
    actor Usuario
    participant Lace as Lace Wallet
    participant Vault as Vault.compact
    participant Batch as BatchManager.compact
    participant SDK as Vinchi SDK / Note Tree
    participant Merchant as Comercio (cafe.midnight)
    participant Keeper as Keeper Bot

    Usuario->>Lace: 1. Aprobar & Depositar 1,000 USDC (30 días, 12% APR)
    Lace->>Vault: 2. Lock 1,000 USDC en Vault
    Vault->>Batch: 3. Generar Batch { id, principal: 1000, expectedYield: 9.86, maturesAt }
    Vault->>SDK: 4. Emitir 1,009.86 lUSDv (Capital + Yield Adelantado)
    SDK->>Usuario: 5. Guardar notas cifradas en IndexedDB local

    Usuario->>Lace: 6. Pago Privado de 200 lUSDv a cafe.midnight
    Lace->>SDK: 7. Consumir Lote FIFO (Preservar maturesAt original)
    SDK->>Merchant: 8. Transferir sublote de 200 lUSDv
    SDK->>Usuario: 9. Retornar sublote de cambio lUSDv preservando maduración

    Note over Keeper, Vault: 10. Al llegar fecha maturesAt
    Keeper->>Vault: 11. snapshotYieldIndex() & Marcar status = MATURED
    Note over Usuario, Vault: 12. Conversión Lazy automática a mUSDv rebasing (sin tx del usuario)
```

## Motor de Rendimiento Adelantado (Fórmula)

$$\text{futureYield} = \frac{\text{amount} \times \text{APR} \times \text{días}}{365}$$

$$\text{lUSDv Minted} = \text{amount} + \text{futureYield}$$

### Ejemplo Práctico:
- Depositado: **1,000 USDC**
- Plazo: **30 Días** (APR 12%)
- Rendimiento Adelantado: **9.86 USDC**
- lUSDv Recibidos de inmediato: **1,009.86 lUSDv**
