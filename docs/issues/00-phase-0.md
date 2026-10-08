# Fase 0 — Investigación y arquitectura (M0)

> Esta fase la ejecuta la planificación inicial (documentación en `docs/`). Las issues que quedan son las que requieren decisión o acción humana.

## ISSUE P0-01 — Revisar y aprobar la documentación de planificación

- **Tipo:** task
- **Prioridad:** P0
- **Épica:** —
- **Hito:** M0
- **Estimación:** XS
- **Etiquetas:** area:docs, human-required
- **Depende de:** —

### Descripción
Revisar `docs/` (PRODUCT, PRD, ARCHITECTURE, DOMAIN_MODEL, DESIGN_SYSTEM, ROADMAP, TESTING_STRATEGY, DEPLOYMENT, RISKS, WORKFLOW, ADR/) y aprobarlos o pedir cambios antes de escribir código.

### Contexto
Toda la implementación se apoya en estas decisiones. Cambiarlas después cuesta más. Las ADR están en estado «Propuesta».

### Requisitos
- Leer al menos PRD §10 (preguntas abiertas), ARCHITECTURE §1 (cambios al stack) y RISKS (top 5).
- Marcar cada ADR como `Aceptada` o abrir comentarios.

### Criterios de aceptación
- [x] Las 10 ADR están en estado `Aceptada` o con cambios solicitados registrados como comentarios.
- [x] El PRD y el ROADMAP están aprobados explícitamente (comentario «Aprobado» en esta issue).

### Tests esperados
No aplica (revisión humana).

## ISSUE P0-02 — Resolver las preguntas abiertas del PRD

- **Tipo:** task
- **Prioridad:** P0
- **Épica:** —
- **Hito:** M0
- **Estimación:** S
- **Etiquetas:** area:product, needs-decision, human-required
- **Depende de:** P0-01

### Descripción
Tomar decisión sobre las preguntas Q1–Q10 de [PRD §10](../PRD.md#10-preguntas-abiertas) (idiomas de la UI, nombre/dominio, estilo visual, licencia del código, analítica, etc.). Cada una tiene una propuesta por defecto.

### Contexto
Algunas respuestas condicionan issues concretas (p. ej. i18n en P1-05, estilo visual en P4-01, analítica en P8-01).

### Requisitos
- Para cada pregunta: confirmar la propuesta o indicar la alternativa.
- Registrar el resultado en el PRD (sección «Decisiones tomadas») y, si procede, en una ADR nueva.

### Criterios de aceptación
- [x] PRD §10 convertido en «Decisiones tomadas» con fecha.
- [x] Ninguna pregunta P0-bloqueante queda abierta (Q1, Q2, Q3).

### Tests esperados
No aplica.

## ISSUE P0-03 — Crear el repositorio en GitHub, ramas, ajustes e importar el backlog

- **Tipo:** task
- **Prioridad:** P0
- **Épica:** —
- **Hito:** M0
- **Estimación:** S
- **Etiquetas:** area:infra, human-required
- **Depende de:** P0-01

### Descripción
Crear el repositorio (privado), subir la documentación, crear `develop` como rama por defecto, configurar los ajustes de repositorio disponibles, labels y milestones, e importar las issues con el script.

### Contexto
**Estado (2026-10-08):** con la autorización del propietario («dale con esto») se creó el repositorio privado `MarcSagues/room-forge` (`main` y `develop`, `develop` por defecto) y se importaron las issues de las fases 0–8. El propietario decidió **no usar protecciones de GitHub** (ni Pro ni repo público). `gh` está autenticado como `MarcSagues` con scopes `repo`, `workflow`, `project`. **Cambiar ajustes del repositorio o crear más recursos remotos requiere autorización explícita.**

### Requisitos
- Confirmar propietario/nombre/visibilidad del repo.
- `git init`, primer commit con `docs/` y `.github/`, push de `main` y `develop`; `develop` por defecto ([ADR-0009](../ADR/0009-git-workflow.md)).
- ~~Protección de ramas~~ **No disponible y descartada** (2026-10-08): los repos privados del plan gratuito no la admiten (HTTP 403) y el propietario decidió **no pagar GitHub Pro ni hacer público el repositorio**. Rige la política por convención de [DEPLOYMENT §6](../DEPLOYMENT.md#6-política-de-ramas-y-despliegue-sin-protecciones-de-github).
- Ajustes de repositorio (sí disponibles): squash y merge commit permitidos, rebase y *auto-merge* deshabilitados, borrar la rama al fusionar.
- Ejecutar `github-import.mjs import --apply --phases 0-8` (la Fase 9 puede importarse después).
- Opcional: crear un GitHub Project (tablero) con columnas Backlog/Ready/In progress/In review/Done.

### Criterios de aceptación
- [x] Repositorio creado con `main` y `develop`; `develop` es la rama por defecto.
- [x] Decisión sobre protecciones tomada y documentada: **política por convención** (sin Pro, repo privado) en ADR-0009 y DEPLOYMENT §6.
- [x] Ajustes de repositorio aplicados (squash + merge commit, sin rebase, sin auto-merge, borrar rama al fusionar).
- [x] Labels y milestones creados; N issues importadas; el mapa `.import-state.json` guardado.
- [x] Una issue de ejemplo muestra «Depende de» con enlaces `#N` resueltos.

### Tests esperados
- `node tools/planning/github-import.mjs validate` → 0 errores antes de importar.
- Verificación manual de 3 issues al azar en GitHub.
