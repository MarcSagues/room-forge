# ADR-0007 — Estrategia de assets: híbrido GLB CC0 + objetos paramétricos

- **Estado:** **Aceptada** (2026-10-10, tras el spike P4-01; antes provisional desde 2026-10-08)
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

**2026-10-09 — avance de P4-01 (#29):** disponibles nueve muestras propias (tres variantes
por familia), visor con color por ranura y descarga GLB, y comparación con tres GLB
CC0 de Kenney con licencia y versión verificadas. Véase
[informe de muestras](../research/ASSET_SPIKE_P4_01.md). La geometría propia ofrece
control de variantes y ranuras; los modelos CC0 usados son más simples y mucho más ligeros.
Se propone mantener la mezcla por categoría y evaluar la vía propia para silla gaming.
La ADR sigue **provisional** hasta recoger la valoración visual del propietario,
la prueba con tres personas y la comparación en la sala del editor. No se da por
cerrada #29 ni se integra el experimento como código de producto.

**2026-10-10 — decisión (cierra P4-01, #29):** el propietario da el visto bueno a las nueve
muestras propias y pide aplicarlas al editor. Queda aceptado:
- **Modelos propios generados por código y exportados a GLB** (`tools/spikes/model-variants`, sin
  assets de terceros, `LicenseRef-RoomForge-Proprietary`) para escritorios, sillas gaming y monitores,
  con **ranuras de color** semánticas por modelo (p. ej. tablero/estructura/detalles).
- Los GLB **CC0** siguen siendo la vía para objetos orgánicos (planta, sofá, puf) cuando el lote lo
  necesite, siempre con licencia y procedencia registradas en el manifiesto.
- Presupuesto por modelo: ≤ 20 000 triángulos y ≤ 300 kB, 3–4 ranuras, carga perezosa del catálogo.
- La evaluación con tres personas queda como seguimiento de la beta (P8-04), no bloquea la integración.
