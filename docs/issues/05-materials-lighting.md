# Fase 5 — Materiales e iluminación (M5)

## ISSUE E5 — Épica: Materiales e iluminación (RGB, día/noche)

- **Tipo:** epic
- **Prioridad:** P0
- **Épica:** —
- **Hito:** M5
- **Estimación:** — (suma de las hijas)
- **Etiquetas:** area:scene, area:core, area:ui
- **Depende de:** —

### Descripción
Materiales básicos editables y la característica estrella: iluminación LED/RGB con efectos, modo día/noche con ventanas, bloom, calidad adaptativa y presupuesto de luces.

### Contexto
Es la fase de mayor riesgo de rendimiento visual ([RISKS R2](../RISKS.md)). Se trabaja con spikes de pool de luces y de bloom antes de cerrar la API.

### Requisitos
- Presupuestos de [R3F_PERFORMANCE §3](../research/R3F_PERFORMANCE.md) cumplidos con 30 objetos y 8 luminarias.
- Cambiar color/intensidad/encendido no recompila shaders.

### Criterios de aceptación
- [ ] Escena demo «setup completo»: ≥45 FPS en portátil de referencia con 8 luminarias y bloom en calidad media.
- [ ] Alternar día/noche y luces no provoca tirones (sin recompilación; `programs.length` estable).
- [ ] Todas las issues hijas cerradas.

### Tests esperados
Ver issues hijas.

## ISSUE P5-01 — core: modelo de materiales, presets y comandos de material

- **Tipo:** feature
- **Prioridad:** P0
- **Épica:** E5
- **Hito:** M5
- **Estimación:** M
- **Etiquetas:** area:core
- **Depende de:** P2-04, P3-02

### Descripción
Definir `MaterialPreset` (id, nombre i18n, categoría, parámetros PBR base, textura opcional) y una biblioteca de ≈20 presets (pinturas mate/satinada, maderas, suelos de roble/gris/hormigón/microcemento, paneles, tela), más comandos `object/setMaterial` y `room/setSurfaceMaterial` con `tint`, `roughness`, `metalness`.

### Contexto
[DOMAIN_MODEL](../DOMAIN_MODEL.md) `MaterialRef`. Los presets son datos de la app (como el catálogo), no del documento.

### Requisitos
- Presets sin texturas pesadas: parámetros PBR + texturas procedurales o ≤512² comprimidas.
- Ranuras de material por item respetan `slots`.
- Validación de rangos (0..1) y de `tint` hex.

### Criterios de aceptación
- [ ] Aplicar material a pared/suelo/techo y a una ranura de objeto con undo/redo correcto.
- [ ] Un `presetId` desconocido se conserva y usa un material por defecto (I6).
- [ ] Biblioteca ≥ 20 presets listados con i18n.

### Tests esperados
- Unitarios de comandos y de validación; propiedad de undo/redo.

## ISSUE P5-02 — scene: MaterialFactory compartido y texturas (UV en espacio mundo)

- **Tipo:** feature
- **Prioridad:** P0
- **Épica:** E5
- **Hito:** M5
- **Estimación:** M
- **Etiquetas:** area:scene, area:perf
- **Depende de:** P5-01, P2-07

### Descripción
`MaterialFactory` con caché por clave `(presetId, tint, roughness, metalness)`, conteo de referencias, y aplicación a suelos/paredes (UV en espacio mundo, repetición 1 m) y a ranuras de objetos **sin clonar geometría**. Cambio de color sin recompilar el programa de shader.

### Contexto
[R3F_PERFORMANCE §2.4](../research/R3F_PERFORMANCE.md).

### Requisitos
- Texturas compartidas y liberadas con el registry; `colorSpace` correcto (sRGB para color, lineal para datos).
- Actualización de `tint` mutando `material.color` (no creando materiales nuevos por cambio).
- Anisotropía y mipmaps configurados según calidad.

### Criterios de aceptación
- [ ] 50 objetos con el mismo material comparten 1 instancia.
- [ ] Cambiar el tinte de 1 objeto no afecta a los demás y no incrementa `programs.length`.
- [ ] Las texturas del suelo se ven con escala 1 m en salas de cualquier tamaño.

### Tests esperados
- Unitarios de la clave de caché y del conteo de referencias.
- E2E: cambiar color y verificar `renderer.info.programs`.

## ISSUE P5-03 — ui: panel de materiales y color

- **Tipo:** feature
- **Prioridad:** P0
- **Épica:** E5
- **Hito:** M5
- **Estimación:** M
- **Etiquetas:** area:ui
- **Depende de:** P5-02, P3-07

### Descripción
Sección «Material» en propiedades: selector de superficie/ranura, rejilla de presets, `ColorField` con paleta rápida y hex, deslizadores de rugosidad/metalicidad en modo avanzado. Aplicar a toda la sala (todas las paredes) o a una pared.

### Contexto
[DESIGN_SYSTEM §5.2](../DESIGN_SYSTEM.md). Los cambios de color con deslizador deben coalescerse (`mergeKey`).

### Requisitos
- Vista previa en vivo sin spamear el historial.
- «Aplicar a todas las paredes» / «Solo esta pared».
- Accesible por teclado y con contraste verificado.

### Criterios de aceptación
- [ ] Cambiar el color arrastrando produce 1 entrada de historial.
- [ ] Seleccionar una pared y aplicar un preset afecta solo a esa pared; «todas» afecta a las 4.
- [ ] Hex inválido muestra error y no cambia el material.

### Tests esperados
- RTL de selección y validación de color; E2E de cambio de pared.

## ISSUE P5-04 — core: modelo de luminarias (estado de luz, efectos) y comandos

- **Tipo:** feature
- **Prioridad:** P0
- **Épica:** E5
- **Hito:** M5
- **Estimación:** M
- **Etiquetas:** area:core
- **Depende de:** P3-02

### Descripción
Comandos `light/set` (on, color, intensidad, efecto), `light/setAll` (apagar/encender todas, aplicar preset de ambiente), `scene/setLightingMode` (día/noche) y presets de ambiente («Cyberpunk», «Atardecer», «Cálido», «Frío») como colecciones de `LightState`. Tipos de efecto: `static`, `breathing`, `cycle`.

### Contexto
[DOMAIN_MODEL](../DOMAIN_MODEL.md) `LightState`. El *tiempo* de las animaciones NO es parte del documento: el efecto se evalúa en el motor a partir de `now`.

### Requisitos
- Función pura `evaluateEffect(effect, baseColor, t) → color` en `core` (para pruebas deterministas).
- Validación de rangos y de que solo items con capacidad de luz acepten `light`.
- `light/setAll` como gesto único (1 entrada).

### Criterios de aceptación
- [ ] `evaluateEffect` devuelve valores esperados en una tabla de tiempos (breathing y cycle periódicos).
- [ ] Aplicar un preset de ambiente a 8 luminarias = 1 entrada de historial.
- [ ] Aplicar `light` a un item sin capacidad de luz ⇒ error.

### Tests esperados
- Unitarios de `evaluateEffect` (periodicidad, límites); comandos y undo.

## ISSUE P5-05 — scene: pool fijo de luces, asignador por presupuesto y visuales emisivos

- **Tipo:** feature
- **Prioridad:** P0
- **Épica:** E5
- **Hito:** M5
- **Estimación:** L
- **Etiquetas:** area:scene, area:perf
- **Depende de:** P5-04, P4-10, P2-11

### Descripción
`LightPool` que reserva N luces three.js (según calidad), un `LightAllocator` puro que decide qué luminarias obtienen luz real (importancia = intensidad × cercanía a cámara/objetos seleccionados − coste), y visuales emisivos para todas. Tiras LED aproximadas con varias luces puntuales/`RectAreaLight` según spike.

### Contexto
[ADR-0006](../ADR/0006-r3f-rendering-strategy.md) y [R3F_PERFORMANCE §2.7](../research/R3F_PERFORMANCE.md). Parte de las conclusiones del spike **P2-11** (coste de `PointLight` vs `RectAreaLight` vs `SpotLight` y confirmación de que el pool evita recompilaciones); aquí se **implementa** de forma definitiva y se revalida con luminarias reales.

### Requisitos
- Pool reservado al montar y por cambio de calidad (puede recompilar una vez); reasignación sin recompilar.
- Histéresis para evitar parpadeo al cambiar la asignación.
- Luces sin sombra por defecto.
- Documentar resultados del spike en el PR (tabla de coste).

### Criterios de aceptación
- [ ] Con 20 luminarias y pool de 8: 8 reciben luz, las 12 restantes solo brillo emisivo; ningún parpadeo al orbitar.
- [ ] Encender/apagar/cambiar color/mover una luminaria no cambia `renderer.info.programs.length`.
- [ ] `LightAllocator` es determinista (mismos inputs ⇒ mismos resultados).

### Tests esperados
- Unitarios del `LightAllocator` (orden, histéresis, límites).
- E2E: contar programas antes/después de operaciones de luz.

## ISSUE P5-06 — scene: modo día/noche (entorno procedural, sol con sombras, ventanas)

- **Tipo:** feature
- **Prioridad:** P0
- **Épica:** E5
- **Hito:** M5
- **Estimación:** L
- **Etiquetas:** area:scene
- **Depende de:** P5-05

### Descripción
Dos estados de iluminación global: **Día** (luz direccional con sombra ajustada a la sala, hemisférica, entorno `Lightformer` procedural; si hay ventanas, el color de cielo se ve por ellas y el sol entra por los huecos) y **Noche** (ambiente bajo azulado, sin sol, luna tenue). Transición animada de 700 ms interpolando parámetros.

### Contexto
[ARCHITECTURE §6.5](../ARCHITECTURE.md). Sin HDRI descargado; sin remontar nada.

### Requisitos
- Sombra del sol: cámara de sombra ajustada al *bounding box* de la sala; `autoUpdate` desactivado, actualizar al cambiar objetos.
- Sin ventanas (las aperturas son P1, ver P3-12) el modo día debe verse bien igualmente: luz hemisférica + entorno; el sol proyecta sombra desde «arriba» a través del techo oculto.
- Con ventanas: la luz de día entra por los huecos **por geometría** (los huecos de las paredes dejan pasar la sombra del sol); la dirección respeta `sunAzimuth`. Fondo/«exterior» visible por ellas (degradado de cielo).
- Atajo `N` para alternar.

### Criterios de aceptación
- [ ] Alternar día↔noche tarda ≈700 ms sin tirones (`programs.length` constante).
- [ ] De día, el sol proyecta sombras coherentes de los objetos en el suelo; si hay una ventana (P3-12), se ve el haz de luz entrando por ella.
- [ ] De noche, una luminaria encendida domina visiblemente la escena.
- [ ] Sin red: no se descarga ningún HDRI.

### Tests esperados
- Unitarios del cálculo de parámetros por modo/tiempo (funciones puras).
- E2E: alternar modo y verificar estado + captura de referencia.

## ISSUE P5-07 — scene: resplandor (bloom) selectivo según calidad

- **Tipo:** feature
- **Prioridad:** P1
- **Épica:** E5
- **Hito:** M5
- **Estimación:** M
- **Etiquetas:** area:scene, area:perf
- **Depende de:** P5-05

### Descripción
Postproceso de bloom (umbral sobre emisivos con `toneMapped=false`) activo en calidad media/alta, con intensidad dependiente del modo (más en noche), desactivado durante movimiento de cámara cuando la calidad adaptativa lo pida.

### Contexto
Aporta el “look” de neón. Dependencia: `@react-three/postprocessing`/`postprocessing` (justificar y verificar compatibilidad con R3F 9 / React 19).

### Requisitos
- Compatible con `frameloop="demand"` (el composer debe respetar invalidate).
- MSAA/SMAA razonable; sin degradar texto/UI (el HUD está fuera del Canvas).
- La exportación PNG debe incluir el bloom (P6-06).

### Criterios de aceptación
- [ ] Bloom visible en neones/tiras de noche y casi imperceptible de día.
- [ ] Coste medido < 3 ms/frame en GPU integrada en calidad media (o se reduce resolución del bloom).
- [ ] En calidad baja el bloom está desactivado y se conserva el brillo emisivo.

### Tests esperados
- E2E: activar/desactivar por calidad (estado); captura de referencia nocturna.

## ISSUE P5-08 — scene: efectos RGB animados con bucle de invalidación limitado

- **Tipo:** feature
- **Prioridad:** P1
- **Épica:** E5
- **Hito:** M5
- **Estimación:** M
- **Etiquetas:** area:scene, area:perf
- **Depende de:** P5-05

### Descripción
`EffectTicker` único que, mientras exista alguna luminaria con efecto no estático, llama a `invalidate()` a ≤30 fps y actualiza colores con `evaluateEffect`; se detiene cuando no quedan efectos activos o la pestaña está oculta. Respeta `prefers-reduced-motion`.

### Contexto
[ARCHITECTURE §6.2](../ARCHITECTURE.md). Mantiene el coste cero cuando todo es estático.

### Requisitos
- Ticker basado en `requestAnimationFrame` con limitador de fps.
- Pausa en `visibilitychange` oculto.
- Actualización de color por mutación (sin React).

### Criterios de aceptación
- [ ] Sin efectos activos: 0 frames en reposo. Con 1 efecto: ≈30 frames/s.
- [ ] Pestaña oculta: 0 frames.
- [ ] Con `prefers-reduced-motion`, los efectos arrancan en pausa con un control para reanudar.

### Tests esperados
- Unitarios del limitador de fps con reloj falso.
- E2E: contar frames con/sin efecto.

## ISSUE P5-09 — ui: controles de iluminación (día/noche, luminaria RGB, presets de ambiente)

- **Tipo:** feature
- **Prioridad:** P0
- **Épica:** E5
- **Hito:** M5
- **Estimación:** M
- **Etiquetas:** area:ui, area:ux
- **Depende de:** P5-04, P5-06

### Descripción
Botón día/noche en la barra inferior, popover «Luces» (todas on/off, intensidad global, presets de ambiente) y sección «Luz» en propiedades para luminarias (on/off, `RgbPicker`, intensidad, efecto y velocidad).

### Contexto
[DESIGN_SYSTEM §5.2](../DESIGN_SYSTEM.md). El selector RGB debe ser accesible (hex editable, paleta de presets, deslizadores H/S/L con valor numérico).

### Requisitos
- Cambios continuos (arrastrar color) coalescidos en 1 entrada.
- Vista en vivo sin pasar por React en el camino caliente (mutación directa del color con confirmación al soltar).
- Estados textuales además del color (accesibilidad).

### Criterios de aceptación
- [ ] Cambiar el color de una tira LED actualiza la escena en el mismo frame que el puntero y deja 1 entrada de historial.
- [ ] Aplicar el preset «Cyberpunk» cambia todas las luminarias y es deshacible de una vez.
- [ ] `RgbPicker` es operable solo con teclado.

### Tests esperados
- RTL del selector; E2E: aplicar preset + undo.

## ISSUE P5-10 — scene + ui: ajustes de calidad gráfica y calidad adaptativa

- **Tipo:** feature
- **Prioridad:** P0
- **Épica:** E5
- **Hito:** M5
- **Estimación:** M
- **Etiquetas:** area:scene, area:ui, area:perf
- **Depende de:** P5-05, P5-06

### Descripción
Niveles Baja/Media/Alta/Auto que fijan `dpr`, tamaño del pool, sombras, bloom y anisotropía. «Auto» usa `PerformanceMonitor` (límites y *flipflops*) y `performance.regress()` al orbitar. La elección se guarda como preferencia de UI. En móvil/visor el defecto es Baja.

### Contexto
[R3F_PERFORMANCE §2.8](../research/R3F_PERFORMANCE.md). Cambiar de nivel puede recompilar una vez (se hace con indicador de «Aplicando calidad…»).

### Requisitos
- Tabla de niveles documentada en el código y en DESIGN/ARCHITECTURE.
- Oscilación controlada (no cambiar más de 1 nivel cada 5 s).
- Mostrar el nivel actual y el FPS en un indicador opcional.

### Criterios de aceptación
- [ ] En un equipo lento, «Auto» baja de nivel tras sostener <30 FPS 3 s y no oscila.
- [ ] Al orbitar, `performance.regress()` baja `dpr`/bloom temporalmente y los restaura al soltar.
- [ ] La elección persiste tras recargar.

### Tests esperados
- Unitarios de la máquina de estados de calidad con FPS simulados.
- E2E: cambiar nivel y verificar parámetros de renderer.
