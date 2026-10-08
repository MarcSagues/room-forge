# Fase 1 — Fundamentos del proyecto (M1)

## ISSUE E1 — Épica: Fundamentos del proyecto

- **Tipo:** epic
- **Prioridad:** P0
- **Épica:** —
- **Hito:** M1
- **Estimación:** — (suma de las hijas)
- **Etiquetas:** area:infra
- **Depende de:** —

### Descripción
Dejar un repositorio funcional, con calidad automatizada, CI, shell de editor sin lógica, y despliegue de previews. Sin funcionalidad de producto.

### Contexto
Cada fase posterior depende de poder iterar con feedback rápido (lint, tipos, tests, CI, preview). Ver [ROADMAP Fase 1](../ROADMAP.md).

### Requisitos
- Monorepo pnpm con `packages/core` y `apps/web`.
- Biome, dependency-cruiser, Vitest, Playwright, CI.
- Tailwind v4 + shadcn/ui + tokens del sistema de diseño.
- Layout del editor (5 regiones) vacío pero responsive.
- Previews automáticos y revisión Codex activada.

### Criterios de aceptación
- [ ] `pnpm check` pasa en local y en CI.
- [ ] Un PR de prueba produce preview desplegada y recibe revisión de Codex.
- [ ] El shell del editor se ve correctamente a 1280, 1024 y 768 px.
- [ ] Todas las issues hijas cerradas.

### Tests esperados
Ver issues hijas.

## ISSUE P1-01 — Scaffold del monorepo (pnpm, Next.js 16 export estático, packages/core)

- **Tipo:** task
- **Prioridad:** P0
- **Épica:** E1
- **Hito:** M1
- **Estimación:** M
- **Etiquetas:** area:infra
- **Depende de:** P0-03

### Descripción
Crear la estructura del monorepo según [ARCHITECTURE §2.2](../ARCHITECTURE.md): `pnpm-workspace.yaml`, `apps/web` (Next.js con `output: 'export'`), `packages/core` (TS puro), configuración de TypeScript estricta, `.nvmrc`, `.editorconfig`, `.gitignore`, `packageManager` fijado.

### Contexto
[ADR-0001](../ADR/0001-monorepo-core-package.md) y [ADR-0002](../ADR/0002-nextjs-static-export.md). Versiones verificadas el 2026-10-08 en [FINDINGS](../research/FINDINGS.md); **TypeScript 7 requiere verificar compatibilidad** (si hay fricción, usar la última 5.x/6.x).

### Requisitos
- `apps/web`: Next 16, React 19, `output: 'export'`, `images.unoptimized`, `trailingSlash`; páginas `/` (placeholder) y `/editor` (placeholder).
- `packages/core`: `tsconfig` con `lib: ["ES2023"]` (sin DOM), `exports` por subruta, sin dependencias de runtime aún.
- Dependencias **solo las imprescindibles** (next, react, react-dom, typescript, @types/*); R3F/three/zustand/immer/zod se instalan en las issues que las usan.
- Documentar versiones elegidas y la decisión sobre TypeScript en el PR.
- Scripts raíz: `dev`, `build`, `typecheck`.

### Criterios de aceptación
- [x] `pnpm install && pnpm build` produce `apps/web/out/` con `index.html` y `editor/index.html`.
- [x] `pnpm dev` sirve `/` y `/editor` sin errores en consola.
- [x] Importar `window` desde `packages/core` falla en `pnpm typecheck`.
- [x] `pnpm-lock.yaml` versionado; `engines`/`.nvmrc` fijan Node 22.

### Tests esperados
- Smoke de build en CI (issue P1-04).
- Test de tipos negativo: archivo de ejemplo en `core` que usa `document` debe fallar (comprobado con `tsc` en un script).

## ISSUE P1-02 — Calidad de código: Biome, TypeScript estricto, dependency-cruiser y hooks de commit

- **Tipo:** task
- **Prioridad:** P0
- **Épica:** E1
- **Hito:** M1
- **Estimación:** S
- **Etiquetas:** area:infra
- **Depende de:** P1-01

### Descripción
Configurar Biome (formato + lint), reglas estrictas de TS, dependency-cruiser con la matriz de [ARCHITECTURE §2.1](../ARCHITECTURE.md), husky + lint-staged y commitlint (Conventional Commits).

### Contexto
[ADR-0008](../ADR/0008-tooling.md). Las fronteras arquitectónicas deben hacerse cumplir automáticamente.

### Requisitos
- `biome.json` con reglas recomendadas + `noExplicitAny`, imports ordenados.
- `tsconfig`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- `.dependency-cruiser.cjs` con las reglas de la matriz (incluida «`core` no importa react/three/DOM»).
- Scripts: `lint`, `format`, `check:deps`, y `check` que los agrupe (más typecheck y tests cuando existan).
- Hook `pre-commit` (lint-staged) y `commit-msg` (commitlint).
- Hook `pre-push` que **rechaza empujar a `develop`/`main`** (sustituye la protección de ramas que GitHub no ofrece en este plan; override explícito del propietario con `ROOMFORGE_ALLOW_PROTECTED_PUSH=1`; ver DEPLOYMENT §6).
- Opcional: reglas de permisos del proyecto en `.claude/settings.json` que impidan a Claude Code `git push` a `develop`/`main` y `--force`.

### Criterios de aceptación
- [x] `pnpm check` falla si se introduce un import prohibido (probado con un commit de prueba descartado).
- [x] Un mensaje de commit no convencional es rechazado localmente.
- [x] `git push origin develop` y `git push origin main` desde una rama local son rechazados por el hook (probado), y `git push origin <rama-de-trabajo>` funciona.
- [x] El tiempo de `pnpm lint` en repo vacío < 5 s.

### Tests esperados
- Fixtures de arquitectura: 2 archivos de ejemplo (uno válido, uno inválido) ejecutados por un script de verificación de reglas (`tools/checks`).

## ISSUE P1-03 — Vitest y React Testing Library: configuración y tests de humo

- **Tipo:** task
- **Prioridad:** P0
- **Épica:** E1
- **Hito:** M1
- **Estimación:** S
- **Etiquetas:** area:testing
- **Depende de:** P1-01

### Descripción
Configurar Vitest con dos proyectos: `core` (entorno `node`) y `web` (entorno `happy-dom`), RTL, cobertura (v8) y utilidades de test (`packages/core/src/testing`: builders y generador de IDs determinista).

### Contexto
[TESTING_STRATEGY](../TESTING_STRATEGY.md). Tests de `core` deben arrancar en milisegundos.

### Requisitos
- `vitest.workspace` (o proyectos) para `core` y `web`.
- Un test de humo por paquete (`expect(true)` no vale: p. ej. render de la página `/editor` y una función trivial de `core`).
- Informe de cobertura; umbrales **no bloqueantes** todavía (se activan en P7-03).
- Scripts: `test`, `test:watch`, `test:coverage`.

### Criterios de aceptación
- [x] `pnpm test` ejecuta ambos proyectos y pasa.
- [x] `pnpm test:coverage` genera informe HTML y lcov.
- [x] Tiempo de `pnpm --filter core test` < 3 s.

### Tests esperados
- Los propios tests de humo.

## ISSUE P1-04 — CI en GitHub Actions (lint, typecheck, test, build, deps)

- **Tipo:** task
- **Prioridad:** P0
- **Épica:** E1
- **Hito:** M1
- **Estimación:** S
- **Etiquetas:** area:infra
- **Depende de:** P1-02, P1-03

### Descripción
Workflow `ci.yml` que se ejecuta en PR y en push a `develop`/`main`: instalar (con caché de pnpm), `pnpm check`, `pnpm test:coverage`, `pnpm build`. Subir artefactos de cobertura. Configurar Dependabot agrupado.

### Contexto
Especificación en [DEPLOYMENT §4](../DEPLOYMENT.md). No hay protección de ramas en GitHub (decisión del propietario): los checks se vigilan por convención antes de fusionar ([DEPLOYMENT §6](../DEPLOYMENT.md#6-política-de-ramas-y-despliegue-sin-protecciones-de-github)).

### Requisitos
- Permisos mínimos (`contents: read`), `concurrency` por rama con cancelación.
- Matriz no necesaria (Node 22, ubuntu-latest).
- `dependabot.yml` agrupando por ecosistema semanal.
- Los checks `ci` y `e2e` se publican con nombres estables y el resultado se consulta siempre antes de fusionar (no hay bloqueo técnico: ver DEPLOYMENT §6).

### Criterios de aceptación
- [ ] Un PR con error de lint/tipos/test/build falla; uno limpio pasa.
- [ ] Tiempo total de CI < 5 min con caché.
- [ ] Los checks `ci`/`e2e` aparecen en cada PR con un nombre estable y AGENTS.md/WORKFLOW indican que se revisan antes de fusionar.

### Tests esperados
- PR de prueba con fallo intencionado por cada fase del pipeline (se descarta).

## ISSUE P1-05 — Tailwind v4, shadcn/ui y tokens de diseño (tema oscuro/claro)

- **Tipo:** task
- **Prioridad:** P0
- **Épica:** E1
- **Hito:** M1
- **Estimación:** M
- **Etiquetas:** area:ui
- **Depende de:** P1-01

### Descripción
Instalar Tailwind v4 y shadcn/ui, implementar los tokens de [DESIGN_SYSTEM §2](../DESIGN_SYSTEM.md) (color, tipografía Inter self-hosted, radios, movimiento) con temas oscuro (por defecto) y claro, y una página interna `/dev/ui` que muestra los componentes base.

### Contexto
La identidad visual debe ser coherente desde el principio. Q1 del PRD (idiomas) condiciona la infraestructura de i18n: dejar un `t()` mínimo con diccionarios `es`/`en`.

### Requisitos
- Tokens como variables CSS + `@theme`; cambio de tema con `data-theme` y `prefers-color-scheme`.
- Componentes shadcn necesarios: Button, Input, Tabs, Tooltip, Dialog, DropdownMenu, Select, Slider, Switch, ScrollArea, Separator, Sonner.
- Fuente Inter incluida en el build (sin peticiones externas).
- Infra i18n mínima (sin librería) con claves estables.
- `/dev/ui` excluida del sitemap/producción (solo en desarrollo o detrás de flag).

### Criterios de aceptación
- [ ] Contraste de los pares documentados ≥ ratios de DESIGN_SYSTEM §2.1 (verificado con script).
- [ ] Cambiar de tema no produce destello (FOUC) en recarga.
- [ ] Sin peticiones a dominios externos en la pestaña Network.
- [ ] `/dev/ui` muestra todos los estados (hover, focus-visible, disabled).

### Tests esperados
- Test RTL de `Button`/`Input` (foco visible, disabled).
- Test unitario del script de contraste.
- Axe en `/dev/ui` sin violaciones graves.

## ISSUE P1-06 — Shell del editor: layout de 5 regiones con paneles redimensionables

- **Tipo:** feature
- **Prioridad:** P0
- **Épica:** E1
- **Hito:** M1
- **Estimación:** M
- **Etiquetas:** area:ui, area:ux
- **Depende de:** P1-05

### Descripción
Implementar el layout del editor (barra superior, panel izquierdo, viewport central, panel derecho, barra inferior) con paneles redimensionables/colapsables y comportamiento responsive. Contenido placeholder.

### Contexto
[DESIGN_SYSTEM §3](../DESIGN_SYSTEM.md). El viewport es un `div` vacío que recibirá el Canvas en P2-06.

### Requisitos
- Anchos por defecto y límites según DESIGN_SYSTEM §3; tamaños de panel persistidos en `localStorage` (con try/catch).
- Atajo para colapsar paneles (`[` y `]`).
- Breakpoints: ≥1280 completo; 768–1023 *drawers*; <768 modo visor (solo viewport + banner).
- Sin dependencia de three/R3F.

### Criterios de aceptación
- [ ] A 1280, 1024 y 768 px el layout no desborda ni produce scroll de página.
- [ ] Redimensionar y recargar conserva los anchos.
- [ ] Tab recorre las regiones en orden lógico; los paneles colapsados no son focuseables.
- [ ] A <768 px solo se ve el viewport y el banner «Abre en un ordenador para editar».

### Tests esperados
- RTL: colapsar/expandir, persistencia con `localStorage` simulado y con `localStorage` que lanza error.
- Playwright (cuando exista P1-07): capturas del layout a 3 anchos.

## ISSUE P1-07 — Playwright con WebGL y tests e2e de humo en CI

- **Tipo:** task
- **Prioridad:** P1
- **Épica:** E1
- **Hito:** M1
- **Estimación:** S
- **Etiquetas:** area:testing
- **Depende de:** P1-04, P1-06

### Descripción
Configurar Playwright (Chromium) con renderizado WebGL por software (SwiftShader) para CI, servidor de pruebas sobre el build estático, y tests de humo: la home carga, el editor carga, no hay errores de consola.

### Contexto
[TESTING_STRATEGY §5](../TESTING_STRATEGY.md). Es el **spike** que determina si la regresión visual determinista es viable (P7-02).

### Requisitos
- Flags de Chromium para WebGL en headless/CI documentados y probados.
- Test que crea un `<canvas>` WebGL2 y verifica `getContext('webgl2') !== null` en CI.
- Job separado `e2e` en CI (solo en PR y push a develop), traza y vídeo solo en fallo.
- Flag `NEXT_PUBLIC_E2E=1` reservado para exponer `window.__RF__` (todavía sin contenido).

### Criterios de aceptación
- [ ] `pnpm e2e` pasa en local y en CI.
- [ ] Hay una nota en TESTING_STRATEGY con los flags finales y limitaciones observadas.
- [ ] El job e2e dura < 4 min.

### Tests esperados
- `smoke.spec.ts`: home, editor, WebGL2 disponible, consola sin errores.

## ISSUE P1-08 — Despliegue de previews en Cloudflare (PR y develop)

- **Tipo:** task
- **Prioridad:** P0
- **Épica:** E1
- **Hito:** M1
- **Estimación:** M
- **Etiquetas:** area:infra, human-required
- **Depende de:** P1-04

### Descripción
Desplegar el build estático en Cloudflare con un preview por PR y un entorno estable para `develop`, mediante `wrangler` en GitHub Actions. Comentar la URL de preview en el PR.

### Contexto
[ADR-0005](../ADR/0005-hosting-cloudflare.md) y [DEPLOYMENT §3](../DEPLOYMENT.md). **Requiere que el propietario cree la cuenta/token de Cloudflare y los secretos en GitHub** (no automatizable por agentes).

### Requisitos
- Secretos: `CLOUDFLARE_API_TOKEN` (permisos mínimos), `CLOUDFLARE_ACCOUNT_ID`.
- Workflow `deploy-preview.yml` con permisos mínimos y sin exponer secretos a PRs de forks.
- Archivo `_headers` inicial (seguridad básica y caché de assets con hash).
- Decidir y documentar Workers (static assets) vs Pages en el PR.

### Criterios de aceptación
- [ ] Abrir un PR crea una URL de preview accesible y la comenta en el PR.
- [ ] La preview de `develop` se actualiza al fusionar.
- [ ] Ningún secreto aparece en logs; los PRs desde forks no reciben secretos.

### Tests esperados
- Verificación manual con un PR de prueba; test E2E de humo (P1-07) contra la URL de preview (opcional).

## ISSUE P1-09 — Activar la revisión con Codex y validar el flujo con un PR de prueba

- **Tipo:** task
- **Prioridad:** P1
- **Épica:** E1
- **Hito:** M1
- **Estimación:** S
- **Etiquetas:** area:infra, human-required
- **Depende de:** P1-04

### Descripción
Configurar Codex cloud para el repositorio, activar *Code review*, comprobar que lee `AGENTS.md` (sección `## Review guidelines`) y ejecutar el ciclo completo con un PR de prueba: Claude abre PR → `@codex review` → Claude corrige → `@codex review` → fusión a `develop`.

### Contexto
[WORKFLOW](../WORKFLOW.md) y [FINDINGS §4](../research/FINDINGS.md). Las reseñas automáticas se disparan al abrir el PR; tras nuevos commits hay que volver a pedirlas. **Acción humana:** habilitar Codex en el repositorio.

### Requisitos
- PR de prueba con un fallo deliberado que `AGENTS.md` debería detectar (p. ej. import de `react` en `core`).
- Documentar en WORKFLOW cualquier diferencia observada (formato de hallazgos, severidades).
- Verificar que el PR NO se fusiona automáticamente en ningún paso.

### Criterios de aceptación
- [ ] Codex comenta el PR de prueba y menciona la violación.
- [ ] El ciclo de 2 rondas se completa y el PR se fusiona manualmente en `develop`.
- [ ] WORKFLOW actualizado con los hallazgos reales.

### Tests esperados
No aplica (validación de proceso).
