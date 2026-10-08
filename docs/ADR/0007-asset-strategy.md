# ADR-0007 — Estrategia de assets: híbrido GLB CC0 + objetos paramétricos

- **Estado:** **Aceptada (provisional)** (2026-10-08) — se confirma o enmienda con el resultado del spike P4-01
- **Fecha:** 2026-10-08
- **Revisar cuando:** P4-01 concluya, o aparezca un presupuesto/artista.

## Contexto
Es el **riesgo n.º 1** del producto: se necesitan ~30 objetos coherentes, ligeros, con licencia limpia y coste ≈ 0. Los packs CC0 (Kenney, Quaternius, KayKit, Poly Haven) cubren mobiliario genérico, pero el nicho gaming (torre RGB, ultrawide, barras de luz, paneles hexagonales, neón) probablemente no existe. El usuario no necesariamente dispone de habilidades de modelado.

## Decisión (hipótesis a validar)
- **Dirección artística:** *estilizado limpio* (low-poly pulido con materiales PBR simples), coherente entre items; no fotorrealismo.
- **Tres fuentes por item**, elegidas por coste/beneficio:
  1. **Paramétrico en código** (cajas, cilindros, extrusiones compuestas) para objetos geométricos: escritorios, estanterías, monitores, teclados, tiras LED, barras de luz, paneles, alfombra. Ventajas: peso ≈ 0, redimensionable, ranuras de material, sin licencia.
  2. **GLB CC0** (Kenney/Quaternius/KayKit/Poly Haven) para objetos orgánicos o complejos: silla, planta, puf, sofá.
  3. **Creación propia en Blender / encargo** solo si P4-01 demuestra que (1) y (2) no alcanzan el listón visual.
- Todo asset pasa por un **pipeline** (`gltf-transform`) con presupuestos y registro de licencia en el manifiesto.
- **No se usan modelos de licencia incierta ni generados por IA** sin revisar términos del plan concreto.

## Alternativas consideradas
| Alternativa | Pros | Contras | Por qué no |
|---|---|---|---|
| Solo GLB descargados | Calidad artística inmediata | Huecos de catálogo; coherencia de estilo dispar; licencias a verificar una a una | Insuficiente para el nicho. |
| Solo paramétrico | Cero descargas, resizable | Menos «premium» en objetos orgánicos | Híbrido lo mitiga. |
| Generación IA de mallas | Rapidez | Topología/escala inconsistentes; licencias | Riesgo y limpieza costosa. |
| Encargar a artista 3D | Máxima calidad | Coste | Opción de crecimiento (Fase 9: marketplace). |

## Consecuencias
- (+) Catálogo viable con coste ≈ 0 y descargas mínimas.
- (−) Tiempo de ingeniería en el *builder* paramétrico (P4-05).
- (−) Riesgo de «aspecto programador» si no se cuida el estilo: P4-01 fija un listón visual con 3 items de prueba.

## Verificación
P4-01: 3 objetos (silla, monitor, escritorio) hechos por cada vía, evaluados con capturas y presupuesto; resultado ⇒ actualización de esta ADR a **Aceptada**.
