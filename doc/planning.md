# Vinchi — Especificación de arquitectura y repositorio

Documento de diseño técnico. Cada archivo del repositorio con su responsabilidad, invariantes y las fallas que resuelve.

---

## Parte 0 — Índice de fallas y soluciones

Las catorce fallas identificadas en el análisis de riesgos, con la solución arquitectural que las resuelve. Varias fallas se resuelven con una sola decisión de diseño: eso es señal de que la solución es correcta.

| # | Falla | Severidad | Solución | Archivo |
|---|---|---|---|---|
| F1 | Inflation attack en ERC-4626 | Crítica | Virtual shares + dead shares sembradas en deploy | `VinchiVault4626.sol` |
| F2 | Loop sin límite en `balanceOf` → DoS por gas | Crítica | Ring buffer deque + agregado incremental O(1) | `BatchDeque.sol` |
| F3 | Keeper único punto de falla | Crítica | Historial de índices + búsqueda binaria, sin keeper | `IndexHistory.sol` |
| F4 | Race condition en `rebaseIndexAtMaturity` | Alta | Misma solución que F3 — interpolación por timestamp | `IndexHistory.sol` |
| F5 | MEV / front-running de la tasa `r0` | Alta | TWAP sobre historial + techo de desviación | `YieldEstimator.sol` |
| F6 | Reentrancy en el orquestador | Alta | CEI estricto + guard transitorio + adapter aislado | `Conductor.sol`, `StrategyAdapter.sol` |
| F7 | Storage bloat del registro de lotes | Alta | Reclamo automático del deque + prune incentivado | `BatchDeque.sol` |
| F8 | Rebasing incompatible con wallets | Media | Token wrapper no-rebasing (patrón wstETH) | `WrappedMaturedUSDv.sol` |
| F9 | Pausa sin granularidad | Media | Flags por selector; retiros nunca pausables | `ModulePauser.sol` |
| F10 | Depeg de USDC | Media | Circuit breaker por oráculo en depósito | `PegGuard.sol` |
| F11 | Sin rate limiting en depósitos | Media | Caps por dirección, por época y globales | `DepositLimiter.sol` |
| F12 | Subgraph como infra crítica | Infra | Vistas O(1) on-chain + fallback RPC en el SDK | `BatchLens.sol` |
| F13 | Drift de configuración multichain | Infra | Config declarativa + CREATE2 + reconciliación en CI | `ChainConfig.ts` |
| F14 | Megaeth prematuro en producción | Infra | Tiers de red; solo tier 1 en producción | `chains.ts` |
| E1 | Estimación de yield determina rentabilidad | Económica | MA ponderada + buffer configurable | `YieldEstimator.sol` |

---

## Parte 1 — Las cuatro decisiones que reordenan la arquitectura

### Decisión 1 — El deque reemplaza al registro de lotes

**Problema original.** El `BatchRegistry` guardaba `userBatchIds[]` como array y `balanceOf` iteraba sobre él sumando los lotes no vencidos. Costo lineal en cantidad de lotes, sin techo, con `SLOAD` frío de 2.100 gas cada uno. Un usuario con muchos lotes puede volver su propia cuenta intransferible.

**Observación que resuelve el problema.** Los lotes de un usuario tienen dos órdenes que son el mismo orden:

- Se consumen en FIFO — el más viejo primero.
- Maduran en orden cronológico — el más viejo primero.

Si los dos órdenes coinciden, no hace falta una estructura que permita acceso arbitrario. Alcanza una cola de doble punta: se agrega por la cola, se consume y madura por la cabeza.

**Estructura.**

```solidity
struct Slot {
    uint128 amount;      // lUSDv en este lote
    uint64  maturesAt;   // timestamp de maduración
    uint64  rateBps;     // tasa prometida, para auditoría
}

struct Deque {
    mapping(uint256 => Slot) slots;
    uint32 head;              // primer lote vivo
    uint32 tail;              // siguiente posición libre
    uint128 activeTotal;      // suma de lotes NO vencidos — mantenido incrementalmente
    uint128 maturedTotal;     // suma de lotes vencidos, pendientes de materializar
}
```

`balanceOf` devuelve `activeTotal`. Una sola lectura. No itera nunca.

Los totales se actualizan en escritura: al depositar suma, al gastar resta, al madurar mueve de `activeTotal` a `maturedTotal`. El único momento en que se recorren slots es el avance de la cabeza, que procesa como máximo los lotes efectivamente vencidos desde la última interacción — acotado por `MAX_ADVANCE_PER_CALL`.

**Qué resuelve.** F2 (sin iteración), F7 (los slots consumidos se borran con `delete`, generando reembolso de gas y liberando storage).

**Garantía de acotación.** `MAX_ACTIVE_BATCHES = 16`. Un depósito que excedería el límite revierte con `TooManyActiveBatches`, indicando al usuario que materialice lotes vencidos primero. El límite es configurable por gobernanza dentro de un rango duro de 8 a 32.

---

### Decisión 2 — El historial de índices elimina al keeper

**Problema original.** Un bot externo llamaba `checkpointBatch(batchId)` al vencimiento para fijar `rebaseIndexAtMaturity`. Si el bot fallaba, los usuarios de ese lote quedaban sin poder materializar. Si el bot llegaba tarde, el índice capturado era mayor al correcto y los holders recibían shares subsidiadas por depósitos futuros.

**Solución.** No se fija nada al vencimiento. Se registra un checkpoint `(timestamp, index)` en cada interacción con el vault, y al materializar se busca el índice correspondiente al `maturesAt` del lote mediante búsqueda binaria sobre ese historial.

```solidity
struct Checkpoint {
    uint64  timestamp;
    uint192 index;       // RAY (1e27)
}
```

Al materializar un lote con `maturesAt = T`:

1. Búsqueda binaria del último checkpoint con `timestamp <= T`.
2. Búsqueda del primer checkpoint con `timestamp > T`.
3. Interpolación lineal entre ambos para obtener el índice en `T`.

La interpolación lineal es exacta cuando el índice crece linealmente entre checkpoints, y en un vault con acumulación continua eso es correcto dentro del error de redondeo. La interpolación siempre redondea **hacia abajo**, de modo que cualquier error residual favorece al protocolo y nunca a un usuario individual — una invariante de solvencia debe ser conservadora en la dirección correcta.

**Qué resuelve.** F3 (no hay keeper que pueda fallar; la materialización es autosuficiente), F4 (el índice se calcula para el instante exacto de maduración, no para el momento en que un bot llegó a escribir).

**Garantía de disponibilidad de checkpoints.** Si nadie interactúa con el vault durante un período largo, podría no haber checkpoint posterior a `maturesAt`. En ese caso la materialización usa el último checkpoint disponible y lo extiende con la tasa registrada del vault hasta `T`, con techo en el índice actual. Cualquiera puede además llamar `poke()` — una función sin permisos que solo escribe un checkpoint — para densificar el historial. No es necesaria para la corrección, solo mejora la precisión.

**Acotación del historial.** Checkpoints con granularidad mínima de una hora: si el último checkpoint tiene menos de `MIN_CHECKPOINT_GAP` de antigüedad, se sobrescribe en lugar de agregarse. El historial crece como máximo 24 entradas por día, 8.760 por año. La búsqueda binaria sobre esa magnitud son ~14 iteraciones. Aceptable.

---

### Decisión 3 — El estimador de yield es un módulo, no una constante

**Hallazgo del análisis estadístico.** Con estimación spot, el protocolo pierde en esperanza. Con media móvil larga o promesa conservadora, gana con probabilidad de pérdida cercana a cero. La diferencia entre las dos configuraciones es la diferencia entre un protocolo viable y uno insolvente.

Esto significa que la tasa prometida no puede ser un parámetro pasado al `Conductor` ni un número leído del vault en el momento del depósito. Es una decisión de política con consecuencias de solvencia y merece su propio módulo, su propia superficie de gobernanza y sus propios tests.

**Interfaz.**

```solidity
interface IYieldEstimator {
    /// @return rateBps tasa anual en basis points que el protocolo promete
    /// @return confidence 0-10000, qué tan confiable es la estimación
    function estimate(uint256 periodDays) external view returns (uint16 rateBps, uint16 confidence);
}
```

**Implementación de referencia — `TwapYieldEstimator`.**

1. Lee el historial de índices del vault y calcula la tasa realizada en la ventana `WINDOW_DAYS` (por defecto 60, conforme al resultado del análisis).
2. Aplica el factor de buffer: `promised = realized * (10000 - BUFFER_BPS) / 10000`, con `BUFFER_BPS` por defecto 2000, es decir se promete el 80%.
3. Aplica un techo absoluto: `promised = min(promised, HARD_CAP_BPS)`. Impide que una manipulación del vault subyacente se traduzca en una promesa desmedida.
4. Aplica un techo relativo: la tasa prometida no puede superar en más de `MAX_DEVIATION_BPS` la media de largo plazo. Esto es la defensa contra el escenario de F5.

**Qué resuelve.** E1 (la política de estimación es explícita, testeable y auditable), F5 (una TWAP de 60 días no puede moverse de forma significativa dentro de un bloque, así que manipular la utilización del vault subyacente no produce beneficio para el atacante).

---

### Decisión 4 — El vault se separa del protocolo por un adapter

**Problema original.** El `LockedVault` invertía directamente en protocolos externos. Cualquier llamada externa en el camino del `Conductor` abre ventana de reentrancy, y un exploit del protocolo subyacente se propaga directamente al núcleo de Vinchi.

**Solución.** Tres capas con responsabilidades separadas:

- `VinchiVault4626` — contabilidad de shares. Nunca llama a un protocolo externo. Solo mantiene el balance de USDC y el índice.
- `StrategyAdapter` — la única superficie que toca protocolos externos. Se lo invoca desde funciones de mantenimiento (`harvest`, `rebalance`), nunca desde el camino de depósito o retiro del usuario.
- `IStrategy` — implementaciones concretas (Aave, RWA, passive).

El usuario deposita y retira contra el buffer de liquidez del vault. La estrategia se mueve de forma asincrónica. Un exploit en Aave no puede reentrar durante el depósito de un usuario porque durante el depósito no se llama a Aave.

**Qué resuelve.** F6 (el camino de usuario no tiene llamadas externas, por lo que no hay superficie de reentrancy en la ruta crítica), y acota el radio de daño de un exploit en el protocolo subyacente al capital efectivamente desplegado, no al total del vault.

**Ratio de buffer.** El vault mantiene `BUFFER_BPS` del total en USDC líquido (por defecto 10%). Si un retiro excede el buffer, entra en cola de retiro diferido en lugar de forzar un desmonte de emergencia de la estrategia. Este es el patrón de ERC-7540 y evita que un retiro grande se convierta en pérdida por slippage.

---

## Parte 2 — Árbol del repositorio

```
vinchi/
├── apps/
│   ├── web/                              Next.js — Vercel
│   └── worker/                           Proceso persistente — Docker local
├── packages/
│   ├── contracts-evm/                    Foundry — núcleo del protocolo
│   ├── contracts-midnight/               Compact — KYC privado (V2, aislado)
│   ├── sdk/                              Cliente TypeScript
│   └── shared/                           ABIs, tipos, direcciones, config
├── subgraph/                             The Graph
├── infra/                                Docker, IaC, CI
└── docs/
```

Cuatro reglas estructurales:

1. `contracts-midnight` no comparte toolchain con nada. Si se atrasa, el MVP sigue.
2. `shared` es la única fuente de verdad de direcciones y ABIs. Los ABIs se generan desde Foundry, nunca se escriben a mano.
3. `worker` es el único componente que no puede vivir en Vercel, y contiene todo lo que necesita estado vivo. Corre en Docker local durante el desarrollo; el destino de producción se decide más adelante.
4. Ningún paquete importa de `apps/`. Las dependencias van siempre de `apps` hacia `packages`.

---

## Parte 3 — `packages/contracts-evm`

### 3.1 Librerías — `src/libraries/`

Se construyen primero porque todo lo demás depende de ellas y porque son lo más fácil de testear exhaustivamente de forma aislada.

---

#### `BatchDeque.sol`

**Responsabilidad.** Estructura de datos de lotes por usuario. Cola de doble punta sobre mapping, con agregados incrementales.

**Resuelve.** F2, F7.

**API.**

```solidity
library BatchDeque {
    struct Slot {
        uint128 amount;
        uint64  maturesAt;
        uint64  rateBps;
    }

    struct Data {
        mapping(uint256 => Slot) slots;
        uint32  head;
        uint32  tail;
        uint128 activeTotal;
        uint128 maturedTotal;
    }

    function push(Data storage d, uint128 amount, uint64 maturesAt, uint64 rateBps) internal;
    function consume(Data storage d, uint128 amount) internal returns (uint128 consumed);
    function advance(Data storage d, uint64 nowTs, uint32 maxSteps) internal returns (uint32 advanced);
    function activeCount(Data storage d) internal view returns (uint32);
    function peekHead(Data storage d) internal view returns (Slot memory);
}
```

**Invariantes.**

- `activeTotal + maturedTotal == Σ slots[i].amount` para todo `i` en `[head, tail)`.
- `head <= tail` siempre.
- `slots[i].maturesAt <= slots[i+1].maturesAt` — el orden temporal se preserva porque solo se agrega por la cola con `maturesAt` monótono creciente.
- `activeCount() <= MAX_ACTIVE_BATCHES`.

**Notas de implementación.**

`consume` recorre desde `head` restando hasta agotar el monto pedido. Como los lotes se consumen completos salvo el último parcial, el costo amortizado es constante: cada slot se toca a lo sumo dos veces en su vida (una al crearse, una al consumirse).

`advance` mueve lotes vencidos de `activeTotal` a `maturedTotal` y borra los slots ya consumidos con `delete` para obtener el reembolso de gas. El parámetro `maxSteps` acota el costo de una sola llamada; si quedan lotes por avanzar se procesan en la siguiente interacción. Esto garantiza que ninguna transacción pueda quedar bloqueada por acumulación histórica.

`push` revierte con `TooManyActiveBatches` si `activeCount() >= MAX_ACTIVE_BATCHES` después de intentar `advance`. El intento previo de avance es importante: un usuario con 16 lotes vencidos debe poder depositar sin fricción.

---

#### `IndexHistory.sol`

**Responsabilidad.** Historial de checkpoints del índice del vault con búsqueda binaria e interpolación.

**Resuelve.** F3, F4.

**API.**

```solidity
library IndexHistory {
    struct Checkpoint {
        uint64  timestamp;
        uint192 index;        // RAY
    }

    struct Data {
        Checkpoint[] points;
        uint64 minGap;        // segundos mínimos entre checkpoints
    }

    function write(Data storage d, uint192 index) internal;
    function indexAt(Data storage d, uint64 targetTs) internal view returns (uint192);
    function latest(Data storage d) internal view returns (Checkpoint memory);
}
```

**Invariantes.**

- `points[i].timestamp < points[i+1].timestamp` — estrictamente creciente.
- `points[i].index <= points[i+1].index` — el índice nunca decrece. Un vault que pierde capital no baja el índice; la pérdida se socializa por otro mecanismo explícito (ver `VinchiVault4626.reportLoss`).
- `indexAt(t)` para `t` entre dos checkpoints devuelve un valor entre ambos, redondeado hacia abajo.

**Notas de implementación.**

`write` compara con el último checkpoint: si `block.timestamp - last.timestamp < minGap`, sobrescribe en lugar de agregar. Esto acota el crecimiento del array sin perder precisión relevante.

`indexAt` con `targetTs` posterior al último checkpoint extrapola con la tasa implícita del último intervalo, con techo en el índice actual del vault. Nunca devuelve un valor mayor al índice presente — de lo contrario un lote podría materializar contra yield que aún no existe.

`indexAt` con `targetTs` anterior al primer checkpoint devuelve `RAY` (índice inicial). Solo puede ocurrir para lotes creados antes del primer checkpoint, lo que el `Conductor` impide escribiendo un checkpoint en el deploy.

**La interpolación redondea hacia abajo, siempre.** El error de redondeo se acumula a favor del protocolo. Esto es deliberado: una invariante de solvencia debe fallar en la dirección segura.

---

#### `RebaseMath.sol`

**Responsabilidad.** Conversiones entre shares y balances para el token rebasing.

**API.**

```solidity
library RebaseMath {
    function toShares(uint256 amount, uint256 index) internal pure returns (uint256);
    function toAmount(uint256 shares, uint256 index) internal pure returns (uint256);
    function toSharesUp(uint256 amount, uint256 index) internal pure returns (uint256);
}
```

**Regla de redondeo.** Al mintear shares se redondea hacia abajo (el usuario recibe menos). Al quemar shares para retirar se redondea hacia arriba (el usuario entrega más). Ambas direcciones favorecen al protocolo. Esta asimetría es la defensa estándar contra ataques de redondeo acumulativo.

---

#### `PegGuard.sol`

**Responsabilidad.** Verificación de que el colateral mantiene su paridad antes de aceptar depósitos.

**Resuelve.** F10.

**API.**

```solidity
library PegGuard {
    struct Config {
        address oracle;           // Chainlink USDC/USD
        uint256 maxDeviationBps;  // por defecto 200 = 2%
        uint256 maxStaleness;     // por defecto 3600s
    }

    function check(Config storage c) internal view returns (bool ok, uint256 price);
}
```

**Comportamiento.** Si el precio se desvía más de `maxDeviationBps` de 1 USD, o el dato del oráculo tiene más de `maxStaleness` de antigüedad, `check` devuelve `false`. El `Conductor` revierte los depósitos nuevos pero **nunca los retiros**. Un depeg no debe atrapar el capital de los usuarios; debe impedir que entre capital nuevo a un sistema cuya premisa está rota temporalmente.

**Nota.** El oráculo introduce una dependencia externa, que es exactamente la clase de riesgo que se documentó en el análisis. La mitigación es que su única capacidad es **bloquear depósitos**, nunca liberar fondos ni alterar contabilidad. Un oráculo comprometido puede causar denegación de servicio en depósitos, no pérdida de fondos.

---

#### `Errors.sol` y `Events.sol`

Errores personalizados y eventos centralizados. Los errores personalizados son más baratos que los strings de `require` y facilitan el testing preciso con `vm.expectRevert`. Los eventos se centralizan porque el subgraph depende de sus firmas y un cambio accidental rompe el indexado en silencio.

---
### 3.2 Núcleo — `src/core/`

---

#### `Conductor.sol`

**Responsabilidad.** Punto de entrada único del protocolo. Orquesta depósito, gasto, materialización y retiro. No contiene lógica de negocio propia: compone módulos.

**Resuelve.** F6 (parcialmente), y es el punto donde se aplican F9, F10, F11.

**API.**

```solidity
function deposit(uint256 amount, uint16 periodDays) external returns (uint256 lMinted);
function materialize(address user, uint32 maxSteps) external returns (uint256 mMinted);
function redeem(uint256 mAmount, address receiver) external returns (uint256 assets);
function poke() external;
```

**Orden de operaciones en `deposit` — CEI estricto.**

```
1. CHECKS
   - pauser.requireNotPaused(DEPOSIT)
   - pegGuard.check() → revierte si hay depeg
   - limiter.checkAndRecord(msg.sender, amount)
   - validar periodDays ∈ ALLOWED_PERIODS
   - kycRegistry.requireVerified(msg.sender)

2. EFFECTS
   - (rateBps, confidence) = estimator.estimate(periodDays)
   - revertir si confidence < MIN_CONFIDENCE
   - grossYield  = amount * rateBps * periodDays / (10000 * 365)
   - protocolFee = grossYield * FEE_BPS / 10000
   - netYield    = grossYield - protocolFee
   - lMinted     = amount + netYield
   - deque.advance(...)  ← libera slots vencidos antes de agregar
   - deque.push(lMinted, maturesAt, rateBps)
   - obligations += netYield        ← contabilidad de deuda del protocolo
   - feesAccrued += protocolFee

3. INTERACTIONS
   - USDC.safeTransferFrom(msg.sender, vault, amount)
   - vault.recordDeposit(amount)    ← sin llamadas externas hacia afuera
   - lUSDv.mint(msg.sender, lMinted)
```

La única transferencia externa es de USDC, un token conocido y sin hooks. `vault.recordDeposit` es contabilidad interna: no toca la estrategia. La estrategia se mueve en `harvest`, fuera del camino del usuario.

**`nonReentrant` con `ReentrancyGuardTransient`.** EIP-1153 hace el guard significativamente más barato que la versión con storage. Se aplica a las cuatro funciones públicas.

**Contabilidad de obligaciones.** `obligations` acumula el yield neto prometido y aún no generado. Es el número que hace verificable la invariante de solvencia: `vault.totalAssets() >= totalPrincipal + obligations`. Sin este registro explícito, la solvencia del protocolo no es comprobable on-chain.

---

#### `BatchRegistry.sol`

**Responsabilidad.** Envoltura del `BatchDeque` por usuario, con control de acceso. Solo el `Conductor` escribe.

**API.**

```solidity
function push(address user, uint128 amount, uint64 maturesAt, uint64 rateBps) external onlyConductor;
function consume(address from, uint128 amount) external onlyConductor returns (uint128);
function advance(address user, uint32 maxSteps) external returns (uint32);
function activeBalanceOf(address user) external view returns (uint128);
function maturedBalanceOf(address user) external view returns (uint128);
function activeCountOf(address user) external view returns (uint32);
function nextMaturityOf(address user) external view returns (uint64);
```

**Nota sobre `advance`.** Es la única función sin restricción de acceso. Cualquiera puede avanzar la cola de cualquier usuario, porque hacerlo solo puede beneficiar a ese usuario (mueve lotes vencidos a materializable) y nunca lo perjudica. Esto elimina la necesidad de que el usuario o un keeper lo hagan.

**Vistas O(1).** `activeBalanceOf`, `maturedBalanceOf`, `activeCountOf` y `nextMaturityOf` leen agregados mantenidos incrementalmente. El frontend puede construir la vista completa de un usuario con cuatro llamadas RPC constantes, sin subgraph. Esto es la solución a F12.

---

#### `AccessManager.sol`

**Responsabilidad.** Roles y autorización centralizada.

**Roles.**

| Rol | Puede | Custodia sugerida |
|---|---|---|
| `GOVERNOR` | Cambiar parámetros, agregar estrategias, rotar roles | Multisig 3-de-5, timelock 48h |
| `GUARDIAN` | Pausar módulos. No puede despausar retiros | Multisig 2-de-3, sin timelock |
| `STRATEGIST` | Ejecutar `harvest` y `rebalance` dentro de límites | EOA operativa con caps |
| `KYC_ISSUER` | Emitir y revocar attestations | Worker con clave en TEE |

**El asimetría de `GUARDIAN` es deliberada.** Puede pausar depósitos instantáneamente sin timelock, porque una respuesta rápida a un exploit vale más que la protección contra un guardian malicioso en esa dirección. No puede pausar retiros bajo ninguna circunstancia — esa capacidad no existe en el contrato, no es cuestión de permisos.

---

#### `ModulePauser.sol`

**Responsabilidad.** Pausa granular por operación.

**Resuelve.** F9.

```solidity
enum Op { DEPOSIT, MATERIALIZE, TRANSFER, HARVEST }

function pause(Op op) external onlyGuardian;
function unpause(Op op) external onlyGovernor;
function requireNotPaused(Op op) external view;
```

`REDEEM` no está en el enum. Los retiros no son pausables por construcción, no por configuración. Un usuario siempre puede sacar su capital.

Pausar y despausar son asimétricos: `GUARDIAN` pausa sin demora, solo `GOVERNOR` despausa. Esto evita que un guardian comprometido pueda reabrir un módulo que se cerró por una razón válida.

---

#### `DepositLimiter.sol`

**Responsabilidad.** Límites de tasa y concentración.

**Resuelve.** F11.

```solidity
struct Limits {
    uint128 maxPerDeposit;      // tamaño máximo de un lote individual
    uint128 maxPerUserEpoch;    // por dirección por época
    uint128 maxGlobalTvl;       // techo total del vault
    uint32  epochLength;        // por defecto 86400
}
```

**Por qué importa.** El análisis estadístico mostró que el peor escenario de pérdida es un lote grande depositado en un momento de tasa alta. Un cap por depósito acota la exposición del protocolo a ese escenario individual. El cap global de TVL es la protección contra crecer más rápido de lo que la estrategia puede absorber sin degradar el rendimiento.

Los límites se elevan por gobernanza con timelock, de forma progresiva. Un protocolo nuevo arranca con caps bajos y los sube a medida que acumula historial operativo.

---

### 3.3 Vault — `src/vault/`

---

#### `VinchiVault4626.sol`

**Responsabilidad.** Contabilidad de shares conforme a ERC-4626. Mantiene el índice y su historial. No llama a protocolos externos.

**Resuelve.** F1, y habilita F3 y F4 al ser el dueño del `IndexHistory`.

**Defensa contra inflation attack — dos capas.**

Primera: `_decimalsOffset()` devuelve 6. La implementación de OpenZeppelin usa shares virtuales derivadas del offset, lo que hace que el ataque de donación tenga un costo que crece exponencialmente con el offset y un beneficio que tiende a cero. Con offset 6, un atacante necesitaría donar del orden de un millón de veces el depósito de la víctima para robar una fracción.

Segunda: en el deploy, el contrato mintea `DEAD_SHARES` a sí mismo con un depósito semilla del protocolo. Esas shares nunca se pueden retirar — el contrato no tiene función para hacerlo. Establece un `totalSupply` distinto de cero desde el bloque de deploy, cerrando la ventana de primer depositante por completo.

Las dos son redundantes a propósito. La segunda cuesta el depósito semilla, y ese costo es despreciable frente a la clase de exploit que evita.

**API adicional.**

```solidity
function recordDeposit(uint256 assets) external onlyConductor;
function recordWithdraw(uint256 assets) external onlyConductor;
function reportProfit(uint256 amount) external onlyAdapter;
function reportLoss(uint256 amount) external onlyAdapter;
function indexAt(uint64 timestamp) external view returns (uint192);
function currentIndex() external view returns (uint192);
function bufferRatio() external view returns (uint256);
```

**`reportLoss` es explícito.** Si la estrategia pierde capital, el índice **no baja** — eso rompería la monotonicidad de la que depende el `IndexHistory`. En cambio, la pérdida se registra en un acumulador `unrealizedLoss` que reduce `totalAssets()` sin tocar el índice. Los usuarios que materializan reciben el yield que el índice indica; si el vault no tiene activos para cubrirlo, entra el mecanismo de socialización de `ReserveBuffer`.

**Buffer de liquidez.** El vault mantiene `BUFFER_BPS` en USDC líquido. `bufferRatio()` expone el estado actual para que el `StrategyAdapter` sepa cuándo rebalancear.

---

#### `StrategyAdapter.sol`

**Responsabilidad.** Única superficie de contacto con protocolos externos. Aislado del camino de usuario.

**Resuelve.** F6.

```solidity
function harvest() external onlyStrategist whenNotPaused(HARVEST);
function rebalance() external onlyStrategist;
function emergencyExit() external onlyGuardian;
function setStrategy(address newStrategy) external onlyGovernor;  // timelock
```

**Regla dura.** Ninguna función de `Conductor` llama a `StrategyAdapter`. La verificación es estática y debe estar en el CI: un script que analiza el grafo de llamadas y falla el build si existe un camino desde `Conductor.deposit` hasta cualquier dirección externa que no sea USDC o un contrato del propio protocolo.

**`emergencyExit`.** Retira todo el capital de la estrategia al buffer del vault. Es la palanca que se acciona ante un exploit del protocolo subyacente. No requiere timelock: la velocidad importa más que la deliberación en ese escenario, y la operación solo puede mover fondos hacia una posición más segura.

---

#### `strategies/PassiveStrategy.sol`

Rendimiento cero. Existe para la v1 y para los tests de integración: permite ejercitar todo el flujo de lotes, maduración, transferencias y materialización sin que un bug en la lógica de inversión contamine el debugging del núcleo.

**No es código descartable.** Queda en producción como estrategia de fallback: si `emergencyExit` se acciona, el vault opera contra `PassiveStrategy` hasta que la gobernanza designe una nueva.

---

#### `strategies/AaveV3Strategy.sol`

Implementación de referencia de rendimiento. Deposita en Aave V3, cosecha en `harvest`.

**Límites obligatorios.** Porcentaje máximo del vault desplegable en una sola estrategia (`MAX_ALLOCATION_BPS`, por defecto 9000), y verificación de que el mercado de Aave objetivo tiene liquidez suficiente para un retiro del tamaño de la posición antes de aumentar la asignación.

---
### 3.4 Tokens — `src/tokens/`

---

#### `LockedUSDv.sol`

**Responsabilidad.** ERC-20 restringido al ecosistema. Cantidad fija por lote, sin rebasing.

```solidity
function _update(address from, address to, uint256 value) internal override {
    if (from != address(0) && to != address(0)) {
        guard.requireAllowed(from, to);
        registry.consume(from, uint128(value));
        registry.pushTransferred(to, uint128(value));
    }
    super._update(from, to, value);
}
```

**Punto delicado.** Cuando un usuario transfiere lUSDv a un comercio, los lotes con su maduración viajan con el monto. El comercio recibe lotes que heredan el `maturesAt` original. Esto es correcto: la maduración pertenece al acto de emisión, no al tenedor. Un comercio que recibe un pago el día 25 de un lote de 30 días puede materializar 5 días después.

`pushTransferred` inserta en el deque del destinatario respetando el orden de maduración. Como el deque asume orden monótono y una transferencia puede traer un lote más viejo que los existentes del destinatario, se necesita inserción ordenada. Para acotar el costo, la inserción se hace solo en la cabeza o la cola: si el lote entrante no encaja en ninguno de los dos extremos, se fusiona con el lote existente de maduración más cercana **posterior**, redondeando la maduración hacia adelante. El destinatario nunca se ve perjudicado por más de un período de fusión, y la estructura mantiene su orden.

**Alternativa considerada y descartada.** Insertar en posición arbitraria con desplazamiento de slots. Costo lineal, reintroduce F2 por la puerta de atrás.

---

#### `MaturedUSDv.sol`

**Responsabilidad.** ERC-20 rebasing. El balance crece con el índice del vault.

```solidity
function balanceOf(address a) public view override returns (uint256) {
    return RebaseMath.toAmount(_shares[a], vault.currentIndex());
}
```

**Contabilidad interna en shares.** `_shares` es el estado real; `balanceOf` es una vista derivada. Transferencias, aprobaciones y quemas operan sobre shares para evitar drift por redondeo.

---

#### `WrappedMaturedUSDv.sol`

**Responsabilidad.** Envoltorio no-rebasing de mUSDv. Balance fijo, valor creciente.

**Resuelve.** F8.

```solidity
function wrap(uint256 mAmount) external returns (uint256 wAmount);
function unwrap(uint256 wAmount) external returns (uint256 mAmount);
function exchangeRate() external view returns (uint256);
```

Es el patrón de wstETH y resuelve el mismo problema. Los exploradores de bloques, agregadores y protocolos que asumen que el balance solo cambia con transferencias funcionan con el token envuelto sin ninguna adaptación. El usuario que quiere ver su rendimiento reflejado en el balance usa mUSDv; el que quiere integrarse con infraestructura estándar usa wmUSDv.

Es una capa de compatibilidad de treinta líneas y elimina toda una clase de problemas de integración. Debe existir desde el día uno, no como agregado posterior.

---

### 3.5 Registros — `src/registry/`

---

#### `TransferGuard.sol`

**Responsabilidad.** Decide si una transferencia de lUSDv está permitida.

```solidity
function requireAllowed(address from, address to) external view;
function isAllowed(address from, address to) external view returns (bool);
```

**Política.** El destino debe ser comercio aprobado o el propio `Conductor`. El origen debe tener KYC verificado si no es comercio.

**Separado del token a propósito.** La política de transferencia cambia con la regulación y con la evolución del producto; el token no debería redesplegarse por eso. El guard es reemplazable por gobernanza con timelock.

---

#### `MerchantRegistry.sol`

Registro de comercios aprobados. Alta y baja por `GOVERNOR`. Almacena un hash del identificador fiscal (CUIT) para trazabilidad regulatoria sin exponer el dato en claro.

---

#### `KycRegistry.sol`

**Responsabilidad.** Estado de verificación por dirección, con verificador enchufable.

```solidity
interface IKycVerifier {
    function isVerified(address user) external view returns (bool);
    function verifiedAt(address user) external view returns (uint64);
}

function setVerifier(address v) external onlyGovernor;   // timelock
function requireVerified(address user) external view;
```

**El verificador es una interfaz, no una implementación.** Esto es lo que permite que Midnight entre en V2 sin tocar el núcleo:

- `EasKycVerifier` — lee attestations de EAS. Es la implementación del MVP.
- `MidnightKycVerifier` — verifica una prueba ZK puenteada. Es la V2.
- `MockKycVerifier` — para tests.

Cambiar de EAS a Midnight es una transacción de gobernanza, no una migración. Esta es la decisión que hace que la pregunta de Midnight no bloquee el MVP.

---

### 3.6 Estimación — `src/estimator/`

---

#### `TwapYieldEstimator.sol`

**Responsabilidad.** Calcula la tasa que el protocolo promete. Es el módulo con mayor impacto sobre la solvencia.

**Resuelve.** E1, F5.

```solidity
struct Params {
    uint32 windowDays;         // 60
    uint16 bufferBps;          // 2000 → promete 80% de lo estimado
    uint16 hardCapBps;         // 1500 → nunca promete más de 15% APY
    uint16 maxDeviationBps;    // 500 → máx 5pp sobre la media larga
    uint16 minConfidenceBps;   // 7000
}

function estimate(uint256 periodDays) external view returns (uint16 rateBps, uint16 confidence);
```

**Algoritmo.**

```
1. i_now  = vault.currentIndex()
   i_past = vault.indexAt(now - windowDays * 1 days)
2. realizedApr = (i_now / i_past - 1) * 365 / windowDays
3. longRunApr  = ventana de 180 días, mismo cálculo
4. capped      = min(realizedApr, longRunApr + maxDeviationBps)
5. capped      = min(capped, hardCapBps)
6. rateBps     = capped * (10000 - bufferBps) / 10000
7. confidence  = f(densidad de checkpoints, dispersión de la ventana)
```

**Por qué cada paso.** El paso 2 es el hallazgo estadístico: una ventana de 60 días en lugar de la tasa spot. El paso 4 es la defensa contra manipulación: aunque un atacante infle la utilización del vault subyacente, la desviación permitida sobre la media de 180 días está acotada. El paso 6 es el buffer que convierte la esperanza de ganancia de negativa a positiva.

**`confidence`.** Si el historial de checkpoints en la ventana es escaso o la dispersión de tasas es alta, la confianza baja. El `Conductor` revierte los depósitos por debajo de `minConfidenceBps`. Es preferible rechazar un depósito que prometer un yield sobre una estimación mala.

**Estos parámetros son la palanca de riesgo del protocolo.** Cualquier cambio debe pasar por timelock de 48 horas y debe estar acompañado de la simulación que lo justifica. El repositorio incluye el modelo de Monte Carlo en `packages/contracts-evm/analysis/` para que ese análisis sea reproducible por cualquiera.

---

#### `ReserveBuffer.sol`

**Responsabilidad.** Absorber el descalce cuando el vault rinde menos de lo prometido.

```solidity
function accrueFee(uint256 amount) external onlyConductor;
function coverShortfall(uint256 amount) external onlyConductor returns (uint256 covered);
function reserveRatio() external view returns (uint256);
```

Los fees del protocolo se acumulan acá antes de ser retirables. Solo el excedente sobre `MIN_RESERVE_BPS` de las obligaciones pendientes puede retirarse. Si `coverShortfall` no alcanza a cubrir el faltante, se emite `ShortfallUncovered` y el protocolo entra en modo restringido: sin depósitos nuevos hasta que la reserva se reconstituya.

El modelo estadístico indicó que con estimación MA-60 y buffer del 20%, la probabilidad de que la reserva se agote es cercana a cero. Este contrato existe para el caso en que el modelo esté equivocado.

---

### 3.7 Lectura — `src/periphery/`

---

#### `BatchLens.sol`

**Responsabilidad.** Vistas agregadas para el frontend en una sola llamada.

**Resuelve.** F12.

```solidity
struct UserView {
    uint128 activeBalance;
    uint128 maturedBalance;
    uint128 wrappedBalance;
    uint32  activeCount;
    uint64  nextMaturity;
    uint16  currentRateBps;
    bool    kycVerified;
}

function userView(address user) external view returns (UserView memory);
function protocolView() external view returns (ProtocolView memory);
```

Contrato sin estado, no upgradeable, redesplegable libremente. El SDK lo llama cuando el subgraph no responde. Con esto el frontend nunca depende de infraestructura de indexado para funcionar — el subgraph pasa a ser una optimización de historial, no una dependencia crítica.

---
## Parte 4 — Tests

### 4.1 Invariantes — `test/invariant/`

Los tests de invariantes son el entregable de mayor valor de todo el repositorio. Son lo que un auditor mira primero y lo que detecta las clases de bug que los tests unitarios no alcanzan.

---

#### `Solvency.t.sol`

**Invariante.** `vault.totalAssets() + reserve.balance() >= totalPrincipal + obligations`

Es la invariante maestra. Si se rompe, el protocolo debe más de lo que tiene. El handler debe incluir el caso adversario: depósitos en momentos de tasa alta seguidos de caída sostenida del rendimiento del vault, que es exactamente el escenario de pérdida que el modelo de Monte Carlo identificó.

---

#### `BatchConservation.t.sol`

**Invariante.** Para todo usuario: `deque.activeTotal + deque.maturedTotal == lUSDv.balanceOf(user)`

Detecta cualquier camino donde el token y el registro se desincronicen. La transferencia con fusión de lotes es el escenario de mayor riesgo acá.

---

#### `DequeBounds.t.sol`

**Invariantes.**
- `activeCount(user) <= MAX_ACTIVE_BATCHES` para todo usuario
- El gas de `balanceOf` es constante e independiente del historial

El segundo se verifica con `vm.snapshotGas` sobre una cuenta con historial largo. Es el test que prueba que F2 está efectivamente resuelto y no solo mitigado.

---

#### `IndexMonotonic.t.sol`

**Invariantes.**
- `indexAt(t1) <= indexAt(t2)` para `t1 < t2`
- `indexAt(t) <= currentIndex()` para todo `t`
- La interpolación nunca sobreestima

El segundo es el que impide materializar contra yield inexistente.

---

#### `NoExternalCallOnUserPath.t.sol`

Verifica con `vm.expectCall` que ninguna llamada a `Conductor.deposit`, `materialize` o `redeem` toca una dirección externa que no sea USDC. Complementa la verificación estática del CI. Es la prueba de que F6 está cerrado por construcción.

---

#### `EstimatorSafety.t.sol`

**Invariante.** `estimate(p) <= hardCapBps` y `estimate(p) <= longRunApr + maxDeviationBps` bajo cualquier manipulación del índice del vault dentro de un bloque.

El handler incluye un actor que intenta inflar el índice con donaciones directas. Es el test de F5.

---

### 4.2 Fuzzing dirigido — `test/fuzz/`

- `BatchDeque.fuzz.t.sol` — secuencias aleatorias de push/consume/advance contra una implementación de referencia en memoria.
- `RebaseMath.fuzz.t.sol` — round-trip de shares y montos verificando que el redondeo siempre favorece al protocolo.
- `IndexHistory.fuzz.t.sol` — interpolación contra un cálculo exacto en aritmética de mayor precisión.

---

### 4.3 Fork tests — `test/fork/`

Contra estado real de mainnet o testnet: comportamiento de `AaveV3Strategy` en condiciones de liquidez reales, y simulación del escenario de depeg de USDC de marzo de 2023 con datos históricos del oráculo.

---

## Parte 5 — Configuración e infraestructura

### 5.1 `packages/shared/src/chains.ts`

**Resuelve.** F13, F14.

```typescript
export enum ChainTier {
  PRODUCTION = 1,   // auditado, liquidez profunda, oráculos maduros
  BETA       = 2,   // funcional, caps reducidos
  EXPERIMENTAL = 3, // solo testnet
}

export const CHAINS = {
  base:      { tier: ChainTier.PRODUCTION,   maxTvl: 50_000_000n },
  arbitrum:  { tier: ChainTier.PRODUCTION,   maxTvl: 50_000_000n },
  optimism:  { tier: ChainTier.BETA,         maxTvl:  5_000_000n },
  megaeth:   { tier: ChainTier.EXPERIMENTAL, maxTvl:          0n },
} as const;
```

El deploy script rechaza desplegar en tier 3 con configuración de producción. Megaeth queda documentado como objetivo futuro sin ser un riesgo operativo presente.

---

### 5.2 `packages/shared/src/config/parameters.ts`

Fuente única de verdad de todos los parámetros del protocolo, por cadena. El script de deploy los lee de acá y el job de reconciliación del CI compara el estado on-chain contra este archivo, fallando el build ante cualquier divergencia.

Esto es lo que resuelve F13: la configuración no puede driftar entre cadenas porque hay un solo lugar donde se declara y una verificación automática de que la realidad lo refleja.

---

### 5.3 `script/Deploy.s.sol`

Deploy determinista con CREATE2. La misma versión del código produce las mismas direcciones en todas las cadenas, lo que hace la verificación cruzada trivial.

Orden: librerías → `AccessManager` → `ModulePauser` → `IndexHistory` inicial → `VinchiVault4626` (con siembra de dead shares) → tokens → registros → estimador → `Conductor` → wiring de roles → `BatchLens`.

**La siembra de dead shares ocurre en el mismo bloque que el deploy del vault**, no en una transacción posterior. Cualquier ventana entre ambos es exactamente la ventana del inflation attack.

---

### 5.4 `apps/worker/`

```
worker/
├── src/
│   ├── index.ts                    loop principal, graceful shutdown
│   ├── queue/consumer.ts           pgmq de Supabase
│   ├── jobs/
│   │   ├── issueCredential.ts      Midnight (V2)
│   │   ├── pokeVault.ts            densifica el historial de índices
│   │   ├── harvest.ts              cosecha de estrategia
│   │   └── reconcile.ts            Didit vs. attestations on-chain
│   ├── signers/{evm,midnight}.ts
│   └── monitoring/health.ts
├── Dockerfile
├── docker-compose.yml              worker + proof server + .env local
└── .env.example
```

**Ejecución local.** El `docker-compose.yml` levanta el worker junto al Proof Server en la misma red, comunicándose por nombre de servicio. Un solo `docker compose up` deja el entorno completo andando contra la testnet.

```yaml
services:
  proof-server:
    image: midnightntwrk/proof-server:latest
    command: midnight-proof-server -v
    ports: ["6300:6300"]
  worker:
    build: .
    environment:
      PROOF_SERVER_URL: http://proof-server:6300
    env_file: .env
    depends_on: [proof-server]
    restart: unless-stopped
```

`restart: unless-stopped` es lo que reemplaza al `min-instances` de un entorno gestionado: si el proceso cae, Docker lo vuelve a levantar. Para desarrollo alcanza.

**La seed del issuer va en `.env`, nunca en el compose.** El `.env.example` documenta las variables sin valores. El `.env` real queda en `.gitignore` desde el primer commit.

**`pokeVault` no es crítico.** Con la solución de `IndexHistory`, si el worker muere el protocolo sigue funcionando: la materialización interpola con los checkpoints disponibles. El worker solo mejora la precisión. Esta es la diferencia entre la arquitectura original y esta: el componente off-chain pasó de ser un punto único de falla a ser una optimización.

**`reconcile` es el control de compromiso de clave.** Compara la cantidad de verificaciones aprobadas en Didit contra la cantidad de attestations emitidas on-chain. Una divergencia indica que la clave del issuer se está usando fuera del flujo legítimo. Corre cada hora y alerta ante cualquier diferencia.

---

### 5.5 `.github/workflows/ci.yml`

Jobs obligatorios:

1. `forge fmt --check`, `forge build --sizes`
2. `forge test` — unitarios, integración, invariantes
3. `forge coverage` — mínimo 90% en `src/core` y `src/libraries`
4. `slither` y `aderyn` — análisis estático
5. **`check-external-calls`** — script propio que falla si existe un camino desde el camino de usuario del `Conductor` hacia una dirección externa no permitida
6. **`check-config-drift`** — compara estado on-chain contra `parameters.ts` en todas las cadenas desplegadas
7. `forge script Deploy --fork` — el deploy debe funcionar en cada PR

Los jobs 5 y 6 son verificaciones específicas de este diseño. Sin ellos, F6 y F13 pueden reintroducirse en un refactor sin que nadie lo note.

---

## Parte 6 — Orden de construcción

**Fase 1 — Librerías.** `BatchDeque`, `IndexHistory`, `RebaseMath`, `Errors`, `Events`. Con fuzzing completo antes de avanzar. Son la base de todo y los bugs acá se propagan a todo lo demás.

**Fase 2 — Vault pasivo.** `VinchiVault4626` con `PassiveStrategy`. Yield cero. Permite validar toda la contabilidad de shares e índices sin variable financiera.

**Fase 3 — Tokens y registros.** `LockedUSDv`, `MaturedUSDv`, `WrappedMaturedUSDv`, `TransferGuard`, `MerchantRegistry`, `KycRegistry` con `MockKycVerifier`.

**Fase 4 — Estimador y reserva.** `TwapYieldEstimator`, `ReserveBuffer`. Con el modelo de Monte Carlo del repositorio calibrando los parámetros.

**Fase 5 — Conductor.** Recién cuando todas las piezas funcionan aisladas. Es composición, no lógica nueva.

**Fase 6 — Invariantes sobre el conjunto.** El sistema completo bajo fuzzing.

**Fase 7 — Periferia.** `BatchLens`, SDK, subgraph, frontend.

**Fase 8 — Estrategia real.** `AaveV3Strategy` con fork tests. Última porque es la que introduce riesgo externo.

**Paralelo, sin bloquear.** `contracts-midnight` y `EasKycVerifier`. La interfaz `IKycVerifier` permite que ambos avancen sin tocar el núcleo.

---

## Parte 7 — Lo que queda pendiente de decidir

Cuestiones que la arquitectura deja abiertas a propósito y que requieren una decisión de producto antes de producción:

**Fusión de lotes en transferencia.** La solución propuesta redondea la maduración hacia adelante en el caso de inserción intermedia. Es correcta y acotada, pero perjudica marginalmente al receptor. La alternativa es rechazar transferencias que producirían inserción intermedia, lo que es más justo pero degrada la UX. Requiere decisión.

**Modelo del Proof Server para usuarios.** Si Vinchi corre el Proof Server, ve los datos privados durante el cómputo. Si lo corre el usuario, la UX es inviable para pagos en comercios. Esto determina qué se le puede prometer al usuario sobre privacidad y qué se le declara al regulador.

**Multi-issuer para el KYC.** Un solo issuer es un punto único de compromiso. Un esquema M-de-N es más seguro pero más complejo operativamente. Con el volumen del free tier de Didit, un issuer con rotación y reconciliación horaria probablemente alcanza para el MVP.

**Cola de retiros diferidos.** El buffer del 10% cubre la operación normal. El comportamiento ante un retiro que lo excede — cola ERC-7540 o desmonte forzado de estrategia — necesita definición antes de que haya capital real en juego.