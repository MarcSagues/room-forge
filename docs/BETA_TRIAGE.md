# Triage de la beta

> P8-04. Cómo llegan los comentarios de la beta, cómo se clasifican y cuándo se responde. Complementa [WORKFLOW §10](WORKFLOW.md#10-gestión-de-bugs) (gestión de bugs) con lo específico de la beta.

## 1. Canal de entrada

No hay backend: el feedback se convierte en **issues públicas de GitHub** en `MarcSagues/room-forge`.

| Origen | Cómo llega |
|---|---|
| Botón **«Enviar comentarios»** del editor (barra superior) y del pie de las páginas públicas | Diálogo con tipo (algo no funciona / idea / otra cosa), mensaje y casilla opcional de detalles técnicos. Abre en una pestaña nueva el formulario `beta-bug.yml` o `beta-idea.yml` ya rellenado; la persona lo revisa y lo envía con su cuenta de GitHub. También puede copiar el texto. |
| GitHub directamente | Formularios `Beta: something does not work` y `Beta: idea or comment` (`.github/ISSUE_TEMPLATE/`). |
| Pantalla de fallo del editor («Report a problem», P7-08) | Issue con el error y el entorno, sin plantilla beta: se le añade `beta` en el triage. |

**Qué datos llegan.** Solo lo que la persona escribe y, si marca la casilla, los detalles técnicos: versión de la app, navegador, GPU y calidad gráfica, resumen de `renderer.info` y las últimas 5 entradas del registro de errores local (sin pilas). **Nunca el proyecto**: solo llega si la persona exporta el archivo y lo adjunta. El diálogo enseña los detalles antes de enviarlos. El enlace se limita a 7 000 caracteres: se quitan primero errores y después se acorta el mensaje (el diálogo lo avisa y ofrece copiar el texto completo).

## 2. Etiquetas

Definidas en [`tools/planning/labels.json`](../tools/planning/labels.json).

| Etiqueta | Quién la pone | Significado |
|---|---|---|
| `beta` | Plantilla | Viene de la beta |
| `needs-triage` | Plantilla | Pendiente de triage; se **quita** al terminarlo |
| `type:bug` / `type:feature` | Plantilla; se corrige en el triage | Defecto / mejora (una «otra cosa» se reclasifica o se cierra como pregunta respondida) |
| `severity:critical` / `major` / `minor` | Triage (solo bugs) | Ver §3 |
| `P0-critical` … `P3-future` | Triage | Prioridad (§3) |
| `area:*` | Triage | Módulo afectado (`area:scene`, `area:ui`, `area:persistence`…) |
| `regression` | Triage | Funcionaba en una versión anterior |
| `blocked`, `needs-decision` | Triage | Falta información o una decisión del propietario |

## 3. Severidad, prioridad y SLA interno

La severidad de [WORKFLOW §10](WORKFLOW.md#10-gestión-de-bugs) decide la prioridad. El desplegable «How much does it get in your way?» del formulario es orientativo; la severidad la fija el triage.

| Severidad | Ejemplos en la beta | Prioridad | Primera respuesta | Objetivo de arreglo |
|---|---|---|---|---|
| `severity:critical` | Pérdida de proyectos, el editor no abre, no guarda, problema de seguridad o privacidad | **P0** | **< 24 h** (también fuera del triage semanal) | Hotfix ([WORKFLOW §8](WORKFLOW.md#8-hotfix)) |
| `severity:major` | No se puede mover, iluminar, exportar o compartir; regresión de rendimiento grave | **P1** | **< 3 días** | Siguiente hito |
| `severity:minor` | Molestia con alternativa, cosmético, texto | **P2** | Triage semanal | Cuando haya hueco |
| Ideas (`type:feature`) | Peticiones, mejoras | P2/P3 | Triage semanal | Se valoran contra el [ROADMAP](ROADMAP.md) |

«Primera respuesta» = comentario en la issue que confirma que se ha leído y dice el siguiente paso. Son objetivos internos, no un compromiso público.

## 4. Revisión semanal (15–30 min)

Una vez por semana, con el filtro `is:issue is:open label:needs-triage`:

1. **Leer y limpiar.** Si alguien ha escrito datos personales o ha adjuntado un proyecto que no debería ser público, editar la issue para quitarlos (o pedirle que lo haga).
2. **Duplicados.** Buscar issues parecidas; cerrar el duplicado con `Duplicate of #n` y sumar el caso a la original.
3. **Reproducir** los bugs con la versión indicada en los detalles técnicos. Si no hay datos suficientes, pedirlos y poner `blocked`; se cierra si no hay respuesta en 14 días.
4. **Clasificar:** `type:*`, `severity:*` (bugs), prioridad `P*`, `area:*`, `regression` si aplica; asignar hito.
5. **Quitar `needs-triage`.**
6. **Convertir en trabajo.** Un bug o una idea aceptada se enlaza desde una issue del backlog (`docs/issues/*.md`, con su ID `Pn-nn`) o se trabaja directamente si es pequeño. Las ideas que no entran se cierran con una explicación breve o se etiquetan `post-mvp`.
7. **Revisar los SLA** de §3: lo que se haya pasado de plazo, primero.

Además, a diario durante la beta: mirar si hay algo con pinta de `severity:critical` (filtro `label:beta created:>=AYER`).

## 5. Del feedback al arreglo

- Bug → test que falla → arreglo → test de regresión (E2E si es un flujo crítico) → PR con `Closes #n` ([WORKFLOW §10](WORKFLOW.md#10-gestión-de-bugs)).
- Idea aceptada → issue del backlog con criterios de aceptación; la issue de la beta la enlaza y queda abierta hasta que se publique.

## 6. Cerrar el ciclo

- Al fusionar el arreglo, comentar en la issue de la beta **qué cambió y desde qué versión** está disponible (la versión aparece en los detalles técnicos del diálogo) y cerrarla.
- Las ideas descartadas se cierran con el motivo, sin dejarlas sin respuesta.
- Las notas de versión de cada hito citan las issues de la beta resueltas.
- Una vez al mes: recuento de issues `beta` abiertas/cerradas por tipo y severidad, para el informe de la beta.

## 7. Prueba del proceso

Criterio de aceptación de P8-04: enviar un bug de prueba desde la app desplegada («Enviar comentarios» → «Algo no funciona» → «Abrir en GitHub» → enviar), comprobar que llega con `beta`, `needs-triage` y `type:bug`, aplicarle los pasos de §4 y cerrarlo como prueba.

> Las etiquetas `beta` y `needs-triage` deben existir en el repositorio para que las plantillas las apliquen: se crean con `gh label create` (o reimportando las etiquetas con el importador, que requiere autorización del propietario).
