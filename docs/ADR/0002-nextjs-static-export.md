# ADR-0002 — Next.js con exportación estática (`output: 'export'`)

- **Estado:** **Aceptada** (2026-10-08)
- **Fecha:** 2026-10-08
- **Revisar cuando:** (a) la fricción de DX con Next supere el beneficio, o (b) el backend de Fase 9 se separe como servicio independiente.

## Contexto
El MVP no tiene backend. El editor es 100 % cliente (WebGL). Se necesita además landing con SEO/OG y, en Fase 9, rutas servidor (API, auth, IA). El brief propone Next.js.

## Decisión
Mantener **Next.js 16** con `output: 'export'` (SPA/SSG estático), `images.unoptimized: true`, `trailingSlash: true`. El editor se carga solo en cliente. En la Fase 9 se decide (spike P9-01) entre añadir Workers/API separados o ejecutar Next en Cloudflare.

## Alternativas consideradas
| Alternativa | Pros | Contras | Por qué no |
|---|---|---|---|
| **Vite + React Router** | Arranque y HMR más rápidos; sin limitaciones de export; menos «magia» | Landing/SEO/OG requieren trabajo extra o un segundo proyecto; backend futuro aparte | Válida; se mantiene como **plan B barato** porque `core` y `scene-engine` no dependen de Next. |
| Next con servidor (SSR) | Flexibilidad | Coste de hosting/compute; Vercel Hobby no es comercial | Innecesario en MVP. |
| Astro (landing) + Vite (editor) | Landing muy ligera | Dos proyectos | Complejidad sin necesidad probada. |

## Consecuencias
- (+) Despliegue en cualquier CDN estático (coste ≈ 0).
- (+) Una base de código para landing y editor; camino natural hacia API.
- (−) En export estático no hay middleware, ISR, optimización de imágenes ni `redirects/headers` de `next.config`: se resuelven en la plataforma (`_headers`, `_redirects`).
- (−) R3F exige rutas client-only (`dynamic ssr:false`) y cuidado con Strict Mode.
- (−) Next añade peso de herramienta frente a Vite.

## Verificación
P1-01 produce `out/` desplegable; P1-08 despliega previews; P7-03 vigila el tamaño del bundle del editor (≤450 kB gz de JS inicial).
