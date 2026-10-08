# Fase 4 — Catálogo de objetos (M4)

## ISSUE E4 — Épica: Catálogo de objetos (30 items)

- **Tipo:** epic
- **Prioridad:** P0
- **Épica:** —
- **Hito:** M4
- **Estimación:** — (suma de las hijas)
- **Etiquetas:** area:catalog
- **Depende de:** —

### Descripción
Definir la estrategia visual y técnica de los assets, construir el pipeline, el manifiesto y la carga, y producir los **30 objetos del MVP** (ver [PRD §5](../PRD.md#5-catálogo-del-mvp-30-objetos)) con licencias limpias y dentro de presupuesto.

### Contexto
**Riesgo n.º 1 del proyecto** ([RISKS R1](../RISKS.md)). Empezar por el spike P4-01 antes de producir contenido en masa.

### Requisitos
- Estilo visual coherente (decidido en P4-01).
- Cada item con licencia registrada y dentro de presupuesto.

### Criterios de aceptación
- [ ] 30 items disponibles en el catálogo con miniatura, dimensiones reales y licencia.
- [ ] `pnpm catalog:validate` pasa; peso de carga inicial ≤ 3 MB.
- [ ] Una escena de «setup completo» (≥15 objetos) mantiene los presupuestos de render.

### Tests esperados
Ver issues hijas.

## ISSUE P4-01 — Spike: calidad visual y estrategia de assets (paramétrico vs GLB)

- **Tipo:** spike
- **Prioridad:** P0
- **Épica:** E4
- **Hito:** M4
- **Estimación:** M
- **Etiquetas:** area:catalog, area:ux, needs-decision
- **Depende de:** P2-07

### Descripción
Producir **3 objetos representativos** (silla gaming, monitor, escritorio) por las vías posibles —paramétrica en código, GLB CC0 adaptado— y compararlos con capturas en la sala bajo luz de día y de noche. Fijar el listón de calidad, el estilo y los presupuestos. Actualizar [ADR-0007](../ADR/0007-asset-strategy.md).

### Contexto
Los objetos de nicho gaming probablemente no existen en packs CC0 ([FINDINGS §3](../research/FINDINGS.md)). Hay que decidir pronto cuánto del catálogo será paramétrico y si hace falta modelado propio o encargo.

### Requisitos
- Descargar y **verificar la licencia** de cada pack usado (kenney.nl, quaternius.com, polyhaven.com); registrar fuente y versión.
- Medir triángulos, texturas y tiempo de carga de cada variante.
- Producir un documento corto de comparación con capturas lado a lado.
- Prueba de usuario informal (≥3 personas): ¿cuál «parece de calidad»?

### Criterios de aceptación
- [ ] Decisión escrita: estilo, mezcla por categoría (paramétrico/GLB/propio) y presupuestos finales.
- [ ] ADR-0007 pasa a `Aceptada` (o se enmienda).
- [ ] Lista de los 30 items con su vía de producción asignada y estimación revisada de P4-07..P4-10.

### Tests esperados
No aplica (entregable: informe y ADR). Los experimentos no se fusionan como código de producto.

## ISSUE P4-02 — catalog: schema del manifiesto, validador, licencias y atribuciones

- **Tipo:** feature
- **Prioridad:** P0
- **Épica:** E4
- **Hito:** M4
- **Estimación:** M
- **Etiquetas:** area:catalog, area:core
- **Depende de:** P4-01, P2-01

### Descripción
Definir el schema zod de `CatalogItem` (en `core`), el formato del manifiesto en `apps/web/src/asset-library/manifest/`, el `CatalogProvider` real y el script `pnpm catalog:validate` (dimensiones, licencia, presupuestos, archivos existentes, miniaturas, IDs únicos). Generar `ATTRIBUTION.md` desde el manifiesto.

### Contexto
[DOMAIN_MODEL §3.1](../DOMAIN_MODEL.md). La validación se ejecuta en CI y bloquea items sin licencia.

### Requisitos
- IDs de catálogo estables y nunca reutilizados (`desk.gaming.160`).
- Campos i18n (`en`, `es`).
- Presupuestos configurables y diferenciados por categoría.
- `ATTRIBUTION.md` generado y comparado en CI (falla si está desactualizado).

### Criterios de aceptación
- [ ] Un item sin licencia, con ID duplicado o fuera de presupuesto hace fallar `catalog:validate`.
- [ ] El `CatalogProvider` devuelve items por ID y por categoría/etiqueta.
- [ ] `ATTRIBUTION.md` se regenera de forma determinista.

### Tests esperados
- Unitarios del validador con manifiestos de ejemplo válidos/inválidos.
- Test del `CatalogProvider`.

## ISSUE P4-03 — catalog: pipeline de optimización de assets y miniaturas

- **Tipo:** task
- **Prioridad:** P0
- **Épica:** E4
- **Hito:** M4
- **Estimación:** L
- **Etiquetas:** area:catalog, area:perf
- **Depende de:** P4-01

### Descripción
Script reproducible (`pnpm catalog:build`) con `gltf-transform` (dedupe, prune, weld, simplificación opcional, Meshopt/Draco, texturas a WebP/KTX2, redimensión a ≤1024²), nombres con hash de contenido, informe de presupuestos y generador de miniaturas (render determinista del GLB → WebP 256 px).

### Contexto
[R3F_PERFORMANCE §3](../research/R3F_PERFORMANCE.md) fija presupuestos. Los originales se guardan fuera del bundle (carpeta `assets-src/`, con licencia) y el build genera `public/assets`.

### Requisitos
- Idempotente y determinista (misma entrada ⇒ mismos hashes).
- Informe: tris, nº de materiales, bytes de textura, bytes totales.
- Miniaturas con iluminación y cámara estándar (consistentes).
- Documentar el flujo para añadir un item nuevo.

### Criterios de aceptación
- [ ] Un GLB de ~2 MB se reduce a ≤ 300 kB manteniendo aspecto aceptable (comparación visual en el PR).
- [ ] Ejecutar el pipeline dos veces no cambia ningún hash.
- [ ] Las miniaturas de 3 items de prueba son coherentes entre sí.

### Tests esperados
- Test de integración del script con un GLB de fixture (tamaños y hashes).
- Test de las funciones puras de informe/presupuesto.

## ISSUE P4-04 — scene: carga y reutilización de modelos (caché, clonado, placeholders, dispose)

- **Tipo:** feature
- **Prioridad:** P0
- **Épica:** E4
- **Hito:** M4
- **Estimación:** M
- **Etiquetas:** area:scene, area:perf
- **Depende de:** P4-02, P2-09

### Descripción
`ModelView`: carga perezosa con `useGLTF` (Meshopt/Draco), clonado ligero por instancia compartiendo geometría y materiales, `ResourceRegistry` con conteo de referencias y política de `dispose`, caja *placeholder* con las dimensiones reales mientras carga o si falla, y precarga de los items más usados.

### Contexto
[R3F_PERFORMANCE §2.4–2.5](../research/R3F_PERFORMANCE.md). **Spike de `dispose`:** verificar que desmontar una instancia no destruye recursos compartidos.

### Requisitos
- Estados: loading → ready → error, con reintento.
- No cargar items que no se usan; `preload` configurable.
- `renderer.info.memory` estable tras añadir/eliminar instancias repetidamente.

### Criterios de aceptación
- [ ] 20 instancias del mismo item comparten 1 geometría y 1 juego de materiales (verificado con `renderer.info`).
- [ ] Añadir/eliminar un objeto 200 veces no aumenta geometrías ni texturas.
- [ ] Un GLB inexistente muestra el placeholder de error sin romper la escena.

### Tests esperados
- Unitarios del `ResourceRegistry` (conteo, liberación diferida).
- E2E: cargar escena con 20 instancias y comprobar `renderer.info.memory`.

## ISSUE P4-05 — scene: constructor de objetos paramétricos

- **Tipo:** feature
- **Prioridad:** P1
- **Épica:** E4
- **Hito:** M4
- **Estimación:** M
- **Etiquetas:** area:scene, area:catalog
- **Depende de:** P4-01, P4-04

### Descripción
Marco para definir items como funciones `(params, materials) → grupo de mallas` (cajas, cilindros, extrusiones, biseles), con ranuras de material, dimensiones paramétricas (p. ej. ancho de escritorio) y reutilización de geometrías por clave de parámetros.

### Contexto
[ADR-0007](../ADR/0007-asset-strategy.md). Se implementa solo si P4-01 confirma la vía paramétrica (si no, se cierra como no necesaria). Es la base de los objetos geométricos y de las aperturas.

### Requisitos
- API de builder declarativa y tipada; tests de la geometría resultante.
- Las ranuras de material se corresponden con `slots` del manifiesto.
- Caché de geometrías por `(builder, params)`.

### Criterios de aceptación
- [ ] Un escritorio paramétrico se puede crear en 3 anchos distintos con caja envolvente exacta.
- [ ] El mismo objeto con los mismos parámetros comparte geometría (comprobado con `renderer.info`).
- [ ] Cambiar el color de una ranura no recrea la geometría.

### Tests esperados
- Unitarios de cada builder (bounding box, nº de mallas, ranuras).

## ISSUE P4-06 — ui: panel de catálogo completo (categorías, búsqueda, miniaturas)

- **Tipo:** feature
- **Prioridad:** P0
- **Épica:** E4
- **Hito:** M4
- **Estimación:** M
- **Etiquetas:** area:ui
- **Depende de:** P4-02, P3-06

### Descripción
Sustituir el panel mínimo por el catálogo real: pestañas de categorías, búsqueda por nombre/etiqueta (es/en), tarjetas con miniatura y medidas, estados de carga, favoritos y «recientes» (localStorage).

### Contexto
[DESIGN_SYSTEM §5.2](../DESIGN_SYSTEM.md) (`CatalogCard`). Debe mantener la mecánica de arrastre de P3-06.

### Requisitos
- Búsqueda tolerante a acentos y mayúsculas.
- Miniaturas con `loading="lazy"` y dimensiones reservadas (sin saltos de layout).
- Navegación por teclado; Enter coloca el item.

### Criterios de aceptación
- [ ] Filtrar por categoría y buscar «lámp» encuentra lámparas (acentos/idioma).
- [ ] 30 items renderizan en <100 ms; sin layout shift (CLS ≈ 0).
- [ ] Arrastrar desde una tarjeta sigue funcionando como en P3-06.

### Tests esperados
- RTL: filtros, búsqueda, favoritos persistentes (con fallos de storage).
- Axe sin violaciones graves.

## ISSUE P4-07 — content: lote A — escritorios y asientos (5 items)

- **Tipo:** task
- **Prioridad:** P0
- **Épica:** E4
- **Hito:** M4
- **Estimación:** L
- **Etiquetas:** area:catalog
- **Depende de:** P4-03, P4-04

### Descripción
Producir e integrar: `desk.office.140`, `desk.gaming.160`, `desk.corner.l`, `chair.gaming`, `chair.office`. Incluir superficies de apoyo en los escritorios, ranuras de material y miniaturas.

### Contexto
Imprescindibles para el 80 % de los setups. La vía de producción (paramétrica/GLB) viene del informe P4-01.

### Requisitos
- Dimensiones reales (medidas típicas de mercado) en el manifiesto.
- `supports` definidos para cada escritorio (rectángulo y altura del tablero).
- Silla con `allowOverlapWith` para escritorios.
- Licencia/atribución completas.

### Criterios de aceptación
- [ ] Los 5 items pasan `catalog:validate` y se ven coherentes en día y noche.
- [ ] Un monitor se apoya correctamente en cada escritorio (P3-13).
- [ ] Cada item ≤ presupuesto (tris/bytes) y carga < 300 ms en caché fría local.

### Tests esperados
- `catalog:validate`; test de geometría de `supports`; captura de referencia por item (para regresión visual P7-02).

## ISSUE P4-08 — content: lote B — informática y audio (9 items)

- **Tipo:** task
- **Prioridad:** P0
- **Épica:** E4
- **Hito:** M4
- **Estimación:** L
- **Etiquetas:** area:catalog
- **Depende de:** P4-07

### Descripción
Producir e integrar: monitor 27", monitor ultrawide 34", portátil, torre PC con RGB, teclado mecánico, ratón + alfombrilla, altavoces (par), auriculares + soporte, micrófono con brazo. Todos `tabletop` salvo la torre (suelo).

### Contexto
Es el núcleo diferencial gaming. Los monitores deben tener pantalla emisiva (contenido estático genérico, p. ej. degradado/escritorio abstracto).

### Requisitos
- Nombres **genéricos** (sin marcas).
- Torre con ventiladores/tira emisiva que pueda tomar el color RGB (ranura de luz; se conecta en P5-05).
- Pantallas con material emisivo y mapa de contenido intercambiable (futuro).

### Criterios de aceptación
- [ ] 9 items validados y colocables sobre escritorio (salvo torre).
- [ ] Ultrawide cabe en `desk.gaming.160` sin salirse de la superficie de apoyo.
- [ ] Peso conjunto del lote ≤ 900 kB tras pipeline.

### Tests esperados
- `catalog:validate`; unitarios de `supports` vs. dimensiones; capturas de referencia.

## ISSUE P4-09 — content: lote C — almacenamiento, entretenimiento y decoración (10 items)

- **Tipo:** task
- **Prioridad:** P1
- **Épica:** E4
- **Hito:** M4
- **Estimación:** L
- **Etiquetas:** area:catalog
- **Depende de:** P4-07

### Descripción
Producir e integrar: estantería, cajonera con ruedas, estante de pared, aparador, TV 55" (soporte/pared), consola con mando, puf, planta, alfombra y marco/póster de pared.

### Contexto
Completan la sensación de habitación habitada. Los de pared usan `placement.surface: 'wall'` y `backFace`.

### Requisitos
- Items `wall`: snap a pared con elevación por defecto.
- Alfombra: `floor` con altura mínima; los objetos pueden colocarse sobre ella sin colisión (`allowOverlapWith`).
- Marco/póster con ranura de textura (imagen genérica incluida).

### Criterios de aceptación
- [ ] 10 items validados y coherentes con los lotes A/B.
- [ ] Los items de pared se alinean a las 4 paredes y respetan las aperturas (aviso P3-14).
- [ ] Peso del lote ≤ 1,2 MB tras pipeline.

### Tests esperados
- `catalog:validate`; E2E: colocar un item de cada tipo de colocación.

## ISSUE P4-10 — content: lote D — luminarias (6 items)

- **Tipo:** task
- **Prioridad:** P0
- **Épica:** E4
- **Hito:** M4
- **Estimación:** M
- **Etiquetas:** area:catalog
- **Depende de:** P4-03

### Descripción
Producir e integrar: tira LED, par de barras de luz, paneles hexagonales, lámpara de pie, lámpara de escritorio y neón (forma genérica). Definir `light` en el manifiesto (tipo, coste de luz, color por defecto).

### Contexto
Las luminarias son el “momento wow” del producto. En esta issue solo se aportan **modelos y metadatos**; el comportamiento de luz está en P5-04/P5-05.

### Requisitos
- Visual emisivo preparado (material con `emissive`, `toneMapped=false` previsto).
- Tira LED: longitud configurable (`params.length`), colocable en borde de escritorio, pared o suelo.
- `light.cost` coherente (tira=2, barras=1, paneles=2, lámparas=1, neón=1).

### Criterios de aceptación
- [ ] 6 items validados; la tira LED puede alargarse entre 0,5 y 3 m con geometría correcta.
- [ ] Cada item define su `light` en el manifiesto y pasa la validación.
- [ ] Sin luz activa los modelos se ven bien en modo día.

### Tests esperados
- `catalog:validate`; unitarios del builder de tira LED (longitud ↔ geometría).
