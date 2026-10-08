# Fase 3 — Editor interactivo (M3)

## ISSUE E3 — Épica: Editor interactivo

- **Tipo:** epic
- **Prioridad:** P0
- **Épica:** —
- **Hito:** M3
- **Estimación:** — (suma de las hijas)
- **Etiquetas:** area:ui, area:scene, area:core
- **Depende de:** —

### Descripción
Convertir el motor en un editor usable: crear sala, añadir objetos desde el catálogo (arrastrar y soltar), seleccionar, mover, rotar con snap, editar propiedades, puertas/ventanas, atajos y undo/redo desde la interfaz.

### Contexto
La **sensación de juego** es el principal diferenciador de UX. Esta fase se valida con pruebas de uso reales (ver criterios).

### Requisitos
- Interacciones sin `setState` en el camino caliente ([ADR-0006](../ADR/0006-r3f-rendering-strategy.md)).
- Cada interacción continua produce una sola entrada de historial.

### Criterios de aceptación
- [ ] Una persona nueva coloca 5 objetos, los rota y deshace sin ayuda en <3 min (prueba informal con ≥3 personas, registrada en la issue).
- [ ] 60 fps en interacción con 50 objetos en el hardware de referencia (sin luces avanzadas todavía).
- [ ] Todas las issues hijas cerradas.

### Tests esperados
Ver issues hijas.

## ISSUE P3-01 — core: geometría de colocación (snap, límites, snap a pared, huellas OBB)

- **Tipo:** feature
- **Prioridad:** P0
- **Épica:** E3
- **Hito:** M3
- **Estimación:** L
- **Etiquetas:** area:core
- **Depende de:** P2-01

### Descripción
Biblioteca pura en `core/geometry`: snap a rejilla (5/10/25/50 cm), snap angular (15°/45°/90°), huella OBB de un objeto, *clamp* dentro de la sala, **snap a pared** (cara trasera alineada y orientada), intersección rayo–plano y un `solvePlacement(input) → { transform, valid, reason, guides }`.

### Contexto
[ARCHITECTURE §6.1](../ARCHITECTURE.md): la matemática vive en `core` para probarla sin WebGL. Es la base de arrastre (P3-04), rotación (P3-05) y colocación sobre superficies (P3-13).

### Requisitos
- Tipos `Vec2/Vec3`, funciones puras sin asignaciones innecesarias (variantes *out-param* para el camino caliente).
- Tolerancia numérica documentada (1 mm).
- `solvePlacement` devuelve guías (líneas/etiquetas) para la UI.
- Sin dependencias de three.

### Criterios de aceptación
- [ ] Un objeto arrastrado hacia una pared a <15 cm se alinea con su cara trasera pegada y rotado correctamente (4 paredes × 4 orientaciones iniciales).
- [ ] El resultado nunca deja la huella fuera de la sala (propiedad con fast-check).
- [ ] Snap idempotente: `snap(snap(x)) === snap(x)`.
- [ ] Cobertura ≥ 95 % en `geometry`.

### Tests esperados
- Unitarios por función; tabla de casos de wall-snap.
- Propiedades (fast-check) de límites e idempotencia.

## ISSUE P3-02 — core: comandos de objetos, CatalogProvider e invariantes

- **Tipo:** feature
- **Prioridad:** P0
- **Épica:** E3
- **Hito:** M3
- **Estimación:** L
- **Etiquetas:** area:core
- **Depende de:** P2-03, P3-01

### Descripción
Comandos `object/add`, `object/move`, `object/rotate`, `object/setProps`, `object/remove`, `object/duplicate`; puerto `CatalogProvider` con catálogo de fixtures para tests; verificación de invariantes I1–I4 y I6.

### Contexto
[ARCHITECTURE §4.5](../ARCHITECTURE.md). Los comandos aceptan arrays de IDs desde el principio (multi-selección futura). `catalogId` desconocido se conserva (I6).

### Requisitos
- `object/add` calcula posición válida cercana si la solicitada es inválida (política documentada) o devuelve error.
- `object/duplicate` desplaza una cantidad configurable y respeta límites; conserva `parentId` solo si el padre también se duplica.
- Eliminar un objeto con hijos: política (eliminar hijos) documentada y probada.
- `object/move` con coalescing por `mergeKey`.

### Criterios de aceptación
- [ ] Propiedad: secuencias aleatorias de comandos de objetos mantienen I1–I7 y `undo` total restaura el documento.
- [ ] Añadir el objeto n.º 301 devuelve error `LIMIT_REACHED`.
- [ ] Mover fuera de la sala devuelve `ok:false` (o clamp según política) sin cambiar el documento.
- [ ] Cobertura ≥ 90 % en `commands/object`.

### Tests esperados
- Unitarios por comando; fast-check de secuencias; casos de borde (hijos, límites, catálogo desconocido).

## ISSUE P3-03 — scene: selección (clic, hover, contorno) con colliders proxy

- **Tipo:** feature
- **Prioridad:** P0
- **Épica:** E3
- **Hito:** M3
- **Estimación:** M
- **Etiquetas:** area:scene
- **Depende de:** P2-09, P2-05

### Descripción
Selección por clic y hover en el viewport usando una caja proxy invisible por objeto (dimensiones del catálogo). Contorno de selección/hover con el acento y caja de dimensiones. `Esc` y clic en vacío deseleccionan.

### Contexto
[R3F_PERFORMANCE §2.11](../research/R3F_PERFORMANCE.md): evitar raycast contra mallas complejas; hover limitado a un raycast por frame.

### Requisitos
- Proxy de colisión desacoplado de la malla visual.
- Contorno sin duplicar geometría pesada (shader/outline barato o `Edges` de drei sobre la caja proxy).
- No selecciona objetos bloqueados u ocultos; paredes/suelo no son seleccionables como objetos.
- Click a través de objetos transparentes (paredes atenuadas) no los selecciona.

### Criterios de aceptación
- [ ] Hover y selección no re-renderizan componentes React (conteo de renders = 0 por movimiento de puntero).
- [ ] Con 100 objetos, el coste del hover < 0,5 ms por frame (medido con `performance.now`).
- [ ] La selección se refleja en el panel de propiedades y se limpia al borrar el objeto.

### Tests esperados
- Unitario del selector de rayos (rayo sintético → id).
- E2E: clic en un objeto del escenario de prueba selecciona; `Esc` deselecciona.

## ISSUE P3-04 — scene: mover objetos arrastrando sobre el suelo con snap y fantasma

- **Tipo:** feature
- **Prioridad:** P0
- **Épica:** E3
- **Hito:** M3
- **Estimación:** L
- **Etiquetas:** area:scene, area:ux
- **Depende de:** P3-01, P3-02, P3-03

### Descripción
`MoveController`: arrastrar un objeto seleccionado sobre el plano del suelo (intersección analítica rayo–plano), con snap a rejilla y pared, indicador de validez (acento/rojo), guías, `Esc` para cancelar y **un único comando `object/move` al soltar**.

### Contexto
Flujo de [ARCHITECTURE §4.2](../ARCHITECTURE.md). Camino caliente: sin React, sin asignaciones por frame.

### Requisitos
- Pointer capture; soporte de ratón y lápiz/táctil básico.
- La cámara no orbita mientras se arrastra.
- `Alt` desactiva snap; flechas mueven un paso de snap (`Shift` ×10).
- Publicar X/Z al *transient store* como máximo una vez por frame.

### Criterios de aceptación
- [ ] Arrastrar produce 1 entrada de historial y `Ctrl+Z` devuelve el objeto a su posición original.
- [ ] `Esc` durante el arrastre restaura la posición sin entrada de historial.
- [ ] Sin asignaciones por frame en el controlador (verificado con perfil de memoria en la PR).
- [ ] 60 fps arrastrando con 50 objetos (GPU de referencia).

### Tests esperados
- Unitarios del controlador con rayos sintéticos y `session` real (sin WebGL).
- E2E: arrastrar objeto con el ratón, comprobar posición final y undo.

## ISSUE P3-05 — scene: rotación (teclas, asa circular, snap angular)

- **Tipo:** feature
- **Prioridad:** P0
- **Épica:** E3
- **Hito:** M3
- **Estimación:** M
- **Etiquetas:** area:scene, area:ux
- **Depende de:** P3-04

### Descripción
Rotar el objeto seleccionado con `R` (+paso), `Shift+R` (−paso), un asa circular arrastrable y rueda del ratón mientras se arrastra. Paso configurable (15° por defecto); `Alt` sin snap.

### Contexto
La rotación durante la colocación («como en un juego») es esencial para la sensación de construcción.

### Requisitos
- `RotateController` análogo al de movimiento (un comando por gesto).
- Ángulo mostrado como etiqueta junto al asa.
- Respetar la rotación de pared (wall-snap fija orientación).

### Criterios de aceptación
- [ ] 24 pulsaciones de `R` con paso 15° devuelven a la orientación inicial.
- [ ] Arrastrar el asa produce 1 entrada de historial.
- [ ] Rotar un objeto cerca de una pared no deja su huella fuera de la sala (se bloquea o se desplaza según política documentada).

### Tests esperados
- Unitarios de cálculo de ángulo/snap.
- E2E: rotar con teclado y con asa; undo.

## ISSUE P3-06 — ui: panel de catálogo mínimo y drag & drop al canvas

- **Tipo:** feature
- **Prioridad:** P0
- **Épica:** E3
- **Hito:** M3
- **Estimación:** M
- **Etiquetas:** area:ui, area:scene
- **Depende de:** P3-04

### Descripción
Panel izquierdo con lista/rejilla de items de un **manifiesto stub** (5 items con cajas de colores), búsqueda por texto y arrastre al viewport con fantasma de colocación (`PlaceController`). Clic en un item también lo coloca en el centro de la vista.

### Contexto
El catálogo real y sus miniaturas llegan en la Fase 4 (P4-06 sustituye este panel). Aquí se resuelve la **mecánica** de drag & drop.

### Requisitos
- Arrastre basado en eventos de puntero (no HTML5 DnD nativo, para controlar el fantasma 3D y táctil).
- El fantasma sigue el cursor sobre el suelo con las mismas reglas de snap/validez que el movimiento.
- Soltar fuera del viewport cancela.
- Cada colocación = `object/add` (1 entrada de historial).

### Criterios de aceptación
- [ ] Arrastrar un item, moverlo sobre el suelo y soltar crea el objeto en la posición del fantasma.
- [ ] Soltar sobre un panel o fuera del viewport no crea nada.
- [ ] Teclado: Enter sobre un item lo coloca en el centro (accesibilidad).

### Tests esperados
- RTL del panel (búsqueda, foco, Enter).
- E2E: arrastrar/soltar desde el panel y verificar el recuento de objetos.

## ISSUE P3-07 — ui: panel de propiedades del objeto seleccionado

- **Tipo:** feature
- **Prioridad:** P0
- **Épica:** E3
- **Hito:** M3
- **Estimación:** M
- **Etiquetas:** area:ui
- **Depende de:** P3-03, P3-02

### Descripción
Panel derecho con nombre, posición (X, Z, elevación), rotación, dimensiones (solo lectura en MVP), bloqueo, visibilidad y botones duplicar/eliminar. Componente `ScrubInput` (arrastrar la etiqueta cambia el valor, flechas ±, Enter confirma).

### Contexto
[DESIGN_SYSTEM §5.2](../DESIGN_SYSTEM.md). Los valores en vivo durante un arrastre vienen del *transient store* (1 actualización por frame); al confirmar se genera un comando con `mergeKey`.

### Requisitos
- Edición numérica con validación y *clamp* (mensaje si se rechaza).
- Coalescing: teclear/arrastrar el valor en un campo produce una sola entrada.
- Estado vacío («Selecciona un objeto»); multi-selección futura mostrará «Varios valores».
- Unidades en cm en la UI (el modelo guarda metros).

### Criterios de aceptación
- [ ] Cambiar X/Z desde el panel mueve el objeto y soporta undo.
- [ ] Mientras se arrastra el objeto, los campos X/Z se actualizan sin que el panel se re-renderice más de 1 vez por frame.
- [ ] Valores inválidos (fuera de sala) muestran error accesible (`aria-invalid` + mensaje).

### Tests esperados
- RTL: edición, validación, atajos de teclado en el campo.
- Unitarios de conversión de unidades.

## ISSUE P3-08 — ui: ShortcutRegistry, atajos, undo/redo en UI y ayuda

- **Tipo:** feature
- **Prioridad:** P0
- **Épica:** E3
- **Hito:** M3
- **Estimación:** M
- **Etiquetas:** area:ui, area:ux
- **Depende de:** P2-03, P1-06

### Descripción
Registro de atajos como **datos** (id, teclas, ámbito, handler, descripción), manejo global que ignora campos de texto, botones de undo/redo con tooltip de etiqueta («Deshacer: mover escritorio»), diálogo de ayuda (`?`).

### Contexto
Tabla de atajos en [DESIGN_SYSTEM §4](../DESIGN_SYSTEM.md). Los atajos deben funcionar en Windows/Linux (`Ctrl`) y macOS (`⌘`).

### Requisitos
- Detección de plataforma para mostrar `Ctrl`/`⌘`.
- Prevención de conflictos con atajos del navegador (`Ctrl+Z` en inputs sigue siendo del input).
- Registro extensible por módulo; la ayuda se genera del registro.

### Criterios de aceptación
- [ ] `Ctrl/⌘+Z`, `Ctrl/⌘+Shift+Z`, `Ctrl+Y`, `Supr`, `R`, `G`, `1`, `2`, `F`, `N`, `?` funcionan fuera de campos de texto y no dentro.
- [ ] El diálogo `?` lista exactamente los atajos registrados.
- [ ] Los botones de undo/redo se deshabilitan según `canUndo/canRedo`.

### Tests esperados
- Unitarios del registro (resolución, ámbitos, conflictos).
- RTL: eventos de teclado con foco en input vs. fuera.

## ISSUE P3-09 — ui: barra superior e inferior (proyecto, estado, herramientas, vistas, snap)

- **Tipo:** feature
- **Prioridad:** P0
- **Épica:** E3
- **Hito:** M3
- **Estimación:** M
- **Etiquetas:** area:ui, area:ux
- **Depende de:** P1-06, P3-08

### Descripción
TopBar (logo, nombre de proyecto editable, `StatusPill` de guardado, undo/redo, menú Exportar y Compartir como *placeholders*), BottomBar (herramienta, snap on/off + tamaño, paso de rotación, vista perspectiva/superior, modo de paredes, día/noche y luces como placeholders).

### Contexto
[DESIGN_SYSTEM §3](../DESIGN_SYSTEM.md). Los controles de día/noche e iluminación se conectan en P5-09; exportar en P6-05/P6-06.

### Requisitos
- Controles conectados al store de sesión/UI (snap, vista, paredes).
- Tooltips con atajos (`Kbd`).
- Nombre de proyecto editable inline con validación (≤80 caracteres).

### Criterios de aceptación
- [ ] Cambiar snap/tamaño actualiza el comportamiento del arrastre inmediatamente.
- [ ] Renombrar el proyecto con Enter/blur; Esc cancela.
- [ ] Los controles tienen nombre accesible y se operan con teclado.

### Tests esperados
- RTL: cada control cambia el estado esperado.
- E2E: alternar vista y snap.

## ISSUE P3-10 — ui: asistente «Nueva habitación» y edición de dimensiones y superficies

- **Tipo:** feature
- **Prioridad:** P0
- **Épica:** E3
- **Hito:** M3
- **Estimación:** M
- **Etiquetas:** area:ui
- **Depende de:** P2-04, P2-07

### Descripción
Diálogo de creación de sala (ancho, fondo, alto con límites, presets: Pequeña 3×3, Despacho 4×3,5, Gaming 4×4,5), vista previa 2D en vivo, y edición posterior de dimensiones desde el panel de propiedades de la sala (clic en suelo/pared/techo selecciona la superficie).

### Contexto
FR-ROOM-01..04 del [PRD](../PRD.md). La política de conflictos al redimensionar viene de P2-04 (se muestran los objetos afectados).

### Requisitos
- Validación inline accesible; unidades cm/m.
- Al redimensionar con conflictos: mensaje con la lista y botón «Ver objetos» que los resalta.
- Seleccionar superficie (suelo/pared/techo) muestra sus propiedades (material en P5-03).

### Criterios de aceptación
- [ ] Crear una sala de 4×4,5×2,6 m genera la sala centrada y encuadrada.
- [ ] Reducir una sala dejando un objeto fuera muestra el conflicto y no aplica el cambio.
- [ ] Valores fuera de límites no se pueden confirmar.

### Tests esperados
- RTL del asistente (validación, presets, errores).
- E2E: crear sala y redimensionar.

## ISSUE P3-11 — core: aperturas (puertas y ventanas): comandos y validación

- **Tipo:** feature
- **Prioridad:** P1
- **Épica:** E3
- **Hito:** M3
- **Estimación:** M
- **Etiquetas:** area:core
- **Depende de:** P2-04

### Descripción
Comandos `opening/add`, `opening/move`, `opening/resize`, `opening/remove`; validación I4 (dentro de la pared, sin solapes, dentro de la altura, distancia mínima a esquinas); variantes: puerta simple, puerta doble, ventana estándar, ventana grande.

### Contexto
[DOMAIN_MODEL](../DOMAIN_MODEL.md): `offset` a lo largo de la pared. Los objetos de pared (cuadros, TV) no pueden colocarse delante de una apertura (regla de aviso en P3-14).

**Decisión de alcance (P1, no P0):** puertas y ventanas aparecen en la visión del producto pero **no** en la lista de MVP del brief original. Se planifican como P1: dan realismo y sentido al modo día/noche, pero son las primeras candidatas a recorte si el calendario aprieta. El modo día/noche (P5-06) no depende de ellas.

### Requisitos
- Dimensiones por defecto por variante (constantes exportadas).
- `opening/move` desliza en la misma pared y permite cambiar de pared.
- Ajuste automático al borde válido más cercano (política documentada).

### Criterios de aceptación
- [ ] Dos aperturas que se solapan: la segunda se rechaza (`OVERLAP`).
- [ ] Una apertura fuera de rango se ajusta o rechaza según política; nunca queda inválida.
- [ ] Undo/redo de cada comando restaura exactamente (propiedad).

### Tests esperados
- Unitarios + fast-check (aperturas aleatorias válidas ⇒ invariantes).

## ISSUE P3-12 — scene: aperturas en paredes (huecos, colocar y deslizar)

- **Tipo:** feature
- **Prioridad:** P1
- **Épica:** E3
- **Hito:** M3
- **Estimación:** L
- **Etiquetas:** area:scene
- **Depende de:** P3-11, P2-07, P3-04

### Descripción
Generar paredes con huecos (contornos con agujeros extruidos, sin CSG), marco y hoja/cristal de puertas y ventanas (paramétricos), y `OpeningController` para colocarlas arrastrando sobre una pared (snap, validez) y deslizarlas.

### Contexto
Extiende `buildRoomGeometry` de P2-07 con aperturas. Las ventanas deben dejar pasar la luz/ambiente (se conecta en P5-06).

### Requisitos
- Regenerar solo la pared afectada al cambiar una apertura.
- Catálogo de aperturas en el panel (pestaña «Estructura»).
- Selección y borrado de aperturas (outliner y clic).

### Criterios de aceptación
- [ ] Arrastrar una puerta sobre una pared crea el hueco en vivo y al soltar genera 1 comando.
- [ ] Las 4 variantes se renderizan sin artefactos en las 4 paredes.
- [ ] Solo se regenera la geometría de la pared modificada (test de memoización).

### Tests esperados
- Unitarios de `buildWallGeometry` con huecos (áreas y *bounding boxes*).
- E2E: colocar puerta y ventana, undo.

## ISSUE P3-13 — core + scene: colocación sobre superficies (objetos sobre escritorios)

- **Tipo:** feature
- **Prioridad:** P1
- **Épica:** E3
- **Hito:** M3
- **Estimación:** L
- **Etiquetas:** area:core, area:scene, area:ux
- **Depende de:** P3-04

### Descripción
Los items `tabletop` (monitor, teclado, lámpara, altavoces…) se apoyan sobre las **superficies de apoyo** de otros objetos (tablero del escritorio): al arrastrarlos sobre un escritorio, adoptan su altura (`parentId`) y se mueven con él.

### Contexto
Es clave para los setups gaming: sin esto el usuario no puede montar un escritorio realista. [DOMAIN_MODEL](../DOMAIN_MODEL.md): `parentId` + transform local; I2 jerarquía de profundidad ≤2.

### Requisitos
- `solvePlacement` extendido: raycast analítico contra rectángulos de apoyo; elegir la superficie más cercana a la cámara.
- Comando `object/reparent`; mover el padre mueve a los hijos (transform local).
- Eliminar el padre elimina hijos (o los suelta al suelo según política; por defecto eliminar, con aviso).
- Los límites del tablero impiden colocar fuera del borde (con tolerancia).

### Criterios de aceptación
- [ ] Un monitor arrastrado sobre un escritorio queda a la altura del tablero y dentro de su superficie.
- [ ] Mover el escritorio mueve monitor y teclado; undo restaura todo en una entrada.
- [ ] Un objeto `floor` no puede apoyarse sobre un escritorio.
- [ ] Propiedad: las posiciones mundiales de hijos son consistentes tras secuencias aleatorias de mover/rotar el padre.

### Tests esperados
- Unitarios de geometría de apoyo; fast-check de transformaciones; E2E del escenario «montar escritorio».

## ISSUE P3-14 — scene: avisos de colisión y fuera de límites

- **Tipo:** task
- **Prioridad:** P2
- **Épica:** E3
- **Hito:** M3
- **Estimación:** M
- **Etiquetas:** area:scene, area:core
- **Depende de:** P3-04

### Descripción
Detección de solapes entre huellas OBB de objetos de suelo (y entre objetos de pared y aperturas) y feedback visual (tinte de aviso + icono) **sin bloquear** la colocación; panel de problemas opcional.

### Contexto
En setups reales algunos solapes son legítimos (silla bajo el escritorio), por eso es un aviso. Atributo opcional `allowOverlap` en el manifiesto.

### Requisitos
- Test de solape OBB–OBB (SAT) en `core/geometry`, con aceleración espacial simple si >100 objetos.
- Estado derivado `warnings` calculado fuera del documento (no se persiste).
- Marcado por catálogo: `allowOverlapWith: ['seating']` para sillas bajo escritorios.

### Criterios de aceptación
- [ ] Dos estanterías solapadas muestran aviso; una silla bajo un escritorio no.
- [ ] El cálculo con 300 objetos < 2 ms por actualización.
- [ ] El aviso desaparece al corregir y no afecta al historial.

### Tests esperados
- Unitarios SAT (casos tangentes, rotados) y de rendimiento.

## ISSUE P3-15 — ui: panel de escena (outliner)

- **Tipo:** feature
- **Prioridad:** P1
- **Épica:** E3
- **Hito:** M3
- **Estimación:** M
- **Etiquetas:** area:ui, area:a11y
- **Depende de:** P3-07

### Descripción
Pestaña «Escena» en el panel derecho: lista jerárquica de sala, aperturas y objetos (con hijos), seleccionar, renombrar, ocultar, bloquear, eliminar y reordenar. Es también la **alternativa accesible** al canvas.

### Contexto
[ARCHITECTURE §12](../ARCHITECTURE.md). Navegable con teclado (flechas, Enter, F2, Supr); anuncios `aria-live`.

### Requisitos
- Virtualización solo si >200 filas.
- Sincronización bidireccional de selección con el viewport.
- Renombrar con coalescing (`object/setProps`).

### Criterios de aceptación
- [ ] Todas las acciones del outliner son operables solo con teclado.
- [ ] Ocultar/bloquear se refleja en el viewport y es undoable.
- [ ] Lector de pantalla anuncia selección y acciones (verificado con axe + prueba manual).

### Tests esperados
- RTL de teclado y selección; axe sin violaciones graves.
