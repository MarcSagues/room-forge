# Issues preparados para importar

Este directorio contiene el backlog completo de RoomForge como **Markdown estructurado**, listo para importarse a GitHub Issues con `tools/planning/github-import.mjs` (o para leerse tal cual).

## Formato de cada issue

```markdown
## ISSUE P1-01 — Título

- **Tipo:** task            (epic | feature | task | spike | bug)
- **Prioridad:** P0         (P0 crítico · P1 importante · P2 mejora · P3 futuro)
- **Épica:** E1             (o «—»)
- **Hito:** M1              (M0…M10, ver tools/planning/milestones.json)
- **Estimación:** M         (XS ≈ 0,25 d · S ≈ 0,5 d · M ≈ 1 d · L ≈ 2 d · XL ≈ 4 d — dividir antes de empezar)
- **Etiquetas:** area:infra, human-required
- **Depende de:** P0-03, P1-02   (o «—»)

### Descripción
### Contexto
### Requisitos
### Criterios de aceptación     ← casillas verificables
### Tests esperados
### Notas                       ← opcional
```

La **estimación** son *días ideales de desarrollo asistido por IA* (incluye tests, PR y ronda de revisión). No son horas de calendario.

## Archivos

| Archivo | Fase / hito |
|---|---|
| [00-phase-0.md](00-phase-0.md) | M0 — Investigación y arquitectura |
| [01-foundations.md](01-foundations.md) | M1 — Fundamentos del proyecto |
| [02-engine.md](02-engine.md) | M2 — Motor 3D |
| [03-editor.md](03-editor.md) | M3 — Editor interactivo |
| [04-catalog.md](04-catalog.md) | M4 — Catálogo de objetos |
| [05-materials-lighting.md](05-materials-lighting.md) | M5 — Materiales e iluminación |
| [06-persistence-export.md](06-persistence-export.md) | M6 — Persistencia y exportación |
| [07-testing-optimization.md](07-testing-optimization.md) | M7 — Testing y optimización |
| [08-beta.md](08-beta.md) | M8 — Beta pública |
| [09-ai-monetization.md](09-ai-monetization.md) | M9 — IA y monetización (post-MVP) |
| [10-home.md](10-home.md) | M10 — HomeForge: la casa completa |

## Uso del importador

```bash
# 1) Validar (offline, sin tocar GitHub): estructura, dependencias, ciclos, totales
node tools/planning/github-import.mjs validate

# 2) Regenerar docs/BACKLOG.md (tabla priorizada)
node tools/planning/github-import.mjs backlog

# 3) Ver qué se crearía en GitHub (dry-run, no escribe nada)
node tools/planning/github-import.mjs import --repo OWNER/REPO

# 4) Crear de verdad (REQUIERE autorización explícita y `gh auth login`)
node tools/planning/github-import.mjs import --repo OWNER/REPO --apply [--phases 0-8]
```

El importador es **idempotente** (guarda un mapa ID→nº de issue en `docs/issues/.import-state.json`) y crea labels y milestones antes que las issues. Sin `--apply` nunca escribe en GitHub.

## Bugs

Todavía no hay código, por lo tanto **no hay issues de bug**. Los bugs se reportarán con la plantilla `.github/ISSUE_TEMPLATE/bug_report.yml` y se clasificarán según [WORKFLOW.md](../WORKFLOW.md#10-gestión-de-bugs).
