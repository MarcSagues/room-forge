# RoomForge — Funcionalidades futuras (documentadas, no planificadas)

> Todo lo de este documento está **fuera del MVP**. Se recoge aquí el diseño preliminar y los **puntos de extensión ya previstos** para que no haga falta rehacer nada. Las issues correspondientes están en [Fase 9](issues/09-ai-monetization.md).

## 1. Resumen

| Funcionalidad | Cuándo | Punto de extensión ya previsto | Decisión pendiente |
|---|---|---|---|
| Cuentas y sincronización en la nube | Fase 9 | Puerto `ProjectRepository`; documentos con `schemaVersion` | Backend/auth/BD (P9-01) |
| Enlaces alojados con vista previa | Fase 9 | Formato de enlace `v1.`; visor `/view` | Almacenamiento y moderación |
| Generación de distribuciones con IA | Fase 9 | Comandos serializables; `LayoutGenerator` (puerto vacío en `web/ai`) | Proveedor y modelo (P9-03) |
| Planes y pagos | Fase 9 | Entitlements por plan (a diseñar) | Stripe vs *merchant of record* |
| Catálogo premium / marketplace | Fase 9+ | Manifiesto + pipeline de validación | Moderación, licencias, reparto |
| Colaboración en tiempo real | Fase 9+ | Log de patches de Immer | CRDT (Yjs) vs servidor autoritativo |
| Salas poligonales, varias plantas, viviendas | Fase 9+ | `shape.kind` discriminado; mapas `rooms`; migración | Herramienta de dibujo de paredes |
| Dormitorios, salones, cocinas | Fase 9+ | Categorías de catálogo | Contenido |
| Selección múltiple, grupos, medición, vistas | Fase 9+ | Comandos con `ids[]`; selección ≥1 | UX de grupos |
| Recorrido en primera persona | Fase 9+ | `CameraRig` extensible | Control táctil |
| Exportar glTF/USDZ, AR | Futuro | Escena ya en three | Calidad de export |
| Importar modelos propios | Futuro | Pipeline `catalog:build` | Seguridad y presupuestos |
| Unidades imperiales | Futuro | Modelo en metros | Conversión/UX |
| Más idiomas | Futuro | Diccionarios externalizados | Traducción |
| Historial de revisiones del proyecto | Futuro | Patches por entrada | Almacenamiento |

## 2. Cuentas, sincronización y backend

- **Modelo:** local-first. La nube es un **espejo opcional**; la app funciona sin cuenta.
- **Datos:** `projects` + `documents` en Postgres (Neon/Supabase u otro; decidir en P9-01) con el mismo envelope versionado que el JSON; miniaturas y enlaces en almacenamiento de objetos.
- **Sincronización:** por proyecto con versión monótona; conflicto = detectar y ofrecer «quedarme con la mía / con la remota / duplicar» (no fusión automática en la primera versión).
- **Migración:** subir proyectos locales al iniciar sesión.
- **Cumplimiento:** exportar y borrar todos los datos del usuario (RGPD); retención definida.
- **Hosting:** API en Cloudflare Workers (mismo proveedor) o Next en Workers; evaluar en el spike.

## 3. IA de distribuciones

Diseño completo en [ARCHITECTURE §10](ARCHITECTURE.md). Resumen:
1. El usuario escribe una petición («rincón streamer con iluminación cálida, escritorio en L»).
2. Un LLM recibe sala + subconjunto del catálogo (tags/dimensiones) y devuelve un **plan estructurado** (intenciones, no coordenadas).
3. Un **solver determinista** en `core` calcula posiciones válidas, evita colisiones y respeta aperturas.
4. Se muestra una **vista previa fantasma**; aceptar = una transacción = un `undo`.

Riesgos: coste y abuso (límites + caché + alertas), calidad (conjunto de evaluación), privacidad (no enviar datos personales), dependencia de proveedor (puerto intercambiable).
Posibles extensiones: sugerir iluminación/paletas, «completar mi escritorio», imagen → distribución.

## 4. Pagos y planes

- **Gratis:** editor completo local-first, catálogo base.
- **Pro (hipótesis):** sync, enlaces alojados con vista previa, exportes de alta resolución, créditos de IA, packs.
- **Implementación:** Stripe Checkout + Customer Portal, webhooks idempotentes, `entitlements` en BD; modo de prueba completo antes de producción. Considerar *merchant of record* por IVA UE.
- **Principio:** nunca bloquear el acceso a los datos del usuario por impago (siempre podrá exportar JSON).

## 5. Marketplace

Packs de assets validados por el mismo pipeline (`catalog:build`/`catalog:validate`): presupuestos, licencias, miniaturas. Requiere revisión/moderación, política de licencias, reparto de ingresos y firma/derechos de descarga.

## 6. Colaboración en tiempo real

Opciones: (a) **CRDT** (Yjs) sobre el documento; (b) **servidor autoritativo** que ordena comandos/patches. Los patches de Immer y los comandos con `id` estables facilitan (b); (a) exige representar el documento como estructura CRDT. Presencia (cursores, selección) y undo por usuario. ADR obligatoria antes de empezar.

## 7. Geometría avanzada

- **Salas poligonales:** `shape: { kind: 'polygon', points }`; paredes como segmentos con IDs estables; aperturas por segmento; generador de mallas con triangulación (`earcut`) y huecos.
- **Plantas:** entidad `Level` con elevación; escaleras y huecos de forjado.
- **Migración:** v1→v2 con golden tests ([DOMAIN_MODEL §8](DOMAIN_MODEL.md)).

## 8. Herramientas de edición avanzadas

Selección múltiple (marquesina, `Shift`), grupos/prefabs («kit de escritorio»), alinear/distribuir, medición con cotas, vistas guardadas, paleta de comandos (`Ctrl+K`), recorrido en primera persona.

## 9. Otros

- **Exportación 3D / AR:** glTF/USDZ desde la escena three; vista AR en móvil.
- **Importar modelos propios:** validar presupuestos y seguridad (tamaño, texturas, scripts no permitidos).
- **Imperial:** conmutador de unidades en UI (el modelo ya está en metros).
- **PWA/offline:** ya planificada como P2 (P8-05).
- **Revisiones del proyecto:** snapshots con nombre y diff visual.
