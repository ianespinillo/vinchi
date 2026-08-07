# Flujo de Privacidad ZK (Zero-Knowledge Architecture)

## Modelo Criptográfico ZK de Midnight

Vinchi utiliza el patrón ZK **Note / Nullifier / Merkle Tree** inspirado en los estándares de privacidad de Midnight Network.

```mermaid
graph LR
    subgraph Frontend Private State
        Note["📝 Note (owner, amount, maturesAt, nonce)"]
        Commitment["🔒 Commitment = PoseidonHash(Note)"]
        NullifierKey["🔑 NullifierKey = KDF(Seed)"]
        Nullifier["🚫 Nullifier = PoseidonHash(NullifierKey, Note.nonce)"]
    end

    subgraph Ledger Public State
        MerkleRoot["🌳 Merkle Tree Root"]
        NullifierSet["🚫 Spent Nullifier Set"]
        ZKProof["⚡ ZK Proof Data"]
    end

    Note --> Commitment
    Commitment --> MerkleRoot
    NullifierKey & Note --> Nullifier
    Nullifier --> NullifierSet
    ZKProof -->|verifyProof| Ledger Public State
```

## Revelado vs. Cifrado

| Elemento | Visibilidad | Propósito |
| :--- | :--- | :--- |
| **Nullifiers** | 🌐 Público en Ledger | Evita doble gasto de notas consumidas |
| **Commitments** | 🌐 Público en Ledger | Agregados al Merkle Tree acumulador |
| **Merkle Root** | 🌐 Público en Ledger | Prueba de pertenencia de notas |
| **Importes (Amounts)** | 🔒 Cifrado Off-chain | Solo conocido por emisor y receptor |
| **Destinatario (Recipient)** | 🔒 Cifrado Off-chain | Cifrado punto a punto en notas locales |
