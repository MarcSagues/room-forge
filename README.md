# RoomForge

Diseña habitaciones, despachos y **setups gaming** en 3D desde el navegador: arrastra muebles, cambia materiales, añade **iluminación LED/RGB** y alterna entre **día y noche**. Sin instalar nada, sin saber 3D.

> **Estado: Fase 1 — fundamentos.** Documentación y backlog completos ([`docs/`](docs/README.md)); scaffold del monorepo en curso (P1-01). Todavía no hay funcionalidad de producto.

## Empieza por aquí

| Quiero… | Documento |
|---|---|
| Entender el producto | [docs/PRODUCT.md](docs/PRODUCT.md) |
| Ver qué se construye (MVP) | [docs/PRD.md](docs/PRD.md) |
| Ver la arquitectura | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [modelo de dominio](docs/DOMAIN_MODEL.md) |
| Ver el plan y el calendario | [docs/ROADMAP.md](docs/ROADMAP.md) · [backlog priorizado](docs/BACKLOG.md) |
| Conocer los riesgos | [docs/RISKS.md](docs/RISKS.md) |
| Trabajar en una issue | [docs/WORKFLOW.md](docs/WORKFLOW.md) · [AGENTS.md](AGENTS.md) |
| Ver las decisiones técnicas | [docs/ADR/](docs/ADR/README.md) |

## Stack (propuesto)

Next.js 16 (export estático) · React 19 · TypeScript · Tailwind v4 + shadcn/ui · Zustand + Immer · three.js + React Three Fiber + drei · IndexedDB (`idb`) · Vitest + Playwright · GitHub Actions · Cloudflare.

## Desarrollo

Requisitos: Node 22 (`.nvmrc`) y pnpm 12 (`packageManager`).

```bash
pnpm install
pnpm dev                 # http://localhost:3000  (/, /editor/)
pnpm build               # export estático → apps/web/out
pnpm typecheck
pnpm check:core-purity   # verifica que packages/core no puede usar el DOM
```

Estructura: `apps/web` (Next.js 16, export estático) · `packages/core` (TypeScript puro; [ADR-0001](docs/ADR/0001-monorepo-core-package.md)).

## Backlog

El backlog está en [`docs/issues/`](docs/issues/README.md) como Markdown estructurado, listo para importar a GitHub:

```bash
node tools/planning/github-import.mjs validate     # validar (offline)
node tools/planning/github-import.mjs backlog      # regenerar docs/BACKLOG.md
node tools/planning/github-import.mjs import --repo OWNER/REPO            # dry-run
```

Crear el repositorio y las issues en GitHub requiere autorización explícita (ver issue P0-03).

## Licencia

Pendiente de decisión (PRD Q3). Hasta entonces: todos los derechos reservados.
