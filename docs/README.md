# Documentación de RoomForge

Estado: **Fase 0 — borrador para aprobación** (2026-10-08). Idioma: español (código, commits y PRs en inglés).

## Producto
| Documento | Contenido |
|---|---|
| [PRODUCT.md](PRODUCT.md) | Visión, usuarios, diferenciadores, competencia, métricas, modelo de negocio |
| [PRD.md](PRD.md) | Alcance MVP, requisitos funcionales y no funcionales, catálogo de 30 objetos, preguntas abiertas |
| [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) | Identidad visual, tokens (con contrastes verificados), layout del editor, atajos, componentes, accesibilidad |
| [FUTURE_VERSIONS.md](FUTURE_VERSIONS.md) | IA, pagos, cuentas, colaboración, marketplace… (documentado, no planificado) |

## Ingeniería
| Documento | Contenido |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Capas, estado, comandos/historial, motor de escena, rendimiento R3F, persistencia, IA, seguridad |
| [DOMAIN_MODEL.md](DOMAIN_MODEL.md) | Entidades, tipos, invariantes, versionado de escenas, evolución |
| [ADR/](ADR/README.md) | 10 decisiones de arquitectura (Propuestas) |
| [TESTING_STRATEGY.md](TESTING_STRATEGY.md) | Pirámide, propiedades, E2E con WebGL, visual, presupuestos |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Entornos, Cloudflare, CI/CD (especificación), secretos, cabeceras, rollback |
| [WORKFLOW.md](WORKFLOW.md) | Ramas, commits, PRs, revisión con Codex, fusión, bugs |
| [research/](research/FINDINGS.md) | Hallazgos de la investigación y fuentes ([R3F_PERFORMANCE](research/R3F_PERFORMANCE.md)) |

## Gestión
| Documento | Contenido |
|---|---|
| [ROADMAP.md](ROADMAP.md) | 10 fases con objetivo, funcionalidades, dependencias, riesgos, criterios, estimación, entregables; calendario; plan de recorte |
| [BACKLOG.md](BACKLOG.md) | Backlog priorizado y orden de implementación (**generado**) |
| [RISKS.md](RISKS.md) | 22 riesgos con mitigación y señales de alerta |
| [BETA_TRIAGE.md](BETA_TRIAGE.md) | Feedback de la beta: canal (issues de GitHub), etiquetas, severidad, SLA, revisión semanal, cierre del ciclo |
| [issues/](issues/README.md) | Issues listas para importar a GitHub (fuente de verdad del backlog) |

## Cómo mantener esto coherente
- Edita `docs/issues/*.md` → `node tools/planning/github-import.mjs validate` → `... backlog`.
- El validador también comprueba que toda referencia `Pn-nn` en la documentación apunta a una issue existente.
- Cambios de decisión → nueva ADR o enmienda de la existente.
