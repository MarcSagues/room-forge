# RoomForge — Arquitectura

> Estado: **borrador para aprobación** (Fase 0) · 2026-10-08
> Decisiones individuales: [ADR/](ADR/) · Modelo de datos: [DOMAIN_MODEL.md](DOMAIN_MODEL.md) · Investigación de rendimiento: [research/R3F_PERFORMANCE.md](research/R3F_PERFORMANCE.md)

## 0. Resumen ejecutivo

- **Un monorepo pnpm mínimo** con dos piezas: `packages/core` (TypeScript puro: dominio, comandos, historial, serialización — **sin React, sin three, sin DOM**) y `apps/web` (Next.js 16 con *static export*, UI, motor de escena R3F, persistencia IndexedDB).
- **Todo cambio del documento pasa por un Comando.** Los comandos producen *patches* de Immer → undo/redo gratis, serializable, testeable, reutilizable por la IA y por una futura colaboración.
- **El estado se divide en capas** (documento / sesión de editor / UI / interacción transitoria). Lo que cambia 60 veces por segundo **nunca** pasa por React ni por el historial.
- **Render bajo demanda** (`frameloop="demand"`), suscripciones granulares por entidad, recursos compartidos con conteo de referencias y un **pool fijo de luces** con presupuesto por calidad.
- **Local-first sin backend** en el MVP: IndexedDB + exportación JSON + enlaces con la escena comprimida en el fragmento de la URL. Postgres/cuentas quedan detrás de una interfaz (`ProjectRepository`) para la Fase 9.
- **Hosting**: Cloudflare (estático). Se evita Vercel Hobby porque su plan gratuito es solo para uso no comercial (incompatible con la monetización prevista).
- **Sin sobreingeniería**: nada de microservicios, ni ECS, ni CRDT, ni WebGPU, ni React Compiler en el MVP. Cada uno tiene su punto de revisión documentado.

## 1. Cambios propuestos respecto al stack inicial (justificados)

| Propuesta del brief | Decisión | Justificación | ADR |
|---|---|---|---|
| Next.js | **Mantener**, con `output: 'export'` (SPA estática) en el MVP | Landing/SEO/OG y backend futuro en la misma base. El motor no depende de Next: si estorba, el editor migra a Vite sin tocar `core` ni `scene-engine`. | [0002](ADR/0002-nextjs-static-export.md) |
| Repo único | **Monorepo pnpm con 2 paquetes** (`core`, `web`) | La pureza del motor se garantiza por *construcción* (el paquete no declara `react`/`three`/DOM), no por disciplina. Permite testear en Node en milisegundos y reutilizar `core` en el servidor (validación, IA). | [0001](ADR/0001-monorepo-core-package.md) |
| Zustand como estado | **Mantener** (`zustand/vanilla` en core, hooks en web) + Immer para el documento | Zustand ya es dependencia interna de R3F; vanilla permite que `core` no dependa de React. | [0003](ADR/0003-state-and-commands.md) |
| IndexedDB | **Mantener** vía `idb` (envoltorio de ~1 KB) tras `ProjectRepository` | Dexie es más potente de lo necesario; no hay consultas complejas. | [0004](ADR/0004-persistence-indexeddb.md) |
| «Hosting gratuito compatible con Next.js» | **Cloudflare** (Workers static assets / Pages) | Vercel Hobby = solo no comercial. Ver [DEPLOYMENT](DEPLOYMENT.md). | [0005](ADR/0005-hosting-cloudflare.md) |
| ESLint/Prettier (implícito) | **Biome 2** + dependency-cruiser | Una sola herramienta rápida; las fronteras arquitectónicas se verifican con dependency-cruiser. | [0008](ADR/0008-tooling.md) |
| Assets 3D | **Estrategia híbrida** GLB CC0 + objetos paramétricos; decisión final tras spike | Es el riesgo n.º 1 del proyecto. | [0007](ADR/0007-asset-strategy.md) |

Versiones verificadas en el registro npm el 2026-10-08 (se fijan definitivamente en P1-01): Next 16.4, React 19.3, three 0.186, @react-three/fiber 9.8 (peer `react >=19 <19.4`), @react-three/drei 10.7, Zustand 5.0, Immer 11, zod 4.6, Tailwind 4.3, Vitest 5, Playwright 1.64, Biome 2.5. TypeScript 7.0 es la última versión, pero se **fija 6.0.3**: Next 16.4 compila con ambas, mientras que dependency-cruiser (que hace cumplir las fronteras) aún no soporta TS ≥ 7 (verificado en P1-01; ver [ADR-0008](ADR/0008-tooling.md)).

## 2. Vista de capas

```mermaid
flowchart TB
  subgraph WEB["apps/web (Next.js static export)"]
    direction TB
    APP["app/ — rutas Next (/, /editor, /projects, /view)"]
    UI["ui/ — React + shadcn: paneles, barras, diálogos"]
    EDB["editor/ — puente: hooks, herramientas, atajos"]
    SCN["scene-engine/ — R3F + three: render, cámara, picking, interacción"]
    AST["asset-library/ — manifiesto, carga de modelos, CatalogProvider"]
    PER["persistence/ — IndexedDB, autosave, import/export, enlaces"]
    EXP["export/ — PNG, miniaturas"]
    AI["ai/ — (vacío en MVP) puerto LayoutGenerator"]
  end
  subgraph CORE["packages/core (TS puro, sin DOM)"]
    DOM["domain/ — tipos + schemas zod"]
    CMD["commands/ — comandos del documento"]
    HIS["history/ — undo/redo, coalescing"]
    SES["session/ — EditorSession, store, eventos, selección"]
    GEO["geometry/ — snap, huellas, placement solver"]
    SER["serialization/ — formato, migraciones, validación"]
    PORTS["ports/ — ProjectRepository, CatalogProvider, Clock, IdGen"]
  end

  APP --> UI
  UI --> EDB
  EDB --> SES
  EDB --> SCN
  SCN --> SES
  SCN --> AST
  EXP --> SCN
  PER --> SES
  PER --> SER
  AST --> PORTS
  AI -.futuro.-> CMD
  SES --> CMD
  SES --> HIS
  CMD --> DOM
  CMD --> GEO
  SER --> DOM
```

### 2.1 Responsabilidades y reglas de dependencia

| Módulo | Responsabilidad | Puede importar | NO puede importar |
|---|---|---|---|
| `core/domain` | Tipos y schemas del documento | `zod` | todo lo demás |
| `core/geometry` | Matemática 2D/3D pura (snap, OBB, ray–plane) | `domain` | three, DOM |
| `core/commands` | Mutaciones válidas del documento | `domain`, `geometry`, `immer` | three, DOM, React |
| `core/history` | Pila undo/redo, coalescing | `immer` (patches) | three, DOM, React |
| `core/session` | `EditorSession`: estado, ejecución, eventos, selección | `commands`, `history`, `zustand/vanilla` | three, DOM, React |
| `core/serialization` | Formato de archivo, migraciones, validación de import | `domain`, `zod` | three, DOM |
| `web/scene-engine` | three/R3F: render, cámara, picking, controladores de interacción | `core`, three, R3F, drei, `asset-library` | `ui/` |
| `web/asset-library` | Manifiesto de catálogo, carga/caché de modelos, `CatalogProvider` | `core`, three (loaders) | `ui/`, `scene-engine` internos |
| `web/persistence` | Adaptadores IndexedDB, autosave, share links | `core`, `idb`, `fflate` | `ui/`, three |
| `web/export` | PNG/miniaturas | `scene-engine` (vía interfaz `RendererHandle`) | `ui/` |
| `web/editor` | Hooks `useEditor`, `useDocument(selector)`, herramientas, atajos | `core`, `scene-engine` (API pública) | detalles internos de three |
| `web/ui` | Componentes React/shadcn | `editor`, `core` (solo tipos) | `scene-engine` internals, `persistence` |
| `web/ai` | Puerto + adaptadores futuros | `core` | `ui/` |

Reglas **verificadas por herramientas** (no por convención):

1. `core` no declara `react`, `three` ni tipos DOM (`"lib": ["ES2023"]` en su `tsconfig`): usar `window`/`document` es un **error de compilación**.
2. `dependency-cruiser` (`pnpm check:deps`, en CI) aplica la matriz anterior dentro de `apps/web/src`.
3. Las únicas importaciones entre módulos web van por el `index.ts` público de cada módulo.

### 2.2 Estructura de carpetas objetivo

```text
roomforge/
├─ apps/web/
│  ├─ src/
│  │  ├─ app/                  # rutas Next (client-only para el editor)
│  │  ├─ ui/                   # componentes y paneles
│  │  ├─ editor/               # hooks, tools, shortcuts
│  │  ├─ scene-engine/         # R3F + three
│  │  │   ├─ canvas/ camera/ room/ objects/ lighting/ interaction/ resources/
│  │  ├─ asset-library/        # manifest/, loaders/, provider.ts
│  │  ├─ persistence/
│  │  ├─ export/
│  │  └─ ai/                   # vacío (puerto)
│  ├─ public/assets/           # models/*.glb, thumbs/*.webp (hash en nombre)
│  └─ e2e/                     # Playwright
├─ packages/core/
│  └─ src/ domain/ geometry/ commands/ history/ session/ serialization/ ports/ testing/
├─ tools/                      # scripts de catálogo y planificación
├─ docs/
└─ .github/
```

## 3. Gestión del estado (4 capas)

```mermaid
flowchart LR
  subgraph L1["1. Documento (undoable, persistente)"]
    D[SceneDocument<br/>rooms · objects · openings · lighting]
  end
  subgraph L2["2. Estado de sesión de editor (no undoable)"]
    S[selección · herramienta activa · hover · modo de pared]
  end
  subgraph L3["3. Estado de UI (preferencias)"]
    U[tamaños de panel · tema · calidad gráfica · diálogos]
  end
  subgraph L4["4. Interacción transitoria (60 Hz)"]
    T[fantasma de arrastre · puntero · cámara en movimiento]
  end
  D -- patches --> H[(Historial)]
  L4 -- "commit al soltar: UN comando" --> D
  D --> React
  S --> React
  U --> React
  L4 -. "refs + three, SIN React" .-> Canvas
```

| Capa | Dónde vive | Undo | Persistencia | Tecnología |
|---|---|---|---|---|
| Documento | `core/session` | Sí | IndexedDB / JSON | `zustand/vanilla` + Immer (inmutable, estructural compartida) |
| Sesión de editor | `core/session` | No | No | `zustand/vanilla` |
| UI | `web/ui` | No | `localStorage` (por usuario/navegador) | Zustand + `persist` |
| Interacción transitoria | `scene-engine` | No | No | Refs, objetos reutilizables, `useFrame` |

**Regla de oro:** si un valor cambia en cada `pointermove` o en cada frame, **no** va a React state, ni al store del documento, ni al historial. Se escribe en refs/objetos three y, si algún panel necesita verlo (p. ej. X/Z mientras se arrastra), se publica en un *transient store* leído por ese único componente y limitado a 1 actualización por frame.

## 4. Sistema de comandos e historial

### 4.1 Contrato

```ts
// packages/core/src/commands/types.ts  (ilustrativo — se implementa en P2-02)
export interface Command<A = unknown> {
  readonly type: string;                 // 'object/move'
  readonly label: string;                // texto para «Deshacer: Mover escritorio»
  readonly mergeKey?: string;            // para coalescing (p. ej. `move:${id}`)
  apply(draft: Draft<SceneDocument>, ctx: CommandContext): void;  // muta el borrador de Immer
}
export type CommandResult =
  | { ok: true; patches: Patch[]; inverse: Patch[] }
  | { ok: false; error: CommandError };  // nunca lanza por validación de dominio
```

`EditorSession.execute(cmd)` ejecuta `produceWithPatches`, **valida invariantes** (§4.3), actualiza el store, empuja el historial y emite `document:changed`. Si un invariante falla, el documento **no cambia** y se devuelve `{ ok:false }`.

### 4.2 Flujo de un arrastre (el caso crítico para UX y rendimiento)

```mermaid
sequenceDiagram
  actor U as Usuario
  participant I as InteractionController (scene-engine)
  participant G as core/geometry (placement solver)
  participant O as Object3D (ref)
  participant T as TransientStore
  participant S as EditorSession (core)
  participant H as History
  participant P as Autosave

  U->>I: pointerdown sobre objeto
  I->>S: select(id)            %% no undoable
  loop cada pointermove (máx. 1/frame)
    U->>I: pointermove (rayo)
    I->>G: solve(rayo, objeto, sala, snaps)
    G-->>I: transform candidato + válido/inválido
    I->>O: set position/rotation (mutación directa)
    I->>T: publish(x, z)         %% solo lo lee el panel de propiedades
    I->>I: invalidate()          %% frameloop="demand"
  end
  U->>I: pointerup
  I->>S: execute(MoveObjects{id, transform final})
  S->>H: push(patches, inverse, mergeKey)
  S-->>I: document:changed  (solo re-renderiza ESA entidad)
  S-->>P: document:changed → autosave (debounce 1,5 s)
  U->>S: Ctrl+Z → aplica inverse patches
```

Esc durante el arrastre → restaura el transform original **sin** tocar el documento ni el historial.

### 4.3 Invariantes del documento (verificados tras cada comando)

| ID | Invariante |
|---|---|
| I1 | Todos los IDs son únicos y las referencias (`roomId`, `parentId`, `openings.roomId`) existen. |
| I2 | La jerarquía `parentId` es acíclica y de profundidad ≤ 2 (MVP). |
| I3 | Objetos de suelo: huella OBB contenida en la sala (con tolerancia 1 mm). |
| I4 | Aperturas: dentro de la longitud de la pared, sin solaparse entre sí, dentro de la altura. |
| I5 | Dimensiones de sala dentro de límites (2–12 m lado, 2,2–4 m alto; configurables). |
| I6 | `catalogId` desconocido **no es error**: se conserva con marcador (no se pierde información al importar). |
| I7 | Valores numéricos finitos (sin NaN/Infinity). |

Las invariantes se prueban con **tests basados en propiedades** (fast-check): para cualquier secuencia aleatoria de comandos válidos, `undo` completo ⇒ documento original; `undo+redo` ⇒ igual; los invariantes se mantienen.

### 4.4 Historial

- Entrada: `{ label, patches, inverse, mergeKey?, at }`. Límite: 200 entradas (configurable).
- **Coalescing:** comandos consecutivos con el mismo `mergeKey` dentro de 600 ms se fusionan (p. ej. teclear en un campo numérico, mover con flechas).
- **Gestos:** `session.beginGesture(label)` agrupa varios comandos en **una** entrada (p. ej. «Colocar kit de escritorio»).
- El historial **no se persiste** entre sesiones en el MVP (se documenta como mejora futura; el autoguardado cubre la pérdida de datos).
- La selección y el estado de herramienta **no** se deshacen (convención de editores profesionales).

### 4.5 Catálogo de comandos del MVP

| Dominio | Comandos |
|---|---|
| Sala | `room/create`, `room/resize`, `room/setSurfaceMaterial` |
| Aperturas | `opening/add`, `opening/move`, `opening/resize`, `opening/remove` |
| Objetos | `object/add`, `object/move`, `object/rotate`, `object/setProps`, `object/setMaterial`, `object/remove`, `object/duplicate`, `object/reparent` |
| Luz | `light/set` (on, color, intensidad, efecto) |
| Escena | `scene/setLightingMode` (día/noche), `scene/setSettings` |
| Compuestos | `batch` / gestos |

## 5. Eventos

Emisor tipado mínimo en `core/session` (≈30 líneas, sin dependencias). Sirve para efectos laterales desacoplados: autosave, invalidación de render, analítica.

| Evento | Payload | Consumidores |
|---|---|---|
| `document:changed` | `{ patches, source: 'command'|'undo'|'redo'|'load' }` | autosave, scene-engine (`invalidate`), analítica |
| `history:changed` | `{ canUndo, canRedo, undoLabel, redoLabel }` | UI (botones, tooltips) |
| `selection:changed` | `{ ids }` | scene-engine (contorno), panel propiedades |
| `gesture:started/ended` | `{ label }` | autosave (pausa durante gesto) |
| `session:error` | `{ error }` | toasts, telemetría local |

El estado **reactivo** de la UI se obtiene del store (`useStore(store, selector)`); los eventos son para *efectos*, no para pintar.

## 6. Motor de escena (`scene-engine`)

### 6.1 Principios

1. **El documento manda, three obedece.** El motor no guarda estado de negocio; proyecta `SceneDocument` a objetos three.
2. **Una vista por entidad:** `<ObjectView id>` se suscribe **solo** a `objects[id]` (selector + `React.memo`). La lista de IDs se suscribe con `useShallow`. Mover un objeto re-renderiza *un* componente.
3. **Registro de refs:** `Map<EntityId, Object3D>` para que los controladores de interacción muten sin pasar por React.
4. **Los controladores son clases TypeScript** (`MoveController`, `RotateController`, `PlaceFromCatalogController`, `OpeningController`) que reciben eventos de puntero normalizados y devuelven transform + validez. La matemática vive en `core/geometry` (testeable sin WebGL).
5. **Cámara:** `CameraControls` (drei) sobre dos cámaras (perspectiva y ortográfica superior). Transiciones suaves, encuadre automático a la sala.
6. **Picking barato:** *colliders proxy* (una caja invisible por objeto) en vez de raycast contra mallas completas; arrastre por **intersección analítica rayo–plano** (no raycast contra el suelo).
7. **Paredes estilo Sims:** modos *arriba / corte / abajo*; las paredes que miran a la cámara se atenúan por producto escalar cámara–normal.

### 6.2 Bucle de render bajo demanda

```mermaid
flowchart LR
  subgraph Triggers
    A[document:changed]
    B[Cámara se mueve - controls change]
    C[Resize / cambio de calidad]
    D[Efecto RGB animado activo]
  end
  A --> INV[invalidate]
  B --> INV
  C --> INV
  D --> RAF["bucle limitado 30 fps\n(solo mientras haya efectos)"] --> INV
  INV --> R["R3F renderiza UN frame\n(frameloop='demand')"]
```

- Sin cambios ⇒ **0 frames, 0 % GPU** (batería y ventiladores).
- Si hay luminarias con efecto animado, un único *ticker* (≤30 fps) llama a `invalidate()`; se apaga solo cuando no quedan efectos.
- El arrastre usa `invalidate()` por cada actualización de puntero (coalescido por R3F).

### 6.3 Estrategias de rendimiento (resumen; detalle y fuentes en [research/R3F_PERFORMANCE.md](research/R3F_PERFORMANCE.md))

| # | Estrategia | Aplicación en RoomForge |
|---|---|---|
| 1 | `frameloop="demand"` + `invalidate()` | Todo el editor. |
| 2 | Nada de `setState` en `useFrame`/`pointermove` | Refs + objetos three + transient store. |
| 3 | Suscripciones granulares | `ObjectView` por entidad; selectores estables. |
| 4 | **Sin crear objetos en el bucle** | Vector3/Quaternion/Matrix4 reutilizables (scratch). |
| 5 | Compartir geometrías, materiales y texturas | `ResourceRegistry` con conteo de referencias; `useGLTF` con caché. |
| 6 | **Cuidado con `dispose` automático** | R3F libera recursos al desmontar; los compartidos se protegen (`dispose={null}`) o los gestiona el registry. |
| 7 | No montar/desmontar «etapas» | Alternar `visible` (techo, paredes en vista superior, modo día/noche). |
| 8 | **Pool fijo de luces** | Cambiar el *número* de luces recompila shaders; se reservan N luces al inicio y se reasignan (N según calidad). |
| 9 | Presupuesto de luces | Luminarias ordenadas por importancia; las que no caben se muestran solo como emisivo + bloom. |
| 10 | Sombras acotadas | 1 sombra direccional (sol) ajustada a la sala; `autoUpdate=false`; sin sombras de luces puntuales por defecto. |
| 11 | Presupuestos de assets | ≤20 k tris/objeto (hero ≤50 k), texturas ≤1024², Meshopt/Draco, WebP/KTX2. |
| 12 | Calidad adaptativa | `PerformanceMonitor` + `dpr` adaptativo + `performance.regress()` al orbitar. |
| 13 | Instancing | **No en MVP** (≤300 objetos). Umbral de adopción: >300 draw calls. |
| 14 | Postproceso mínimo | Solo bloom selectivo; desactivado en calidad baja. |
| 15 | Entorno sin descargas | `Lightformer` procedural en vez de HDRI pesado. |
| 16 | Medición continua | `renderer.info` (draw calls/triángulos) en tests; presupuesto en CI (P7-03). |

### 6.4 Next.js + R3F

- El editor es **client-only** (`'use client'` + `dynamic(..., { ssr: false })`); la landing no carga three.
- `next.config`: `output: 'export'`, `images: { unoptimized: true }`, `trailingSlash: true`.
- El código de `scene-engine` no importa nada de `next/*`.
- React Strict Mode: R3F v9 avisa de efectos duplicados en desarrollo; los controladores se escriben idempotentes (cleanup simétrico).

### 6.5 Iluminación (resumen; detalle en P5-05/P5-06)

- **Luminarias** = objetos del catálogo con capacidad `light` (tira, barra, panel, lámpara, neón). Cada una declara su *coste* de luz.
- Visual emisivo (material con `toneMapped=false`) para **todas**; luz real solo para las que caben en el pool.
- **Día:** luz direccional con sombra (sol) + hemisférica; entorno `Lightformer`; color de cielo visible por ventanas.
- **Noche:** ambiente bajo azulado, sin sol; luces de usuario dominan; bloom activo según calidad.
- Transición día↔noche animada interpolando parámetros (sin remontar nada).

### 6.6 Exportación PNG

- No se usa `preserveDrawingBuffer` (penaliza todo el render). Se renderiza a un **`WebGLRenderTarget` fuera de pantalla** (MSAA 4×) con tamaño de exportación, se lee a un canvas 2D y `toBlob`.
- Opciones: 1×/2×/4× (límite por memoria/`MAX_TEXTURE_SIZE`), fondo transparente opcional, ocultar rejilla/gizmos.
- Debe pasar por el mismo pipeline que el viewport (incluye bloom) para que «lo que ves es lo que exportas».

## 7. Biblioteca de assets (`asset-library`)

```mermaid
flowchart LR
  SRC[Fuentes CC0 / creación propia / paramétrico] --> PIPE["tools/catalog: gltf-transform\n(dedupe, prune, meshopt, texturas WebP/KTX2)"]
  PIPE --> GLB["public/assets/models/*.glb (hash)"]
  PIPE --> THUMB["miniaturas WebP"]
  MAN["manifest/*.json (zod)"] --> VAL["pnpm catalog:validate\n(presupuestos, licencias, dimensiones)"]
  GLB --> VAL
  MAN --> PROV["CatalogProvider (implementa puerto de core)"]
  PROV --> CORE["core: valida huellas, soportes, límites"]
  PROV --> SCN["scene-engine: carga perezosa + placeholders"]
```

- **El manifiesto es la fuente de verdad** del item: dimensiones reales, tipo de colocación (`floor | wall | ceiling | tabletop`), superficies de soporte, ranuras de material, capacidad de luz, licencia y autoría.
- `core` solo conoce la interfaz `CatalogProvider.getItem(id)`; los tests de `core` usan un catálogo de fixtures.
- Carga **perezosa** por item; precarga solo de los 6 más usados; *placeholder* (caja con las dimensiones reales) mientras carga o si falla.
- Cada item registra licencia (SPDX), autor y fuente → `ATTRIBUTION.md` generado y comprobado en CI.

## 8. Persistencia

```mermaid
flowchart LR
  S[EditorSession] -- document:changed --> A["Autosave<br/>debounce 1,5 s · pagehide · visibilitychange"]
  A --> R["ProjectRepository (puerto)"]
  R --> IDB[("IndexedDB<br/>projects · documents")]
  R -. Fase 9 .-> API[("API + Postgres")]
  S -- export --> J["JSON envelope versionado"]
  J -- import --> V["zod + migraciones"] --> S
  S -- compartir --> U["#v1.deflate+base64url<br/>(fragmento URL, nunca llega al servidor)"]
```

- **Esquema IndexedDB** (v1): `projects` (metadatos + miniatura `Blob`), `documents` (documento por `projectId`), `meta` (flags). Cambios de esquema de BD mediante `onupgradeneeded` versionado.
- **Versionado de escena:** `schemaVersion` entero en el documento + cadena de migraciones puras `vN → vN+1` con *golden files* en tests. Un archivo con versión mayor que la de la app se **rechaza con mensaje claro** (no se corrompe).
- **Autoguardado:** escritura atómica (una transacción). Indicador «Guardado / Guardando… / Error». Fallo ⇒ aviso persistente + ofrecer exportar JSON.
- **Riesgos conocidos** (ver [RISKS](RISKS.md)): desalojo de almacenamiento (Safari, modo privado), cuota, varias pestañas → `navigator.storage.persist()`, recordatorio de copia de seguridad y *Web Locks* para evitar escrituras concurrentes.
- **Enlaces para compartir (MVP):** escena comprimida con `fflate` + base64url en el **fragmento** (`#`), sin servidor y sin enviar datos a terceros. Límite objetivo <4 KB (≈30 objetos), tope duro 16 KB; si se excede, ofrecer exportar archivo (enlaces alojados en Fase 9).

## 9. Exportación e importación

| Formato | Contenido | Notas |
|---|---|---|
| **JSON** `.roomforge.json` | Envelope `{ format, formatVersion, appVersion, exportedAt, project, document }` | Validado con zod, límite 5 MB, rechaza `__proto__`/claves peligrosas (zod las elimina). |
| **PNG** | Render a resolución elegida | Ver §6.6. |
| **Enlace** | Fragmento URL comprimido | Modo visor de solo lectura. |
| glTF/USDZ | **Fuera del MVP** | Documentado en FUTURE_VERSIONS. |

## 10. Integración de IA (diseño, no implementación)

Principio: **la IA propone Comandos, nunca muta el documento directamente.**

```mermaid
flowchart LR
  P["Prompt del usuario + sala + catálogo filtrado"] --> LLM["LayoutGenerator (puerto)\nadaptador a un proveedor LLM"]
  LLM --> PLAN["Plan estructurado JSON\n(intenciones: 'escritorio contra pared norte, centrado')"]
  PLAN --> ZOD["Validación zod"]
  ZOD --> SOLVER["Solver determinista (core/geometry)\nresuelve posiciones, evita colisiones"]
  SOLVER --> CMDS["Lista de Comandos"]
  CMDS --> PREV["Vista previa fantasma"]
  PREV -->|Aceptar| TX["UNA transacción → UN undo"]
  PREV -->|Rechazar| X[Descartar]
```

- La llamada al LLM se hace desde un **endpoint servidor** (Worker) para no exponer claves; límites de uso y caché por hash de petición.
- La verdad geométrica la pone el solver determinista, no el LLM (los LLM son malos con coordenadas).
- Evaluación offline con un conjunto de ~30 salas de referencia (spike P9-03).
- Elección de proveedor/modelo: decisión de Fase 9 por coste/calidad; el puerto lo hace intercambiable.

## 11. Seguridad y privacidad

| Tema | Medida |
|---|---|
| Entrada no confiable (JSON importado, fragmento de URL) | Validación zod estricta, límites de tamaño/cantidad, sin `eval`, sin carga de URLs desde el documento (`catalogId` se resuelve contra catálogo local). |
| XSS | Nombres de proyecto/objeto siempre como texto (React escapa); CSP estricta vía `_headers` (P7-09). |
| Datos personales | MVP: ninguno (local-first). Analítica sin cookies ni PII (Fase 8). |
| Cadena de suministro | Versiones fijadas (lockfile), Dependabot agrupado, `pnpm audit` en CI, sin postinstall scripts no revisados. |
| Secretos | Solo en GitHub Secrets (tokens de Cloudflare); nunca en repo. |
| Licencias de assets | Campo obligatorio en manifiesto; CI falla si falta. |

## 12. Accesibilidad e internacionalización

- UI (paneles, diálogos) cumple WCAG 2.2 AA objetivo; el canvas no es accesible por naturaleza ⇒ **panel de escena (outliner)** como alternativa textual y por teclado (P3-15), mover con flechas, foco visible, `prefers-reduced-motion`.
- Textos externalizados desde el día 1 (diccionarios `es`/`en`). Decisión de idiomas en el MVP: pregunta abierta Q1 del PRD (propuesta: EN + ES).
- Unidades: métricas en el modelo (metros); conmutador a imperial es mejora P3.

## 13. Observabilidad (ligera)

- Errores: `ErrorBoundary` + registro local (últimos 50) descargable con «Reportar problema».
- Métricas de render (solo dev/E2E): `window.__RF__` expone `renderer.info`, sesión y utilidades de test cuando `NEXT_PUBLIC_E2E=1`.
- Producción: analítica de eventos agregada sin PII (Fase 8).

## 14. Qué hemos evaluado y descartado (por ahora)

| Opción | Motivo | Revisitar si… |
|---|---|---|
| WebGPU renderer | Beneficio incierto para escenas pequeñas; compatibilidad de librerías (postprocessing, drei) no verificada en esta investigación. | Cuello de botella de GPU demostrado. |
| Motor de física (Rapier) | No hay física en el producto; la colocación es geométrica. | Interacciones físicas deseadas. |
| ECS (bitecs/miniplex) | El volumen (≤300 objetos) no lo justifica. | Escenas de miles de entidades. |
| CRDT/Yjs | Sin colaboración en MVP; los comandos/patches dejan la puerta abierta. | Fase 9 colaboración. |
| React Compiler | Interacción con R3F no verificada; los hot paths ya evitan React. | Mejora medible en perfiles. |
| Instancing | ≤300 objetos, pocas repeticiones. | >300 draw calls. |
| Microservicios | Innecesarios. | Nunca (monolito modular). |
| Vite en lugar de Next | Ver ADR-0002. | Fricción de DX o backend separado. |
