# RoomForge — Registro de riesgos

> Estado: **vivo** — revisar al cerrar cada fase. · Puntuación = Probabilidad (1–3) × Impacto (1–3). · Fecha: 2026-10-08.

## 1. Mapa de calor

| | Impacto 1 (bajo) | Impacto 2 (medio) | Impacto 3 (alto) |
|---|---|---|---|
| **Prob. 3 (alta)** | R16 | R14, R17, R23 | **R1, R3** |
| **Prob. 2 (media)** | R13, R21 | R8, R9, R10, R12, R20, R22 | **R2, R4, R5, R6, R11, R15, R18** |
| **Prob. 1 (baja)** | | R19 | R7 |

## 2. Registro

| ID | Riesgo | P | I | Pts | Mitigación | Señal de alerta (trigger) | Fase | Issues |
|---|---|:-:|:-:|:-:|---|---|:-:|---|
| **R1** | **Assets**: no se consigue un catálogo de 30 objetos coherente, ligero y con licencia limpia a coste ≈ 0 (los objetos gaming no existen en CC0). | 3 | 3 | 9 | Spike temprano P4-01; estrategia híbrida paramétrico + GLB ([ADR-0007](ADR/0007-asset-strategy.md)); presupuesto y pipeline; plan B: encargar 5–10 items clave. | P4-01 concluye que ≥10 items requieren modelado propio. | 4 | P4-01…P4-10 |
| **R2** | **Rendimiento de iluminación/sombras** en GPU integrada y móvil: luces dinámicas RGB + sombras + bloom no alcanzan 45 FPS. | 2 | 3 | 6 | Spike P2-11 temprano; pool fijo de luces y presupuesto; emisivo+bloom para el resto; calidad adaptativa; una sola sombra. | P2-11 muestra <30 FPS con 8 luces en el hardware de referencia. | 2, 5 | P2-11, P5-05, P5-07, P5-10, P7-04 |
| **R3** | **Scope creep**: se cuelan polígonos, plantas, IA, marketplace, físicas… | 3 | 3 | 9 | PRD con «fuera de alcance» explícito; plan de recorte (ROADMAP §6); issues pequeñas; cambios de alcance vía ADR/PRD. | Aparecen issues P0 nuevas fuera del PRD. | Todas | PRD, ROADMAP |
| **R4** | **La interacción no «se siente» como un juego** (arrastre, snap, rotación, cámara). | 2 | 3 | 6 | Controladores testeables; prueba con ≥3 personas en Fase 3; iterar con prototipos; atajos y guías visuales. | La prueba de 5 objetos en <3 min falla. | 3 | P3-03…P3-06, P3-13 |
| **R5** | **Pérdida de datos** por desalojo de IndexedDB (Safari/ITP, modo privado), cuota o escritura concurrente. | 2 | 3 | 6 | `storage.persist()`, autosave robusto, export JSON y recordatorios, Web Locks, avisos; E2E de recarga. | Informes de usuarios con proyectos desaparecidos. | 6, 7 | P6-02, P6-03, P6-05, P6-09, P7-07 |
| **R6** | **Evolución del esquema** rompe proyectos guardados. | 2 | 3 | 6 | `schemaVersion` + migraciones puras con golden files; rechazo seguro de versiones futuras; `catalogId` desconocido se conserva. | Un cambio de modelo sin migración llega a PR. | 2, 6 | P2-01, P6-01 |
| **R7** | **WebGL no disponible o contexto perdido** (navegador, driver, memoria). | 1 | 3 | 3 | Detección y pantalla de fallo; recuperación de contexto; exportar JSON como salida. | Crash reports con `CONTEXT_LOST`. | 7 | P7-07, P7-08 |
| **R8** | **Exportación PNG** falla o difiere del viewport (memoria, límites de textura, bloom, MSAA). | 2 | 2 | 4 | Render target fuera de pantalla; degradación elegante; pruebas de píxel/alfa; mismo pipeline que el viewport. | PNG distinto del viewport en pruebas. | 6 | P6-06 |
| **R9** | **Deriva de dependencias**: Next 16, React 19.x (R3F acota `<19.4`), TypeScript 7 (fijado en 6.0.3 por dependency-cruiser), Vitest 5… con rupturas. | 2 | 2 | 4 | Versiones fijadas + lockfile; Dependabot agrupado; E2E completo en cada actualización; verificar TS 7 en P1-01. | Peer deps no satisfechas; CI roto tras update. | 1+ | P1-01, P1-04 |
| **R10** | **Flujo con agentes**: PRs enormes, bucles de revisión, churn, cambios no solicitados. | 2 | 2 | 4 | Issues pequeñas; PR ≤ 400 líneas; AGENTS.md; máx. 2 rondas automáticas; revisión humana final; prohibiciones explícitas. | PRs con >600 líneas o >3 rondas. | Todas | P1-09 |
| **R11** | **Licencias/IP**: assets con licencia incorrecta o modelos generados por IA con términos restrictivos. | 2 | 3 | 6 | Licencia obligatoria en manifiesto; CI valida; solo CC0/propios; revisar términos antes de usar generadores; `ATTRIBUTION.md`. | Item sin licencia verificable. | 4 | P4-02 |
| **R12** | **Hosting**: términos de Cloudflare o límites no encajan con el uso comercial; cambios Pages/Workers. | 2 | 2 | 4 | Verificar términos en P8-03; ADR-0005; plan B Netlify/Vercel Pro; build estático portable. | Cambio de términos o bloqueo de cuenta. | 8 | P1-08, P8-03 |
| **R13** | **Enlaces compartidos** superan el límite de URL o son feos. | 2 | 1 | 2 | Compactación; tope 16 KB; alternativa exportar archivo; enlaces alojados en Fase 9. | Enlaces >4 KB frecuentes. | 6 | P6-08 |
| **R14** | **Accesibilidad del canvas**: editor 3D difícil de operar sin ratón. | 3 | 2 | 6 | Outliner + atajos como alternativa; axe; pruebas manuales; objetivo AA realista para la UI. | axe/manual detectan bloqueos. | 3, 7 | P3-15, P7-05 |
| **R15** | **Corrección de undo/redo** (el fallo más dañino para la confianza). | 2 | 3 | 6 | Immer patches; propiedades fast-check; invariantes tras cada comando; gestos atómicos. | Un fallo de propiedad aparece en CI. | 2, 3 | P2-02, P2-03, P3-02 |
| **R16** | **E2E/visual inestables** por WebGL por software en CI. | 3 | 1 | 3 | Spike P1-07; modo determinista; pruebas por estado, visual solo en CI; política de cuarentena. | >2 % de ejecuciones con fallos aleatorios. | 1, 7 | P1-07, P7-01, P7-02 |
| **R17** | **Estimaciones optimistas / ancho de banda** (una persona + agentes; revisión como cuello de botella). | 3 | 2 | 6 | Factor ×1,4 esperado; recalibrar tras Fase 2; plan de recorte; límite de PRs abiertos. | Velocidad real <70 % de la estimada tras S4. | Todas | ROADMAP |
| **R18** | **Diferenciación de mercado** insuficiente frente a Planner 5D & co. | 2 | 3 | 6 | Foco gaming + RGB + «sensación de juego»; beta con 10 usuarios; métricas de activación/compartir. | Activación <40 % o nulo interés por RGB. | 8 | P8-01…P8-06 |
| **R19** | **Entradas no confiables** (JSON, enlaces) provocan cuelgues o XSS. | 1 | 2 | 2 | Zod estricto, límites, fuzz, CSP, texto siempre escapado. | Fallo de fuzz. | 6, 7 | P6-01, P7-09 |
| **R20** | **Privacidad/RGPD** (analítica, enlaces, feedback). | 2 | 2 | 4 | Sin cookies ni PII; fragmento no sale del navegador; feedback sin datos del proyecto; páginas legales. | Cualquier petición con datos de proyecto. | 8 | P8-01, P8-04 |
| **R21** | **R3F 9 / React 19 / Strict Mode**: efectos duplicados, `react <19.4`, regresiones en actualizaciones. | 2 | 1 | 2 | Controladores idempotentes; E2E; fijar versiones; spike P2-06. | Errores solo en dev/Strict Mode. | 2 | P2-06 |
| **R22** | **Marcas registradas** en nombres de catálogo o de producto. | 2 | 2 | 4 | Nombres genéricos; comprobar marca «RoomForge» (Q2); revisión legal ligera. | Reclamación o conflicto de marca. | 4, 8 | P0-02, P4-02 |

| **R23** | **Sin controles de GitHub** (decisión del propietario: ni Pro ni repo público): no hay protección de ramas, rulesets ni aprobaciones de Environment; un agente o un descuido podría empujar a `develop`/`main` o desplegar sin aprobación, y los secretos son del repositorio. | 3 | 2 | 6 | Política permanente por convención ([DEPLOYMENT §6](DEPLOYMENT.md#6-política-de-ramas-y-despliegue-sin-protecciones-de-github)): hook `pre-push` local (`.husky/pre-push`, P1-02 ✔), ajustes de repo (squash/merge commit, sin auto-merge), producción solo por `workflow_dispatch` manual, tokens Cloudflare separados y de mínimo privilegio, revisión humana del diff de `.github/`, AGENTS.md. | Primer push directo a `develop`/`main`, workflow modificado sin que lo pida la issue, o despliegue no lanzado por el propietario. | 0, 1, 8 | P1-02, P8-03 |

## 3. Top 5 (atención prioritaria)

1. **R1 Assets** — decisión temprana (P4-01) y plan B de encargo.
2. **R3 Scope creep** — disciplina de alcance y plan de recorte.
3. **R2 Iluminación/rendimiento** — spike P2-11 en la Fase 2.
4. **R15/R6 Corrección y datos** — propiedades y migraciones, desde el primer comando.
5. **R5 Pérdida de datos** — autosave + export + avisos.

## 4. Supuestos que, si fallan, invalidan el plan

| Supuesto | Qué ocurre si es falso | Cómo se detecta |
|---|---|---|
| Un solo desarrollador con agentes puede sostener ~5 días ideales/semana | El calendario se alarga linealmente | Velocidad real tras S4 |
| WebGL por software es suficiente para E2E en CI | Se pierde regresión visual automatizada | Spike P1-07 |
| El estilo estilizado/paramétrico agrada a los usuarios | Hay que invertir en modelado de calidad | P4-01 y beta |
| Cloudflare permite uso comercial gratuito sin sorpresas | Migración o coste | Revisión en P8-03 |
| Los usuarios aceptan «local-first» sin cuenta | Retención baja por falta de sync | Feedback de beta |

## 5. Proceso

- Revisión de riesgos al cerrar cada hito (15 min): actualizar P/I, añadir nuevos, cerrar mitigados.
- Todo riesgo con puntuación ≥ 6 debe tener una issue de mitigación o un *spike* asignado.
- Los riesgos materializados pasan a la sección «Incidencias» del hito correspondiente (retrospectiva).
