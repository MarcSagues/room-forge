# ADR-0012 — HomeForge: modos Habitación y Casa, planes gratuito y premium

- **Estado:** **Aceptada** (2026-10-11)
- **Fecha:** 2026-10-11
- **Decisores:** propietario (decisiones en el chat del 2026-10-11) · redacción: agente
- **Revisar cuando:** se planifiquen cuentas y pagos reales (P9-01, P9-05), o una casa de 6 salas no cumpla el presupuesto de escena (P10-05).

## Contexto

RoomForge nació para diseñar **una habitación** (PRD §2, §9: «viviendas» estaba fuera de alcance). El propietario decidió el 2026-10-11 ampliar el producto a **la casa completa** y fijó tres cosas:

1. El producto pasa a llamarse **HomeForge** (producto y código). El cambio de nombre es una issue aparte (P10-08) que se hace cuando no haya PRs abiertos; hasta entonces el código y la UI siguen diciendo RoomForge.
2. Dos planes: **gratuito** = modo Habitación, 1 habitación por proyecto; **premium** = modo Casa (varias habitaciones, pasillos, puertas entre habitaciones y plantillas de casa).
3. Premium es **«solo el límite, sin pagos»**: un indicador de plan local, una pantalla «Premium próximamente» y un interruptor de desarrollo. Nada de pagos, cuentas ni backend (siguen en P9-01/P9-05; AGENTS.md los prohíbe sin autorización).

El modelo ya lo prevé en parte: `SceneDocument.rooms`/`roomOrder` son un mapa y una lista, `Room.origin` existe y `LIMITS.maxRooms = 16` (DOMAIN_MODEL §8 «Vivienda completa»). Lo que falta: salas con forma libre (polígono), colocar varias salas en un plano, pasillos, paredes compartidas, puertas entre salas y puertas que se abren.

Requisito añadido por el propietario el mismo día: las habitaciones **no son solo rectángulos**; una sala en L, U o T se debe poder dibujar, con paredes y esquinas editables (P10-09, P10-10). DOMAIN_MODEL §8 ya lo preveía (`shape` es una unión discriminada). Más tarde, ese mismo día, decidió que la forma libre llegue **antes de la beta pública**: la release P8-06 exige P10-09 y P10-10 cerradas.

## Decisión

### 1. Nombre y alcance
**HomeForge**: diseñar habitaciones sueltas y, en premium, la vivienda de una planta con sus pasillos. Entran las **salas con forma libre** (polígonos de paredes rectas; en la primera versión, ángulos de 90°). Siguen fuera: varias plantas, paredes curvas, normativa, planos acotados profesionales y edición móvil (PRD §9). El cambio de nombre (P10-08) migra claves de almacenamiento y formato de archivo sin perder datos; los archivos `.roomforge.json` y los enlaces `/view/#v1.` antiguos se siguen aceptando.

### 2. Dos modos, un solo documento
- **Modo Habitación:** una sala en el origen, como hoy, que ahora puede tener cualquier planta poligonal (rectángulo, L, U, T…) editando paredes y esquinas.
- **Modo Casa:** varias salas y pasillos (`Room.kind = 'corridor'`) colocados en un mismo plano (`Room.origin` real y rotación en pasos de 90°), con paredes compartidas detectadas por geometría y puertas en ellas.

El **modo no se guarda**: es el mismo `SceneDocument`; un documento con una sala es un proyecto de modo Habitación y uno con varias es de modo Casa. Así no hay dos formatos ni conversiones, y un proyecto de una habitación se puede convertir en casa añadiendo salas.

### 3. Qué incluye cada plan

| Capacidad | Gratuito (Habitación) | Premium (Casa) |
|---|:---:|:---:|
| Una habitación con muebles, luces, materiales, puertas y ventanas | ✅ | ✅ |
| Abrir y cerrar puertas | ✅ | ✅ |
| Forma libre de la sala: mover y partir paredes, mover esquinas, presets L/U/T | ✅ | ✅ |
| Guardar, importar/exportar, PNG, enlaces, plantillas de habitación | ✅ | ✅ |
| Varias habitaciones por proyecto | ❌ (1) | ✅ (hasta `LIMITS.maxRooms` = 16) |
| Pasillos | ❌ | ✅ |
| Puertas entre habitaciones (paredes compartidas) | ❌ | ✅ |
| Plantillas de casa | ❌ (visibles, bloqueadas) | ✅ |
| Abrir un proyecto con varias salas | Solo lectura con aviso (§5) | ✅ |

Las puertas que se abren (P10-02) y la forma libre de la sala (P10-09, P10-10) son del plan gratuito: mejoran el modo Habitación y no dependen de tener varias salas. El límite gratuito es **el número de salas**, no su forma. (La altura editable de los objetos, P3-16, también es de ambos planes.)

### 4. El límite es una política de la app, no una regla del documento
- `core` **no conoce planes**: un documento con N salas es válido (dentro de `LIMITS.maxRooms`) para cualquier plan. Así un archivo exportado por un usuario premium sigue siendo un archivo válido para todos, las migraciones no dependen del plan y los tests de `core` no cambian.
- La app define un **puerto `PlanPolicy`** en la capa de aplicación (`apps/web`, junto al arranque del editor; nunca en `packages/core`):

  ```ts
  type Plan = 'free' | 'premium';
  interface PlanPolicy {
    readonly plan: Plan;
    /** Salas que un proyecto puede tener en este plan (free: 1). */
    readonly maxRooms: number;
    /** ¿Puede usarse esta capacidad del modo Casa? */
    allows(feature: 'multi-room' | 'corridor' | 'shared-door' | 'home-template'): boolean;
    /** ¿Se puede editar este documento o se abre en solo lectura? */
    canEdit(document: DeepReadonly<SceneDocument>): boolean;
    subscribe(listener: () => void): () => void;
  }
  ```

- **Implementación local** (P10-07): el plan se guarda en `localStorage` (`roomforge.plan`, que P10-08 renombra a `homeforge.plan`), con valor por defecto `free` y lectura validada (cualquier valor desconocido es `free`). El interruptor de desarrollo vive en `/dev/` y en builds E2E (`window.__RF__`), no en la UI de producción. La pantalla «Premium próximamente» explica el plan sin formulario de pago.
- **Dónde se aplica:** (a) la UI desactiva las acciones del modo Casa (añadir sala o pasillo, plantillas de casa) con una explicación accesible (`aria-describedby`) y un enlace a la pantalla premium; (b) defensa en profundidad: el despachador de comandos de la app rechaza `room/add` (y los comandos de distribución de P10-03) si `PlanPolicy` no lo permite, con un `notify()` en vez de un error. No es una medida de seguridad: sin backend, quien edite `localStorage` obtiene premium, y se acepta (no hay nada que proteger mientras no haya pagos).

### 5. Un usuario gratuito abre un proyecto con varias salas: solo lectura con aviso
Llega por importar un archivo, abrir un enlace, una plantilla de casa o volver al plan gratuito tras probar premium. El proyecto **se abre en solo lectura** (`EditorSession.setReadOnly(true)`, el mismo modo que ya usan el bloqueo multipestaña y el visor) con un aviso persistente: «Este proyecto tiene N habitaciones; editarlo requiere el plan premium», un enlace a la pantalla premium y dos salidas: **exportar** (JSON/PNG/enlace funcionan) y **«Abrir una habitación como proyecto nuevo»** (copia una sala y su contenido a un proyecto de una sala, editable).

Por qué esta opción:

| Alternativa | Pros | Contras | Por qué no |
|---|---|---|---|
| **Solo lectura con aviso** (elegida) | No pierde ni modifica datos; reutiliza el modo de solo lectura existente; el límite no se esquiva importando un archivo | El usuario gratuito no puede editar ese proyecto | — |
| Editable pero sin poder añadir salas | Más cómodo | Importar un archivo con 16 salas daría el modo Casa entero gratis: el límite no significaría nada | Vacía el plan premium. |
| Rechazar el archivo | Simple | Pierde el acceso a datos del propio usuario (p. ej. tras bajar de plan) | Contradice «nunca perder datos». |
| Abrir solo la primera sala | Editable | Guardar borraría las demás salas sin que el usuario lo decida | Pérdida silenciosa de datos. |

La regla se evalúa al abrir y cada vez que cambia el plan (`PlanPolicy.subscribe`): pasar a premium desbloquea la edición sin recargar.

### 6. Modelo de dominio (detalle en DOMAIN_MODEL §8.1)
- **Puertas que se abren (P10-02):** las aperturas de tipo puerta ganan `swing` (`in` | `out`), `hinge` (`left` | `right`) y `open` (0…1, fracción de 90°). Son **obligatorios en puertas y ausentes en ventanas**, así que el esquema sube a **v2** con una migración v1 → v2 que da a las puertas existentes `swing: 'in'`, `hinge: 'left'`, `open: 0` (golden file). Comando `opening/setOpen` deshacible que se fusiona al repetirse (`mergeKey`), y `opening/setSwing` para sentido y bisagra.
- **Barrido de la hoja:** una hoja abierta **no puede atravesar una pared** (bloquea: el comando se rechaza con `blocked`), porque sería un estado imposible del documento que además se ve roto. Los **objetos** en el barrido solo **avisan** (toast): coherente con FR-OBJ-09 (las colisiones entre objetos son avisos, no bloqueos), evita que mover un mueble deje puertas «atascadas» y no hace depender el documento de la geometría detallada de los modelos.
- **Salas con forma libre (P10-09, P10-10):** `shape` pasa a `{ kind: 'polygon', points, wallIds }`: un polígono simple de paredes rectas (sin autointersecciones, lados ≥ mínimo, 90° en la primera versión pero sin suponerlo en el modelo). Las **paredes son segmentos con IDs estables** (`wallIds[i]` va de `points[i]` a `points[i+1]`), y `Room.walls`, `Opening.wall` y el imán a pared usan esos IDs. Migración: un rectángulo pasa a un polígono de 4 puntos cuyas paredes conservan los IDs `north`, `east`, `south` y `west`, en el mismo orden y sentido en que hoy se miden los *offsets*, así que **ninguna apertura ni material cambia** de significado. La forma se edita en **ambos planes**.
- **Varias salas (P10-03, depende de P10-09):** `Room.origin` deja de ser siempre `[0, 0]`; `Room.rotation` en cuartos de vuelta (0–3); `Room.kind` `room` | `corridor` con ancho de pasillo acotado en `LIMITS`. Migración que añade `kind: 'room'`, `rotation: 0`. Las salas no se solapan (invariante, con polígonos).
- **Numeración del esquema:** cada cambio de forma sube `SCHEMA_VERSION` en una unidad, **en el orden en que se fusionan**: con el orden previsto, v2 = estado de las puertas (P10-02), v3 = polígonos (P10-09; su issue dice «v1→v2» porque se escribió antes), v4 = varias salas (P10-03). Cada paso tiene su migración y su golden file; nunca se reutiliza un número.
- **Paredes compartidas (P10-03/04):** **no se guardan**: se derivan de la geometría (dos segmentos de pared paralelos de salas distintas cuyos interiores distan exactamente un grosor de pared y se solapan en un tramo). Una puerta entre salas sigue perteneciendo a **una** sala (`roomId` + `wall`), la «propietaria»; la otra cara del hueco se deriva. `swing: 'in'` siempre significa hacia la sala propietaria.

### 7. Camino hacia cuentas y pagos
- `PlanPolicy` es el único sitio que sabe de planes. Con P9-01 (backend y auth) y P9-05 (pagos) se sustituye la implementación local por una que lee el plan del perfil de la cuenta (con caché local para uso sin conexión); la UI, los comandos y el documento no cambian.
- El plan local de hoy **no se migra a una suscripción**: es un indicador de prueba. Al llegar las cuentas, el interruptor queda solo para desarrollo.
- Ninguna decisión de esta ADR añade dependencias, servicios remotos ni datos personales.

## Alternativas consideradas

| Alternativa | Pros | Contras | Por qué no |
|---|---|---|---|
| Límite de salas como invariante de `core` | Imposible saltárselo desde la UI | El documento dependería del plan; archivos premium inválidos para usuarios gratuitos; migraciones y tests ligados a planes | El plan es negocio, no dominio. |
| Dos formatos de documento (habitación y casa) | Tipos más estrictos por modo | Conversiones, doble mantenimiento, dos rutas de import | Un solo `SceneDocument` ya admite N salas. |
| Guardar el modo en el documento | Explícito | Redundante con `roomOrder.length`; puede contradecirlo | Se deriva. |
| Paredes compartidas guardadas como entidades | Explícitas | Hay que mantenerlas al mover salas; estados incoherentes | Derivarlas es estable y verificable con propiedades. |
| Mantener `rect` y añadir `polygon` como segundo tipo de forma | Sin migrar salas existentes | Dos caminos en toda la geometría para siempre; las paredes de un rectángulo seguirían sin IDs de segmento | Un rectángulo es un polígono de 4 lados: un solo camino. |
| Paredes de polígono con IDs por índice | Simple | Partir o quitar una esquina cambiaría los IDs y descolocaría aperturas y materiales | IDs estables por segmento. |
| Campos de puerta opcionales sin subir el esquema | Sin migración | Todo el código debe tratar su ausencia para siempre | Obligatorios + migración: el código lee siempre un valor. |
| Pagos reales ya (Stripe) | Ingresos | Backend, cuentas, fiscalidad, RGPD; prohibido sin autorización | Decisión del propietario: «solo el límite». |

## Consecuencias
- Positivas: el modo Habitación no cambia; el modo Casa reutiliza documento, comandos, persistencia y render; el límite se cambia por cuentas sin tocar `core`.
- Negativas / costes: el límite es eludible editando `localStorage` (aceptado); tres subidas de esquema (v2 puertas, v3 polígonos, v4 varias salas) con sus goldens; los polígonos tocan casi toda la geometría (suelo triangulado, paredes por segmento, colocación, imán) y el render de varias salas (P10-05) es el mayor riesgo de rendimiento.
- Riesgos y mitigaciones:
  - Rendimiento con 6 salas → presupuestos con `renderer.info` en P10-05, geometrías por pared memoizadas, pool de luces fijo.
  - Confusión de plan → aviso claro y accesible, pantalla premium, nunca bloquear la exportación.
  - Pérdida de datos al bajar de plan → solo lectura, nunca recorte.

## Verificación
- P10-02: tests de esquema, migración (golden), comando y barrido con fast-check; E2E de abrir/cerrar, deshacer y recarga.
- P10-09: propiedades (polígonos válidos, migración de rectángulos sin cambio de significado, colocación dentro de la planta, imán en esquinas interiores); E2E con una sala en U dentro del presupuesto.
- P10-03/P10-04: propiedades (no solapamiento, paredes compartidas simétricas, deshacer restaura).
- P10-07: unitarios de `PlanPolicy`, RTL de avisos y E2E en ambos planes (incluido abrir un archivo de varias salas en el plan gratuito).
