# ADR-0009 — Flujo Git, rama por defecto y revisión

- **Estado:** **Aceptada** (2026-10-08)
- **Fecha:** 2026-10-08
- **Revisar cuando:** se incorporen colaboradores humanos, se automatice más el release, o el propietario decida pagar GitHub Pro / hacer público el repositorio (entonces activar protecciones y Environments).

## Contexto
Flujo pedido: issue → rama feature → Claude implementa y prueba → PR → Codex revisa → Claude corrige → Codex revisa → merge a `develop` → merge a `main` **solo con aprobación humana**. Detalles en [WORKFLOW.md](../WORKFLOW.md).

## Decisión
- Ramas: `main` (producción), `develop` (integración, **rama por defecto del repositorio**), `feat|fix|refactor|perf|test|docs|chore|ci/<issue>-<slug>`, `hotfix/<slug>`.
- **`develop` como rama por defecto** para que `Closes #N` cierre las issues al fusionar en `develop` (GitHub solo cierra automáticamente al fusionar en la rama por defecto).
- **Squash merge** de feature → `develop` (título = Conventional Commit). **Merge commit** de `develop` → `main` (release).
- `main` solo recibe merges desde `develop` (y `hotfix/*`, con *back-merge* a `develop`) ⇒ no hay divergencia.
- **Puerta humana real:** GitHub no permite aprobar tu propio PR y los agentes actúan con las credenciales del propietario, así que la aprobación no puede ser un simple *review*. Se implementa como (a) **fusión de `main` solo por el propietario**, (b) **despliegue a producción solo por `workflow_dispatch` manual lanzado por el propietario** y (c) `AGENTS.md` que prohíbe a los agentes fusionar en `main` o lanzar ese workflow. **No hay protección de ramas ni Environments con revisores** (ver actualización abajo).
- Revisión: Codex vía `@codex review` (o revisión automática) tras abrir el PR y tras cada ronda de correcciones; **máx. 2 rondas automáticas** antes de intervención humana.

## Alternativas consideradas
| Alternativa | Por qué no |
|---|---|
| Trunk-based (solo `main`) | El brief pide `develop` + `main`. |
| `main` por defecto + workflow que cierre issues | Más piezas móviles. Alternativa válida si se prefiere `main` visible. |
| Cuenta bot separada para agentes | Permitiría «aprobar» como humano distinto, pero añade gestión de credenciales; revisar si el equipo crece. |

## Consecuencias
- (+) Trazabilidad issue↔PR↔commit; historia lineal en `develop`.
- (−) El README de la rama por defecto muestra `develop` (aceptable).
- (−) Sin protección de ramas ni aprobaciones de entorno: las reglas dependen de convención, de un hook local y del disparo manual de producción (riesgo R23).

## Decisión 2026-10-08 — sin protecciones de GitHub (permanente)
Al aplicar esta ADR se comprobó que un **repositorio privado del plan gratuito no admite protección de ramas ni rulesets** (HTTP 403) y que los Environments con revisores requeridos probablemente tampoco. El propietario decidió **no pagar GitHub Pro ni hacer público el repositorio**. Consecuencias: la aprobación humana de `main` se mantiene como regla, pero se aplica **por convención + hook local `pre-push` + despliegue manual**, sin enforcement en GitHub. Sí se usan los **ajustes de repositorio** disponibles (squash y merge commit, sin rebase, sin auto-merge, borrar rama al fusionar). Detalle y reglas en [DEPLOYMENT §6](../DEPLOYMENT.md#6-política-de-ramas-y-despliegue-sin-protecciones-de-github).
