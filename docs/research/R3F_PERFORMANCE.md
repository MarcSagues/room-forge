# Investigación — Rendimiento con React Three Fiber

> Fecha de investigación: 2026-10-08 · Aplicado en [ARCHITECTURE §6](../ARCHITECTURE.md#6-motor-de-escena-scene-engine)
> **Convención:** «Fuente» = documentación oficial o hallazgo directo; «Práctica» = recomendación nuestra derivada, **no** citada de las fuentes.

## 1. Fuentes consultadas

| Fuente | Tipo | Aporta |
|---|---|---|
| [R3F — Scaling performance](https://r3f.docs.pmnd.rs/advanced/scaling-performance) | Oficial | Render bajo demanda, `invalidate`, reutilización de recursos, instancing, LOD, `PerformanceMonitor`, regresión de movimiento, concurrencia. |
| [R3F — Performance pitfalls](https://r3f.docs.pmnd.rs/advanced/pitfalls) | Oficial | Qué NO hacer: `setState` en bucles/eventos rápidos, crear objetos en el bucle, duplicar geometrías/materiales, montar/desmontar etapas. |
| [R3F — Guía de migración a v9](https://r3f.docs.pmnd.rs/tutorials/v9-migration-guide) | Oficial | v9 = compatibilidad con React 19; cambios que afloran errores en Strict Mode. |
| [Discourse three.js — estado con R3F sin problemas de rendimiento](https://discourse.threejs.org/t/how-to-use-state-management-with-react-three-fiber-without-performance-issues/61223) | Comunidad | Separar estado de aplicación de estado transitorio por frame; evitar re-crear clases en cada tick. |
| [GitNation — Scaling R3F applications beyond Hello World](https://gitnation.com/contents/scaling-react-three-fiber-applications-beyond-the-hello-world) | Charla | Experiencia con un editor 3D tipo Figma: instancing, reducción de memoria, árboles espaciales. |

Limitaciones: la página oficial de pitfalls **no** cubre `dispose`, selectores de Zustand ni particularidades de Next.js/SSR; esos puntos se marcan como «Práctica» y deben verificarse en spikes (P2-06, P2-09).

## 2. Hallazgos y cómo se aplican

### 2.1 Renderizar solo cuando hay cambios — *Fuente*
- `<Canvas frameloop="demand">`: el render ocurre cuando cambian props; los cambios por mutación directa (controles de cámara) requieren `invalidate()`. Los controles de drei lo hacen solos. Las llamadas a `invalidate()` se **coalescen** (marcan «hace falta un frame»).
- **Aplicación:** modo por defecto del editor. Puente `document:changed → invalidate()`. Para animaciones RGB, un ticker único limitado a 30 fps mientras haya efectos activos (P5-08).

### 2.2 Nada de React en el camino caliente — *Fuente*
- `setState` en `useFrame`, `setInterval` o `onPointerMove` provoca re-renders sin beneficio; hay que mutar por `ref` y escalar con `delta`.
- Vincular estado de store que cambia rápido a JSX (`useSelector → position-x`) re-renderiza en cada cambio; leer imperativamente con `getState()` dentro de `useFrame`.
- **Aplicación:** el arrastre muta `Object3D` por ref (ver [ARCHITECTURE §4.2](../ARCHITECTURE.md#42-flujo-de-un-arrastre-el-caso-crítico-para-ux-y-rendimiento)). El panel de propiedades lee un *transient store* a ≤1 actualización por frame.

### 2.3 No asignar memoria en el bucle — *Fuente*
- `new THREE.Vector3()` dentro de `useFrame` genera basura (GC). Reutilizar objetos creados una vez y usar `.set()`.
- **Aplicación:** módulo `scratch` con Vector3/Quaternion/Matrix4/Box3 reutilizables; regla de review en AGENTS.md.

### 2.4 Compartir geometrías, materiales y texturas — *Fuente*
- Crearlos una vez y compartir; `useLoader` cachea por URL; para glTF usar gltfjsx/reutilización.
- **Aplicación:** `ResourceRegistry` con conteo de referencias; `MaterialFactory` con caché por clave `(presetId, tint, roughness, metalness)`; override de color **sin clonar geometría**.

### 2.5 Dispose — *Práctica (verificar en spike P4-04)*
- R3F libera recursos de los objetos que crea al desmontarse. Con recursos **compartidos/cacheados** esto puede destruir lo que otro objeto sigue usando.
- **Aplicación:** `dispose={null}` en primitivas compartidas; el `ResourceRegistry` decide cuándo liberar (cuando el contador llega a 0 y tras un retardo para evitar thrash). Test: añadir/eliminar un objeto 200 veces ⇒ el número de geometrías/texturas en `renderer.info.memory` no crece.

### 2.6 No montar/desmontar etapas — *Fuente*
- Montar y desmontar recompila materiales y re-procesa geometría; mantener montado y alternar `visible`.
- **Aplicación:** techo, paredes (modos), rejilla y gizmos se alternan por `visible`/opacidad. Día/noche no remonta nada.

### 2.7 Número de luces y recompilación de shaders — *Práctica (verificar en spike P5-05)*
- En three.js el programa del shader depende del número y tipo de luces; añadir/quitar luces fuerza recompilar los materiales afectados (tirón visible).
- **Aplicación:** **pool fijo de luces** reservado al inicio por nivel de calidad (p. ej. 4/8/12) y reasignado (posición/color/intensidad). Las luminarias que no caben se representan solo con emisivo + bloom.

### 2.8 Calidad adaptativa — *Fuente*
- `PerformanceMonitor` (onIncline/onDecline con límites y *flipflops*), `dpr` adaptativo, `performance.regress()` durante interacción con cámara (la app debe leer `performance.current`).
- **Aplicación:** P5-10. `dpr ∈ [1, 2]`, regresión al orbitar (baja dpr y desactiva bloom/sombras temporalmente), calidad manual persistida.

### 2.9 Instancing y LOD — *Fuente*
- `instancedMesh` para muchas copias; mantener draw calls por debajo de ~1000 (idealmente cientos); `<Detailed />` de drei para LOD.
- **Aplicación:** **no en el MVP** (≤300 objetos, poca repetición). Umbral de adopción: >300 draw calls medidos. Presupuesto de assets mantiene la geometría ligera.

### 2.10 Concurrencia — *Fuente*
- Canvas en modo concurrente; `startTransition`/`useTransition` para trabajo caro (la página reporta ~5 fps vs ~60 fps en su benchmark).
- **Aplicación:** cargas masivas (importar proyecto grande, aplicar plantilla) dentro de `startTransition`.

### 2.11 Picking — *Práctica*
- El raycast por defecto de R3F recorre las mallas con handlers; con modelos complejos es caro.
- **Aplicación:** colliders proxy (caja invisible por objeto); `raycast={null}` en decorado no interactivo; arrastre por intersección analítica rayo–plano; hover limitado a 1 raycast/frame. `three-mesh-bvh` queda como opción si hay mallas densas.

### 2.12 Estado con Zustand — *Fuente + Práctica*
- R3F usa Zustand internamente (sin coste extra de bundle). Selectores granulares; `useShallow` para listas; lecturas imperativas (`getState`) en el bucle.
- **Aplicación:** un componente por entidad suscrito a `objects[id]`; test de **conteo de renders** (P2-09): mover 1 de 500 objetos ⇒ re-render de 1 componente.

### 2.13 Exportar imagen sin penalizar el render — *Práctica*
- `preserveDrawingBuffer: true` afecta al rendimiento global.
- **Aplicación:** render a `WebGLRenderTarget` fuera de pantalla bajo demanda (P6-06).

### 2.14 Next.js — *Práctica*
- Canvas solo en cliente; el código del motor no importa `next/*`; el editor se carga con `dynamic(..., { ssr:false })`; Strict Mode en dev duplica efectos ⇒ cleanup simétrico en controladores.

## 3. Presupuestos propuestos (a validar con el harness de P7-03)

| Recurso | Presupuesto (escritorio) | Presupuesto (móvil/visor) |
|---|---|---|
| Draw calls | ≤ 300 | ≤ 150 |
| Triángulos en escena | ≤ 1,5 M | ≤ 500 k |
| Triángulos por objeto | ≤ 20 k (hero ≤ 50 k) | — |
| Texturas | ≤ 1024² por item; total ≤ 64 MB GPU | ≤ 512² |
| Luces reales simultáneas | 12 (alta) / 8 (media) / 4 (baja) | 4 |
| Sombras | 1 mapa direccional 2048² | 1024² o desactivadas |
| Peso inicial del editor (JS gz) | ≤ 450 kB | idem |
| Peso del catálogo inicial | ≤ 3 MB (carga perezosa por item) | ≤ 1,5 MB |
| FPS objetivo (30 obj + 8 luces) | ≥ 45 en GPU integrada | ≥ 30 |

## 4. Herramientas de medición
- `renderer.info` (calls, triangles, geometries, textures) expuesto en `window.__RF__` solo con `NEXT_PUBLIC_E2E=1`.
- `r3f-perf` / `<Stats>` en desarrollo (no se instala hasta P2-06).
- Chrome Performance + Spector.js para sesiones de profiling (P7-04).
- Test de regresión de presupuesto en Playwright (P7-03).
