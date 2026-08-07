# Backend REST API Reference (`apps/backend`)

El servicio backend de Vinchi expone los siguientes endpoints HTTP para interactuar con la SDK y los contratos Compact de Midnight Network:

## Endpoints

### 1. Faucet API
- **`POST /faucet`**
  - **Body**: `{ "address": "0x...", "token": "tUSDC", "amount": "10000" }`
  - **Respuesta**: Recibe 10,000 tUSDC de prueba en la red Midnight Preview.

### 2. Wallet & Balances API
- **`GET /wallet/:address`**
  - **Respuesta**: Información de red y saldos en la wallet ZK.

### 3. Deposits API
- **`POST /deposits`**
  - **Body**: `{ "amount": "1000000000", "ownerPubKey": "0x...", "periodDays": 30 }`
  - **Respuesta**: Creación de lote y emisión de lUSDv.

### 4. Private Transfers API
- **`POST /transfers`**
  - **Body**: `{ "recipient": "cafe.midnight", "amount": "200000000", "senderPubKey": "0x..." }`
  - **Respuesta**: Ejecución de transferencia ZK privada con lotes FIFO consumidos.

### 5. Domain Registry API
- **`POST /domains/register`**: Registra dominio `.midnight`.
- **`GET /domains/:name`**: Resuelve dominio a dirección ZK.
- **`GET /domains/reverse/:address`**: Búsqueda inversa de dirección a dominio `.midnight`.

### 6. Redeem API
- **`POST /redeem`**
  - **Body**: `{ "amount": "500000000", "ownerPubKey": "0x..." }`
  - **Respuesta**: Quemado de mUSDv y desembolso de colateral USDC.
