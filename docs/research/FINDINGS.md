# Investigación — Hallazgos de la Fase 0

> Fecha: 2026-10-08. Cada hallazgo indica su **fiabilidad**. Todo lo marcado «verificar» debe confirmarse antes de actuar.

## 1. Versiones del ecosistema (consulta directa al registro npm — alta fiabilidad)

| Paquete | Versión | Nota |
|---|---|---|
| next | 16.4.0 | Rama 16 en soporte activo según trackers de terceros (media fiabilidad en las fechas de soporte). |
| react / react-dom | 19.3.0 | R3F 9.8.1 exige `react >=19 <19.4`. |
| three | 0.186.1 | drei exige `three >=0.159`; R3F `>=0.156`. |
| @react-three/fiber | 9.8.1 | Línea 9.x = React 19. |
| @react-three/drei | 10.7.9 | Peer `@react-three/fiber ^9`. |
| zustand | 5.0.15 | |
| immer | 11.1.21 | |
| zod | 4.6.5 | |
| idb | 8.0.4 | |
| tailwindcss | 4.3.3 | |
| vitest | 5.0.3 | |
| @playwright/test | 1.64.0 | |
| @biomejs/biome | 2.5.15 | |
| typescript | 7.0.2 | **Verificar** compatibilidad con Next/Vitest/Biome antes de adoptar; alternativa: última 5.x/6.x. |
| fast-check | 4.10.2 | Tests basados en propiedades. |
| dependency-cruiser | 18.5.0 | Reglas de frontera. |
| @gltf-transform/cli | 4.5.1 | Pipeline de assets. |
| fflate | 0.8.3 | Compresión para enlaces. |
| camera-controls | 3.1.2 | Base de `CameraControls` de drei. |
| wrangler | 4.148.0 | Despliegue Cloudflare. |

Las versiones se **fijan** (lockfile + rango exacto en dependencias críticas) en P1-01. Dependabot agrupado actualizará.

## 2. Hosting (media fiabilidad — fuentes de terceros; verificar términos oficiales antes de producción)

| Opción | Uso comercial en plan gratuito | Next.js estático | Comentario |
|---|---|---|---|
| **Vercel Hobby** | **No** (solo uso personal no comercial) — [docs de Vercel](https://vercel.com/docs/plans/hobby) | Sí | Pro cuesta 20 $/asiento/mes. Incompatible con monetizar en la Fase 9. |
| **Cloudflare (Workers static assets / Pages)** | Sin restricción comercial encontrada ([análisis de terceros](https://guptadeepak.com/tools/top-5-static-site-hosting-jamstack-platforms-2026/)); **verificar términos** | Sí (`output: 'export'`) | Límites de build en Pages gratuito: 500 builds/mes, 20 min por build, 20 000 archivos ([límites oficiales](https://developers.cloudflare.com/pages/platform/limits)). Cloudflare orienta los proyectos nuevos a Workers; Pages sigue operativo. |
| GitHub Pages | Restringido por términos | Sí | No indicado para producto comercial. |
| Netlify | Plan gratuito con límites de ancho de banda/builds | Sí | Alternativa válida; no evaluada en detalle. |

**Decisión:** Cloudflare, sirviendo `out/` (estático). Ver [ADR-0005](../ADR/0005-hosting-cloudflare.md). Nota: en exportación estática **no funcionan** `redirects/rewrites/headers` de `next.config`, ni `next/image` con optimizador, ni middleware; las cabeceras y redirecciones se declaran en la plataforma (`_headers`, `_redirects` o config de Workers).

## 3. Licencias de assets 3D (media fiabilidad — verificar la licencia de **cada descarga**)

- **CC0 (dominio público, uso comercial permitido, sin atribución):** Kenney, Quaternius, KayKit, Poly Haven (modelos, texturas, HDRIs). Fuente agregadora: [guía de packs gratuitos](https://app.cinevva.com/guides/sketchfab-polyhaven-kenney) — **verificar en kenney.nl / quaternius.com / polyhaven.com**.
- El pack de muebles de Kenney figura (en un listado de 2018) con OBJ/PNG; comprobar si la versión actual trae GLB ([OpenGameArt](https://opengameart.org/content/furniture-kit)).
- Sketchfab: licencias mixtas por modelo. Poly Pizza: mayoritariamente CC-BY (requiere atribución).
- **Hueco real:** los objetos de nicho gaming (torre con RGB, monitor ultrawide, barras de luz, paneles hexagonales, neones) **probablemente no existan** en packs CC0 → motivo del spike P4-01 y de la estrategia paramétrica.
- Modelos generados por IA (p. ej. servicios tipo Meshy): **revisar los términos de licencia del plan concreto antes de usar** (no verificado aquí).

## 4. Revisión con Codex (media fiabilidad — documentación oficial de OpenAI)

Según la [documentación de Codex para GitHub](https://developers.openai.com/codex/integrations/github):
- Requiere configurar **Codex cloud** para el repositorio y activar *Code review* en los ajustes de Codex (acción humana).
- Se solicita con un comentario `@codex review` en el PR; también hay «Automatic reviews» al abrir un PR.
- Lee archivos `AGENTS.md` y sigue una sección `## Review guidelines` (el más cercano al archivo cambiado prevalece).
- En GitHub señala por defecto problemas P0/P1.
- `@codex fix it` puede lanzar una tarea de arreglo (no la usaremos: el flujo acordado es que **Claude** corrige).
- Las reseñas automáticas se disparan al **abrir** el PR; tras nuevos *pushes* hay que volver a pedir `@codex review`.

Implicación: `AGENTS.md` en la raíz con `## Review guidelines` específicas del proyecto (incluido en este repositorio).

## 5. Panorama competitivo

Ver [PRODUCT §7](../PRODUCT.md#7-panorama-competitivo-resumen). Fiabilidad **baja-media**: reseñas con intereses comerciales; no se han probado las herramientas.

## 6. Preguntas que esta investigación NO resuelve (→ spikes)

| Pregunta | Spike |
|---|---|
| ¿Calidad visual alcanzable con assets CC0 + paramétricos? | P4-01 |
| ¿Comportamiento real de `dispose` y recompilación de shaders con el pool de luces? | P2-06, P5-05 |
| ¿WebGL estable en CI (SwiftShader) para E2E y regresión visual? | P1-07 |
| ¿TypeScript 7 es viable con todo el toolchain? | P1-01 |
| ¿Términos exactos de Cloudflare para uso comercial? | P8-03 |
