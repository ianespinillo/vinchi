# Vinchi — Arquitectura nativa en Midnight

Especificación alternativa. Privacidad transaccional real; KYC fuera de alcance por ahora.

> Documento hermano de `vinchi-arquitectura-spec.md`, que describe la arquitectura EVM. Los dos son válidos y responden a productos distintos. La decisión entre ambos es de producto, no técnica: **¿Vinchi es un protocolo DeFi con compliance limpio, o un sistema de pagos privados?** Este documento asume la segunda respuesta.

---

## Parte 0 — Qué cambia y por qué

### El diagnóstico que motiva el replanteo

En la arquitectura EVM con Midnight solo para KYC, la privacidad que se obtiene es de datos personales, no de comportamiento financiero. El grafo de pagos queda público: quién depositó cuánto, quién le pagó a qué comercio, con qué frecuencia. Para un sistema de pagos en comercios reales eso es un problema, porque los patrones de gasto son datos comerciales sensibles tanto para el usuario como para el comercio.

Agregarle privacidad a un sistema EVM por fuera no funciona. La privacidad tiene que estar en el modelo de ejecución, no encima.

### El hallazgo que hace que esto sea más simple, no más complejo

La arquitectura EVM necesitó inventar el `BatchDeque` para resolver un problema que solo existe en EVM: rastrear lotes con vencimientos distintos sobre un token fungible cuyo `balanceOf` es un solo número. De ahí salieron el DoS por gas, el storage bloat, la fusión de lotes en transferencias y el límite de 16 lotes activos.

Midnight no usa un modelo de saldos. Usa notas — el mismo modelo de Zcash. Y **un lote es una nota, nativamente**. No hay que construir nada: la estructura de datos que la arquitectura EVM tuvo que fabricar es el primitivo del sistema.

Con eso desaparecen cinco de las catorce fallas originales, no porque se resuelvan sino porque el problema no se plantea.

### Tabla de fallas heredadas

| # | Falla original | Estado en Midnight |
|---|---|---|
| F1 | Inflation attack ERC-4626 | **No aplica** — no hay vault de shares en el camino crítico |
| F2 | Loop sin límite en `balanceOf` | **No aplica** — no hay `balanceOf` global; el balance es la suma de notas del usuario, calculada en su cliente |
| F3 | Keeper único punto de falla | **No aplica** — la maduración se prueba en el circuito contra el tiempo del bloque |
| F4 | Race condition del índice | **Persiste, mitigado** — el índice sigue siendo público; ver `IndexOracle` |
| F5 | MEV / front-running de `r0` | **Reducido** — el mempool de Midnight no expone montos ni participantes |
| F6 | Reentrancy | **No aplica** — Compact no tiene llamadas externas reentrantes en el modelo de circuitos |
| F7 | Storage bloat | **Transformado** — el problema pasa a ser el crecimiento del árbol de nullifiers |
| F8 | Rebasing incompatible con wallets | **No aplica** — no hay token rebasing |
| F9 | Pausa sin granularidad | **Persiste** — se resuelve igual, con flags por circuito |
| F10 | Depeg de colateral | **Persiste** — mismo problema, misma solución |
| F11 | Sin rate limiting | **Persiste y se agrava** — limitar por dirección es difícil cuando no hay direcciones visibles |
| F12 | Subgraph crítico | **Transformado** — el usuario indexa sus propias notas localmente |
| F13 | Drift multichain | **No aplica** — una sola cadena |
| F14 | Megaeth prematuro | **No aplica** |
| E1 | Estimación de yield | **Persiste** — es el mismo problema económico |

Fallas nuevas que introduce este modelo, desarrolladas en la Parte 5:

| # | Falla nueva | Severidad |
|---|---|---|
| N1 | Pérdida de notas por el usuario = pérdida de fondos | Crítica |
| N2 | Crecimiento indefinido del árbol de nullifiers | Alta |
| N3 | Fuga de metadatos por timing y montos | Alta |
| N4 | Sin fuente de rendimiento nativa en Midnight | Crítica (producto) |
| N5 | Auditoría regulatoria sin romper la privacidad | Alta |

---

## Parte 1 — El modelo de notas

### Qué es una nota

Una nota es un compromiso criptográfico sobre un valor y sus atributos. En Vinchi:

```
Note {
    owner:      PublicKey     // a quién pertenece
    amount:     Uint<128>     // cuántos lUSDv
    maturesAt:  Uint<64>      // cuándo vence
    rateBps:    Uint<16>      // tasa prometida, para auditoría
    nonce:      Bytes<32>     // aleatorio, hace único el commitment
}
```

De esa nota se derivan dos valores:

- **Commitment** = `hash(owner, amount, maturesAt, rateBps, nonce)`. Va al árbol de Merkle público. No revela nada.
- **Nullifier** = `hash(nullifierKey, commitment)`. Se publica al gastar la nota. Impide el doble gasto sin revelar cuál nota se gastó.

El estado público de la cadena tiene solo dos cosas: el árbol de commitments y el conjunto de nullifiers. Ningún monto, ningún participante, ningún vínculo entre entrada y salida.

### Por qué esto reemplaza al deque

En EVM, para saber cuánto tiene un usuario había que sumar sus lotes on-chain, y de ahí el problema. En Midnight, las notas viven en el estado privado del usuario — en su wallet. Sumarlas es un cálculo local en su dispositivo. La cadena no lo hace y no puede hacerlo.

El límite de 16 lotes activos desaparece. La fusión de lotes en transferencias desaparece. El costo de `balanceOf` desaparece porque `balanceOf` no existe como concepto on-chain.

Lo que aparece en su lugar es N1: si el usuario pierde su estado privado, pierde sus notas, y con ellas su dinero. La cadena no puede reconstruirlo.

### El gasto es una transformación de notas

Pagar no es "restar de un saldo". Es: destruir notas de entrada, crear notas de salida, y probar que la suma se conserva.

```
Entrada:  Note(1000, vence día 30)
Salida:   Note(340, vence día 30)  → comercio
          Note(660, vence día 30)  → vuelta al usuario (cambio)
```

Es exactamente el modelo de billetes físicos: entregás uno de mil, recibís cambio. El circuito prueba que `340 + 660 == 1000` sin revelar ninguno de los tres números.

El consumo FIFO deja de ser una regla del contrato y pasa a ser una política del cliente: la wallet elige qué notas gastar. La regla del protocolo se reduce a la conservación de valor, que es lo único que realmente importa.

---

## Parte 2 — Contratos Compact

### `VinchiNotes.compact` — el núcleo

**Responsabilidad.** Custodia del árbol de commitments y el conjunto de nullifiers. Todos los circuitos de valor viven acá.

**Estado público.**

```compact
ledger {
    // Árbol de Merkle de todas las notas emitidas
    noteTree: MerkleTree<32, Field>;

    // Nullifiers gastados — impide doble gasto
    nullifiers: Set<Field>;

    // Total de USDC custodiado. Público a propósito: es la prueba de reservas.
    totalCollateral: Uint<128>;

    // Total de lUSDv en circulación. Público: verifica la solvencia.
    totalIssued: Uint<128>;

    // Raíz del árbol de comercios habilitados
    merchantRoot: Field;

    // Índice de rendimiento y su historial
    yieldIndex: Uint<192>;
    indexCheckpoints: MerkleTree<16, Field>;
}
```

**Decisión de diseño.** `totalCollateral` y `totalIssued` son públicos deliberadamente. Cualquiera puede verificar en todo momento que el protocolo tiene respaldo suficiente sin ver una sola transacción individual. Esa es exactamente la promesa de Midnight: privacidad de lo individual, transparencia de lo agregado. Un protocolo financiero que oculta también sus agregados no es privado, es opaco — y eso es indefendible frente a un usuario y frente a un regulador.

---

#### Circuito `deposit`

```
Entrada pública:   amount (visible — es una entrada de fiat/USDC)
Entrada privada:   owner, nonce
Salida pública:    nuevo commitment agregado al árbol
```

**Lógica.**

```
1. Verificar que amount está dentro de los límites vigentes
2. Leer rateBps del estimador de yield
3. grossYield  = amount * rateBps * period / (10000 * 365)
4. fee         = grossYield * FEE_BPS / 10000
5. netYield    = grossYield - fee
6. lAmount     = amount + netYield
7. commitment  = hash(owner, lAmount, now + period, rateBps, nonce)
8. noteTree.insert(commitment)
9. totalCollateral += amount
10. totalIssued    += lAmount
```

**El monto del depósito es público.** No hay forma de evitarlo: el USDC entra desde una cadena o un on-ramp externo y ese movimiento es visible. Esto es una fuga de metadatos real (N3) y hay que nombrarla: un observador ve que alguien depositó 1.000 USDC en el bloque N. Lo que no ve es a quién pertenece la nota resultante ni qué hace después con ella.

La mitigación es de producto, no criptográfica: montos de depósito estandarizados (100, 500, 1.000, 5.000) reducen la capacidad de correlacionar un depósito con un gasto posterior por coincidencia de monto.

---

#### Circuito `pay`

El circuito central. Es donde vive la privacidad transaccional.

```
Entrada privada:   notas de entrada + sus Merkle paths + nullifierKey
                   notas de salida (destinatario, montos, nonces)
                   Merkle path que prueba que el destinatario es comercio habilitado
Salida pública:    nullifiers de las notas gastadas
                   commitments de las notas creadas
```

**Lógica del circuito.**

```
1. Para cada nota de entrada:
   - Probar que su commitment está en noteTree
   - Probar conocimiento de la nullifierKey del owner
   - Verificar que su nullifier NO está en el conjunto
   - Publicar el nullifier

2. Probar conservación:
   Σ amounts de entrada == Σ amounts de salida

3. Probar que las notas de salida heredan maturesAt:
   Para cada salida: maturesAt_out == maturesAt de la entrada correspondiente

4. Probar que el destinatario es comercio habilitado:
   MerkleProof(destinatario, merchantRoot)

5. Insertar commitments de salida en noteTree
```

**Qué ve la cadena.** Una lista de nullifiers y una lista de commitments. Nada más. No se sabe cuántos lUSDv se movieron, ni de quién a quién, ni si las notas de salida son un pago o un cambio.

**Qué reemplaza al TransferGuard.** En EVM, el guard consultaba un mapping público de comercios. Acá el usuario **prueba** que el destinatario está en el árbol de comercios, sin revelar cuál. La lista de comercios habilitados sigue siendo pública (el árbol es público), pero cuál de ellos recibió el pago no lo es.

**La herencia de maduración se preserva.** Una nota que se paga a un comercio conserva su `maturesAt` original. Esto era una decisión de diseño correcta en la arquitectura EVM y se mantiene: la maduración pertenece al acto de emisión, no al tenedor.

---

#### Circuito `materialize`

Convierte una nota vencida en una nota madura, que ya no tiene restricción de circulación.

```
Entrada privada:   nota vencida + Merkle path + nullifierKey
                   checkpoint del índice en maturesAt + su Merkle path
Salida pública:    nullifier de la nota vencida
                   commitment de la nota madura
```

**Lógica.**

```
1. Probar posesión de la nota (igual que en pay)
2. Probar que maturesAt <= block.timestamp
3. Probar que el checkpoint del índice es válido contra indexCheckpoints
4. shares = amount * RAY / indexAt(maturesAt)
5. Crear nota madura con esas shares
6. Publicar nullifier y nuevo commitment
```

**Acá desaparece el keeper (F3).** No hay ningún bot que tenga que registrar nada al vencimiento. El usuario prueba en el circuito que su nota venció, contra el tiempo del bloque. Si nadie materializa nunca, no pasa nada: la nota sigue siendo válida y materializable en cualquier momento futuro.

Esta es la diferencia estructural más importante respecto a la arquitectura EVM. En EVM había que resolver el problema del keeper con historial de índices y búsqueda binaria; acá el problema no se plantea porque la prueba la genera el interesado en el momento en que le conviene.

**F4 persiste parcialmente.** El índice sigue siendo público y sigue necesitando checkpoints. La solución es la misma que en EVM: `indexCheckpoints` como árbol de Merkle de pares `(timestamp, index)`, y el usuario prueba en el circuito cuál corresponde a su `maturesAt`. La interpolación redondea hacia abajo, igual que en la versión EVM y por la misma razón.

---

#### Circuito `redeem`

```
Entrada privada:   nota madura + Merkle path + nullifierKey
Salida pública:    nullifier
                   amount a retirar (público — sale de la cadena)
                   dirección de destino (pública)
```

El retiro es público por la misma razón que el depósito: el capital sale del sistema hacia un destino externo. Se aplica la misma mitigación de montos estandarizados.

**El retiro nunca es pausable.** Igual que en la arquitectura EVM: no es cuestión de permisos, la capacidad de bloquear retiros no existe en el circuito.

---

### `MerchantRegistry.compact`

**Responsabilidad.** Mantener el árbol de Merkle de comercios habilitados.

```compact
ledger {
    merchantTree: MerkleTree<20, Field>;
    revoked: Set<Field>;
    governor: PublicKey;
}
```

**Decisión.** El árbol es público. Cualquiera puede ver la lista de comercios que aceptan Vinchi — eso es información comercial que los comercios quieren pública, es su beneficio estar en la lista. Lo privado es **cuál** recibió un pago determinado, y eso lo garantiza el circuito `pay`.

Se consideró un registro privado con pruebas de membresía ciegas. Se descartó: agrega complejidad significativa para proteger información que el interesado quiere difundir.

---

### `YieldIndex.compact`

**Responsabilidad.** Índice de rendimiento y su historial de checkpoints.

Estado público, porque todos los usuarios necesitan probar contra los mismos checkpoints y porque el rendimiento del protocolo es información agregada, no individual.

```compact
ledger {
    currentIndex: Uint<192>;
    checkpoints: MerkleTree<16, Field>;   // hash(timestamp, index)
    lastCheckpointAt: Uint<64>;
}

circuit poke(): [] {
    // Sin permisos. Cualquiera puede densificar el historial.
}
```

Mismo diseño que `IndexHistory.sol` de la arquitectura EVM, con la misma garantía de monotonicidad y el mismo redondeo conservador.

---

### `Governance.compact`

Roles, pausa por circuito y parámetros. Réplica funcional de `AccessManager` + `ModulePauser`.

```compact
ledger {
    governor: PublicKey;
    guardian: PublicKey;
    pausedCircuits: Set<Field>;   // deposit, pay, materialize — NUNCA redeem
    params: ProtocolParams;
}
```

`redeem` no puede insertarse en `pausedCircuits`: el circuito no lee ese conjunto.

---

## Parte 3 — El problema del rendimiento

### N4 — Midnight no tiene de dónde sacar yield

Esta es la falla más grave del replanteo y hay que ponerla adelante, no esconderla en un apéndice.

Vinchi promete rendimiento adelantado. Ese rendimiento tiene que generarse en algún lado. En EVM se genera en Aave, Morpho o RWA tokenizados. **En Midnight no existe ninguno de esos protocolos.** El ecosistema tiene meses de mainnet y no hay mercados de lending con liquidez.

Hay tres caminos y ninguno es gratis.

---

### Camino A — MVP con rendimiento cero

`yieldIndex` permanece en `RAY`. El protocolo emite lUSDv 1:1 con el USDC depositado, sin yield adelantado.

**Qué se pierde.** La propuesta de valor completa. Vinchi deja de ser "gastá tu rendimiento futuro" y pasa a ser "pagá con dólares digitales de forma privada".

**Qué se gana.** Un sistema completo, coherente y desplegable, que demuestra la tesis de privacidad transaccional sin ninguna dependencia externa. Toda la mecánica de notas, maduración y circulación queda validada.

**Es la versión honesta del `PassiveVault`** que la arquitectura original ya contemplaba para la v1. La diferencia es reconocer que en Midnight ese estado puede durar bastante más que unas semanas.

**Recomendación.** Es el camino correcto para el MVP. Un producto de pagos privados con dólares digitales tiene valor propio y no necesita el yield para funcionar.

---

### Camino B — Capital puenteado a EVM

El USDC depositado se puentea a Base o Arbitrum, se despliega en Aave, y el rendimiento se refleja en `yieldIndex` mediante un oráculo.

**El costo de privacidad.** Los movimientos del bridge son públicos en ambas cadenas. Un observador ve cuánto capital total tiene Vinchi y cuándo se mueve. Eso ya era público (`totalCollateral`), así que no es una fuga nueva. Lo que sí introduce es correlación temporal: si el bridge se activa poco después de un depósito grande, hay señal.

**Mitigación.** El bridge se ejecuta en lotes con cadencia fija — por ejemplo, una vez por día a hora fija, movinedo el excedente sobre el buffer. Desacopla el timing del bridge del timing de los depósitos individuales.

**El costo real es de seguridad.** El bridge es la superficie más explotada de DeFi históricamente. Todo el colateral del protocolo pasa por ahí. Y el oráculo que reporta el rendimiento desde EVM hacia Midnight es un punto de confianza: si miente, `yieldIndex` miente, y los usuarios materializan contra yield que no existe.

**Mitigación del oráculo.** El índice reportado tiene techo duro: no puede crecer más que `MAX_INDEX_GROWTH_BPS` por día, sin importar qué diga el oráculo. Un oráculo comprometido puede subreportar (perjudica al protocolo, que es la dirección segura) pero no puede inflar el índice más allá del techo.

---

### Camino C — Rendimiento desde reservas en fiat

El USDC se mantiene con un custodio regulado que lo coloca en instrumentos de corto plazo, y el rendimiento se reporta on-chain.

Es el modelo de las stablecoins con yield. Requiere estructura legal y un custodio, lo cual está lejos del alcance de un proyecto universitario, pero es el único camino que no introduce riesgo de smart contract externo.

---

### Recomendación

**MVP con Camino A.** Rendimiento cero, privacidad transaccional real, sistema completo y desplegable. El `yieldIndex` y toda la maquinaria de maduración se construyen igual — simplemente el índice no crece.

Eso mantiene la arquitectura preparada para el Camino B sin tomar hoy el riesgo del bridge. Cuando el ecosistema de Midnight tenga lending nativo, o cuando el bridge esté maduro, el índice empieza a moverse y nada más cambia.

---

## Parte 4 — Arquitectura del sistema

### Componentes

```
vinchi-midnight/
├── contracts/                        Compact
│   ├── VinchiNotes.compact           núcleo: notas, nullifiers, circuitos de valor
│   ├── MerchantRegistry.compact      árbol de comercios
│   ├── YieldIndex.compact            índice y checkpoints
│   └── Governance.compact            roles, pausa, parámetros
│
├── packages/
│   ├── sdk/                          cliente TS: notas, pruebas, sincronización
│   ├── wallet-core/                  gestión del estado privado del usuario
│   └── shared/                       tipos, constantes
│
├── apps/
│   ├── web/                          Next.js — wallet + comercio
│   ├── pos/                          interfaz de cobro para comercios
│   └── worker/                       poke del índice, bridge (camino B)
│
├── infra/
│   └── docker-compose.yml            proof server + nodo local
└── docs/
```

### Dónde vive el Proof Server

Esta es la decisión de arquitectura más consecuente del sistema y no tiene una respuesta técnicamente correcta, solo un trade-off de producto.

**Modelo A — Proof Server del usuario.** Corre en el dispositivo del usuario. Privacidad máxima: los datos privados nunca salen del dispositivo. Requiere que el usuario tenga la wallet Lace instalada con su proof server, o una app nativa que lo embeba.

**Modelo B — Proof Server del protocolo.** Vinchi lo corre; el usuario le envía sus datos privados para generar la prueba. UX de web2, pero el protocolo ve los montos y participantes durante el cómputo. La privacidad es frente a terceros, no frente a Vinchi.

**Para un sistema de pagos en comercios, el Modelo A es el único coherente con la propuesta.** Si el usuario tiene que confiarle sus datos a Vinchi para pagar, la promesa de privacidad se vuelve una promesa de política de datos, no una garantía criptográfica — y eso ya lo dan los sistemas de pago tradicionales sin necesidad de blockchain.

La consecuencia es que Vinchi necesita una app móvil que embeba el proof server, no una web. La generación de pruebas en un celular de gama media es el riesgo técnico principal de este camino y hay que medirlo temprano: si generar una prueba de pago tarda quince segundos, el producto no sirve para pagar en una caja.

**Primera tarea de la fase de investigación: medir el tiempo de generación de prueba del circuito `pay` en hardware móvil real.** Todo lo demás depende de ese número.

---

### El worker

Mucho más liviano que en la arquitectura EVM.

```
worker/
├── src/
│   ├── jobs/
│   │   ├── pokeIndex.ts        densifica checkpoints — no crítico
│   │   └── bridgeSweep.ts      solo camino B, cadencia fija
│   └── signers/midnight.ts
└── Dockerfile
```

Sin `issueCredential` (no hay KYC), sin `reconcile` (no hay attestations que reconciliar), sin `harvest` (no hay estrategia en el MVP). Queda `pokeIndex`, que no es crítico porque la materialización funciona con los checkpoints que existan.

**En el camino A, el worker es prescindible.** El protocolo funciona sin ningún proceso off-chain corriendo. Eso es una propiedad valiosa para un proyecto de MVP con recursos limitados.

---

## Parte 5 — Las fallas nuevas

### N1 — Pérdida de notas es pérdida de fondos

**El problema.** Las notas viven en el estado privado del usuario. Si pierde su dispositivo sin backup, la cadena no puede reconstruir sus fondos. Nadie puede: ese es el punto del sistema.

Es un riesgo de una categoría distinta a la de una wallet EVM. Ahí, con la seed recuperás todo porque el estado vive on-chain. Acá la seed te da las claves, pero las notas — qué commitments te pertenecen — hay que reconstruirlas.

**Solución: recuperación por escaneo determinista.** Los nonces de las notas se derivan de la seed mediante una función determinista con contador. Con la seed, el cliente puede regenerar todos los nonces posibles, calcular los commitments correspondientes y escanear el árbol buscándolos.

```
nonce_i = HKDF(seed, "vinchi-note", i)
```

La recuperación es lenta — hay que escanear el árbol — pero completa. Es el mismo mecanismo que usa Zcash con sus viewing keys.

**Solución complementaria: backup cifrado.** El cliente cifra su estado de notas con una clave derivada de la seed y lo sube a un servicio de almacenamiento. Vinchi no puede leerlo. Acelera la recuperación de horas a segundos, sin agregar confianza.

**Ambas son obligatorias antes de que haya dinero real en el sistema.** Un producto de pagos donde perder el celular es perder el dinero no es viable.

---

### N2 — Crecimiento del árbol de nullifiers

**El problema.** Cada nota gastada agrega un nullifier permanente. El conjunto solo crece. Con volumen de pagos reales, crece rápido: mil pagos diarios con tres notas de entrada promedio son un millón de nullifiers al año.

Esto no es equivalente al storage bloat de EVM (F7), que se resolvía borrando slots consumidos. Acá **no se puede borrar nada**: si se elimina un nullifier, la nota correspondiente se puede volver a gastar.

**Mitigación: épocas.** El conjunto de nullifiers se particiona por época (por ejemplo, trimestral). Las notas llevan la época en la que fueron creadas y solo pueden gastarse dentro de una ventana de épocas. Los nullifiers de épocas cerradas se archivan fuera del estado activo.

El costo es que las notas tienen fecha de expiración de gasto. Requiere que el usuario materialice y renueve antes del cierre de época. Es fricción real, pero es la única forma conocida de acotar el crecimiento sin romper la protección contra doble gasto.

**Decisión pendiente.** La duración de la época es un trade-off directo entre fricción para el usuario y crecimiento del estado. Necesita datos de uso real para calibrarse.

---

### N3 — Fuga de metadatos

Aunque los montos y participantes estén ocultos, hay señal en los bordes:

**Depósitos y retiros son públicos.** Mitigación: montos estandarizados.

**Timing.** Si un usuario deposita y paga en el mismo bloque, la correlación es directa. Mitigación: la wallet introduce demora aleatoria entre operaciones, y el usuario ve una advertencia si intenta pagar inmediatamente después de depositar.

**Cantidad de notas.** El número de nullifiers publicados en una transacción revela cuántas notas se gastaron, lo que correlaciona con el tamaño del pago. Mitigación: padding a un número fijo de entradas y salidas — el circuito siempre consume exactamente cuatro notas y produce exactamente dos, rellenando con notas de valor cero cuando hace falta. El costo es un circuito más grande y pruebas más lentas.

**El padding es obligatorio, no opcional.** Sin él, el análisis del tamaño de las transacciones desanonimiza una fracción significativa de los pagos.

---

### N5 — Auditoría regulatoria

**El problema.** Sin KYC y con transacciones privadas, Vinchi es infraestructura de pagos anónimos. Eso es un problema regulatorio serio en cualquier jurisdicción, y particularmente para un proyecto que quiere integrarse con actores regulados.

**Lo que Midnight ofrece: viewing keys.** El protocolo puede emitir claves de visualización que permiten a un auditor autorizado ver un subconjunto de transacciones sin que sean públicas. Es el mecanismo de divulgación selectiva.

**El diseño mínimo defendible.**

- Cada nota se cifra adicionalmente hacia una clave de auditoría del protocolo.
- Un regulador con esa clave puede resolver el vínculo entre commitment y participantes.
- La clave se custodia con umbral M-de-N, de modo que ninguna persona sola pueda ejercerla.
- Todo uso de la clave queda registrado on-chain.

**Esto no es opcional si el producto apunta a un mercado regulado.** Un sistema sin ninguna capacidad de auditoría no puede integrarse con nada regulado, y el análisis regulatorio original ya identificaba que operar como PSAV registrado es requisito.

**Pero hay que ser explícito con el usuario.** Un sistema con clave de auditoría no es privado frente al Estado. Es privado frente a comercios, competidores y observadores. Prometer más que eso sería deshonesto.

---

## Parte 6 — Comparación de las dos arquitecturas

| Dimensión | EVM + KYC en Midnight | Nativa en Midnight |
|---|---|---|
| Privacidad de datos personales | Alta | No aplica (sin KYC) |
| Privacidad de transacciones | **Ninguna** | **Alta** |
| Rendimiento disponible | Aave, Morpho, RWA | **Ninguno nativo** |
| Complejidad del modelo de datos | Alta (deque, índices, keeper) | **Baja (notas nativas)** |
| Fallas críticas identificadas | 3 | 2 |
| Madurez del toolchain | Muy alta | Baja (meses) |
| Auditores disponibles | Muchos | Muy pocos |
| Riesgo de pérdida de fondos por el usuario | Bajo | **Alto (N1)** |
| Requiere app móvil | No | **Sí (proof server)** |
| Viabilidad regulatoria | Alta con KYC | Requiere viewing keys |
| Esfuerzo hasta MVP | Medio | **Alto** |

### Lectura

La arquitectura nativa en Midnight es **conceptualmente más limpia**. El modelo de notas elimina cinco fallas de la arquitectura EVM porque resuelve nativamente el problema que en EVM había que fabricar una estructura de datos para resolver. Los contratos son más simples y hay menos superficie de ataque.

Pero paga tres costos que no son menores: no hay fuente de rendimiento, el toolchain tiene meses de vida, y requiere una app móvil con proof server embebido para que la propuesta de privacidad sea coherente.

**Para un MVP con fecha en octubre**, la arquitectura EVM es la ruta de menor riesgo de ejecución. **Para el producto que Vinchi dice ser** — pagos privados en comercios — la arquitectura nativa es la correcta, y la versión EVM entrega algo que no es lo que promete.

Esa contradicción no se resuelve eligiendo mejor la tecnología. Se resuelve decidiendo qué es el producto.

---

## Parte 7 — Orden de construcción

**Fase 0 — Medición.** Antes de escribir el sistema: implementar el circuito `pay` con padding de cuatro entradas y medir el tiempo de generación de prueba en un celular de gama media. Si supera los cinco segundos, el modelo A de proof server no es viable y hay que replantear antes de invertir en el resto.

**Fase 1 — Notas.** `VinchiNotes.compact` con `deposit`, `pay` y `redeem`. Sin maduración, sin yield, sin comercios. Solo la mecánica de notas y la conservación de valor.

**Fase 2 — Maduración.** `YieldIndex.compact` y el circuito `materialize`. Con índice fijo en `RAY`.

**Fase 3 — Comercios.** `MerchantRegistry.compact` y la prueba de membresía en `pay`.

**Fase 4 — Recuperación.** Derivación determinista de nonces y backup cifrado. Antes de cualquier despliegue con valor real.

**Fase 5 — Privacidad.** Padding obligatorio, demora aleatoria en el cliente, montos estandarizados.

**Fase 6 — Auditoría.** Viewing keys con custodia de umbral.

**Fase 7 — Gobernanza.** Roles, pausa por circuito, parámetros.

**Fuera del MVP.** Rendimiento (camino B con bridge), épocas de nullifiers, app POS para comercios.