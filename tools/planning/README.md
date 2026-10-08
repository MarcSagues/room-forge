# tools/planning

Herramientas de planificación (Node ≥ 20, **sin dependencias**).

| Archivo | Para qué |
|---|---|
| `github-import.mjs` | Valida `docs/issues/*.md`, genera `docs/BACKLOG.md` e importa a GitHub (labels, milestones, issues) |
| `labels.json` | Definición de labels (nombre, color, descripción) |
| `milestones.json` | Hitos M0…M9 |

## Comandos

```bash
node tools/planning/github-import.mjs validate                       # offline
node tools/planning/github-import.mjs backlog                        # escribe docs/BACKLOG.md
node tools/planning/github-import.mjs show P3-04 --repo OWNER/REPO   # cuerpo tal como se publicaría
node tools/planning/github-import.mjs import --repo OWNER/REPO       # DRY-RUN (no escribe)
node tools/planning/github-import.mjs import --repo OWNER/REPO --apply --phases 0-8   # escribe (requiere autorización)
```

Opciones de `import`: `--refresh` (con `--apply`: reescribe el cuerpo de las issues ya importadas para sincronizarlas con `docs/issues/*.md`; no cambia título, etiquetas ni estado abierto/cerrado; `--only P0-03,P1-04` lo limita a esas issues), `--phases a-b` (hitos a importar), `--branch` (rama para enlaces a docs, por defecto `develop`), `--delay ms` (pausa entre creaciones, por defecto 1500).

## Qué valida

IDs únicos y coherentes con el hito · campos obligatorios · tipo/prioridad/estimación válidos · etiquetas definidas · épicas existentes y del mismo hito · dependencias existentes, sin ciclos, sin apuntar a hitos posteriores ni a épicas · secciones obligatorias (Descripción, Contexto, Requisitos, Criterios de aceptación, Tests esperados) · ≥2 criterios verificables · una issue P0 no depende de otra de menor prioridad · toda referencia `Pn-nn` en `docs/`, `README.md`, `AGENTS.md` y `CLAUDE.md` apunta a una issue existente.

## Seguridad del importador

- **Sin `--apply` no se hace ninguna llamada a GitHub.**
- Con `--apply` comprueba `gh auth status` y que el repositorio existe, y registra el mapa ID→nº en `docs/issues/.import-state.json` (idempotente: no duplica).
- No borra nada ni modifica ajustes del repositorio (ramas, protecciones, secretos).

## Pruebas del importador

El script admite `GH_BIN` (ruta a un script que simula `gh`) y `ROOMFORGE_IMPORT_STATE` (archivo de estado alternativo) para probarse sin tocar GitHub. En la Fase 0 se verificó con un `gh` simulado: 90 issues, 9 milestones, labels, segunda pasada de referencias `#N` y re-ejecución idempotente.
