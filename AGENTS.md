# AGENTS.md — Guía para agentes de IA (Claude Code, Codex)

> Fuente única de instrucciones para agentes. `CLAUDE.md` la importa. Flujo completo: [docs/WORKFLOW.md](docs/WORKFLOW.md).

## Proyecto

**RoomForge**: plataforma web para diseñar habitaciones, despachos y setups gaming en 3D con simulación de iluminación LED/RGB. Local-first, sin backend en el MVP.
Estado actual: **Fase 1 en curso** (scaffold del monorepo; aún no hay funcionalidad de producto). No empieces a implementar fuera de una issue.

Lee primero: [docs/PRD.md](docs/PRD.md) · [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/DOMAIN_MODEL.md](docs/DOMAIN_MODEL.md) · la issue asignada (y su épica).

## Stack

pnpm monorepo · `packages/core` (TypeScript puro) · `apps/web` (Next.js 16 export estático, React 19, R3F 9, drei, three, Tailwind v4, shadcn/ui, Zustand, Immer, zod, idb) · Biome · Vitest + RTL + fast-check · Playwright · Cloudflare. Versiones definitivas en P1-01.

## Comandos

```bash
pnpm install --frozen-lockfile   # ✔
pnpm dev                         # ✔ next dev (apps/web); catálogo de componentes en /dev/ui
pnpm build                       # ✔ next export → apps/web/out
pnpm typecheck                   # ✔ tsc en cada paquete
pnpm check:core-purity           # ✔ core no compila código que use window/document
pnpm lint                        # ✔ biome check (formato + lint + imports)
pnpm format                      # ✔ biome check --write
pnpm check:deps                  # ✔ dependency-cruiser: fronteras entre módulos
pnpm test:arch                   # ✔ tests de las reglas de arquitectura y de los hooks (node --test)
pnpm check                       # ✔ typecheck + lint + deps + core-purity + test:arch + test
pnpm test                        # ✔ vitest (core en node, web en happy-dom)
pnpm test:watch                  # ✔ vitest en modo watch
pnpm test:coverage               # ✔ informe v8 (html + lcov en ./coverage; umbrales informativos hasta P7-03)
pnpm e2e                         # ✔ build E2E (NEXT_PUBLIC_E2E=1) + playwright (Chromium, WebGL por SwiftShader)
pnpm start:static                # ✔ sirve apps/web/out en 127.0.0.1:4173
pnpm catalog:build               # ✔ regenera modelos propios (cuantizados, con hash), miniaturas, manifiesto y docs/ATTRIBUTION.md
pnpm catalog:validate            # ✔ manifiesto: schema, archivos, presupuestos, licencias
node tools/planning/github-import.mjs validate   # valida docs/issues (disponible ya)
```

## Reglas de arquitectura (obligatorias)

1. **`packages/core` es TypeScript puro**: sin `react`, `three`, DOM, `idb`, `next`. Sin `window`/`document`.
2. **Todo cambio del documento pasa por un Comando** (`execute`), con Immer patches; nunca mutar el documento directamente.
3. **Camino caliente sin React:** nada de `setState`, `useState` ni asignaciones (`new Vector3()`…) en `useFrame`, `pointermove` ni controladores de interacción. Usar refs, objetos reutilizables y el transient store (≤1 act./frame).
4. **Render bajo demanda:** cualquier mutación fuera de React que cambie lo que se ve debe llamar a `invalidate()` (helper `mutate()`).
5. **Un gesto = una entrada de historial.** Los arrastres hacen *commit* de un comando al soltar.
6. **Recursos compartidos:** geometrías, materiales y texturas pasan por `ResourceRegistry`/`MaterialFactory`; proteger con `dispose={null}` lo compartido.
7. **No montar/desmontar para alternar visibilidad**: usar `visible`/opacidad.
8. **Número de luces fijo** (pool); no añadir/quitar luces three en caliente.
9. **Fronteras web** (matriz en ARCHITECTURE §2.1): `scene-engine` no importa de `ui`; `ui` no importa internals de `scene-engine`; imports entre módulos solo vía su `index.ts`.
10. **Entradas no confiables** (JSON, enlaces) siempre validadas con zod y límites de tamaño.
11. **Textos de UI** en diccionarios (es/en); sin literales sueltos. Nombres de catálogo genéricos (sin marcas).

## Convenciones

- Código, comentarios, commits, ramas y PRs en **inglés**; documentación e issues en **español**.
- Ramas `feat|fix|refactor|perf|test|docs|chore|ci|build/<issue>-<slug>`. Commits **Conventional Commits** (`feat(core): …`). Pie `Refs #n`; en el PR, `Closes #n`.
- TypeScript estricto, sin `any`, exports nombrados, funciones pequeñas. Comentarios solo para el *porqué* no evidente.
- Tests: lógica de `core` con tests primero; propiedades con fast-check para invariantes; no probar píxeles salvo regresión visual.
- PR ≤ 400 líneas netas; una issue por PR; plantilla completa con plan de pruebas ejecutado y resultados.
- **Dependencias nuevas**: justificar en el PR (tamaño, mantenimiento, licencia, alternativa sin dependencia). No instalar dependencias "por si acaso".

## Qué NO hacer (sin autorización explícita del propietario en el chat)

- Fusionar en `main`; fusionar en `develop` sin orden explícita del propietario en el chat para ese PR; activar *auto-merge*; lanzar el workflow de despliegue a producción; hacer `git push` directo a `develop`/`main` (GitHub **no** protege las ramas en este repo: la regla depende de ti).
- `git push --force`, reescribir historia compartida, borrar ramas protegidas.
- Crear/modificar recursos remotos (repos, secretos, proyectos de Cloudflare/Neon/Stripe), publicar o desplegar.
- Tocar secretos o añadirlos al repositorio; imprimir tokens.
- Añadir infraestructura de pagos, cuentas, backend o IA (fuera del MVP).
- Ampliar el alcance de una issue; si hace falta, abrir otra.
- Usar modelos 3D o assets sin licencia verificada y registrada en el manifiesto.

## Definition of Done (resumen)

Criterios de la issue verificados · tests escritos y verdes · `pnpm check` verde · checks de CI `check` (y `e2e` desde P1-07) verdes en el PR, consultados con `gh pr checks <n>` antes de fusionar (no hay bloqueo técnico) · sin deuda sin issue · revisión sin P0/P1 abiertos · docs/ADR actualizadas · si toca el render, `renderer.info` antes/después · fusión por una persona.

## Review guidelines

Reglas para revisar PRs de este repositorio (Codex y revisores). Señala como **P0/P1** lo que viole estos puntos:

- `packages/core` importa `react`, `three`, `next`, `idb` o usa `window`/`document`/APIs del DOM.
- Se muta el documento fuera de un Comando, o un comando no valida invariantes / no es reversible con sus patches inversos.
- Se usa `setState`/`useState` o se asignan objetos (`new THREE.*`, arrays, closures) dentro de `useFrame`, handlers de `pointermove` o controladores de interacción.
- Un gesto continuo genera más de una entrada de historial, o el arrastre escribe en el store del documento en cada movimiento.
- Mutaciones que cambian la imagen sin `invalidate()` (con `frameloop="demand"` quedará obsoleta).
- Se montan/desmontan elementos de escena para alternar visibilidad, o se cambia dinámicamente el número de luces three.
- Geometrías, materiales o texturas se crean por instancia en vez de compartirse; `dispose` de recursos compartidos; fugas (listeners, ref-counts) sin limpieza simétrica.
- Entradas externas (JSON importado, fragmento de URL, nombres) sin validación zod/límites o renderizadas como HTML.
- Violaciones de fronteras de módulos (`scene-engine` → `ui`, imports de internals).
- Código nuevo sin tests de los tipos exigidos por la issue; tests desactivados sin issue enlazada; cobertura de `core` por debajo del umbral.
- Dependencias nuevas sin justificación, con licencia incompatible con uso comercial o con scripts `postinstall` sospechosos.
- Secretos, tokens o claves en el diff; cambios en workflows/protecciones no pedidos por la issue.
- Textos de UI sin i18n; nombres de marca en el catálogo; assets sin licencia en el manifiesto.
- Accesibilidad: controles sin nombre accesible, trampas de foco, información solo por color.

Ignora: preferencias de estilo ya cubiertas por Biome, nombres internos sin impacto, y refactors no relacionados con el cambio.
