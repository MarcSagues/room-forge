# ADR-0005 — Hosting en Cloudflare (no Vercel Hobby)

- **Estado:** **Aceptada** (2026-10-08)
- **Fecha:** 2026-10-08
- **Revisar cuando:** se verifiquen los términos de Cloudflare (P8-03) o la Fase 9 requiera cómputo de servidor.

## Contexto
Prioridad 1 del brief: coste mínimo. Fase 9 prevé monetización. El plan gratuito de Vercel (Hobby) está limitado a uso **personal no comercial** según su documentación; pasar a Pro cuesta 20 $/asiento/mes y obligaría a migrar o pagar justo al monetizar.

## Decisión
Alojar el sitio estático (`out/`) en **Cloudflare** (Workers con *static assets*, o Pages mientras siga operativo), con despliegues de preview por PR y producción desde `main` con **aprobación humana** (GitHub Environment `production`). Despliegue con `wrangler` desde GitHub Actions.

## Alternativas consideradas
| Alternativa | Pros | Contras | Por qué no |
|---|---|---|---|
| Vercel Hobby | Mejor DX con Next | **No comercial** | Obliga a migrar al monetizar. |
| Vercel Pro | DX | 20 $/mes | Coste innecesario en MVP. |
| Netlify | Gratis con límites | Límites de ancho de banda/builds | Válida como plan B. |
| GitHub Pages | Gratis | Términos no aptos para producto comercial; sin cabeceras personalizadas | No. |

## Consecuencias
- (+) Coste ≈ 0 € y sin bloqueo comercial conocido; mismo proveedor para API/Workers en Fase 9.
- (−) DX de Next algo inferior fuera de Vercel; sin `next/image` ni middleware en export estático.
- (−) Pages vs Workers: Cloudflare orienta proyectos nuevos a Workers; hay diferencias (`_redirects`, middleware). Se documenta en DEPLOYMENT.
- Pendiente humano: crear cuenta y token de API (P1-08).

## Verificación
P1-08 (previews), P8-03 (producción + comprobación de términos de uso comercial).
