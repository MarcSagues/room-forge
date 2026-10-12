# Fase 9 — IA y monetización (M9, post-MVP)

> Todas las issues de esta fase son **borradores de alcance**: se refinan y dividen cuando se planifique la fase. Ver [FUTURE_VERSIONS.md](../FUTURE_VERSIONS.md).

## ISSUE E9 — Épica: IA y monetización

- **Tipo:** epic
- **Prioridad:** P2
- **Épica:** —
- **Hito:** M9
- **Estimación:** — (suma de las hijas)
- **Etiquetas:** area:ai, post-mvp
- **Depende de:** —

### Descripción
Cuentas y sincronización, enlaces alojados, generación de distribuciones con IA, planes y pagos, marketplace y funciones avanzadas del editor.

### Contexto
Depende de los resultados de la beta (retención, demanda de sincronización, interés por IA). No se construye nada de esto en el MVP; la arquitectura deja los puntos de extensión (`ProjectRepository`, `LayoutGenerator`, comandos serializables).

### Requisitos
- Decisiones de backend/auth/IA documentadas en ADR antes de implementar.
- Coste controlado: límites de uso y alertas de facturación desde el primer día.

### Criterios de aceptación
- [ ] ADR de backend, auth, IA y pagos aceptadas.
- [ ] Modelo de costes y límites por plan aprobado.

### Tests esperados
Ver issues hijas.

## ISSUE P9-01 — Spike: backend, autenticación y base de datos (decisión + ADR)

- **Tipo:** spike
- **Prioridad:** P2
- **Épica:** E9
- **Hito:** M9
- **Estimación:** M
- **Etiquetas:** area:infra, area:core, post-mvp, needs-decision
- **Depende de:** P8-06

### Descripción
Comparar opciones para API y datos (Workers + Postgres gestionado como Neon/Supabase, o Next en Cloudflare), autenticación (proveedor gestionado vs librería), ORM (p. ej. Drizzle) y almacenamiento de imágenes; producir ADR y prototipo mínimo de `ApiProjectRepository`.

### Contexto
[ADR-0002](../ADR/0002-nextjs-static-export.md) deja abierta la forma del backend. Evaluar coste, latencia, cumplimiento RGPD y complejidad. **No se crean recursos remotos sin autorización.**

### Requisitos
- Matriz de decisión con costes estimados a 1 k / 10 k / 100 k usuarios.
- Prototipo local (sin producción) de guardar/leer un proyecto con el puerto existente.
- Estrategia de migración de proyectos locales a la nube.

### Criterios de aceptación
- [ ] ADR aceptada con la opción elegida y las descartadas.
- [ ] El prototipo pasa el mismo conjunto de tests de contrato que `IndexedDbProjectRepository`.

### Tests esperados
- Tests de contrato compartidos entre implementaciones de `ProjectRepository`.

## ISSUE P9-02 — Cuentas, sincronización en la nube y enlaces alojados

- **Tipo:** feature
- **Prioridad:** P2
- **Épica:** E9
- **Hito:** M9
- **Estimación:** XL
- **Etiquetas:** area:persistence, area:infra, post-mvp
- **Depende de:** P9-01

### Descripción
Inicio de sesión opcional, sincronización de proyectos entre dispositivos (resolución de conflictos por versión/última escritura con aviso), enlaces cortos alojados con imagen de vista previa (Open Graph) y borrado/exportación de datos del usuario (RGPD).

### Contexto
Mantener **local-first**: la app sigue funcionando sin cuenta. Dividir en issues menores al planificar.

### Requisitos
- Sincronización incremental usando los patches/versión del documento.
- Límites por plan y por usuario.
- Política de retención y borrado.

### Criterios de aceptación
- [ ] Un proyecto creado sin cuenta puede subirse a la cuenta tras iniciar sesión.
- [ ] Editar en dos dispositivos produce un conflicto detectable y resoluble sin pérdida de datos.
- [ ] Un enlace alojado muestra vista previa correcta en un mensajero.

### Tests esperados
- Contrato de repositorio; E2E multi-contexto; pruebas de conflictos.

## ISSUE P9-03 — Spike: diseño del generador de distribuciones con IA

- **Tipo:** spike
- **Prioridad:** P2
- **Épica:** E9
- **Hito:** M9
- **Estimación:** M
- **Etiquetas:** area:ai, post-mvp, needs-decision
- **Depende de:** P8-06

### Descripción
Diseñar y evaluar el flujo «descripción + sala + catálogo → plan estructurado → solver determinista → comandos → vista previa» de [ARCHITECTURE §10](../ARCHITECTURE.md): esquema del plan, prompts, validación con zod, conjunto de evaluación de ~30 salas y comparación de modelos por coste/calidad.

### Contexto
Los LLM son poco fiables con coordenadas: el LLM propone **intenciones**, la geometría la resuelve `core`. Elegir proveedor/modelo por evaluación, no por preferencia.

### Requisitos
- Métricas: % de planes válidos, colisiones tras el solver, puntuación humana, coste por generación y latencia.
- Estrategia de caché y límites de uso.
- Opción «trae tu propia clave» valorada.

### Criterios de aceptación
- [ ] Informe con las métricas sobre el conjunto de evaluación y recomendación de proveedor/modelo.
- [ ] Esquema de plan y puerto `LayoutGenerator` definidos y revisados.

### Tests esperados
- Tests del solver con planes sintéticos; arnés de evaluación reproducible.

## ISSUE P9-04 — Generador de distribuciones con IA (texto → comandos con vista previa)

- **Tipo:** feature
- **Prioridad:** P2
- **Épica:** E9
- **Hito:** M9
- **Estimación:** XL
- **Etiquetas:** area:ai, area:ui, post-mvp
- **Depende de:** P9-03, P9-02

### Descripción
Panel «Generar con IA»: el usuario describe lo que quiere, se genera una propuesta como vista previa fantasma y puede aceptarla (una sola transacción, un `undo`) o rechazarla. Endpoint servidor con límites y caché.

### Contexto
Nunca muta el documento directamente; usa los comandos existentes. Dividir al planificar (endpoint, solver, UI, límites).

### Requisitos
- Límites de uso por usuario/plan, protección anti-abuso y alertas de coste.
- Contenido saneado; no se envían datos personales al proveedor.
- Registro de la generación (entrada/salida) para depuración, con retención corta.

### Criterios de aceptación
- [ ] ≥ 90 % de las generaciones sobre el conjunto de evaluación producen un plan válido tras el solver.
- [ ] Aceptar produce 1 entrada de historial; rechazar no deja rastro.
- [ ] El gasto mensual queda acotado por el límite configurado (prueba de saturación).

### Tests esperados
- Contrato del endpoint; E2E de aceptar/rechazar con proveedor simulado.

## ISSUE P9-05 — Planes, límites y pagos (Stripe)

- **Tipo:** feature
- **Prioridad:** P3
- **Épica:** E9
- **Hito:** M9
- **Estimación:** XL
- **Etiquetas:** area:infra, post-mvp
- **Depende de:** P9-02

### Descripción
Planes Free/Pro, derechos (entitlements) por plan, Stripe Checkout y Customer Portal, webhooks idempotentes, facturación y cumplimiento fiscal básico.

### Contexto
**No crear infraestructura de pago hasta decisión explícita.** Revisar impuestos (IVA UE) y proveedor «merchant of record» como alternativa.

### Requisitos
- Verificación de firma de webhooks; idempotencia; reconciliación.
- Modo de prueba completo antes de producción.

### Criterios de aceptación
- [ ] Un pago de prueba activa el plan y un impago/cancelación lo revierte.
- [ ] Los webhooks repetidos no duplican efectos.

### Tests esperados
- Tests de integración con Stripe en modo prueba; pruebas de idempotencia.

## ISSUE P9-06 — Catálogo premium y marketplace de packs

- **Tipo:** feature
- **Prioridad:** P3
- **Épica:** E9
- **Hito:** M9
- **Estimación:** XL
- **Etiquetas:** area:catalog, post-mvp
- **Depende de:** P9-05

### Descripción
Packs de assets de pago y, más adelante, contribuciones de creadores con revisión, licencias y reparto de ingresos.

### Contexto
Requiere moderación, validación automática (pipeline P4-03) y política de licencias clara.

### Requisitos
- Packs servidos por CDN con control de derechos.
- Validación automática de presupuestos y licencias.

### Criterios de aceptación
- [ ] Un pack de prueba se compra, se descarga y aparece en el catálogo; sin derechos no aparece.
- [ ] Un pack que incumple presupuestos o licencia es rechazado automáticamente por la validación.

### Tests esperados
- Contrato del servicio de packs; E2E de compra simulada.

## ISSUE P9-07 — Colaboración en tiempo real

- **Tipo:** feature
- **Prioridad:** P3
- **Épica:** E9
- **Hito:** M9
- **Estimación:** XL
- **Etiquetas:** area:core, area:infra, post-mvp
- **Depende de:** P9-02

### Descripción
Edición simultánea con presencia (cursores/selección), basada en el log de patches o en un CRDT; historial por usuario.

### Contexto
Los comandos y patches de Immer son el punto de partida; evaluar Yjs frente a un servidor autoritativo simple en un ADR antes de implementar.

### Requisitos
- Resolución de conflictos determinista; tolerancia a desconexiones.

### Criterios de aceptación
- [ ] Dos clientes editan a la vez y convergen al mismo documento tras reconectar.
- [ ] Deshacer solo revierte las acciones propias del usuario, no las de otros participantes.

### Tests esperados
- Tests de convergencia con operaciones concurrentes aleatorias (fast-check).

## ISSUE P9-08 — Paredes en ángulo libre, varias plantas y otros tipos de vivienda

- **Tipo:** feature
- **Prioridad:** P3
- **Épica:** E9
- **Hito:** M9
- **Estimación:** XL
- **Etiquetas:** area:core, area:scene, post-mvp
- **Depende de:** P8-06

### Descripción
Paredes en ángulos libres (no solo 90°), varias plantas (`Level`) y catálogo de dormitorio/salón/cocina/baño. Las salas poligonales ortogonales (L, U, T) y la migración de esquema v2 ya llegan con [P10-09](10-home.md) y [P10-10](10-home.md), antes de la beta.

### Contexto
[DOMAIN_MODEL §8](../DOMAIN_MODEL.md) describe el camino de evolución sin romper proyectos.

### Requisitos
- Migración de esquema con golden tests si cambia el formato (p. ej. `Level`).
- Generación de mallas de paredes en ángulos arbitrarios y aperturas sobre esos segmentos.

### Criterios de aceptación
- [ ] Un proyecto anterior abre sin cambios visibles.
- [ ] Se puede dibujar una sala con una pared en diagonal y colocar objetos y aperturas en ella.

### Tests esperados
- Golden de migración; propiedades de invariantes con polígonos.

## ISSUE P9-09 — Selección múltiple, medición y recorrido en primera persona

- **Tipo:** feature
- **Prioridad:** P3
- **Épica:** E9
- **Hito:** M9
- **Estimación:** L
- **Etiquetas:** area:ui, area:scene, post-mvp
- **Depende de:** P8-06

### Descripción
Selección múltiple (marquesina, `Shift`-clic), mover/rotar grupos, herramienta de medición (cotas), grupos/prefabs («kit de escritorio»), vistas guardadas y modo recorrido en primera persona.

### Contexto
Los comandos ya aceptan arrays de IDs y la selección soporta ≥1 elemento (P2-05, P3-02).

### Requisitos
- Gestos de grupo = 1 entrada de historial.
- Recorrido: colisión con paredes, altura de ojos, restricciones de móvil.

### Criterios de aceptación
- [ ] Mover 10 objetos seleccionados genera 1 entrada y `undo` los restaura todos.
- [ ] La herramienta de medición muestra distancias correctas (tolerancia 1 cm).

### Tests esperados
- Propiedades sobre transformaciones de grupo; E2E de selección múltiple.
