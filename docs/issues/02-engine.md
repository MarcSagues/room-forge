# Fase 2 — Motor 3D (M2)

## ISSUE E2 — Épica: Motor 3D (core de dominio + motor de escena base)

- **Tipo:** epic
- **Prioridad:** P0
- **Épica:** —
- **Hito:** M2
- **Estimación:** — (suma de las hijas)
- **Etiquetas:** area:core, area:scene
- **Depende de:** —

### Descripción
Construir el núcleo puro (dominio, sesión, comandos, historial) y el motor de escena base (Canvas bajo demanda, sala, cámaras, suscripciones granulares). Al final: una sala de ejemplo se renderiza, se orbita, cambia de vista y sus dimensiones cambian mediante comandos con undo/redo.

### Contexto
Es la fase que fija el rendimiento y la corrección del resto. Ver [ARCHITECTURE §3–§6](../ARCHITECTURE.md) y [ADR-0003](../ADR/0003-state-and-commands.md), [ADR-0006](../ADR/0006-r3f-rendering-strategy.md).

### Requisitos
- `core` con ≥90 % de cobertura de líneas; sin dependencias de DOM/React/three.
- Canvas en `frameloop="demand"` con puente de invalidación.
- Test de conteo de renders con 500 entidades ficticias.

### Criterios de aceptación
- [ ] Demo en `/editor`: sala renderizada, orbitar, vista superior, cambio de dimensiones con undo/redo por teclado.
- [ ] GPU en reposo: 0 frames renderizados sin interacción (medido con `renderer.info.render.frame`).
- [ ] Todas las issues hijas cerradas.

### Tests esperados
Ver issues hijas.

## ISSUE P2-01 — core: tipos de dominio y schemas zod de SceneDocument v1

- **Tipo:** feature
- **Prioridad:** P0
- **Épica:** E2
- **Hito:** M2
- **Estimación:** M
- **Etiquetas:** area:core
- **Depende de:** P1-01, P1-03

### Descripción
Implementar en `packages/core/src/domain` los schemas zod (y tipos inferidos) de `SceneDocument`, `Room`, `Opening`, `PlacedObject`, `MaterialRef`, `LightState`, `Lighting`, IDs *brand* y la función `createEmptyDocument()`.

### Contexto
[DOMAIN_MODEL](../DOMAIN_MODEL.md) es la especificación. Los schemas serán también la validación de importaciones (P6-01).

### Requisitos
- Una única fuente de verdad: tipos TS inferidos de zod.
- Límites del dominio (dimensiones, nombres, nº de objetos) definidos como constantes exportadas.
- Generador de IDs inyectable (`IdGen`) con implementación nanoid y una determinista para tests.
- `createEmptyDocument()` y un builder de tests `buildRoom()`, `buildObject()`.
- Documentos son JSON puro (test de `structuredClone`/`JSON` round-trip).

### Criterios de aceptación
- [ ] Documentos válidos del DOMAIN_MODEL parsean; inválidos (NaN, dimensiones fuera de rango, IDs duplicados) se rechazan con mensajes útiles.
- [ ] `z.infer` coincide con los tipos documentados (comprobado con test de tipos).
- [ ] Cobertura ≥ 90 % del paquete `domain`.

### Tests esperados
- Unitarios por schema (casos válidos/ inválidos/ límites).
- Propiedad: `parse(JSON.parse(JSON.stringify(doc)))` ≡ `doc` para documentos generados con fast-check.

## ISSUE P2-02 — core: EditorSession (store) y pipeline de comandos con Immer

- **Tipo:** feature
- **Prioridad:** P0
- **Épica:** E2
- **Hito:** M2
- **Estimación:** L
- **Etiquetas:** area:core
- **Depende de:** P2-01

### Descripción
Implementar `createEditorSession({ initialDocument, catalog, idGen, clock })`: store `zustand/vanilla` de solo lectura, `execute(command)` con `produceWithPatches`, validación de invariantes I1–I7 y resultado `Result` sin excepciones de dominio.

### Contexto
[ARCHITECTURE §4](../ARCHITECTURE.md) y [ADR-0003](../ADR/0003-state-and-commands.md). Este es el corazón del editor; el diseño de API pública debe quedar estable.

### Requisitos
- Interfaz `Command` y `CommandContext` (idGen, clock, catalog).
- `execute` atómico: si falla una invariante el documento no cambia.
- Documento expuesto como `DeepReadonly`; mutarlo fuera de un comando falla en tipos.
- Suscripción por selector y `getState()`.
- Dependencias añadidas: `immer`, `zustand`, `zod` (justificar en el PR).

### Criterios de aceptación
- [ ] `execute` con un comando de prueba cambia el documento y emite `document:changed` (o el hook equivalente) una sola vez.
- [ ] Un comando que viola una invariante devuelve `{ ok:false }` y deja el documento idéntico (referencia igual).
- [ ] Estructura compartida: las partes no modificadas conservan identidad referencial.
- [ ] Ejecutar 10 000 comandos triviales < 500 ms.

### Tests esperados
- Unitarios de `execute`, invariantes, identidad referencial.
- Test de rendimiento básico (umbral holgado).

## ISSUE P2-03 — core: historial undo/redo con coalescing y gestos

- **Tipo:** feature
- **Prioridad:** P0
- **Épica:** E2
- **Hito:** M2
- **Estimación:** M
- **Etiquetas:** area:core
- **Depende de:** P2-02

### Descripción
Pila de historial con `patches`/`inverse`, límite configurable, `undo()`, `redo()`, `canUndo/canRedo`, etiquetas, coalescing por `mergeKey` en ventana de 600 ms y gestos `beginGesture/commit/cancel` que agrupan varios comandos en una entrada.

### Contexto
[ARCHITECTURE §4.4](../ARCHITECTURE.md). Un arrastre debe producir **una** entrada. Ejecutar un comando nuevo tras `undo` descarta la rama de *redo*.

### Requisitos
- `history:changed` con `{canUndo, canRedo, undoLabel, redoLabel}`.
- `cancel()` de un gesto restaura el estado previo sin dejar entrada.
- Límite de 200 entradas con descarte de las más antiguas.
- Reloj inyectado (tests deterministas).

### Criterios de aceptación
- [ ] Propiedad: para cualquier secuencia de comandos válidos, `undo` repetido ⇒ documento original (deep equal) y `redo` repetido ⇒ documento final.
- [ ] Tres comandos con el mismo `mergeKey` en <600 ms ⇒ 1 entrada; con >600 ms ⇒ 2.
- [ ] Un gesto con 5 comandos ⇒ 1 entrada y 1 solo `document:changed` al confirmar.
- [ ] Tras `undo` + comando nuevo, `canRedo === false`.

### Tests esperados
- fast-check (≥1 000 secuencias) sobre comandos de ejemplo.
- Unitarios de coalescing, gestos, límite, cancelación.

## ISSUE P2-04 — core: comandos de habitación (crear, redimensionar, material de superficie)

- **Tipo:** feature
- **Prioridad:** P0
- **Épica:** E2
- **Hito:** M2
- **Estimación:** S
- **Etiquetas:** area:core
- **Depende de:** P2-02

### Descripción
Comandos `room/create`, `room/resize` (ancho, fondo, alto) y `room/setSurfaceMaterial` (suelo, techo, cada pared) con validación de límites. Redimensionar mantiene objetos dentro (los que quedarían fuera se reportan, no se pierden).

### Contexto
[PRD FR-ROOM-*](../PRD.md). Redimensionar con aperturas y objetos requiere política clara; en esta issue: **bloquear** el redimensionado si dejaría objetos/aperturas fuera y devolver la lista de conflictos (UX en P3-10).

### Requisitos
- Límites de DOMAIN_MODEL §5.
- `room/resize` devuelve `conflicts: ObjectId[] | OpeningId[]` en el error.
- `room/create` en un documento vacío establece materiales por defecto y una sala centrada.

### Criterios de aceptación
- [ ] Crear sala con valores en y fuera de rango: acepta/rechaza según límites.
- [ ] Redimensionar con un objeto que quedaría fuera ⇒ `{ok:false, error.conflicts:[id]}` y documento intacto.
- [ ] Undo/redo de cada comando restaura exactamente.

### Tests esperados
- Unitarios + propiedad (resize válido seguido de undo ≡ original).

## ISSUE P2-05 — core: bus de eventos tipado y estado de selección

- **Tipo:** task
- **Prioridad:** P0
- **Épica:** E2
- **Hito:** M2
- **Estimación:** S
- **Etiquetas:** area:core
- **Depende de:** P2-02

### Descripción
Emisor de eventos tipado (`document:changed`, `history:changed`, `selection:changed`, `gesture:*`, `session:error`) y estado de sesión no undoable: `selection`, `hover`, `activeTool`.

### Contexto
[ARCHITECTURE §5](../ARCHITECTURE.md). La selección **no** forma parte del historial.

### Requisitos
- Emisor sin dependencias (≈30 líneas), con `on` que devuelve `unsubscribe`.
- `select(ids, mode)`: reemplazar/añadir/alternar; deseleccionar ids que dejan de existir tras un comando o undo.
- Selección pensada para ≥1 id (multi-selección futura) aunque el MVP use 1.

### Criterios de aceptación
- [ ] Eliminar un objeto seleccionado limpia la selección y emite `selection:changed`.
- [ ] `unsubscribe` evita fugas (comprobado con contador de listeners).
- [ ] Orden de eventos documentado y verificado (`document:changed` antes de `selection:changed`).

### Tests esperados
- Unitarios de emisor y de reconciliación de selección.

## ISSUE P2-06 — scene: Canvas R3F base con render bajo demanda

- **Tipo:** feature
- **Prioridad:** P0
- **Épica:** E2
- **Hito:** M2
- **Estimación:** M
- **Etiquetas:** area:scene, area:perf
- **Depende de:** P1-06, P2-02

### Descripción
Integrar React Three Fiber en `apps/web/src/scene-engine/canvas`: `Canvas` client-only con `frameloop="demand"`, ajustes de renderer (color management, tone mapping, `dpr` acotado), puente `document:changed → invalidate()`, helper `mutate()` y overlay de estadísticas en desarrollo.

### Contexto
[ADR-0006](../ADR/0006-r3f-rendering-strategy.md), [R3F_PERFORMANCE §2.1](../research/R3F_PERFORMANCE.md). Dependencias nuevas: `three`, `@react-three/fiber`, `@react-three/drei` (justificar). **Spike incluido:** verificar R3F 9 + Next 16 export estático + Strict Mode.

### Requisitos
- Carga con `dynamic(..., { ssr:false })`; la landing no carga three.
- `window.__RF__` (solo con `NEXT_PUBLIC_E2E=1`) expone `renderer.info`.
- Helper `mutate(fn)` que ejecuta una mutación y llama a `invalidate()`.
- Contexto de pérdida de WebGL: escuchar `webglcontextlost` y dejar gancho para P7-08.

### Criterios de aceptación
- [ ] Sin interacción, `renderer.info.render.frame` no aumenta durante 5 s.
- [ ] Un cambio en el documento produce exactamente 1 frame.
- [ ] El bundle de la landing no incluye three (verificado con análisis de bundle).
- [ ] Strict Mode en desarrollo no produce errores ni fugas visibles.

### Tests esperados
- E2E: leer `__RF__.info.render.frame` antes/después de esperar y de ejecutar un comando.
- Unitario del helper `mutate` con `invalidate` simulado.

## ISSUE P2-07 — scene: RoomMesh (suelo, paredes y techo desde el dominio)

- **Tipo:** feature
- **Prioridad:** P0
- **Épica:** E2
- **Hito:** M2
- **Estimación:** M
- **Etiquetas:** area:scene
- **Depende de:** P2-01, P2-06

### Descripción
Generar y renderizar la geometría de una sala rectangular (suelo, 4 paredes con grosor, techo) a partir de `Room`. La generación de geometría es una **función pura** (`buildRoomGeometry(room, openings)`) separada del componente.

### Contexto
Las aperturas (huecos) se añaden en P3-12; el generador debe diseñarse para aceptarlas (muros como contornos con huecos). Materiales placeholder hasta P5-02.

### Requisitos
- Origen de sala en esquina NO; coordenadas según DOMAIN_MODEL §1.
- Memoizar geometría por dimensiones; no recrear en cada render.
- Paredes con cara interior visible y exterior opcional; UV en espacio mundo (1 unidad = 1 m).
- Rejilla de suelo (visible en edición).

### Criterios de aceptación
- [ ] Salas de 2×2 m a 12×12 m, altura 2,2–4 m se generan sin huecos ni z-fighting visibles.
- [ ] Cambiar dimensiones solo recalcula la geometría afectada (test de memoización).
- [ ] La función pura devuelve vértices/índices con conteo esperado y *bounding box* exacto.

### Tests esperados
- Unitarios de `buildRoomGeometry` (bounding box, nº de triángulos, normales hacia el interior).
- Snapshot visual (P7-02, más adelante).

## ISSUE P2-08 — scene: CameraRig (orbital + superior ortográfica, encuadre a la sala)

- **Tipo:** feature
- **Prioridad:** P0
- **Épica:** E2
- **Hito:** M2
- **Estimación:** M
- **Etiquetas:** area:scene
- **Depende de:** P2-06

### Descripción
Componer `CameraControls` (drei) con dos cámaras: perspectiva orbital y ortográfica superior (pan/zoom). Transición suave entre vistas, `fitToRoom()`, límites (no atravesar suelo, distancia mínima/máxima) y control de invalidación.

### Contexto
[DESIGN_SYSTEM §4](../DESIGN_SYSTEM.md): orbitar con botón derecho, desplazar con central/Shift. En demanda, los controles de drei invalidan solos; la transición animada requiere ticker temporal.

### Requisitos
- API: `setView('perspective'|'top')`, `fit()`, estado de vista en el store de sesión (no undoable).
- Respetar `prefers-reduced-motion` (corte sin animación).
- Límites dependientes del tamaño de la sala.

### Criterios de aceptación
- [ ] Alternar vistas con la tecla `1`/`2` conserva el encuadre razonable y dura ≤ 600 ms.
- [ ] La cámara no puede atravesar el suelo ni alejarse > 4× la diagonal de la sala.
- [ ] `fit()` encuadra salas de 2×2 y 12×12 m completas.
- [ ] En reposo no se renderizan frames (tras terminar la transición).

### Tests esperados
- Unitarios de cálculo de encuadre y límites (funciones puras).
- E2E: cambiar de vista y verificar estado + frames en reposo.

## ISSUE P2-09 — scene: patrón EntityView y suscripciones granulares con test de renders

- **Tipo:** feature
- **Prioridad:** P0
- **Épica:** E2
- **Hito:** M2
- **Estimación:** M
- **Etiquetas:** area:scene, area:perf
- **Depende de:** P2-06, P2-02

### Descripción
Definir y probar el patrón: `ObjectList` (suscrito a la lista de IDs con `useShallow`) → `ObjectView id` (`React.memo`, suscrito a `objects[id]`) y el registro `Map<EntityId, Object3D>`. Incluir un harness con 500 entidades ficticias.

### Contexto
[R3F_PERFORMANCE §2.12](../research/R3F_PERFORMANCE.md). Esta issue es una **barrera de calidad**: si el patrón no cumple, se rediseña antes de seguir.

### Requisitos
- Hook `useEntity(id, selector)` y `useEntityIds()` tipados.
- Registro de refs con alta/baja automáticas.
- Contador de renders en modo test (`renderCount[id]`).
- Documentar el patrón (README en `scene-engine/objects`).

### Criterios de aceptación
- [ ] Con 500 objetos, mover 1 (comando) re-renderiza exactamente 1 `ObjectView` y la lista 0 veces.
- [ ] Añadir 1 objeto re-renderiza la lista 1 vez y no re-renderiza las vistas existentes.
- [ ] Desmontar un objeto lo elimina del registro (sin fugas).

### Tests esperados
- RTL con `renderCount` y `@react-three/test-renderer` o equivalente (evaluar) / Canvas simulado.
- Prueba de fugas: 200 ciclos añadir/eliminar ⇒ tamaño del registro estable.

## ISSUE P2-10 — scene: modos de visibilidad de paredes (arriba, corte, abajo) y techo

- **Tipo:** feature
- **Prioridad:** P1
- **Épica:** E2
- **Hito:** M2
- **Estimación:** M
- **Etiquetas:** area:scene, area:ux
- **Depende de:** P2-07, P2-08

### Descripción
Tres modos para las paredes: **arriba** (opacas), **corte** (las que miran a la cámara se atenúan según producto escalar cámara–normal), **abajo** (altura reducida). Techo oculto en edición y visible en «Vista previa».

### Contexto
Es el rasgo de usabilidad principal al orbitar (referencia: The Sims). Alternar `visible`/opacidad, **no** montar/desmontar.

### Requisitos
- Cálculo de atenuación en una función pura (testeable) y aplicación vía uniform/propiedad sin re-render de React.
- Transiciones de opacidad con ticker temporal (en demanda).
- Modo y estado de techo en el store de sesión + atajos (`W` para ciclar paredes, `C` techo).

### Criterios de aceptación
- [ ] Al orbitar 360°, siempre las 1–2 paredes frontales se atenúan y las traseras permanecen visibles.
- [ ] Cambiar de modo no recompila shaders (sin tirones; comprobado con `renderer.info.programs.length` constante).
- [ ] Vista superior: techo oculto automáticamente.

### Tests esperados
- Unitarios de la función de atenuación (tabla de ángulos).
- E2E: ciclar modos y verificar estado.

## ISSUE P2-11 — Spike: prototipo desechable de iluminación (coste de luces en GPU integrada)

- **Tipo:** spike
- **Prioridad:** P0
- **Épica:** E2
- **Hito:** M2
- **Estimación:** S
- **Etiquetas:** area:scene, area:perf, needs-decision
- **Depende de:** P2-07

### Descripción
Prototipo **desechable** (rama no fusionable) en la sala de P2-07 con 8–20 luces de distintos tipos (`PointLight`, `SpotLight`, `RectAreaLight`) y emisivos, midiendo coste por frame, recompilación de shaders al cambiar intensidad/color/número de luces y calidad visual, en el hardware de referencia (Q7).

### Contexto
[RISKS R2](../RISKS.md): el rendimiento de la iluminación RGB es el segundo riesgo técnico. Validarlo en la Fase 2 (no en la 5) permite ajustar el diseño del pool de luces ([ADR-0006](../ADR/0006-r3f-rendering-strategy.md)) antes de construir el editor encima.

### Requisitos
- Tabla de resultados: ms/frame y FPS por tipo y número de luces; `renderer.info.programs.length` antes/después de cambiar color, intensidad y número.
- Confirmar o refutar: «un pool fijo evita recompilar».
- Recomendación escrita: tipos de luz a usar para tira LED/barra/panel, tamaño de pool por calidad y necesidad de bloom.

### Criterios de aceptación
- [ ] Informe con datos medidos en ≥1 GPU integrada real (modelo indicado).
- [ ] ADR-0006 confirmada o enmendada con los resultados; P5-05 actualizada con el tamaño de pool y tipos de luz recomendados.
- [ ] El código del prototipo se descarta (se enlaza la rama/commit en el informe).

### Tests esperados
No aplica (entregable: informe y ADR). El prototipo no entra en `develop`.
