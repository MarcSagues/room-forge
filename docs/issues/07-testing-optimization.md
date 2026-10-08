# Fase 7 — Testing y optimización (M7)

## ISSUE E7 — Épica: Testing y optimización

- **Tipo:** epic
- **Prioridad:** P0
- **Épica:** —
- **Hito:** M7
- **Estimación:** — (suma de las hijas)
- **Etiquetas:** area:testing, area:perf
- **Depende de:** —

### Descripción
Endurecer el MVP: E2E de flujos críticos, regresión visual, presupuestos automatizados, profiling, accesibilidad, móvil, compatibilidad entre navegadores, resiliencia y seguridad.

### Contexto
[TESTING_STRATEGY](../TESTING_STRATEGY.md). Esta fase cierra el MVP técnico.

### Requisitos
- Presupuestos de rendimiento verificados en CI.
- Sin fugas de memoria en operaciones repetidas.

### Criterios de aceptación
- [ ] CI incluye E2E críticos, presupuestos y cobertura con umbrales.
- [ ] Informe de rendimiento con cifras reales frente a los objetivos del PRD.
- [ ] Todas las issues hijas cerradas.

### Tests esperados
Ver issues hijas.

## ISSUE P7-01 — e2e: flujos críticos del MVP con Playwright

- **Tipo:** feature
- **Prioridad:** P0
- **Épica:** E7
- **Hito:** M7
- **Estimación:** L
- **Etiquetas:** area:testing
- **Depende de:** P6-05, P6-06

### Descripción
Suite E2E de los flujos de [TESTING_STRATEGY §6](../TESTING_STRATEGY.md): crear sala → colocar objetos → mover/rotar/undo → materiales → luces/día-noche → autoguardar y recargar → exportar/importar JSON → exportar PNG → compartir y abrir enlace.

### Contexto
Usa `window.__RF__` (solo con `NEXT_PUBLIC_E2E=1`) para leer la sesión y `renderer.info`, y evita depender de píxeles salvo en la regresión visual.

### Requisitos
- Aislamiento: cada test con contexto/IndexedDB limpios.
- Utilidades de página (`EditorPage`) para reducir fragilidad.
- Reintentos máx. 1 en CI; trazas en fallos.

### Criterios de aceptación
- [ ] ≥ 10 escenarios críticos pasan 20 veces seguidas en CI (sin flakiness).
- [ ] La suite completa tarda < 6 min en CI.
- [ ] Un fallo adjunta traza y captura.

### Tests esperados
- La propia suite; revisión de flakiness con `--repeat-each=20` en el PR.

## ISSUE P7-02 — testing: regresión visual determinista de la escena

- **Tipo:** task
- **Prioridad:** P1
- **Épica:** E7
- **Hito:** M7
- **Estimación:** M
- **Etiquetas:** area:testing
- **Depende de:** P1-07, P5-06

### Descripción
Capturas de referencia de escenas fijas (sala vacía, setup completo de día, de noche con RGB) con renderizado por software, semilla fija y efectos congelados, comparadas con tolerancia; flujo de actualización de referencias vía PR.

### Contexto
Depende del spike de P1-07 (WebGL por software estable). Las diferencias de GPU hacen inviable comparar píxel a píxel entre máquinas: se ejecuta **solo en CI** con la misma imagen de runner.

### Requisitos
- Modo determinista: `?e2e=1` congela tiempo y efectos, fija IDs y calidad.
- Umbral de diferencia documentado; informe visual (diff) en artefactos.
- Referencias versionadas (Git LFS no necesario si son pocas y pequeñas).

### Criterios de aceptación
- [ ] 5 escenas de referencia estables en 20 ejecuciones consecutivas.
- [ ] Un cambio deliberado de color de material hace fallar el test con diff visible.
- [ ] Procedimiento de actualización documentado en TESTING_STRATEGY.

### Tests esperados
- Los propios tests visuales.

## ISSUE P7-03 — quality gates: cobertura, presupuesto de bundle y de escena en CI

- **Tipo:** task
- **Prioridad:** P1
- **Épica:** E7
- **Hito:** M7
- **Estimación:** M
- **Etiquetas:** area:testing, area:perf, area:infra
- **Depende de:** P1-07, P4-07

### Descripción
Activar umbrales de cobertura (`core` ≥90 % líneas / ≥85 % ramas, `web` ≥70 %), presupuesto de tamaño de bundle (JS inicial del editor ≤450 kB gz) y **presupuesto de escena** (draw calls, triángulos y programas de shader en una escena patrón) medidos por Playwright con `renderer.info`.

### Contexto
[R3F_PERFORMANCE §3](../research/R3F_PERFORMANCE.md). Las métricas se publican como comentario/artefacto del PR para ver tendencias.

### Requisitos
- Escena patrón determinista (30 objetos + 8 luminarias).
- Los umbrales viven en un archivo de configuración versionado y se cambian solo con justificación en el PR.
- Informe de tamaño por chunk.

### Criterios de aceptación
- [ ] Un PR que aumenta el bundle por encima del presupuesto falla CI.
- [ ] Un PR que excede draw calls/triángulos de la escena patrón falla CI.
- [ ] Bajar la cobertura de `core` por debajo del umbral falla CI.

### Tests esperados
- Pruebas de las propias comprobaciones con casos que fallan intencionadamente (en un PR de prueba).

## ISSUE P7-04 — perf: pasada de profiling y optimización (renders, GC, fugas de memoria)

- **Tipo:** task
- **Prioridad:** P0
- **Épica:** E7
- **Hito:** M7
- **Estimación:** L
- **Etiquetas:** area:perf
- **Depende de:** P5-10

### Descripción
Sesión de profiling guiada por [R3F_PERFORMANCE](../research/R3F_PERFORMANCE.md): contadores de renders React, asignaciones por frame, tirones por recompilación de shaders, fugas de geometría/textura y tiempos de carga. Corregir los 5 hallazgos de mayor impacto y documentar el resto.

### Contexto
Hardware de referencia: portátil con GPU integrada (definir modelo concreto en esta issue) y un móvil de gama media para el visor.

### Requisitos
- Informe con cifras antes/después (FPS, ms/frame, memoria, tiempo de carga).
- Test de fugas: 200 ciclos añadir/borrar + 50 cambios de día/noche ⇒ memoria y `renderer.info.memory` estables.
- Ajustar presupuestos si la realidad lo exige (con justificación).

### Criterios de aceptación
- [ ] Escena de referencia (30 objetos + 8 luces, calidad media) ≥ 45 FPS en el portátil de referencia.
- [ ] Sin crecimiento de memoria tras los ciclos de fuga (±5 %).
- [ ] p75 de tiempo hasta editor interactivo ≤ 5 s en 4G rápido simulado.

### Tests esperados
- Test automatizado de fugas (Playwright + `__RF__`); informe de rendimiento en `docs/perf/`.

## ISSUE P7-05 — a11y: teclado, foco, contraste, reduced-motion y alternativa textual

- **Tipo:** task
- **Prioridad:** P1
- **Épica:** E7
- **Hito:** M7
- **Estimación:** M
- **Etiquetas:** area:a11y, area:ui
- **Depende de:** P3-15

### Descripción
Auditoría y corrección de accesibilidad de la UI: orden de tabulación, trampas de foco, nombres accesibles, contraste en ambos temas, `prefers-reduced-motion`, anuncios `aria-live`, y verificación con axe en E2E.

### Contexto
[DESIGN_SYSTEM §6](../DESIGN_SYSTEM.md). El outliner es la alternativa accesible al canvas.

### Requisitos
- Pruebas manuales con teclado y un lector de pantalla (NVDA o VoiceOver) documentadas.
- axe en las pantallas principales (editor, proyectos, visor, diálogos).
- Corrección de todos los problemas graves y críticos.

### Criterios de aceptación
- [ ] 0 violaciones graves/críticas de axe en las pantallas principales.
- [ ] Todas las acciones de una sesión típica (crear, colocar, mover, deshacer, guardar) realizables solo con teclado mediante el outliner y los atajos.
- [ ] Animaciones de cámara y efectos RGB respetan `prefers-reduced-motion`.

### Tests esperados
- axe-playwright en E2E; checklist manual archivada en la PR.

## ISSUE P7-06 — mobile: modo visor táctil y comprobación en móviles

- **Tipo:** feature
- **Prioridad:** P1
- **Épica:** E7
- **Hito:** M7
- **Estimación:** M
- **Etiquetas:** area:ui, area:scene
- **Depende de:** P6-08

### Descripción
Visor optimizado para móvil: orbitar/zoom táctil (un dedo orbita, dos dedos zoom/desplazar), calidad baja por defecto, UI mínima (vista, día/noche, luces), banner «Abre en un ordenador para editar» y carga ligera.

### Contexto
El brief: «Mobile tendrá inicialmente una experiencia de visualización y exploración».

### Requisitos
- Objetivos táctiles ≥ 44 px; sin hover.
- Manejo de rotación de pantalla y *safe areas*.
- Pruebas en un móvil real (Android y iOS si es posible) y emulación.

### Criterios de aceptación
- [ ] Un enlace compartido se abre y se orbita con fluidez (≥30 FPS) en un móvil de gama media.
- [ ] No hay scroll de página accidental durante gestos táctiles.
- [ ] La edición no está accesible en <768 px (solo visor).

### Tests esperados
- E2E con emulación táctil; checklist manual en dispositivos.

## ISSUE P7-07 — compat: pruebas cross-browser y degradación sin WebGL

- **Tipo:** task
- **Prioridad:** P1
- **Épica:** E7
- **Hito:** M7
- **Estimación:** M
- **Etiquetas:** area:testing
- **Depende de:** P7-01

### Descripción
Ejecutar los E2E críticos en Chromium, Firefox y WebKit; documentar diferencias (WebGL, IndexedDB, desalojo de Safari, tipografías); implementar y probar la pantalla de «Tu navegador no admite WebGL 2» con exportación del JSON como salida.

### Contexto
[RISKS R5, R7](../RISKS.md). Matriz de navegadores soportados en el PRD §7.

### Requisitos
- Navegadores objetivo: últimas 2 versiones de Chrome/Edge, Firefox y Safari (macOS/iOS).
- Fallo de WebGL ⇒ pantalla explicativa, sin pantalla en blanco.

### Criterios de aceptación
- [ ] Los E2E críticos pasan en los 3 motores (o las diferencias están documentadas con workaround).
- [ ] Simular ausencia de WebGL2 muestra la pantalla de fallo y permite exportar JSON.
- [ ] Matriz de compatibilidad actualizada en el PRD.

### Tests esperados
- Proyectos Playwright por navegador; test con WebGL deshabilitado.

## ISSUE P7-08 — resiliencia: ErrorBoundary, pérdida de contexto WebGL y pantalla de fallo

- **Tipo:** task
- **Prioridad:** P0
- **Épica:** E7
- **Hito:** M7
- **Estimación:** M
- **Etiquetas:** area:ui, area:scene
- **Depende de:** P6-03

### Descripción
`ErrorBoundary` global y por panel, manejo de `webglcontextlost`/`restored` (recrear recursos, conservar la sesión), registro local de errores (últimos 50, descargable) y pantalla de fallo con «Reintentar», «Exportar copia» y «Reportar problema».

### Contexto
La regla de oro: **nunca perder el trabajo**. Un error en el render no debe tumbar el documento ni el autoguardado.

### Requisitos
- Simular pérdida de contexto con la extensión `WEBGL_lose_context` en E2E.
- Tras restaurar, texturas/materiales se recrean desde el registry sin perder la selección.
- «Reportar problema» abre una issue prellenada **sin datos del proyecto** salvo que el usuario los adjunte.

### Criterios de aceptación
- [ ] Forzar pérdida de contexto: aparece aviso y, al restaurarse, la escena vuelve idéntica.
- [ ] Una excepción en un panel no tumba el editor; el resto sigue funcionando.
- [ ] Tras un crash simulado, el último estado autoguardado se recupera al recargar.

### Tests esperados
- E2E con `lose_context`; RTL de ErrorBoundary; test de recuperación tras recarga.

## ISSUE P7-09 — seguridad: fuzz de importación, CSP y auditoría de dependencias

- **Tipo:** task
- **Prioridad:** P0
- **Épica:** E7
- **Hito:** M7
- **Estimación:** S
- **Etiquetas:** area:infra, area:testing
- **Depende de:** P6-05

### Descripción
Fuzz de las entradas no confiables (JSON importado, fragmento de URL), política CSP estricta en `_headers`, `pnpm audit` en CI, revisión de scripts `postinstall` y de licencias de dependencias.

### Contexto
[ARCHITECTURE §11](../ARCHITECTURE.md).

### Requisitos
- CSP sin `unsafe-eval`; `unsafe-inline` solo si Next lo exige (documentar y mitigar con hashes/nonce cuando sea posible en export estático).
- `Referrer-Policy`, `X-Content-Type-Options`, `Permissions-Policy` mínimas.
- Informe de licencias de dependencias (compatibles con uso comercial).

### Criterios de aceptación
- [ ] 10 000 entradas aleatorias/mutadas no producen excepciones no controladas ni cuelgues.
- [ ] La app funciona con la CSP activa (sin violaciones en consola).
- [ ] `pnpm audit` sin vulnerabilidades altas/críticas sin justificar.

### Tests esperados
- Fuzz con fast-check; E2E comprobando cabeceras y consola limpia.
