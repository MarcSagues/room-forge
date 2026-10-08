# ADR-0008 — Herramientas de calidad y testing

- **Estado:** **Aceptada** (2026-10-08)
- **Fecha:** 2026-10-08
- **Revisar cuando:** Biome no cubra una regla necesaria (p. ej. hooks de React) o la configuración de dependency-cruiser resulte frágil.

## Contexto
Equipo de uno + agentes de IA. Se prioriza velocidad de feedback, pocas herramientas, y que las reglas arquitectónicas se hagan cumplir automáticamente. Next 16 ya no incluye `next lint`.

## Decisión
| Ámbito | Herramienta |
|---|---|
| Formato + lint | **Biome 2** |
| Fronteras de módulos | **dependency-cruiser** (`pnpm check:deps`) |
| Tipos | **TypeScript** estricto (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`); **fijado en 6.0.3** (verificado en P1-01, ver abajo) |
| Unit/integración | **Vitest** (core en entorno `node`; web en `happy-dom`) + **React Testing Library** |
| Propiedades | **fast-check** |
| E2E / visual / a11y | **Playwright** (+ axe) |
| Hooks locales | **husky + lint-staged** (formato + lint de lo cambiado; typecheck y tests en CI) |
| Commits | **commitlint** (Conventional Commits) |
| Código muerto | **knip** (opcional, P2) |
| Gestor | **pnpm**, Node 22 LTS (`.nvmrc`) |

## Alternativas consideradas
| Alternativa | Por qué no (ahora) |
|---|---|
| ESLint + Prettier | Dos herramientas más lentas; posible vuelta si faltan reglas de React/Next. |
| Jest | Vitest es más rápido y comparte config con Vite/TS. |
| Cypress | Playwright cubre WebGL, múltiples navegadores y screenshots. |
| Storybook | Coste > beneficio en MVP. |

## Consecuencias
- (+) `pnpm check` (format+lint+types+deps+tests) en segundos.
- (−) Sin reglas `eslint-config-next` (se compensan con Biome y revisión).
- (−) **TypeScript 7.0.2** (última en npm) no se adopta todavía. Verificado en P1-01 (2026-10-08): `next build` de Next 16.4 funciona con 7.0.2 **y** con 6.0.3, pero **dependency-cruiser 18.5 no soporta TypeScript ≥ 7** (su propio aviso: «Support for typescript@>=7 will follow when its API is published and stable»), y es la pieza que hace cumplir las fronteras de módulos. Se fija `typescript@6.0.3`. Revisar al actualizar dependency-cruiser; la migración a 7 es un cambio de versión + comprobar `pnpm check`.

## Verificación
P1-02/P1-03/P1-04: CI verde con todas las comprobaciones; un PR de prueba rompe a propósito una frontera y CI falla.
