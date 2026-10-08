# ADR-0010 — Enlaces compartibles con la escena en el fragmento de URL

- **Estado:** **Aceptada** (2026-10-08)
- **Fecha:** 2026-10-08
- **Revisar cuando:** los enlaces excedan el límite con frecuencia o la Fase 9 introduzca enlaces alojados.

## Contexto
Compartir mediante enlaces es parte de la visión, pero el MVP no tiene backend ni cuentas. Una escena típica (≤30 objetos) pesa pocos KB en JSON.

## Decisión
Codificar el documento (JSON mínimo con IDs cortos) → `fflate.deflate` → base64url en el **fragmento** de la URL: `https://<dominio>/view/#v1.<payload>`. El fragmento **no se envía al servidor** (privacidad y cero coste). La ruta `/view/` abre un **modo visor de solo lectura** con botón «Copiar a mis proyectos».

Límites: objetivo <4 KB (≈30 objetos), **tope duro 16 KB**; por encima, se ofrece exportar archivo. Versionado `v1` en el prefijo para migraciones.

## Alternativas consideradas
| Alternativa | Pros | Contras | Por qué no |
|---|---|---|---|
| Servicio de enlaces cortos (KV/DB) | Enlaces cortos, vista previa OG | Backend, abuso, moderación, coste | Fase 9. |
| Query string `?d=` | Simple | Llega a logs de servidor/CDN | Menos privado. |
| Gist anónimo / pastebin | Sin backend propio | Dependencia y datos en terceros | No. |

## Consecuencias
- (+) Funciona offline-first, sin coste, privado.
- (−) URLs largas (feas en mensajería); sin imagen de vista previa (OG) hasta enlaces alojados.
- (−) Validación estricta del contenido (entrada no confiable) — ver P7-09.

## Verificación
P6-08 (round-trip, límites), P7-09 (fuzz).
