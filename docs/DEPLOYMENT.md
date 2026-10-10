# RoomForge — Despliegue, CI/CD e infraestructura

> Estado: **borrador para aprobación** · Decisión de hosting: [ADR-0005](ADR/0005-hosting-cloudflare.md) · Implementación: P1-04, P1-08, P8-03
> **Los workflows de esta página son especificaciones.** No se han creado en `.github/workflows/` porque aún no existe `package.json` y fallarían; se implementan en P1-04 (CI) y P1-08/P8-03 (despliegues).

## 1. Entornos

| Entorno | Rama | URL | Despliegue | Aprobación |
|---|---|---|---|---|
| Local | cualquiera | `localhost:3000` | `pnpm dev` | — |
| **Preview** | PR | `<pr>.<proyecto>.workers.dev` (o equivalente) | Automático al abrir/actualizar el PR | No |
| **Staging** | `develop` | URL estable de staging | Automático al fusionar | No |
| **Producción** | `main` | dominio propio | Automático **tras aprobación** del entorno `production` | **Humana (obligatoria)** |

## 2. Hosting: decisión y límites

- **Cloudflare**, sirviendo el directorio estático `apps/web/out` (Next.js `output: 'export'`).
- Motivo principal: el plan Hobby de Vercel es solo para uso personal no comercial ([docs de Vercel](https://vercel.com/docs/plans/hobby)); Cloudflare no muestra esa restricción en las fuentes consultadas, **pero hay que verificar sus términos antes de producción (P8-03)**.
- Límites del plan gratuito de Pages relevantes: 500 builds/mes, 20 min por build, 20 000 archivos por proyecto ([límites oficiales](https://developers.cloudflare.com/pages/platform/limits)). Al compilar en GitHub Actions y subir el resultado con `wrangler`, el límite de builds de Cloudflare presumiblemente no aplica (subida directa); **verificarlo en P1-08**.
- Cloudflare orienta los proyectos nuevos a **Workers con static assets**; Pages sigue operativo. Ambos sirven el mismo `out/`. La elección final (Workers vs Pages) se hace en P1-08 según el estado de la documentación en ese momento; el resto de este documento aplica a ambos.
- Exportación estática: **no** hay `redirects/rewrites/headers` de `next.config`, ni middleware, ni optimización de imágenes. Redirecciones y cabeceras → ficheros de plataforma (`_headers`, `_redirects` o configuración de Workers).

## 3. Previews y producción (especificación)

Flujo con **builds en GitHub Actions** y subida con `wrangler`:

```yaml
# .github/workflows/deploy-preview.yml  (ESPECIFICACIÓN — se crea en P1-08)
name: deploy-preview
on:
  pull_request:
    types: [opened, synchronize, reopened]
permissions:
  contents: read
  pull-requests: write        # para comentar la URL
concurrency:
  group: preview-${{ github.event.pull_request.number }}
  cancel-in-progress: true
jobs:
  deploy:
    # Los PR desde forks NO reciben secretos: no desplegamos previews de forks.
    if: github.event.pull_request.head.repo.full_name == github.repository
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4          # fijar por SHA en P1-04
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - name: Deploy preview
        run: pnpm dlx wrangler@<versión fijada> deploy --name roomforge-pr-${{ github.event.pull_request.number }}   # o `pages deploy`
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
      # + paso que comenta/actualiza la URL en el PR
```

```yaml
# .github/workflows/deploy-production.yml  (ESPECIFICACIÓN — se crea en P8-03)
name: deploy-production
on:
  workflow_dispatch:               # SOLO manual: es la puerta humana (no hay Environments con revisores, ver §6)
permissions:
  contents: read
jobs:
  deploy:
    if: github.ref == 'refs/heads/main'   # solo se despliega desde main
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm e2e:smoke           # humo contra el build
      - run: pnpm dlx wrangler@<versión fijada> deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

## 4. CI (especificación para P1-04)

```yaml
# .github/workflows/ci.yml  (ESPECIFICACIÓN)
name: ci
on:
  pull_request:
  push:
    branches: [develop, main]
permissions:
  contents: read
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm check                 # biome + tsc + dependency-cruiser
      - run: pnpm test:coverage
      - run: pnpm build
      - uses: actions/upload-artifact@v4
        with: { name: coverage, path: coverage }
  e2e:                                   # se añade en P1-07
    needs: check
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      # install + `pnpm exec playwright install --with-deps chromium` + build + `pnpm e2e`
      - run: echo "ver P1-07"
```

Requisitos de CI:
- **Permisos mínimos** por job; acciones fijadas por SHA de commit (P1-04) y actualizadas por Dependabot.
- `--frozen-lockfile`; sin scripts `postinstall` no revisados (`pnpm` con lista de dependencias permitidas).
- Checks `check` y `e2e` **requeridos** en `develop` y `main`.
- Tiempo objetivo: `check` < 5 min; `e2e` < 6 min.
- Cache de pnpm y de navegadores de Playwright.

### Dependabot (P1-04)

```yaml
# .github/dependabot.yml  (ESPECIFICACIÓN)
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule: { interval: weekly }
    groups:
      react-three: { patterns: ["three", "@react-three/*", "@types/three"] }
      tooling:     { patterns: ["@biomejs/*", "vitest", "@vitest/*", "@playwright/*", "dependency-cruiser", "typescript"] }
      next-react:  { patterns: ["next", "react", "react-dom", "@types/react*"] }
    open-pull-requests-limit: 5
  - package-ecosystem: github-actions
    directory: /
    schedule: { interval: weekly }
```

Las actualizaciones de `three`/`@react-three/*`/`react` se tratan como **riesgo** (R9, R21): R3F 9.8 acota `react >=19 <19.4`; actualizar en grupo y con E2E completo.

## 5. Secretos y configuración (acciones humanas)

| Secreto / variable | Dónde | Quién | Cuándo |
|---|---|---|---|
| `CLOUDFLARE_API_TOKEN_PREVIEW` y `CLOUDFLARE_API_TOKEN_PROD` (permisos mínimos; el de preview **no** puede tocar el proyecto de producción) | GitHub → Secrets **del repositorio** (no hay Environments con revisores, ver §6) | Propietario | P1-08 / P8-03 |
| `CLOUDFLARE_ACCOUNT_ID` | idem | Propietario | P1-08 |
| `NEXT_PUBLIC_E2E` | Solo en jobs E2E | CI | P1-07 |
| `NEXT_PUBLIC_APP_VERSION` | Build (commit SHA/tag) | CI | P1-04 |
| `NEXT_PUBLIC_ANALYTICS_ENDPOINT` | Build de producción, **opcional**: ruta del mismo origen (`/api/event`) o URL https que recibe `{"event":…}` ([ADR-0011](ADR/0011-respectful-analytics.md)). Sin ella no se envía ninguna analítica. Con una URL de otro origen, `write-headers.mjs` añade ese origen a `connect-src` | Propietario, tras elegir la herramienta y actualizar la política de privacidad | P8-01 / P8-03 |

Reglas: **nunca** secretos en el repositorio; rotación si se exponen; los agentes de IA no leen ni escriben secretos.

## 6. Política de ramas y despliegue sin protecciones de GitHub

**Decisión del propietario (2026-10-08): no se pagará GitHub Pro ni se hará público el repositorio.**

En un repositorio privado del plan gratuito, `gh api repos/MarcSagues/room-forge/branches/main/protection` y `.../rulesets` devuelven **HTTP 403 «Upgrade to GitHub Pro or make this repository public to enable this feature»**, y (según la documentación de GitHub; **verificar en P8-03**) tampoco hay reglas de protección de *Environments* (revisores requeridos). Por tanto **no habrá** protección de ramas, rulesets ni aprobaciones de entorno, y esta política es **permanente** mientras no cambie esa decisión. Se compensa con convenciones, controles locales y un despliegue manual.

### Reglas y cómo se cumplen

| Regla | Cómo se cumple (sin protección en GitHub) |
|---|---|
| Todo cambio entra por PR a `develop` | Convención + [AGENTS.md](../AGENTS.md) (prohíbe `push` directo) + hook `pre-push` local (`.husky/pre-push`, activo tras `pnpm install`) que rechaza empujar a `develop`/`main` (el propietario puede saltarlo con `ROOMFORGE_ALLOW_PROTECTED_PUSH=1`) |
| CI verde antes de fusionar | Se mira siempre el resultado; no hay bloqueo técnico |
| Sin `force-push` ni borrado de `develop`/`main` | Convención + hook `pre-push` + AGENTS.md |
| Squash en `develop`, *merge commit* en `main`, sin *auto-merge* | **Ajustes del repositorio** (sí disponibles en el plan gratuito): rebase deshabilitado, *auto-merge* deshabilitado, borrar rama al fusionar |
| `main` solo recibe `develop` (y `hotfix/*` + *back-merge*) | Convención; fusiona el propietario (o un agente por orden explícita suya, nunca en `main`) |
| Cambios en `.github/**` (workflows) revisados | El propietario revisa el diff de `.github/` antes de fusionar; CODEOWNERS es solo informativo sin protección |

### Quién fusiona
- **`develop`:** el propietario, o un agente **solo si el propietario lo ordena explícitamente en el chat** para ese PR.
- **`main`:** solo el propietario.

### Producción: la puerta humana es el disparo manual
- `deploy-production.yml` **no tiene disparador por `push`**: solo `workflow_dispatch`, con guarda `github.ref == refs/heads/main`.
- El propietario fusiona el PR `develop → main` y **él** lanza el workflow (pestaña Actions → *Run workflow*). Los agentes **nunca** lanzan ese workflow.
- Los secretos de preview y de producción son distintos (§5): un token de preview filtrado no puede desplegar producción.

### Riesgo residual (R23)
Los secretos son del repositorio y cualquier workflow de una rama del propio repo podría leerlos; los agentes actúan con las credenciales del propietario. Mitigaciones: tokens de mínimo privilegio y separados, AGENTS.md (no tocar workflows ni secretos salvo que la issue lo pida), revisión humana del diff de `.github/`, y rotación inmediata ante cualquier sospecha. Ver [RISKS R23](RISKS.md).

### Si algún día cambia la decisión
Con GitHub Pro o repositorio público bastaría activar protección de ramas (PR + checks obligatorios, sin force-push) y un Environment `production` con revisores, y volver a un disparador por `push` a `main` con aprobación del entorno. Nada del diseño lo impide.
## 7. Cabeceras y caché (`_headers`, P1-08 → P7-09 → P8-03)

`apps/web/scripts/write-headers.mjs` genera `out/_headers` justo después de `next build` (`pnpm build` lo ejecuta; no hay un `public/_headers` escrito a mano). Así la CSP lleva el hash de los scripts en línea de **esa** compilación:

```text
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()

/_next/static/*
  Cache-Control: public, max-age=31536000, immutable

/editor/                      (una regla por página: /, /projects/, /editor/, /404.html …)
  Content-Security-Policy: default-src 'self'; script-src 'self' 'sha256-…' 'sha256-…' 'sha256-…'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; manifest-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'
```

Notas:

- **Una sola regla fija la CSP de cada página.** Cloudflare une con coma los valores de una misma cabecera que fijan varias reglas, y dos políticas se aplican a la vez (gana la más estricta); por eso la CSP no va en `/*`.
- Una URL que no corresponde a ninguna página (un 404 de verdad) solo recibe las cabeceras de `/*`: la página 404 no muestra datos de nadie.
- **`wasm-unsafe-eval` no está** porque nada compila WebAssembly todavía; P4-04 lo añade en `script-src` si Draco/Meshopt lo necesitan. Cualquier fuente nueva (CDN, analítica de la Fase 8) se añade en `apps/web/scripts/headers.mjs` con su justificación y su prueba.
- Un script en línea nuevo no necesita tocar nada: su hash se calcula solo. Un script **externo** de otro origen sí (y se discute en la PR).
- El límite de Cloudflare es 2 000 caracteres por línea y 100 reglas: un test lo vigila.
- `scripts/serve-static.mjs` aplica `out/_headers` igual que el host, de modo que el E2E prueba la política real.
- Los assets 3D llevan hash en el nombre (inmutables). Brotli lo aplica Cloudflare.

## 8. Costes

| Concepto | MVP | Después |
|---|---|---|
| Hosting estático (Cloudflare) | 0 € | 0 € → plan de pago solo si se necesita Workers de pago |
| GitHub (repo privado, Actions) | 0 € (cuota gratuita) | Vigilar minutos de Actions con E2E |
| Dominio | ≈ 10–15 €/año | — |
| Analítica | 0 € (Cloudflare Web Analytics u otra sin cookies) | Según elección (Q6) |
| Base de datos / auth / IA | — | Fase 9: estimar en P9-01 |

Alertas: avisos de uso en la cuenta de Cloudflare y revisión mensual de minutos de Actions.

## 9. Rollback

1. **Producción:** volver a desplegar el commit/tag anterior (`workflow_dispatch` con `ref` o revertir en `main` y aprobar). Objetivo: < 10 min (ensayado en P8-03).
2. **Datos de usuario:** viven en su navegador; un rollback **no** los toca. Por eso las migraciones de esquema deben ser **hacia delante y tolerantes**: la versión anterior debe rechazar con mensaje claro un archivo de versión futura (nunca corromperlo).
3. **Service worker (si P8-05):** estrategia de invalidación explícita y «kill switch».

## 10. Proceso de release

1. `develop` verde y estable. Demo/hito cerrado.
2. PR `develop → main` (merge commit). Checklist de release en el cuerpo del PR (`docs/releases/vX.Y.Z.md`).
3. El propietario lanza manualmente el workflow `deploy-production` (*Run workflow* sobre `main`) → despliegue. Ver §6.
4. Tag `vX.Y.Z` y release de GitHub con *changelog* generado de Conventional Commits.
5. Smoke E2E contra producción; monitorización 24 h.
6. Hotfix: rama `hotfix/<slug>` desde `main` → PR a `main` → *back-merge* a `develop`.

Versionado: SemVer pre-1.0 (`0.y.z`); `v0.1.0-beta` = beta pública. Hitos internos: etiquetas `m<N>`.

## 11. Docker

Docker **no se usa en el MVP**: no hay servidor, el build es reproducible con Node + pnpm y el despliegue es estático. Se adoptará solo si aporta valor concreto (p. ej. un servicio de IA/worker local en Fase 9 o un entorno de desarrollo reproducible para varias personas). El Docker local del equipo puede servir para ejecutar Postgres en desarrollo de la Fase 9 sin instalar nada en el sistema.
