# Registro de decisiones de arquitectura (ADR)

Formato: [0000-template.md](0000-template.md). Estados: `Propuesta` → `Aceptada` | `Rechazada` | `Sustituida por ADR-XXXX`.
Las ADR de la Fase 0 fueron **aceptadas el 2026-10-08** (aprobación global del propietario en el chat). ADR-0007 se aceptó tras el spike P4-01. ADR-0006 sigue **provisional**: enmendada con el spike P2-11 (2026-10-10), falta medir en la GPU integrada de referencia (Q7).

| ADR | Título | Estado | Revisar en |
|---|---|---|---|
| [0001](0001-monorepo-core-package.md) | Monorepo pnpm con `core` puro y `web` | Aceptada | P1-01 |
| [0002](0002-nextjs-static-export.md) | Next.js con exportación estática | Aceptada | P1-01 / P9-01 |
| [0003](0003-state-and-commands.md) | Estado en capas, comandos con Immer patches | Aceptada | P2-02 |
| [0004](0004-persistence-indexeddb.md) | Persistencia local con IndexedDB tras un puerto | Aceptada | P6-02 |
| [0005](0005-hosting-cloudflare.md) | Hosting en Cloudflare (no Vercel Hobby) | Aceptada | P8-03 |
| [0006](0006-r3f-rendering-strategy.md) | Estrategia de render R3F | Aceptada (provisional, enmendada por P2-11) | Q7 / P5-05 |
| [0007](0007-asset-strategy.md) | Assets: híbrido GLB CC0 + paramétrico | Aceptada (provisional) | P4-01 |
| [0008](0008-tooling.md) | Herramientas de calidad y testing | Aceptada | P1-02 |
| [0009](0009-git-workflow.md) | Flujo Git, rama por defecto y revisión | Aceptada | P0-03 |
| [0010](0010-share-links-url-fragment.md) | Enlaces compartibles en el fragmento de URL | Aceptada | P6-08 |

Para añadir una decisión: copiar la plantilla, numerar secuencialmente, abrir PR `docs(adr): …`.
