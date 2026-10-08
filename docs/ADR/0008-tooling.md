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
| Tipos | **TypeScript** estricto (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`); versión final tras verificar compatibilidad |
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
- (−) TypeScript 7 (versión más reciente en npm) podría no estar soportado por todo el toolchain: comprobar en P1-01.

## Verificación
P1-02/P1-03/P1-04: CI verde con todas las comprobaciones; un PR de prueba rompe a propósito una frontera y CI falla.
