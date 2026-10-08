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
  push:
    branches: [main]
permissions:
  contents: read
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production        # ← revisores requeridos: PUERTA HUMANA
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
| `CLOUDFLARE_API_TOKEN` (permisos mínimos: editar Workers/Pages del proyecto) | GitHub → Secrets (Environments `preview`/`production`) | Propietario | P1-08 |
| `CLOUDFLARE_ACCOUNT_ID` | idem | Propietario | P1-08 |
| `NEXT_PUBLIC_E2E` | Solo en jobs E2E | CI | P1-07 |
| `NEXT_PUBLIC_APP_VERSION` | Build (commit SHA/tag) | CI | P1-04 |

Reglas: **nunca** secretos en el repositorio; rotación si se exponen; los agentes de IA no leen ni escriben secretos.

## 6. Protección de ramas y entornos (a aplicar en P0-03 / P1-04 / P8-03, con autorización)

| Regla | `develop` | `main` |
|---|:---:|:---:|
| PR obligatorio | ✅ | ✅ |
| Checks obligatorios (`check`, `e2e`) | ✅ | ✅ |
| Rama actualizada antes de fusionar | ✅ | ✅ |
| Historial lineal / squash | Squash | Merge commit (release) |
| Force-push y borrado bloqueados | ✅ | ✅ |
| Aprobaciones requeridas | 0 (revisión por Codex + persona al fusionar) | 0 en la rama; **la puerta es el Environment `production` con revisores requeridos** |
| Conversaciones resueltas | ✅ | ✅ |
| Aplicar a administradores | ✅ | ✅ |

### Limitación detectada (2026-10-08): plan gratuito de GitHub con repositorio privado

Al crear el repositorio, `gh api repos/MarcSagues/room-forge/branches/main/protection` y `.../rulesets` devolvieron **HTTP 403 «Upgrade to GitHub Pro or make this repository public to enable this feature»**. En un repositorio **privado del plan gratuito no hay protección de ramas ni rulesets**, y (según la documentación de GitHub; **verificar al llegar a P8-03**) tampoco reglas de protección de *Environments* (revisores requeridos). La tabla anterior es, por tanto, el estado **objetivo**, no el actual.

| Opción | Coste | Efecto | Cuándo encaja |
|---|---|---|---|
| **A. GitHub Pro** | De pago (precio por verificar) | Protecciones, rulesets y Environments con revisores también en privado | El repo debe seguir privado tras el lanzamiento |
| **B. Repositorio público** | 0 | Protecciones y Environments gratuitos; código y docs visibles | Beta pública / open core; **exige decidir la licencia (Q3)** |
| **C. Interino sin protecciones** | 0 | Las reglas se cumplen por convención ([AGENTS.md](../AGENTS.md)); sin bloqueo técnico | Fases 1–7 (aún no hay producción) |

**Decisión provisional: C hasta P8-03**, y decidir A o B antes de la beta (P0-03 queda abierta con la etiqueta `needs-decision`). Reglas del modo interino:
- Todo cambio va por PR a `develop` (convención; los commits de *setup* inicial se hicieron directamente y quedan registrados).
- El resultado de CI se mira **siempre** antes de fusionar, aunque no bloquee técnicamente.
- Nadie hace `push` directo a `develop`/`main`; `main` solo cambia mediante PR `develop → main` fusionado por el propietario.
- El despliegue de producción (P8-03) **no tendrá disparador por `push`**: solo `workflow_dispatch` manual lanzado por el propietario, que actúa como puerta humana mientras no existan Environments con revisores.

Nota: GitHub no permite aprobar el propio PR y los agentes actúan con las credenciales del propietario; por eso la aprobación humana efectiva de producción se implementa con el **Environment `production`** ([ADR-0009](ADR/0009-git-workflow.md)).

## 7. Cabeceras y caché (`_headers`, P1-08 → P7-09 → P8-03)

```text
# apps/web/public/_headers  (ESPECIFICACIÓN)
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'
/_next/static/*
  Cache-Control: public, max-age=31536000, immutable
/assets/*
  Cache-Control: public, max-age=31536000, immutable
/*.html
  Cache-Control: no-cache
```

Notas: la CSP exacta (scripts en línea de Next, Draco/Meshopt WASM, workers) se ajusta en P7-09 con la app real; `script-src` sin `unsafe-inline` si Next export lo permite con hashes. Los assets 3D llevan hash en el nombre (inmutables). Brotli lo aplica Cloudflare.

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
3. Aprobación humana del Environment `production` → despliegue.
4. Tag `vX.Y.Z` y release de GitHub con *changelog* generado de Conventional Commits.
5. Smoke E2E contra producción; monitorización 24 h.
6. Hotfix: rama `hotfix/<slug>` desde `main` → PR a `main` → *back-merge* a `develop`.

Versionado: SemVer pre-1.0 (`0.y.z`); `v0.1.0-beta` = beta pública. Hitos internos: etiquetas `m<N>`.

## 11. Docker

Docker **no se usa en el MVP**: no hay servidor, el build es reproducible con Node + pnpm y el despliegue es estático. Se adoptará solo si aporta valor concreto (p. ej. un servicio de IA/worker local en Fase 9 o un entorno de desarrollo reproducible para varias personas). El Docker local del equipo puede servir para ejecutar Postgres en desarrollo de la Fase 9 sin instalar nada en el sistema.
