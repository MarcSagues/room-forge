# RoomForge — Backlog priorizado

> **Generado automáticamente** por `node tools/planning/github-import.mjs backlog` desde `docs/issues/*.md`. No editar a mano.
> Estimaciones: días ideales de desarrollo asistido por IA (XS 0,25 · S 0,5 · M 1 · L 2 · XL 4). Ver [ROADMAP](ROADMAP.md).

## 1. Resumen por hito

| Hito | Fase | Issues | P0 | P1 | P2 | P3 | Esfuerzo (días) |
|---|---|---:|---:|---:|---:|---:|---:|
| M0 | Fase 0 — Investigación y arquitectura | 3 | 3 | 0 | 0 | 0 | 1,25 |
| M1 | Fase 1 — Fundamentos del proyecto | 9 | 7 | 2 | 0 | 0 | 6,5 |
| M2 | Fase 2 — Motor 3D | 11 | 10 | 1 | 0 | 0 | 10,5 |
| M3 | Fase 3 — Editor interactivo | 16 | 10 | 5 | 1 | 0 | 21 |
| M4 | Fase 4 — Catálogo de objetos | 10 | 8 | 2 | 0 | 0 | 14 |
| M5 | Fase 5 — Materiales e iluminación | 10 | 8 | 2 | 0 | 0 | 12 |
| M6 | Fase 6 — Persistencia y exportación | 9 | 6 | 2 | 1 | 0 | 10,5 |
| M7 | Fase 7 — Testing y optimización | 9 | 4 | 5 | 0 | 0 | 10,5 |
| M8 | Fase 8 — Beta pública | 6 | 4 | 1 | 1 | 0 | 6 |
| M9 | Fase 9 — IA y monetización | 9 | 0 | 0 | 4 | 5 | 28 |
| M10 | Fase 10 — HomeForge: la casa completa | 10 | 0 | 10 | 0 | 0 | 15,5 |
| **Total** | | **102** | | | | | **135,75** |

- **MVP + beta (M0–M8):** 92,25 días ideales. **Fase 9 (post-MVP):** 43,5 días ideales (muy incierto).
- **Ruta crítica del MVP:** P0-01 → P0-03 → P1-01 → P1-03 → P2-01 → P2-02 → P2-06 → P2-07 → P4-01 → P4-03 → P4-10 → P5-05 → P5-06 → P6-06 → P7-01 → P7-07 (20,25 días si no hay paralelismo humano; las issues fuera de la ruta se pueden intercalar).

## 2. Orden de implementación sugerido

Orden topológico respetando dependencias; desempata por hito → prioridad → tamaño. Los **spikes del MVP se adelantan** en cuanto sus dependencias lo permiten (reducir riesgo pronto). Es una **guía**, no un contrato.
La columna «Sprint» agrupa secuencialmente en bloques de 5 días ideales (≈ una semana a dedicación completa, una sola persona).

| # | Sprint | ID | Título | Tipo | Prio | Est. | Depende de |
|---:|---:|---|---|---|---|---|---|
| 1 | S1 | P0-01 | Revisar y aprobar la documentación de planificación | task | P0 | XS | — |
| 2 | S1 | P0-02 | Resolver las preguntas abiertas del PRD | task | P0 | S | P0-01 |
| 3 | S1 | P0-03 | Crear el repositorio en GitHub, ramas, ajustes e importar el backlog | task | P0 | S | P0-01 |
| 4 | S1 | P1-01 | Scaffold del monorepo (pnpm, Next.js 16 export estático, packages/core) | task | P0 | M | P0-03 |
| 5 | S1 | P1-02 | Calidad de código: Biome, TypeScript estricto, dependency-cruiser y hooks de commit | task | P0 | S | P1-01 |
| 6 | S1 | P1-03 | Vitest y React Testing Library: configuración y tests de humo | task | P0 | S | P1-01 |
| 7 | S1 | P1-04 | CI en GitHub Actions (lint, typecheck, test, build, deps) | task | P0 | S | P1-02, P1-03 |
| 8 | S1 | P1-05 | Tailwind v4, shadcn/ui y tokens de diseño (tema oscuro/claro) | task | P0 | M | P1-01 |
| 9 | S2 | P1-06 | Shell del editor: layout de 5 regiones con paneles redimensionables | feature | P0 | M | P1-05 |
| 10 | S2 | P1-08 | Despliegue de previews en Cloudflare (PR y develop) | task | P0 | M | P1-04 |
| 11 | S2 | P1-07 | Playwright con WebGL y tests e2e de humo en CI | task | P1 | S | P1-04, P1-06 |
| 12 | S2 | P1-09 | Activar la revisión con Codex y validar el flujo con un PR de prueba | task | P1 | S | P1-04 |
| 13 | S2 | P2-01 | core: tipos de dominio y schemas zod de SceneDocument v1 | feature | P0 | M | P1-01, P1-03 |
| 14 | S3 | P2-02 | core: EditorSession (store) y pipeline de comandos con Immer | feature | P0 | L | P2-01 |
| 15 | S3 | P2-04 | core: comandos de habitación (crear, redimensionar, material de superficie) | feature | P0 | S | P2-02 |
| 16 | S3 | P2-05 | core: bus de eventos tipado y estado de selección | task | P0 | S | P2-02 |
| 17 | S3 | P2-03 | core: historial undo/redo con coalescing y gestos | feature | P0 | M | P2-02 |
| 18 | S3 | P2-06 | scene: Canvas R3F base con render bajo demanda | feature | P0 | M | P1-06, P2-02 |
| 19 | S4 | P2-07 | scene: RoomMesh (suelo, paredes y techo desde el dominio) | feature | P0 | M | P2-01, P2-06 |
| 20 | S4 | P2-11 | Spike: prototipo desechable de iluminación (coste de luces en GPU integrada) | spike | P0 | S | P2-07 |
| 21 | S4 | P4-01 | Spike: calidad visual y estrategia de assets (paramétrico vs GLB) | spike | P0 | M | P2-07 |
| 22 | S4 | P2-08 | scene: CameraRig (orbital + superior ortográfica, encuadre a la sala) | feature | P0 | M | P2-06 |
| 23 | S4 | P2-09 | scene: patrón EntityView y suscripciones granulares con test de renders | feature | P0 | M | P2-06, P2-02 |
| 24 | S5 | P2-10 | scene: modos de visibilidad de paredes (arriba, corte, abajo) y techo | feature | P1 | M | P2-07, P2-08 |
| 25 | S5 | P3-03 | scene: selección (clic, hover, contorno) con colliders proxy | feature | P0 | M | P2-09, P2-05 |
| 26 | S5 | P3-08 | ui: ShortcutRegistry, atajos, undo/redo en UI y ayuda | feature | P0 | M | P2-03, P1-06 |
| 27 | S5 | P3-09 | ui: barra superior e inferior (proyecto, estado, herramientas, vistas, snap) | feature | P0 | M | P1-06, P3-08 |
| 28 | S5 | P3-10 | ui: asistente «Nueva habitación» y edición de dimensiones y superficies | feature | P0 | M | P2-04, P2-07 |
| 29 | S6 | P3-01 | core: geometría de colocación (snap, límites, snap a pared, huellas OBB) | feature | P0 | L | P2-01 |
| 30 | S6 | P3-02 | core: comandos de objetos, CatalogProvider e invariantes | feature | P0 | L | P2-03, P3-01 |
| 31 | S6 | P3-07 | ui: panel de propiedades del objeto seleccionado | feature | P0 | M | P3-03, P3-02 |
| 32 | S7 | P3-04 | scene: mover objetos arrastrando sobre el suelo con snap y fantasma | feature | P0 | L | P3-01, P3-02, P3-03 |
| 33 | S7 | P3-05 | scene: rotación (teclas, asa circular, snap angular) | feature | P0 | M | P3-04 |
| 34 | S7 | P3-06 | ui: panel de catálogo mínimo y drag & drop al canvas | feature | P0 | M | P3-04 |
| 35 | S7 | P3-11 | core: aperturas (puertas y ventanas): comandos y validación | feature | P1 | M | P2-04 |
| 36 | S8 | P3-15 | ui: panel de escena (outliner) | feature | P1 | M | P3-07 |
| 37 | S8 | P3-12 | scene: aperturas en paredes (huecos, colocar y deslizar) | feature | P1 | L | P3-11, P2-07, P3-04 |
| 38 | S8 | P3-13 | core + scene: colocación sobre superficies (objetos sobre escritorios) | feature | P1 | L | P3-04 |
| 39 | S9 | P3-16 | core + ui: controlar la altura (elevación) de los objetos | feature | P1 | M | P3-07, P3-13 |
| 40 | S9 | P3-14 | scene: avisos de colisión y fuera de límites | task | P2 | M | P3-04 |
| 41 | S9 | P4-02 | catalog: schema del manifiesto, validador, licencias y atribuciones | feature | P0 | M | P4-01, P2-01 |
| 42 | S9 | P4-04 | scene: carga y reutilización de modelos (caché, clonado, placeholders, dispose) | feature | P0 | M | P4-02, P2-09 |
| 43 | S9 | P4-06 | ui: panel de catálogo completo (categorías, búsqueda, miniaturas) | feature | P0 | M | P4-02, P3-06 |
| 44 | S10 | P4-03 | catalog: pipeline de optimización de assets y miniaturas | task | P0 | L | P4-01 |
| 45 | S10 | P4-10 | content: lote D — luminarias (6 items) | task | P0 | M | P4-03 |
| 46 | S10 | P4-07 | content: lote A — escritorios y asientos (5 items) | task | P0 | L | P4-03, P4-04 |
| 47 | S11 | P4-08 | content: lote B — informática y audio (9 items) | task | P0 | L | P4-07 |
| 48 | S11 | P4-05 | scene: constructor de objetos paramétricos | feature | P1 | M | P4-01, P4-04 |
| 49 | S11 | P4-09 | content: lote C — almacenamiento, entretenimiento y decoración (10 items) | task | P1 | L | P4-07 |
| 50 | S12 | P5-01 | core: modelo de materiales, presets y comandos de material | feature | P0 | M | P2-04, P3-02 |
| 51 | S12 | P5-02 | scene: MaterialFactory compartido y texturas (UV en espacio mundo) | feature | P0 | M | P5-01, P2-07 |
| 52 | S12 | P5-03 | ui: panel de materiales y color | feature | P0 | M | P5-02, P3-07 |
| 53 | S12 | P5-04 | core: modelo de luminarias (estado de luz, efectos) y comandos | feature | P0 | M | P3-02 |
| 54 | S13 | P5-05 | scene: pool fijo de luces, asignador por presupuesto y visuales emisivos | feature | P0 | L | P5-04, P4-10, P2-11 |
| 55 | S13 | P5-06 | scene: modo día/noche (entorno procedural, sol con sombras, ventanas) | feature | P0 | L | P5-05 |
| 56 | S13 | P5-09 | ui: controles de iluminación (día/noche, luminaria RGB, presets de ambiente) | feature | P0 | M | P5-04, P5-06 |
| 57 | S14 | P5-10 | scene + ui: ajustes de calidad gráfica y calidad adaptativa | feature | P0 | M | P5-05, P5-06 |
| 58 | S14 | P5-07 | scene: resplandor (bloom) selectivo según calidad | feature | P1 | M | P5-05 |
| 59 | S14 | P5-08 | scene: efectos RGB animados con bucle de invalidación limitado | feature | P1 | M | P5-05 |
| 60 | S14 | P6-01 | core: formato de archivo versionado, migraciones y validación de importación | feature | P0 | M | P2-01 |
| 61 | S14 | P6-02 | persistence: ProjectRepository sobre IndexedDB (idb) | feature | P0 | M | P6-01 |
| 62 | S15 | P6-03 | persistence: autoguardado, estado de guardado y recuperación de sesión | feature | P0 | M | P6-02, P3-09 |
| 63 | S15 | P6-04 | ui: pantalla de proyectos (listar, crear, renombrar, duplicar, borrar) | feature | P0 | M | P6-02 |
| 64 | S15 | P6-05 | persistence: importar y exportar JSON | feature | P0 | M | P6-01, P6-04 |
| 65 | S15 | P6-06 | export: exportar PNG (resolución, fondo, calidad) | feature | P0 | L | P5-06, P3-09 |
| 66 | S16 | P6-07 | export: miniaturas de proyecto | task | P1 | S | P6-06, P6-03 |
| 67 | S16 | P6-08 | persistence: compartir por enlace (fragmento de URL) y modo visor | feature | P1 | L | P6-01, P2-08 |
| 68 | S16 | P6-09 | persistence: robustez del almacenamiento (cuota, persist, multi-pestaña, recordatorio de copia) | task | P2 | M | P6-03 |
| 69 | S16 | P7-09 | seguridad: fuzz de importación, CSP y auditoría de dependencias | task | P0 | S | P6-05 |
| 70 | S16 | P7-08 | resiliencia: ErrorBoundary, pérdida de contexto WebGL y pantalla de fallo | task | P0 | M | P6-03 |
| 71 | S17 | P7-01 | e2e: flujos críticos del MVP con Playwright | feature | P0 | L | P6-05, P6-06 |
| 72 | S17 | P7-04 | perf: pasada de profiling y optimización (renders, GC, fugas de memoria) | task | P0 | L | P5-10 |
| 73 | S17 | P7-02 | testing: regresión visual determinista de la escena | task | P1 | M | P1-07, P5-06 |
| 74 | S18 | P7-03 | quality gates: cobertura, presupuesto de bundle y de escena en CI | task | P1 | M | P1-07, P4-07 |
| 75 | S18 | P7-05 | a11y: teclado, foco, contraste, reduced-motion y alternativa textual | task | P1 | M | P3-15 |
| 76 | S18 | P7-06 | mobile: modo visor táctil y comprobación en móviles | feature | P1 | M | P6-08 |
| 77 | S18 | P7-07 | compat: pruebas cross-browser y degradación sin WebGL | task | P1 | M | P7-01 |
| 78 | S18 | P8-01 | Landing, SEO, páginas legales y analítica respetuosa | feature | P0 | M | P1-08 |
| 79 | S19 | P8-03 | Producción: dominio, despliegue en Cloudflare, cabeceras y aprobación manual | task | P0 | M | P1-08, P7-09 |
| 80 | S19 | P8-02 | Plantillas de inicio y tutorial de primera ejecución | feature | P0 | L | P6-04, P4-10 |
| 81 | S19 | P8-06 | Release v0.1.0-beta: checklist, rollback y changelog | task | P0 | S | P8-02, P8-03, P7-01 |
| 82 | S19 | P8-04 | Feedback in-app y proceso de triage de la beta | task | P1 | S | P8-01 |
| 83 | S19 | P8-05 | PWA / offline: service worker para los assets del editor | feature | P2 | M | P8-03 |
| 84 | S20 | P9-01 | Spike: backend, autenticación y base de datos (decisión + ADR) | spike | P2 | M | P8-06 |
| 85 | S20 | P9-03 | Spike: diseño del generador de distribuciones con IA | spike | P2 | M | P8-06 |
| 86 | S21 | P9-02 | Cuentas, sincronización en la nube y enlaces alojados | feature | P2 | XL | P9-01 |
| 87 | S22 | P9-04 | Generador de distribuciones con IA (texto → comandos con vista previa) | feature | P2 | XL | P9-03, P9-02 |
| 88 | S23 | P9-09 | Selección múltiple, medición y recorrido en primera persona | feature | P3 | L | P8-06 |
| 89 | S24 | P9-05 | Planes, límites y pagos (Stripe) | feature | P3 | XL | P9-02 |
| 90 | S25 | P9-06 | Catálogo premium y marketplace de packs | feature | P3 | XL | P9-05 |
| 91 | S26 | P9-07 | Colaboración en tiempo real | feature | P3 | XL | P9-02 |
| 92 | S27 | P9-08 | Habitaciones poligonales, varias plantas y otros tipos de vivienda | feature | P3 | XL | P8-06 |
| 93 | S27 | P10-01 | docs: ADR HomeForge (modos Habitación/Casa y planes gratuito/premium) | task | P1 | S | — |
| 94 | S28 | P10-02 | puertas que se abren y se cierran | feature | P1 | M | P10-01 |
| 95 | S28 | P10-08 | renombrar RoomForge a HomeForge (producto y código) | task | P1 | L | P10-01 |
| 96 | S28 | P10-09 | core + scene: habitaciones con forma libre (polígono) | feature | P1 | L | P10-01 |
| 97 | S29 | P10-03 | core: varias habitaciones y pasillos en un plano | feature | P1 | L | P10-01, P10-09 |
| 98 | S29 | P10-04 | core + scene: puertas entre habitaciones | feature | P1 | M | P10-03, P10-02 |
| 99 | S29 | P10-05 | scene: renderizar la casa | feature | P1 | L | P10-03 |
| 100 | S30 | P10-06 | ui: editar la distribución de la casa | feature | P1 | L | P10-03, P10-05 |
| 101 | S30 | P10-07 | planes gratuito y premium (límite local, sin pagos) | feature | P1 | M | P10-01, P10-06 |
| 102 | S30 | P10-10 | ui: editar la forma de la habitación | feature | P1 | L | P10-09 |

### Resumen por sprint

| Sprint | Días | Issues |
|---:|---:|---|
| S1 | 4,75 | P0-01, P0-02, P0-03, P1-01, P1-02, P1-03, P1-04, P1-05 |
| S2 | 4 | P1-06, P1-08, P1-07, P1-09, P2-01 |
| S3 | 5 | P2-02, P2-04, P2-05, P2-03, P2-06 |
| S4 | 4,5 | P2-07, P2-11, P4-01, P2-08, P2-09 |
| S5 | 5 | P2-10, P3-03, P3-08, P3-09, P3-10 |
| S6 | 5 | P3-01, P3-02, P3-07 |
| S7 | 5 | P3-04, P3-05, P3-06, P3-11 |
| S8 | 5 | P3-15, P3-12, P3-13 |
| S9 | 5 | P3-16, P3-14, P4-02, P4-04, P4-06 |
| S10 | 5 | P4-03, P4-10, P4-07 |
| S11 | 5 | P4-08, P4-05, P4-09 |
| S12 | 4 | P5-01, P5-02, P5-03, P5-04 |
| S13 | 5 | P5-05, P5-06, P5-09 |
| S14 | 5 | P5-10, P5-07, P5-08, P6-01, P6-02 |
| S15 | 5 | P6-03, P6-04, P6-05, P6-06 |
| S16 | 5 | P6-07, P6-08, P6-09, P7-09, P7-08 |
| S17 | 5 | P7-01, P7-04, P7-02 |
| S18 | 5 | P7-03, P7-05, P7-06, P7-07, P8-01 |
| S19 | 5 | P8-03, P8-02, P8-06, P8-04, P8-05 |
| S20 | 2 | P9-01, P9-03 |
| S21 | 4 | P9-02 |
| S22 | 4 | P9-04 |
| S23 | 2 | P9-09 |
| S24 | 4 | P9-05 |
| S25 | 4 | P9-06 |
| S26 | 4 | P9-07 |
| S27 | 4,5 | P9-08, P10-01 |
| S28 | 5 | P10-02, P10-08, P10-09 |
| S29 | 5 | P10-03, P10-04, P10-05 |
| S30 | 5 | P10-06, P10-07, P10-10 |

## 3. Por prioridad

### P0 (60 issues, 67,25 días)

- **P0-01** Revisar y aprobar la documentación de planificación — _M0, XS_
- **P0-02** Resolver las preguntas abiertas del PRD — _M0, S_
- **P0-03** Crear el repositorio en GitHub, ramas, ajustes e importar el backlog — _M0, S_
- **P1-01** Scaffold del monorepo (pnpm, Next.js 16 export estático, packages/core) — _M1, M_
- **P1-02** Calidad de código: Biome, TypeScript estricto, dependency-cruiser y hooks de commit — _M1, S_
- **P1-03** Vitest y React Testing Library: configuración y tests de humo — _M1, S_
- **P1-04** CI en GitHub Actions (lint, typecheck, test, build, deps) — _M1, S_
- **P1-05** Tailwind v4, shadcn/ui y tokens de diseño (tema oscuro/claro) — _M1, M_
- **P1-06** Shell del editor: layout de 5 regiones con paneles redimensionables — _M1, M_
- **P1-08** Despliegue de previews en Cloudflare (PR y develop) — _M1, M_
- **P2-01** core: tipos de dominio y schemas zod de SceneDocument v1 — _M2, M_
- **P2-02** core: EditorSession (store) y pipeline de comandos con Immer — _M2, L_
- **P2-03** core: historial undo/redo con coalescing y gestos — _M2, M_
- **P2-04** core: comandos de habitación (crear, redimensionar, material de superficie) — _M2, S_
- **P2-05** core: bus de eventos tipado y estado de selección — _M2, S_
- **P2-06** scene: Canvas R3F base con render bajo demanda — _M2, M_
- **P2-07** scene: RoomMesh (suelo, paredes y techo desde el dominio) — _M2, M_
- **P2-08** scene: CameraRig (orbital + superior ortográfica, encuadre a la sala) — _M2, M_
- **P2-09** scene: patrón EntityView y suscripciones granulares con test de renders — _M2, M_
- **P2-11** Spike: prototipo desechable de iluminación (coste de luces en GPU integrada) — _M2, S_
- **P3-01** core: geometría de colocación (snap, límites, snap a pared, huellas OBB) — _M3, L_
- **P3-02** core: comandos de objetos, CatalogProvider e invariantes — _M3, L_
- **P3-03** scene: selección (clic, hover, contorno) con colliders proxy — _M3, M_
- **P3-04** scene: mover objetos arrastrando sobre el suelo con snap y fantasma — _M3, L_
- **P3-05** scene: rotación (teclas, asa circular, snap angular) — _M3, M_
- **P3-06** ui: panel de catálogo mínimo y drag & drop al canvas — _M3, M_
- **P3-07** ui: panel de propiedades del objeto seleccionado — _M3, M_
- **P3-08** ui: ShortcutRegistry, atajos, undo/redo en UI y ayuda — _M3, M_
- **P3-09** ui: barra superior e inferior (proyecto, estado, herramientas, vistas, snap) — _M3, M_
- **P3-10** ui: asistente «Nueva habitación» y edición de dimensiones y superficies — _M3, M_
- **P4-01** Spike: calidad visual y estrategia de assets (paramétrico vs GLB) — _M4, M_
- **P4-02** catalog: schema del manifiesto, validador, licencias y atribuciones — _M4, M_
- **P4-03** catalog: pipeline de optimización de assets y miniaturas — _M4, L_
- **P4-04** scene: carga y reutilización de modelos (caché, clonado, placeholders, dispose) — _M4, M_
- **P4-06** ui: panel de catálogo completo (categorías, búsqueda, miniaturas) — _M4, M_
- **P4-07** content: lote A — escritorios y asientos (5 items) — _M4, L_
- **P4-08** content: lote B — informática y audio (9 items) — _M4, L_
- **P4-10** content: lote D — luminarias (6 items) — _M4, M_
- **P5-01** core: modelo de materiales, presets y comandos de material — _M5, M_
- **P5-02** scene: MaterialFactory compartido y texturas (UV en espacio mundo) — _M5, M_
- **P5-03** ui: panel de materiales y color — _M5, M_
- **P5-04** core: modelo de luminarias (estado de luz, efectos) y comandos — _M5, M_
- **P5-05** scene: pool fijo de luces, asignador por presupuesto y visuales emisivos — _M5, L_
- **P5-06** scene: modo día/noche (entorno procedural, sol con sombras, ventanas) — _M5, L_
- **P5-09** ui: controles de iluminación (día/noche, luminaria RGB, presets de ambiente) — _M5, M_
- **P5-10** scene + ui: ajustes de calidad gráfica y calidad adaptativa — _M5, M_
- **P6-01** core: formato de archivo versionado, migraciones y validación de importación — _M6, M_
- **P6-02** persistence: ProjectRepository sobre IndexedDB (idb) — _M6, M_
- **P6-03** persistence: autoguardado, estado de guardado y recuperación de sesión — _M6, M_
- **P6-04** ui: pantalla de proyectos (listar, crear, renombrar, duplicar, borrar) — _M6, M_
- **P6-05** persistence: importar y exportar JSON — _M6, M_
- **P6-06** export: exportar PNG (resolución, fondo, calidad) — _M6, L_
- **P7-01** e2e: flujos críticos del MVP con Playwright — _M7, L_
- **P7-04** perf: pasada de profiling y optimización (renders, GC, fugas de memoria) — _M7, L_
- **P7-08** resiliencia: ErrorBoundary, pérdida de contexto WebGL y pantalla de fallo — _M7, M_
- **P7-09** seguridad: fuzz de importación, CSP y auditoría de dependencias — _M7, S_
- **P8-01** Landing, SEO, páginas legales y analítica respetuosa — _M8, M_
- **P8-02** Plantillas de inicio y tutorial de primera ejecución — _M8, L_
- **P8-03** Producción: dominio, despliegue en Cloudflare, cabeceras y aprobación manual — _M8, M_
- **P8-06** Release v0.1.0-beta: checklist, rollback y changelog — _M8, S_

### P1 (30 issues, 37,5 días)

- **P1-07** Playwright con WebGL y tests e2e de humo en CI — _M1, S_
- **P1-09** Activar la revisión con Codex y validar el flujo con un PR de prueba — _M1, S_
- **P10-01** docs: ADR HomeForge (modos Habitación/Casa y planes gratuito/premium) — _M10, S_
- **P10-02** puertas que se abren y se cierran — _M10, M_
- **P10-03** core: varias habitaciones y pasillos en un plano — _M10, L_
- **P10-04** core + scene: puertas entre habitaciones — _M10, M_
- **P10-05** scene: renderizar la casa — _M10, L_
- **P10-06** ui: editar la distribución de la casa — _M10, L_
- **P10-07** planes gratuito y premium (límite local, sin pagos) — _M10, M_
- **P10-08** renombrar RoomForge a HomeForge (producto y código) — _M10, L_
- **P10-09** core + scene: habitaciones con forma libre (polígono) — _M10, L_
- **P10-10** ui: editar la forma de la habitación — _M10, L_
- **P2-10** scene: modos de visibilidad de paredes (arriba, corte, abajo) y techo — _M2, M_
- **P3-11** core: aperturas (puertas y ventanas): comandos y validación — _M3, M_
- **P3-12** scene: aperturas en paredes (huecos, colocar y deslizar) — _M3, L_
- **P3-13** core + scene: colocación sobre superficies (objetos sobre escritorios) — _M3, L_
- **P3-15** ui: panel de escena (outliner) — _M3, M_
- **P3-16** core + ui: controlar la altura (elevación) de los objetos — _M3, M_
- **P4-05** scene: constructor de objetos paramétricos — _M4, M_
- **P4-09** content: lote C — almacenamiento, entretenimiento y decoración (10 items) — _M4, L_
- **P5-07** scene: resplandor (bloom) selectivo según calidad — _M5, M_
- **P5-08** scene: efectos RGB animados con bucle de invalidación limitado — _M5, M_
- **P6-07** export: miniaturas de proyecto — _M6, S_
- **P6-08** persistence: compartir por enlace (fragmento de URL) y modo visor — _M6, L_
- **P7-02** testing: regresión visual determinista de la escena — _M7, M_
- **P7-03** quality gates: cobertura, presupuesto de bundle y de escena en CI — _M7, M_
- **P7-05** a11y: teclado, foco, contraste, reduced-motion y alternativa textual — _M7, M_
- **P7-06** mobile: modo visor táctil y comprobación en móviles — _M7, M_
- **P7-07** compat: pruebas cross-browser y degradación sin WebGL — _M7, M_
- **P8-04** Feedback in-app y proceso de triage de la beta — _M8, S_

### P2 (7 issues, 13 días)

- **P3-14** scene: avisos de colisión y fuera de límites — _M3, M_
- **P6-09** persistence: robustez del almacenamiento (cuota, persist, multi-pestaña, recordatorio de copia) — _M6, M_
- **P8-05** PWA / offline: service worker para los assets del editor — _M8, M_
- **P9-01** Spike: backend, autenticación y base de datos (decisión + ADR) — _M9, M_
- **P9-02** Cuentas, sincronización en la nube y enlaces alojados — _M9, XL_
- **P9-03** Spike: diseño del generador de distribuciones con IA — _M9, M_
- **P9-04** Generador de distribuciones con IA (texto → comandos con vista previa) — _M9, XL_

### P3 (5 issues, 18 días)

- **P9-05** Planes, límites y pagos (Stripe) — _M9, XL_
- **P9-06** Catálogo premium y marketplace de packs — _M9, XL_
- **P9-07** Colaboración en tiempo real — _M9, XL_
- **P9-08** Habitaciones poligonales, varias plantas y otros tipos de vivienda — _M9, XL_
- **P9-09** Selección múltiple, medición y recorrido en primera persona — _M9, L_

## 4. Épicas

- **E1** Épica: Fundamentos del proyecto — 9 issues, 6,5 días
- **E2** Épica: Motor 3D (core de dominio + motor de escena base) — 11 issues, 10,5 días
- **E3** Épica: Editor interactivo — 16 issues, 21 días
- **E4** Épica: Catálogo de objetos (30 items) — 10 issues, 14 días
- **E5** Épica: Materiales e iluminación (RGB, día/noche) — 10 issues, 12 días
- **E6** Épica: Persistencia y exportación — 9 issues, 10,5 días
- **E7** Épica: Testing y optimización — 9 issues, 10,5 días
- **E8** Épica: Beta pública — 6 issues, 6 días
- **E9** Épica: IA y monetización — 9 issues, 28 días
- **E10** Épica: HomeForge, de la habitación a la casa — 10 issues, 15,5 días

## 5. Issues que requieren acción humana

- **P0-01** Revisar y aprobar la documentación de planificación (M0)
- **P0-02** Resolver las preguntas abiertas del PRD (M0)
- **P0-03** Crear el repositorio en GitHub, ramas, ajustes e importar el backlog (M0)
- **P1-08** Despliegue de previews en Cloudflare (PR y develop) (M1)
- **P1-09** Activar la revisión con Codex y validar el flujo con un PR de prueba (M1)
- **P8-03** Producción: dominio, despliegue en Cloudflare, cabeceras y aprobación manual (M8)
- **P8-06** Release v0.1.0-beta: checklist, rollback y changelog (M8)
