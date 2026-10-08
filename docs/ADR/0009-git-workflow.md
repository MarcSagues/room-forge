# ADR-0009 — Flujo Git, rama por defecto y revisión

- **Estado:** **Aceptada** (2026-10-08)
- **Fecha:** 2026-10-08
- **Revisar cuando:** se incorporen colaboradores humanos o se automatice más el release.

## Contexto
Flujo pedido: issue → rama feature → Claude implementa y prueba → PR → Codex revisa → Claude corrige → Codex revisa → merge a `develop` → merge a `main` **solo con aprobación humana**. Detalles en [WORKFLOW.md](../WORKFLOW.md).

## Decisión
- Ramas: `main` (producción), `develop` (integración, **rama por defecto del repositorio**), `feat|fix|refactor|perf|test|docs|chore|ci/<issue>-<slug>`, `hotfix/<slug>`.
- **`develop` como rama por defecto** para que `Closes #N` cierre las issues al fusionar en `develop` (GitHub solo cierra automáticamente al fusionar en la rama por defecto).
- **Squash merge** de feature → `develop` (título = Conventional Commit). **Merge commit** de `develop` → `main` (release).
- `main` solo recibe merges desde `develop` (y `hotfix/*`, con *back-merge* a `develop`) ⇒ no hay divergencia.
- **Puerta humana real:** GitHub no permite aprobar tu propio PR y los agentes actúan con las credenciales del propietario. Por eso la aprobación de producción se implementa como **GitHub Environment `production` con revisores requeridos** (despliegue manual aprobado) + `AGENTS.md` que prohíbe a los agentes fusionar en `main`, además de protección de rama (PR obligatorio, checks obligatorios, sin force-push, sin borrado).
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
- (−) Requiere configurar protecciones y entornos (P0-03, P1-09, P8-03; acciones humanas).
