# Threat Model (Modelo de Amenazas y Seguridad)

## Vectores de Ataque Analizados

### 1. Replay & Double Spending Attacks (Doble Gasto)
- **Mitigación**: `PrivateTransfer.compact` exige la inclusión de nullifiers derivados de forma determinística utilizando la clave privada del propietario (`PoseidonHash(NullifierKey, Nonce)`). El contrato verifica que el nullifier no haya sido registrado previamente en el `nullifierSet` del ledger on-chain.

### 2. Sybil & Unregistered Recipient Attacks
- **Mitigación**: `Registry.compact` impone validaciones de lista blanca (`require(isWhitelisted(recipient))`). Todo intento de transferir fondos a direcciones no registradas es rechazado tanto a nivel de SDK como en los circuitos ZK.

### 3. Front-Running en Selección de Lotes FIFO
- **Mitigación**: La selección de lotes se ejecuta cliente-side (off-chain) de forma determinística ordenando por fecha de maduración (`maturesAt`). Los compromisos generados son privados y cifrados, previniendo que bots de MEV extraigan valor de las transacciones en memoria.

### 4. Malicious Yield Manipulation
- **Mitigación**: Los cálculos de adelanto de rendimiento (`futureYield`) y rebasing (`globalIndex`) están acotados por funciones puras no decrecientes en `YieldIndex.compact` (`assert(newIndex >= globalIndex)`).

### 5. Custodia y Almacenamiento de Claves
- **Mitigación**: No se almacenan claves privadas en servidores backend ni en localStorage sin cifrar. Todas las firmas de transacciones requieren la aprobación explícita del usuario a través de la extensión Lace Wallet.
