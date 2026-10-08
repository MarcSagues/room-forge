# Fase 6 — Persistencia y exportación (M6)

## ISSUE E6 — Épica: Persistencia y exportación

- **Tipo:** epic
- **Prioridad:** P0
- **Épica:** —
- **Hito:** M6
- **Estimación:** — (suma de las hijas)
- **Etiquetas:** area:persistence, area:export
- **Depende de:** —

### Descripción
Guardar y recuperar proyectos localmente (IndexedDB) con autoguardado, gestionar proyectos, importar/exportar JSON, exportar PNG y compartir por enlace. La regla de oro es **no perder nunca el trabajo del usuario**.

### Contexto
[ARCHITECTURE §8–§9](../ARCHITECTURE.md), [ADR-0004](../ADR/0004-persistence-indexeddb.md), [ADR-0010](../ADR/0010-share-links-url-fragment.md).

### Requisitos
- Formato versionado con migraciones y *golden tests*.
- Entrada no confiable siempre validada.

### Criterios de aceptación
- [ ] Crear → editar → recargar → el proyecto sigue idéntico (E2E).
- [ ] Exportar JSON → borrar → importar → idéntico.
- [ ] PNG nítido con las luces y bloom del viewport.
- [ ] Todas las issues hijas cerradas.

### Tests esperados
Ver issues hijas.

## ISSUE P6-01 — core: formato de archivo versionado, migraciones y validación de importación

- **Tipo:** feature
- **Prioridad:** P0
- **Épica:** E6
- **Hito:** M6
- **Estimación:** M
- **Etiquetas:** area:core, area:persistence
- **Depende de:** P2-01

### Descripción
Implementar `serializeProject`/`parseProjectFile` con el *envelope* de [DOMAIN_MODEL §7](../DOMAIN_MODEL.md), el registro de migraciones `vN → vN+1`, mensajes de error claros (versión más nueva, JSON inválido, schema inválido, tamaño excedido) y política de `catalogId` desconocido.

### Contexto
[DOMAIN_MODEL §6](../DOMAIN_MODEL.md). La primera migración real no existe aún: se crea una migración **de ejemplo v0→v1** para probar el mecanismo con un golden file.

### Requisitos
- Entrada no confiable: límites de tamaño (5 MB), profundidad, nº de entidades; zod en modo estricto con recorte de claves desconocidas.
- Resultado `Result<Project, ImportError>` sin lanzar.
- Función pura y sin DOM (vive en `core`).

### Criterios de aceptación
- [ ] Round-trip: `parse(serialize(doc))` ≡ `doc` (propiedad con documentos generados).
- [ ] Un archivo de `schemaVersion` mayor que el actual se rechaza con `NEWER_VERSION`.
- [ ] Golden file de migración v0→v1 pasa; añadir una migración exige añadir su golden (regla de test).
- [ ] Entradas hostiles (`__proto__`, ciclos, 10 MB) se rechazan sin colgar el proceso.

### Tests esperados
- Unitarios por tipo de error; fast-check del round-trip; fixtures hostiles.

## ISSUE P6-02 — persistence: ProjectRepository sobre IndexedDB (idb)

- **Tipo:** feature
- **Prioridad:** P0
- **Épica:** E6
- **Hito:** M6
- **Estimación:** M
- **Etiquetas:** area:persistence
- **Depende de:** P6-01

### Descripción
Definir el puerto `ProjectRepository` (`list`, `get`, `save`, `delete`, `duplicate`, `rename`) en `core/ports` e implementar `IndexedDbProjectRepository` con `idb`: almacenes `projects`, `documents` y `meta`, versionado de BD con `onupgradeneeded`, escrituras atómicas y `navigator.storage.persist()`.

### Contexto
[ADR-0004](../ADR/0004-persistence-indexeddb.md). Dependencias nuevas: `idb`, `fake-indexeddb` (dev).

### Requisitos
- Una transacción por guardado (proyecto + documento).
- Manejo de errores tipados (`QuotaExceeded`, `Blocked`, `VersionError`, `Unavailable`).
- Funcionamiento degradado si IndexedDB no está disponible (modo en memoria + aviso).

### Criterios de aceptación
- [ ] CRUD completo verificado con `fake-indexeddb`.
- [ ] Un fallo a mitad de guardado no deja proyecto sin documento (atomicidad).
- [ ] Actualización de esquema de BD v1→v2 de prueba preserva los datos.
- [ ] Sin IndexedDB: la app sigue operativa en memoria y avisa.

### Tests esperados
- Unitarios con `fake-indexeddb`, incluyendo fallos inyectados y migración de BD.

## ISSUE P6-03 — persistence: autoguardado, estado de guardado y recuperación de sesión

- **Tipo:** feature
- **Prioridad:** P0
- **Épica:** E6
- **Hito:** M6
- **Estimación:** M
- **Etiquetas:** area:persistence, area:ux
- **Depende de:** P6-02, P3-09

### Descripción
Servicio `Autosave` que escucha `document:changed`, aplica debounce (1,5 s, máx. 10 s), guarda además en `pagehide` y `visibilitychange`, pausa durante gestos, actualiza el `StatusPill` y recupera el último proyecto abierto al volver.

### Contexto
[ARCHITECTURE §8](../ARCHITECTURE.md). Fallo de guardado ⇒ aviso persistente con acción «Exportar copia».

### Requisitos
- Reloj inyectable para tests.
- Estados: `saved | saving | dirty | error`.
- Reintentos con retroceso; no perder cambios si hay un guardado en curso (cola de 1).
- Aviso al cerrar si hay cambios sin guardar y el guardado ha fallado.

### Criterios de aceptación
- [ ] 50 cambios rápidos producen ≤ 2 escrituras.
- [ ] Cerrar la pestaña justo tras un cambio no pierde el cambio (E2E con `pagehide`).
- [ ] Error simulado de cuota muestra aviso y permite exportar JSON.
- [ ] Reabrir la app abre el último proyecto con su estado.

### Tests esperados
- Unitarios con reloj falso (debounce, máximo, cola); E2E de recarga.

## ISSUE P6-04 — ui: pantalla de proyectos (listar, crear, renombrar, duplicar, borrar)

- **Tipo:** feature
- **Prioridad:** P0
- **Épica:** E6
- **Hito:** M6
- **Estimación:** M
- **Etiquetas:** area:ui
- **Depende de:** P6-02

### Descripción
Ruta `/projects` con rejilla de tarjetas (miniatura, nombre, fecha), acciones por proyecto, estado vacío con CTA y confirmación de borrado (con «Deshacer» durante 8 s antes del borrado definitivo).

### Contexto
[DESIGN_SYSTEM §8](../DESIGN_SYSTEM.md). El borrado es destructivo: mitigarlo con papelera temporal.

### Requisitos
- Orden por última modificación; búsqueda simple por nombre.
- Duplicar copia documento y miniatura.
- Accesible por teclado; confirmaciones accesibles.

### Criterios de aceptación
- [ ] Crear, renombrar, duplicar y borrar funcionan y persisten tras recargar.
- [ ] Borrar y pulsar «Deshacer» dentro de 8 s restaura el proyecto.
- [ ] Estado vacío visible sin proyectos.

### Tests esperados
- RTL con repositorio simulado; E2E de ciclo de vida de proyecto.

## ISSUE P6-05 — persistence: importar y exportar JSON

- **Tipo:** feature
- **Prioridad:** P0
- **Épica:** E6
- **Hito:** M6
- **Estimación:** M
- **Etiquetas:** area:persistence, area:ux
- **Depende de:** P6-01, P6-04

### Descripción
Menú Exportar → «Proyecto (.roomforge.json)», e Importar (botón y arrastrar archivo a la ventana). Importar crea un proyecto nuevo (nunca sobrescribe), valida con P6-01 y muestra errores comprensibles.

### Contexto
Además es la vía de copia de seguridad ([RISKS R5](../RISKS.md)).

### Requisitos
- Descarga con nombre `slug-fecha.roomforge.json`.
- Vista previa antes de importar (nombre, nº de objetos, versión) con aviso si hay `catalogId` desconocidos.
- Mensajes de error accionables para cada `ImportError`.

### Criterios de aceptación
- [ ] Exportar → importar produce un proyecto equivalente (comparación profunda).
- [ ] Un archivo de versión más nueva muestra «Actualiza RoomForge» sin crashear.
- [ ] Un JSON corrupto muestra error y no modifica proyectos existentes.

### Tests esperados
- RTL del diálogo; E2E con archivos válidos, corruptos y de versión nueva.

## ISSUE P6-06 — export: exportar PNG (resolución, fondo, calidad)

- **Tipo:** feature
- **Prioridad:** P0
- **Épica:** E6
- **Hito:** M6
- **Estimación:** L
- **Etiquetas:** area:export, area:scene
- **Depende de:** P5-06, P3-09

### Descripción
`ExportService.renderToBlob({ width, height, scale, transparent, hideHelpers })`: renderiza la escena actual (incluyendo luces y bloom) a un `WebGLRenderTarget` con MSAA, lo lee a un canvas 2D y devuelve un PNG. Diálogo con opciones 1×/2×/4×, fondo transparente y ocultar rejilla/gizmos.

### Contexto
[ARCHITECTURE §6.6](../ARCHITECTURE.md): sin `preserveDrawingBuffer`. Límites de memoria y `MAX_TEXTURE_SIZE` deben respetarse con degradación elegante.

### Requisitos
- Misma cámara que el viewport (o vista «foto» con encuadre automático).
- Reutiliza el pipeline de postproceso.
- Barra de progreso para exportaciones grandes; no bloquear la UI más de ~100 ms (trocear si es posible).
- Nombre de archivo `slug-fecha.png`; metadatos (software) opcionales.

### Criterios de aceptación
- [ ] PNG a 2× es visualmente idéntico al viewport (sin rejilla) incluyendo bloom.
- [ ] 4× en un equipo con límite menor degrada a la máxima soportada con aviso.
- [ ] Fondo transparente produce alfa real (verificado leyendo píxeles de esquina).
- [ ] Tras exportar, el viewport sigue interactivo y sin cambios de estado.

### Tests esperados
- E2E: exportar y comprobar dimensiones/alfa del PNG decodificado.
- Unitarios de cálculo de tamaños y límites.

## ISSUE P6-07 — export: miniaturas de proyecto

- **Tipo:** task
- **Prioridad:** P1
- **Épica:** E6
- **Hito:** M6
- **Estimación:** S
- **Etiquetas:** area:export, area:persistence
- **Depende de:** P6-06, P6-03

### Descripción
Generar una miniatura (320×200 WebP/PNG) del viewport al guardar (con debounce largo) y mostrarla en la pantalla de proyectos.

### Contexto
Reutiliza `ExportService` en baja resolución. No debe bloquear la edición.

### Requisitos
- Máximo una miniatura cada 30 s y al cerrar el editor.
- Guardar como `Blob` en el almacén `projects`.
- Fallback con degradado/placeholder si falla.

### Criterios de aceptación
- [ ] Tras editar y esperar, la tarjeta del proyecto muestra una miniatura actualizada.
- [ ] Generar la miniatura no produce caída de FPS perceptible (< 16 ms de bloqueo del hilo principal).

### Tests esperados
- Unitarios de la política de frecuencia (reloj falso); E2E de visualización.

## ISSUE P6-08 — persistence: compartir por enlace (fragmento de URL) y modo visor

- **Tipo:** feature
- **Prioridad:** P1
- **Épica:** E6
- **Hito:** M6
- **Estimación:** L
- **Etiquetas:** area:persistence, area:ui
- **Depende de:** P6-01, P2-08

### Descripción
Botón «Compartir» → genera `/view/#v1.<payload>` (JSON mínimo → `fflate` deflate → base64url), lo copia al portapapeles y avisa del tamaño. Ruta `/view/` abre un visor de solo lectura (orbitar, vistas, día/noche) con botón «Copiar a mis proyectos».

### Contexto
[ADR-0010](../ADR/0010-share-links-url-fragment.md). El fragmento no llega al servidor. Límite objetivo <4 KB, tope duro 16 KB.

### Requisitos
- Compactación (IDs cortos, redondeo de decimales a mm, omitir valores por defecto) sin perder información visible.
- Validación estricta al abrir (entrada no confiable) con P6-01.
- Si excede el tope: mensaje con alternativa (exportar archivo).
- Sin analítica del contenido del fragmento.

### Criterios de aceptación
- [ ] Round-trip: un setup de 30 objetos genera un enlace < 4 KB que reproduce la escena (comparación visual/estructural).
- [ ] Un enlace manipulado o truncado muestra error amable sin crash.
- [ ] El visor no permite edición; «Copiar a mis proyectos» crea un proyecto nuevo.

### Tests esperados
- Propiedad: `decode(encode(doc))` equivalente; fuzz de payloads corruptos; E2E de compartir y abrir en contexto nuevo.

## ISSUE P6-09 — persistence: robustez del almacenamiento (cuota, persist, multi-pestaña, recordatorio de copia)

- **Tipo:** task
- **Prioridad:** P2
- **Épica:** E6
- **Hito:** M6
- **Estimación:** M
- **Etiquetas:** area:persistence, area:ux
- **Depende de:** P6-03

### Descripción
Solicitar almacenamiento persistente, mostrar uso/cuota en ajustes, bloquear edición simultánea del mismo proyecto en dos pestañas (Web Locks o `BroadcastChannel`), y recordar al usuario exportar una copia cada N días/ediciones.

### Contexto
[RISKS R5](../RISKS.md): desalojo en Safari/modo privado, cuota agotada y escritura concurrente son los principales riesgos de pérdida de datos.

### Requisitos
- Segunda pestaña abre el proyecto en solo lectura con aviso y opción «Tomar el control».
- Recordatorio no intrusivo (toast con «No volver a mostrar»).
- Detectar modo privado/almacenamiento efímero y advertir.

### Criterios de aceptación
- [ ] Abrir el mismo proyecto en dos pestañas: la segunda queda en solo lectura.
- [ ] Con almacenamiento no persistente el aviso aparece una vez.
- [ ] Mostrar uso/cuota estimada en Ajustes.

### Tests esperados
- Unitarios de la lógica de bloqueo con API simulada; E2E con dos páginas de Playwright.
