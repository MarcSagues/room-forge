# Fase 10 — HomeForge: la casa completa (M10)

> Decidido por el propietario el 2026-10-11: el producto pasa de diseñar **una habitación** (RoomForge) a diseñar **la casa** (HomeForge). Hay dos modos: **Habitación** (plan gratuito, 1 habitación por proyecto) y **Casa** (plan premium: varias habitaciones, pasillos y puertas entre ellas). Sin pagos, cuentas ni backend por ahora: el plan es local y los pagos siguen en P9-05.

## ISSUE E10 — Épica: HomeForge, de la habitación a la casa

- **Tipo:** epic
- **Prioridad:** P1
- **Épica:** —
- **Hito:** M10
- **Estimación:** — (suma de las hijas)
- **Etiquetas:** area:core, area:scene, area:ui
- **Depende de:** —

### Descripción
Abrir y cerrar puertas; habitaciones con forma libre (en L, U, T…); proyectos con varias habitaciones y pasillos conectados por puertas; modo Habitación (gratuito) y modo Casa (premium) con un plan local; y cambio de nombre del producto y del código a HomeForge.

### Contexto
El modelo de dominio ya lo prevé ([DOMAIN_MODEL](../DOMAIN_MODEL.md) §«Vivienda completa»: el mapa `rooms`, `roomOrder` y `Room.origin` existen). Monetización real: [P9-05](09-ai-monetization.md).

### Requisitos
- Decisión documentada en una ADR antes de implementar (P10-01).
- Los proyectos existentes de una habitación siguen abriéndose igual (migración aditiva).

### Criterios de aceptación
- [ ] Un proyecto premium puede tener varias habitaciones y pasillos unidos por puertas que se abren y cierran.
- [ ] El plan gratuito queda limitado a una habitación, con un aviso claro del plan premium.
- [ ] El producto se llama HomeForge en la interfaz, el código y la documentación, sin perder datos guardados.

### Tests esperados
Ver issues hijas.

## ISSUE P10-01 — docs: ADR HomeForge (modos Habitación/Casa y planes gratuito/premium)

- **Tipo:** task
- **Prioridad:** P1
- **Épica:** E10
- **Hito:** M10
- **Estimación:** S
- **Etiquetas:** area:docs, needs-decision
- **Depende de:** —

### Descripción
ADR que fija el nuevo alcance: nombre HomeForge, modo Habitación y modo Casa, qué incluye cada plan, cómo se aplica el límite sin backend y cómo encaja después con cuentas y pagos (P9-01, P9-05). Actualiza PRD (visión, alcance, requisitos FR-HOME-*), DOMAIN_MODEL (varias salas, pasillos, puertas compartidas, estado abierto/cerrado) y ROADMAP.

### Contexto
Decisiones del propietario (2026-10-11): renombrar producto y código; premium «solo el límite, sin pagos»; plan gratuito = 1 habitación por proyecto.

### Requisitos
- El límite del plan es una **política de la app** (puerto `PlanPolicy`), no una regla del documento: un archivo importado con varias salas se abre igualmente (en modo solo lectura o con aviso en el plan gratuito, según decida la ADR).
- Sin pagos, sin cuentas, sin backend.

### Criterios de aceptación
- [ ] ADR aceptada y enlazada desde el índice de ADR.
- [ ] PRD, DOMAIN_MODEL y ROADMAP actualizados.

### Tests esperados
- `node tools/planning/github-import.mjs validate` sin avisos.

## ISSUE P10-02 — puertas que se abren y se cierran

- **Tipo:** feature
- **Prioridad:** P1
- **Épica:** E10
- **Hito:** M10
- **Estimación:** M
- **Etiquetas:** area:core, area:scene, area:ui
- **Depende de:** P10-01

### Descripción
Cada puerta tiene un estado de apertura (cerrada/abierta, con ángulo y sentido de giro: hacia dentro/fuera, bisagra izquierda/derecha). Se abre y cierra con doble clic en la puerta, con un control en el panel de propiedades y desde el outliner; la hoja gira con una animación breve.

### Contexto
Las puertas y sus hojas existen desde P3-12 (`WallOpeningsLayer`, `InstancedMesh` por material). Render bajo demanda: la animación usa un bucle de invalidación acotado y respeta `prefers-reduced-motion`.

### Requisitos
- `core`: campos nuevos en `Opening` de tipo puerta (`swing`, `hinge`, `open` 0…1) con migración del esquema; comando `opening/setOpen` deshacible y que se fusiona al repetir.
- La hoja abierta no puede atravesar un objeto ni otra pared en su barrido: aviso o bloqueo según la ADR.
- Sin asignaciones en `useFrame`; nº de programas constante (sin recompilar).

### Criterios de aceptación
- [ ] Abrir y cerrar una puerta es una entrada de historial y se guarda en el proyecto.
- [ ] La animación se ve fluida y el lienzo vuelve a reposo al terminar.
- [ ] Operable con teclado desde el outliner y el panel de propiedades.

### Tests esperados
- Unitarios de core (esquema, migración, comando) con propiedades fast-check.
- E2E: abrir y cerrar con doble clic, deshacer, recargar y conservar el estado; `renderer.info` sin programas nuevos.

## ISSUE P10-03 — core: varias habitaciones y pasillos en un plano

- **Tipo:** feature
- **Prioridad:** P1
- **Épica:** E10
- **Hito:** M10
- **Estimación:** L
- **Etiquetas:** area:core
- **Depende de:** P10-01, P10-09

### Descripción
Un proyecto puede contener varias habitaciones colocadas en un mismo plano (`Room.origin` real y rotación en múltiplos de 90°) y **pasillos** (habitaciones de tipo `corridor`, estrechas). Comandos para añadir, mover, redimensionar, renombrar y quitar salas.

### Contexto
`rooms` y `roomOrder` ya existen; hoy el editor asume una sala en el origen.

### Requisitos
- Invariantes nuevas: las salas no se solapan; las paredes coincidentes se detectan como **pared compartida** (mismo segmento, grosor único).
- Pasillos: ancho mínimo y máximo configurables en `LIMITS`.
- Objetos y aperturas siguen perteneciendo a su sala; mover una sala mueve su contenido.
- Migración aditiva: los documentos actuales (una sala) no cambian de significado.

### Criterios de aceptación
- [ ] Se pueden añadir, mover y quitar salas y pasillos sin solaparse, cada acción una entrada de historial.
- [ ] La detección de paredes compartidas es estable (propiedad).

### Tests esperados
- Unitarios y propiedades fast-check (no solapamiento, paredes compartidas simétricas, deshacer restaura).

## ISSUE P10-04 — core + scene: puertas entre habitaciones

- **Tipo:** feature
- **Prioridad:** P1
- **Épica:** E10
- **Hito:** M10
- **Estimación:** M
- **Etiquetas:** area:core, area:scene
- **Depende de:** P10-03, P10-02

### Descripción
Una puerta (o hueco de paso) colocada en una pared compartida une dos salas: hace el hueco en ambas caras y pertenece a la pared compartida.

### Contexto
Hoy cada apertura pertenece a una pared de una sala (P3-11, P3-12); las paredes compartidas llegan con P10-03.

### Requisitos
- `core`: la apertura referencia la pared compartida; invariantes de encaje en ambas salas.
- Escena: un solo hueco y una sola hoja; deslizar la puerta funciona como en P3-12.

### Criterios de aceptación
- [ ] Se puede pasar de una sala a otra por una puerta y abrirla/cerrarla.
- [ ] Mover una de las dos salas rechaza o reubica la puerta compartida sin dejarla en un estado inválido.

### Tests esperados
- Unitarios de core; E2E colocando una puerta entre dos salas.

## ISSUE P10-05 — scene: renderizar la casa

- **Tipo:** feature
- **Prioridad:** P1
- **Épica:** E10
- **Hito:** M10
- **Estimación:** L
- **Etiquetas:** area:scene, area:perf
- **Depende de:** P10-03

### Descripción
La escena dibuja todas las salas del proyecto: paredes compartidas una sola vez, suelos y techos por sala, modos de pared (arriba/corte/abajo) coherentes en toda la casa, encuadre y límites de cámara de la casa entera, vista superior como plano de la vivienda y selección de sala.

### Contexto
`RoomMesh`, `CameraRig` y los modos de pared (P2-07, P2-08, P2-10) asumen hoy una sala en el origen.

### Requisitos
- Recursos compartidos (geometrías por pared memoizadas); presupuestos de escena para una casa de 6 salas medidos con `renderer.info`.
- El pool de luces y día/noche funcionan con varias salas.

### Criterios de aceptación
- [ ] Una casa de 6 salas y 40 objetos cumple el presupuesto de escena y el FPS objetivo.
- [ ] «Encuadrar» (F) muestra la casa completa en perspectiva y en planta.

### Tests esperados
- E2E con `renderer.info`; test de que mover una sala solo reconstruye sus paredes.

## ISSUE P10-06 — ui: editar la distribución de la casa

- **Tipo:** feature
- **Prioridad:** P1
- **Épica:** E10
- **Hito:** M10
- **Estimación:** L
- **Etiquetas:** area:ui, area:a11y
- **Depende de:** P10-03, P10-05

### Descripción
Herramientas para crear la casa: añadir habitación o pasillo (con tamaño), arrastrarlos en la vista superior con imán a las paredes de otras salas, renombrarlos, y verlos en el outliner como primer nivel. Plantilla «Piso de dos habitaciones» para el modo Casa.

### Contexto
Reutiliza el asistente de nueva habitación (P3-10), el outliner (P3-15) y las plantillas (P8-02).

### Requisitos
- Un gesto = una entrada de historial; textos en i18n; accesible con teclado.

### Criterios de aceptación
- [ ] Una persona crea una casa de 3 salas y un pasillo unidas por puertas en menos de 5 minutos.
- [ ] Todas las acciones de distribución son operables con teclado y se deshacen de una en una.

### Tests esperados
- RTL de los controles; E2E creando dos salas, un pasillo y una puerta entre ellas.

## ISSUE P10-07 — planes gratuito y premium (límite local, sin pagos)

- **Tipo:** feature
- **Prioridad:** P1
- **Épica:** E10
- **Hito:** M10
- **Estimación:** M
- **Etiquetas:** area:ui, area:core
- **Depende de:** P10-01, P10-06

### Descripción
Plan **gratuito**: modo Habitación, 1 habitación por proyecto. Plan **premium**: modo Casa (varias habitaciones, pasillos y puertas entre ellas, plantillas de casa). Sin pagos: el plan se guarda en local, hay una pantalla «Premium próximamente» y un interruptor de desarrollo para probar el modo Casa.

### Contexto
AGENTS.md prohíbe pagos, cuentas y backend sin autorización: el propietario eligió «solo el límite, sin pagos» (2026-10-11). Pagos reales: P9-05.

### Requisitos
- Puerto `PlanPolicy` en la capa de app (no en `core`); la UI desactiva las acciones de Casa con explicación accesible y enlace a la pantalla premium.
- Abrir un proyecto con varias salas en el plan gratuito: según la ADR (solo lectura con aviso).
- Preparado para conectar después con cuentas y pagos (P9-01, P9-05).

### Criterios de aceptación
- [ ] En el plan gratuito no se puede añadir una segunda sala; el aviso explica el plan premium.
- [ ] Con el plan premium (interruptor local) todo el modo Casa funciona.

### Tests esperados
- Unitarios de la política; RTL de los avisos; E2E en ambos planes.

## ISSUE P10-08 — renombrar RoomForge a HomeForge (producto y código)

- **Tipo:** task
- **Prioridad:** P1
- **Épica:** E10
- **Hito:** M10
- **Estimación:** L
- **Etiquetas:** area:infra, area:ui
- **Depende de:** P10-01

### Descripción
Nombre visible, textos (es/en), landing, metadatos/SEO, documentación, paquetes (`@homeforge/core`, `@homeforge/web`), y claves de almacenamiento: base de datos IndexedDB, `localStorage` (`roomforge.*` → `homeforge.*`) y formato de archivo, **con migración** de lo ya guardado.

### Contexto
Toca casi todos los ficheros: se hace cuando no haya PRs abiertos. Renombrar el repositorio de GitHub es una acción remota que solo hace el propietario o autoriza aparte.

### Requisitos
- Los proyectos guardados como RoomForge se abren y se migran sin pérdida; los archivos `.roomforge.json` y enlaces `/view/#v1.` antiguos se siguen aceptando.
- Biome, dependency-cruiser y CI sin cambios de comportamiento.

### Criterios de aceptación
- [ ] No queda «RoomForge» visible en la interfaz ni en la documentación (salvo historia y migraciones).
- [ ] Un proyecto creado antes del cambio se abre después sin pérdida.

### Tests esperados
- E2E: datos sembrados con claves antiguas se migran; importar un archivo antiguo; abrir un enlace antiguo.

## ISSUE P10-09 — core + scene: habitaciones con forma libre (polígono)

- **Tipo:** feature
- **Prioridad:** P1
- **Épica:** E10
- **Hito:** M10
- **Estimación:** L
- **Etiquetas:** area:core, area:scene
- **Depende de:** P10-01

### Descripción
Una habitación deja de ser solo un rectángulo: su planta es un **polígono** de paredes rectas (formas en L, U, T…). El suelo, el techo, las paredes, los huecos de puertas y ventanas, la colocación de objetos, el imán a pared, la cámara y el pool de luces funcionan con cualquier forma.

### Contexto
Decidido por el propietario (2026-10-11): «una habitación que hace forma de U se debe poder poner». El dominio ya lo previó ([DOMAIN_MODEL](../DOMAIN_MODEL.md) §8): `shape` es una unión discriminada y admitirá `{ kind: 'polygon', points }`; las paredes pasan a ser segmentos con IDs estables (migración v2). Va antes que varias habitaciones (P10-03), cuyas paredes compartidas se apoyan en estos segmentos.

### Requisitos
- `core`: `shape` polígono simple (sin autointersecciones, sentido antihorario, lados ≥ mínimo, ángulos de 90° en esta primera versión, preparada para otros ángulos); paredes como segmentos con IDs estables; migración v1→v2 con *golden files* (un rectángulo pasa a un polígono de 4 lados sin cambiar de significado).
- Invariantes: objetos y aperturas dentro de la planta / en su segmento; `solvePlacement` y la detección de pared con polígonos.
- Escena: suelo y techo triangulados, paredes por segmento (esquinas interiores y exteriores correctas), modos de pared y encuadre con la envolvente del polígono; recursos compartidos y presupuestos de escena.

### Criterios de aceptación
- [ ] Un proyecto antiguo (sala rectangular) se abre igual tras la migración.
- [ ] Una sala en U muestra suelo, techo y paredes correctos, admite puertas y ventanas en cualquier pared y los objetos se pegan a cualquier pared.
- [ ] No se puede guardar una forma inválida (autointersección, lado demasiado corto).

### Tests esperados
- Unitarios y propiedades fast-check (polígonos válidos, migración, colocación dentro de la planta, imán a paredes de esquinas interiores).
- E2E con una sala en U: `renderer.info` dentro del presupuesto.

## ISSUE P10-10 — ui: editar la forma de la habitación

- **Tipo:** feature
- **Prioridad:** P1
- **Épica:** E10
- **Hito:** M10
- **Estimación:** L
- **Etiquetas:** area:ui, area:scene, area:a11y
- **Depende de:** P10-09

### Descripción
Herramientas para dar forma a la sala: seleccionar una **pared** y arrastrarla hacia dentro o hacia fuera; **partir** una pared para crear una esquina nueva (así se forma una U o una L); seleccionar una **esquina** y moverla; y formas predefinidas (rectángulo, L, U, T) en el asistente de nueva habitación.

### Contexto
Como la altura de los objetos, cada edición se puede hacer con el ratón (en la vista superior y en 3D), escribiendo valores (longitud de pared, posición de la esquina) y con el teclado. El panel de tamaño de la sala (P3-10) pasa a mostrar las medidas de la pared seleccionada.

### Requisitos
- Un gesto = una entrada de historial; Esc cancela; imán a rejilla y a 90°.
- Si la nueva forma deja fuera objetos o aperturas, se avisa con la lista y no se aplica (como al redimensionar).
- Accesible: paredes y esquinas seleccionables desde el outliner y operables con teclado.

### Criterios de aceptación
- [ ] Una persona convierte la sala por defecto en una U en menos de un minuto.
- [ ] Mover, partir y quitar esquinas funciona con ratón, con valores escritos y con teclado, y se deshace paso a paso.

### Tests esperados
- RTL de los controles; E2E: partir una pared, arrastrarla hasta formar una U, deshacer.
