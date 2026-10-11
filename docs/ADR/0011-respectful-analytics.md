# ADR-0011 — Analítica respetuosa: apagada por defecto, sin cookies y con un punto de enganche propio

- **Estado:** Propuesta (pendiente de que el propietario elija la herramienta y el endpoint)
- **Fecha:** 2026-10-10
- **Decisores:** propietario; implementación P8-01
- **Revisar cuando:** se elija la herramienta (Q6 del PRD) o se despliegue producción (P8-03)

## Contexto
PRD Q6 deja abierta la herramienta («Cloudflare Web Analytics / Plausible / Umami; o ninguna en la beta») y NFR-PRIV-01 exige analítica sin cookies ni datos personales. P8-01 pide además unos eventos mínimos (`editor_opened`, `first_object_placed`, `light_changed`, `export_png`, `export_json`, `share_link_created`, `project_saved`), sin enviar el contenido de los proyectos ni las URL del visor.

Restricciones:
- El sitio es una exportación estática con una CSP estricta: solo hay scripts propios con hash y `connect-src 'self'` ([DEPLOYMENT §7](../DEPLOYMENT.md)). Un script de terceros obligaría a abrir `script-src`.
- Aún no hay dominio ni cuenta de Cloudflare (P1-08 y P8-03). Los agentes no crean recursos remotos.
- Un visor compartido lleva el proyecto en el fragmento de la URL: cualquier herramienta que registre la URL completa filtraría el proyecto.

## Decisión
Ningún script de terceros. La app incluye un emisor propio mínimo (`apps/web/src/editor/analytics/`) que está **apagado salvo que el build defina `NEXT_PUBLIC_ANALYTICS_ENDPOINT`**. Cuando está encendido:
- Cada evento es un `POST` con el cuerpo `{"event":"<nombre>"}` y nada más: ni URL, ni *referrer* (`no-referrer`), ni identificadores, ni hora del cliente, ni contenido del proyecto. Se envía con `credentials: 'omit'`.
- Solo se aceptan los nombres de la lista cerrada, y cada uno se envía como mucho **una vez por carga de página**: las cifras cuentan visitas que hicieron algo, no personas ni clics.
- Si el navegador envía **Do Not Track** o **Global Privacy Control**, no se envía nada.
- El visor de enlaces compartidos no envía ningún evento.
- Los eventos derivados (`first_object_placed`, `light_changed`, `project_saved`) se obtienen de `document:changed` (solo `source: 'command'`) y del estado de autosave. Ningún comando ni panel conoce la analítica, y nada se ejecuta en el camino caliente.
- El endpoint puede ser una ruta del mismo origen (p. ej. una Cloudflare Pages Function o un *proxy* en `/api/event`, sin cambio de CSP) o una URL https. En el segundo caso, `scripts/write-headers.mjs` añade **solo ese origen** a `connect-src`.

`export_png` queda definido para cuando exista la exportación PNG (P6-06), que solo tendrá que llamar a `pageAnalytics().track('export_png')`.

## Alternativas consideradas
| Alternativa | Pros | Contras | Por qué no |
|---|---|---|---|
| Cloudflare Web Analytics (beacon JS) | Gratis, sin cookies, junto al hosting | Script de terceros (`static.cloudflareinsights.com`), CSP más abierta; solo páginas vistas, sin eventos propios | Abre `script-src` y no cubre los eventos pedidos. Se puede activar a nivel de proxy en Cloudflare sin JS, si el propietario lo prefiere |
| Plausible / Umami (script) | Sin cookies, eventos propios | Script externo o autoalojado; registran la URL (riesgo con `/view/#…`) | Requiere cuenta o servidor; la URL completa es un riesgo de privacidad |
| Ninguna analítica en la beta | Cero riesgo | Sin datos de activación (PRODUCT §10) | Se mantiene como estado **por defecto**; el punto de enganche permite activarla sin cambiar código |
| Emisor propio y apagado (elegida) | Sin terceros ni cookies; CSP intacta; payload auditado por tests | Hace falta un endpoint que reciba y agregue (Pages Function, Plausible Events API vía proxy, Umami…) | — |

## Consecuencias
- Positivas: el build por defecto no hace ninguna petición de analítica (comprobado por E2E). Activarla consiste en definir una variable y desplegar un receptor, y el contenido enviado está acotado por tipos y tests.
- Negativas / costes: el receptor y la agregación (y su retención) quedan por hacer. Hasta entonces no hay datos.
- Riesgos y mitigaciones:
  - Un receptor que registre la IP. Mitigación: elegir uno que no la guarde, o un proxy que la descarte. La política de privacidad se actualiza **antes** de activar.
  - Que alguien amplíe el payload. Mitigación: los tests exigen que el cuerpo tenga solo `event`, y la revisión de PR aplica AGENTS.md.

## Verificación
- `apps/web/src/editor/analytics/analytics.test.ts`:
  - Apagada sin endpoint; DNT/GPC respetados; solo nombres de la lista.
  - Propiedad (fast-check): el cuerpo siempre es `{event}` y cada evento sale como mucho una vez.
  - Los eventos derivados solo cuentan ediciones.
- `tools/checks/headers.test.mjs`: `connect-src` es solo `'self'` salvo con un endpoint https de otro origen.
- `e2e/analytics.spec.ts`: el build por defecto no envía ningún `POST` al editar, exportar ni compartir. `e2e/landing.spec.ts` (P8-01): sin cookies ni peticiones a otros orígenes.
