# Fase 8 — Beta pública (M8)

## ISSUE E8 — Épica: Beta pública

- **Tipo:** epic
- **Prioridad:** P0
- **Épica:** —
- **Hito:** M8
- **Estimación:** — (suma de las hijas)
- **Etiquetas:** area:product, area:infra
- **Depende de:** —

### Descripción
Poner RoomForge en manos de usuarios reales: landing, plantillas y tutorial, producción en Cloudflare con aprobación humana, analítica respetuosa, feedback y release v0.1.0-beta.

### Contexto
Es el momento de validar las hipótesis de [PRODUCT §10](../PRODUCT.md) (activación, retención, compartir) y del riesgo de diferenciación ([RISKS R18](../RISKS.md)). **Publicar es una acción irreversible y externa: requiere autorización explícita.**

### Requisitos
- Cumplimiento básico de privacidad (RGPD): sin cookies de seguimiento, sin PII.
- Rollback documentado.

### Criterios de aceptación
- [ ] URL pública funcional con HTTPS y cabeceras de seguridad.
- [ ] 10 usuarios externos completan el flujo «crear → colocar → luz RGB → exportar» en <10 min (observación registrada).
- [ ] Todas las issues hijas cerradas.

### Tests esperados
Ver issues hijas.

## ISSUE P8-01 — Landing, SEO, páginas legales y analítica respetuosa

- **Tipo:** feature
- **Prioridad:** P0
- **Épica:** E8
- **Hito:** M8
- **Estimación:** M
- **Etiquetas:** area:product, area:ui
- **Depende de:** P1-08

### Descripción
Landing con propuesta de valor, demo visual (vídeo/GIF o escena embebida ligera), CTA «Probar ahora», metadatos SEO/Open Graph, páginas de privacidad y términos, y analítica de eventos sin cookies ni PII (herramienta decidida en P0-02).

### Contexto
[PRODUCT](../PRODUCT.md). La landing **no** debe cargar three (el editor es una ruta aparte).

### Requisitos
- Rendimiento: Lighthouse ≥ 90 (rendimiento, accesibilidad, SEO) en móvil.
- Eventos mínimos: `editor_opened`, `first_object_placed`, `light_changed`, `export_png`, `export_json`, `share_link_created`, `project_saved`.
- Sin envío del contenido de proyectos ni de URLs de visor a la analítica.

### Criterios de aceptación
- [ ] Lighthouse móvil ≥ 90 en las cuatro categorías.
- [ ] Ninguna cookie establecida; Network sin terceros distintos de la analítica elegida.
- [ ] Páginas legales revisadas por el propietario.

### Tests esperados
- Lighthouse CI (o script) en CI; E2E de navegación y de ausencia de cookies.

## ISSUE P8-02 — Plantillas de inicio y tutorial de primera ejecución

- **Tipo:** feature
- **Prioridad:** P0
- **Épica:** E8
- **Hito:** M8
- **Estimación:** L
- **Etiquetas:** area:ux, area:catalog
- **Depende de:** P6-04, P4-10

### Descripción
Entre 3 y 5 plantillas diseñadas con el propio editor (Setup gaming, Despacho minimalista, Rincón streamer, Habitación pequeña, Sala de consolas) como documentos versionados, y un tutorial interactivo de 5 pasos (colocar, mover/rotar, color, luz RGB, exportar).

### Contexto
Objetivo de activación: ≥60 % coloca un objeto en <60 s ([PRODUCT §10](../PRODUCT.md)). Las plantillas alimentan también la regresión visual.

### Requisitos
- Plantillas pasan la validación de P6-01 y el presupuesto de escena.
- Tutorial omitible y reanudable; textos es/en.
- Plantillas con miniaturas generadas automáticamente.

### Criterios de aceptación
- [ ] Cada plantilla carga en < 3 s y cumple presupuestos de render.
- [ ] Un usuario nuevo completa el tutorial en < 3 min (prueba con ≥3 personas).
- [ ] «Empezar con plantilla» crea un proyecto nuevo independiente de la plantilla.

### Tests esperados
- Test de validación de cada plantilla en CI; E2E del tutorial.

## ISSUE P8-03 — Producción: dominio, despliegue en Cloudflare, cabeceras y aprobación manual

- **Tipo:** task
- **Prioridad:** P0
- **Épica:** E8
- **Hito:** M8
- **Estimación:** M
- **Etiquetas:** area:infra, human-required
- **Depende de:** P1-08, P7-09

### Descripción
Configurar el dominio, HTTPS, despliegue de producción desde `main` con **GitHub Environment `production` con revisores requeridos**, cabeceras de seguridad y caché, y **verificar los términos de uso comercial de Cloudflare** antes de abrir al público.

### Contexto
[ADR-0005](../ADR/0005-hosting-cloudflare.md), [DEPLOYMENT](../DEPLOYMENT.md). Comprar el dominio y crear/aprobar el entorno son acciones humanas.

### Requisitos
- Caché inmutable para assets con hash; `no-cache` para HTML.
- Redirección `www`→raíz y HTTP→HTTPS.
- Plan de rollback (redeploy del commit anterior) probado.

### Criterios de aceptación
- [ ] Un merge `develop → main` no despliega hasta que un revisor humano aprueba el entorno.
- [ ] `curl -I` muestra las cabeceras definidas; A+/A en un analizador de cabeceras razonable.
- [ ] Rollback ejecutado en simulacro en < 10 min.
- [ ] Términos de Cloudflare revisados y documentados en DEPLOYMENT.

### Tests esperados
- Smoke E2E contra producción tras cada despliegue; verificación manual del flujo de aprobación.

## ISSUE P8-04 — Feedback in-app y proceso de triage de la beta

- **Tipo:** task
- **Prioridad:** P1
- **Épica:** E8
- **Hito:** M8
- **Estimación:** S
- **Etiquetas:** area:product
- **Depende de:** P8-01

### Descripción
Botón «Enviar comentarios» que abre un formulario/issue prellenado (sin datos del proyecto), proceso semanal de triage (etiquetas, severidad, prioridad), y plantillas de issue para bugs y mejoras.

### Contexto
[WORKFLOW §10](../WORKFLOW.md). Las plantillas ya existen en `.github/ISSUE_TEMPLATE/`.

### Requisitos
- El formulario incluye versión de la app, navegador y calidad gráfica; adjuntar el proyecto es opcional y explícito.
- Documentar el SLA interno de triage.

### Criterios de aceptación
- [ ] Desde la app se llega a un formulario de feedback en ≤2 clics.
- [ ] Un bug de prueba enviado aparece etiquetado y priorizado siguiendo el proceso.

### Tests esperados
- E2E del enlace/formulario; revisión manual del proceso.

## ISSUE P8-05 — PWA / offline: service worker para los assets del editor

- **Tipo:** feature
- **Prioridad:** P2
- **Épica:** E8
- **Hito:** M8
- **Estimación:** M
- **Etiquetas:** area:infra, area:perf
- **Depende de:** P8-03

### Descripción
Manifest y service worker que cachean el shell, el JS del editor y los modelos usados, permitiendo abrir y editar proyectos sin conexión (la app es local-first).

### Contexto
Mejora la percepción de velocidad y refuerza la propuesta local-first. Riesgo: cachés obsoletas tras un despliegue ⇒ estrategia de actualización explícita.

### Requisitos
- Estrategia: precache del shell + caché por uso de GLB (límite de tamaño).
- Aviso «Nueva versión disponible» con recarga controlada (sin perder cambios).
- Instalable en escritorio.

### Criterios de aceptación
- [ ] Tras una visita, la app abre en modo avión y permite editar un proyecto existente.
- [ ] Tras un despliegue nuevo, el usuario ve el aviso y actualiza sin perder el trabajo.
- [ ] Lighthouse PWA sin errores graves.

### Tests esperados
- E2E con red desconectada; prueba manual de actualización.

## ISSUE P8-06 — Release v0.1.0-beta: checklist, rollback y changelog

- **Tipo:** task
- **Prioridad:** P0
- **Épica:** E8
- **Hito:** M8
- **Estimación:** S
- **Etiquetas:** area:infra, area:docs, human-required
- **Depende de:** P8-02, P8-03, P7-01

### Descripción
Checklist de lanzamiento (calidad, rendimiento, seguridad, legal, soporte), generación del changelog desde Conventional Commits, tag `v0.1.0-beta`, release notes y anuncio controlado (primeros usuarios invitados).

### Contexto
**Acción irreversible y externa: requiere autorización explícita del propietario.**

### Requisitos
- Checklist archivada en `docs/releases/v0.1.0-beta.md`.
- PR `develop → main` aprobado por humano; despliegue aprobado en el entorno `production`.

### Criterios de aceptación
- [ ] Todos los puntos de la checklist marcados o con excepción justificada.
- [ ] Tag y release de GitHub publicados.
- [ ] Simulacro de rollback documentado.

### Tests esperados
- Smoke E2E en producción; checklist manual.
