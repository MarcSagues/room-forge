# P2-11 — Coste de luces, sombras, emisivos y bloom

Fecha: 2026-10-10 · Issue: #28 · Épica: E2 · Rama: `spike/28-light-cost` · Prototipo:
[`tools/spikes/light-cost/`](../../tools/spikes/light-cost/README.md) (three 0.186.1, el de `apps/web`).

**Resumen.** El pool fijo de luces queda **confirmado**: cambiar color, intensidad o posición no
recompila; añadir/quitar una luz, ocultarla con `visible = false`, activar `castShadow` o cambiar su
tipo sí, con un tirón de **100–190 ms por programa** (en la app real se multiplica por cada variante
de material en escena). El coste por luz es lineal y pequeño con `PointLight`; `SpotLight` cuesta
≈1,4× y `RectAreaLight` ≈3,5–5× una puntual. Las tiras emisivas son casi gratis; lo caro del bloom
es el *composer* (render a destino HalfFloat con MSAA) más que el propio bloom. **Falta la medición en
una GPU integrada real** (Q7 sigue abierta; ver §3): las cifras absolutas no deben leerse como FPS
del hardware de referencia.

## 1. Método

- **Escena** (fija en todas las configuraciones): sala de 5 × 4 m (suelo y dos paredes), 30 objetos
  tipo mueble con geometrías y materiales compartidos (8 colores): **87 draw calls, 54 348
  triángulos**. Base de iluminación siempre presente: `HemisphereLight` + `DirectionalLight` (sol,
  sin sombra salvo en los casos de sombra). Tono ACES, `antialias: true`, `dpr = 1`.
- **Luces de usuario**: N = 0, 2, 4, 8, 16 repartidas por las paredes como tiras/barras/lámparas,
  colores RGB distintos. `PointLight` (distancia 5, decay 2), `SpotLight` (ángulo 0,7, penumbra 0,4)
  y `RectAreaLight` (1 × 0,06 m, solo con `MeshStandardMaterial`). Materiales: Standard, Phong y Lambert.
- **Sombras** (sobre Standard + 8 puntuales): ninguna; sol 2048² actualizado cada frame; sol 2048²
  estático (`shadowMap.autoUpdate = false`, como fija ARCHITECTURE §6.3); 1 puntual 1024² (cubo, 6 pasadas).
- **Brillo**: 20 tiras emisivas (`MeshBasicMaterial`, `toneMapped: false`, color ×4) sin luces y con
  8 puntuales; `EffectComposer` (destino HalfFloat, MSAA 4×) sin bloom; `UnrealBloomPass` a
  resolución completa y a media resolución.
- **Medida**: por configuración, 1 frame de compilación (se mide `firstFrameMs` y
  `renderer.info.programs.length`), 5 de calentamiento y K medidos. Cada frame se sincroniza con
  `readPixels` de 1 px: **tiempo de pared** = CPU + GPU + sincronización. Si existe
  `EXT_disjoint_timer_query_webgl2`, **tiempo de GPU** por frame. Se da la mediana (y p95). En GPU la
  matriz se repite 3 veces y se toma la mediana de las medianas.
- **Recompilación**: experimento aparte, en un navegador nuevo (sin caché de shaders), con
  Standard + 8 puntuales: se aplica cada cambio y se mide programas antes/después y el primer frame.
- **Entornos** (Chromium de Playwright del proyecto, headless):

| Backend | GPU (`UNMASKED_RENDERER`) | Resolución | K × repeticiones | Timer query |
|---|---|---|---|---|
| `d3d11` | NVIDIA GeForce RTX 3060 (dedicada, D3D11 vía ANGLE) | 1920 × 1080 | 120 × 3 | sí |
| `swiftshader` | SwiftShader (rasterizador por **CPU**, Ryzen 7 5700G) | 1280 × 720 | 30 × 1 | sí (emulado) |

Reproducir: `node tools/spikes/light-cost/build.mjs && node tools/spikes/light-cost/run.mjs`
(puerto 4197). Los JSON completos quedan en `tools/spikes/light-cost/dist/` (ignorada por Git).

## 2. Resultados

### 2.1 Coste por tipo y número de luces (ms de GPU por frame, mediana)

| Material / tipo | N=0 | 2 | 4 | 8 | 16 | ms por luz extra |
|---|---:|---:|---:|---:|---:|---:|
| **RTX 3060 · 1080p** | | | | | | |
| Standard · Point | 0,067 | 0,100 | 0,134 | 0,210 | 0,345 | 0,017 |
| Standard · Spot | 0,067 | 0,106 | 0,148 | 0,231 | 0,481 | 0,026 |
| Standard · RectArea | 0,067 | 0,272 | 0,461 | 0,852 | 1,378 | 0,082 |
| Phong · Point | 0,059 | 0,082 | 0,111 | 0,174 | 0,297 | 0,015 |
| Phong · Spot | 0,059 | 0,087 | 0,123 | 0,194 | 0,336 | 0,017 |
| Lambert · Point | 0,054 | 0,083 | 0,108 | 0,163 | 0,267 | 0,013 |
| Lambert · Spot | 0,054 | 0,102 | 0,135 | 0,212 | 0,352 | 0,019 |
| **SwiftShader · 720p** | | | | | | |
| Standard · Point | 22,6 | 29,1 | 33,4 | 47,5 | 78,4 | 3,5 |
| Standard · Spot | 22,6 | 29,6 | 39,5 | 56,7 | 100,5 | 4,9 |
| Standard · RectArea | 22,6 | 43,0 | 68,9 | 115,6 | 219,6 | 12,3 |
| Phong · Point | 16,9 | 23,0 | 31,0 | 47,4 | 90,8 | 4,6 |
| Phong · Spot | 16,9 | 26,1 | 37,1 | 60,1 | 107,1 | 5,6 |
| Lambert · Point | 14,8 | 17,7 | 21,2 | 28,8 | 44,4 | 1,9 |
| Lambert · Spot | 14,8 | 19,6 | 26,0 | 38,3 | 61,0 | 2,9 |

Tiempo de pared en RTX 3060: 0,7–1,0 ms en todas las filas salvo RectArea 8/16 (1,6/2,2 ms): domina
la sincronización y el envío de 87 draw calls, no las luces. En SwiftShader el tiempo de pared es el de
GPU + ≈1,7 ms. Primer frame (compilación) con Standard: 50 ms (0 luces) → 106 ms (8) → 237 ms (16)
Point; **RectArea: 498 ms (8) y 1 284 ms (16)**.

### 2.2 Sombras (Standard + 8 Point; ms de GPU)

| Caso | RTX 3060 | Δ | SwiftShader | Δ | Draw calls |
|---|---:|---:|---:|---:|---:|
| Sin sombras | 0,335 | — | 49,0 | — | 87 |
| Sol 2048², cada frame | 0,480 | +0,15 | 62,8 | +13,8 | 174 |
| Sol 2048², estática | 0,372 | +0,04 | 54,7 | +5,7 | 87 |
| 1 Point 1024², cada frame | 0,449 | +0,11 | 69,5 | +20,5 | 211 |

La sombra estática solo cuesta el muestreo del mapa (los draw calls no se duplican). La sombra
puntual repite la escena 6 veces (cubo): +124 draw calls por luz.

### 2.3 Emisivos y bloom (ms de GPU)

| Caso | RTX 3060 | SwiftShader | Draw calls |
|---|---:|---:|---:|
| 20 tiras emisivas, 0 luces (vs 0 luces sin tiras) | 0,111 (0,067) | 20,6 (22,6) | 107 |
| 20 tiras + 8 Point, render directo | 0,359 | 47,2 | 107 |
| … + `EffectComposer` sin bloom (HalfFloat, MSAA 4×) | 0,736 | 128,7 | 108 |
| … + bloom a resolución completa | 1,014 | 232,7 | 121 |
| … + bloom a media resolución | 0,848 | 205,1 | 121 |

Una tira emisiva cuesta lo que un draw call de una malla pequeña (≈0,002 ms en la RTX 3060); en
SwiftShader no se distingue del ruido. El *composer* (destino intermedio + MSAA + pasada de salida)
cuesta más que el bloom. Visualmente, `UnrealBloomPass` con umbral 1 sobre la escena HDR hace brillar
también las paredes cercanas a las luces y lava la imagen (captura `point-8+bloom`): el bloom tiene
que ser **selectivo** (solo emisivos), como ya dice ARCHITECTURE §6.3.

### 2.4 Recompilación de shaders (Standard + 8 Point, navegador sin caché)

| Cambio | Programas antes → después | 1.er frame RTX 3060 | 1.er frame SwiftShader |
|---|---|---:|---:|
| Escena inicial | 0 → 1 | 158 ms | 142 ms |
| Color de todas las luces | 1 → 1 | 12 ms | 92 ms |
| Intensidad de todas | 1 → 1 | 2 ms | 51 ms |
| Mover todas | 1 → 1 | 2 ms | 52 ms |
| `intensity = 0` en 3 («apagar») | 1 → 1 | 1 ms | 56 ms |
| **`visible = false` en 1** | 1 → **2** | **100 ms** | **134 ms** |
| `visible = true` de nuevo | 2 → 2 (reutiliza) | 1 ms | 54 ms |
| **Añadir una 9.ª luz** | 2 → **3** | **122 ms** | **143 ms** |
| Quitarla (vuelve a 8) | 3 → 3 (reutiliza) | 2 ms | 54 ms |
| **`castShadow` en 1 Point** | 3 → **5** | **134 ms** | **191 ms** |
| `castShadow` desactivado | 5 → 5 | 1 ms | 51 ms |
| **Cambiar 1 Point por Spot** | 5 → **6** | **107 ms** | **138 ms** |
| Encender 20 tiras emisivas | 6 → 7 (MeshBasic nuevo) | 9 ms | 74 ms |

En SwiftShader el frame normal ya dura ≈50 ms; el tirón real es la diferencia (≈80–140 ms). three
guarda los programas ya vistos, así que volver a una configuración anterior no recompila; pero cada
combinación nueva de número/tipo de luces o sombras compila **una vez por variante de material**
(Standard con y sin textura, Physical, etc.). Con 5–10 variantes en una sala real el tirón sería de
0,5–1,5 s, inaceptable al pulsar un interruptor.

**Conclusión: «un pool fijo evita recompilar» se confirma**, con dos matices: apagar una luz del
pool se hace con `intensity = 0` (nunca `visible = false` ni sacarla de la escena) y el reparto por
tipo (Point/Spot) y las sombras también deben quedar fijos.

## 3. Qué es y qué no es representativo

- **Representativo**: qué cambios recompilan (es lógica de three, igual en cualquier GPU); el orden de
  costes entre tipos de luz, materiales, sombras y postproceso; que el coste por luz es lineal; el
  número de draw calls; el tirón de compilación en órdenes de magnitud (ANGLE/D3D11 en Windows, como
  la mayoría de portátiles del público objetivo).
- **No representativo**: los ms absolutos. La RTX 3060 es una GPU dedicada (≈12,7 TFLOPS, 360 GB/s),
  unas **5–7× más rápida** que una integrada moderna tipo Intel Iris Xe o Radeon Vega 8 (≈2 TFLOPS,
  memoria compartida). SwiftShader rasteriza en CPU: es mucho más lento que cualquier GPU y penaliza
  en exceso el ancho de banda (por eso el *composer* le cuesta tanto); sirve para costes relativos de
  ALU y para CI, **no** para FPS. La escena es sintética (sin texturas, sin GLB, sin rejilla ni gizmos).
- **Estimación orientativa para GPU integrada** (RTX × 6, a confirmar): Standard + 8 Point
  ≈1,3 ms; + sol estático ≈0,3 ms; 16 RectArea ≈8 ms; composer + bloom a media resolución ≈3 ms.
  Todo ello cabe con margen en los 22 ms de 45 FPS (NFR-PERF-01) salvo que el bloom supere el
  presupuesto de 3 ms de P5-07, que habrá que vigilar.
- **Pendiente**: el criterio «≥1 GPU integrada real (modelo indicado)» **no se cumple**. En este
  equipo la GPU integrada del Ryzen 7 5700G está desactivada (Windows solo expone la RTX 3060) y Q7
  sigue sin hardware de referencia. Para cerrarlo basta con abrir la página del prototipo en el
  portátil de referencia (`?auto=1&w=1920&h=1080&k=120&r=3` y `?auto=1&mode=recompile`, botón
  «Copiar JSON») y añadir la tabla a este informe.

## 4. Recomendación para P5-05 (y P5-06, P5-07, P5-10)

| Calidad | Pool (reservado al montar) | Sombras | Bloom | Uso previsto |
|---|---|---|---|---|
| Baja | 4 Point | Sol 1024², estática, o desactivada | No | Móvil/visor, equipos lentos |
| Media | 8 Point + 2 Spot | Sol 2048², estática | Selectivo, media resolución | Defecto escritorio |
| Alta | 12 Point + 4 Spot | Sol 2048², estática | Selectivo, resolución completa | GPU sobrada |

1. **Tipos de luz.** `PointLight` para tiras LED, barras y lámparas (una luz en el centro de la tira;
   dos si mide más de 1,5 m y sobra pool). `SpotLight` solo para focos/flexos, con cupo propio en el
   pool. **Sin `RectAreaLight` en el MVP**: 3,5–5× el coste de una puntual, compilación de 0,5–1,3 s,
   solo funciona con Standard/Physical y no da sombras; un panel se aproxima con Point + emisivo.
2. **Pool fijo por tipo y por calidad.** Las luces se crean al montar (y al cambiar de calidad, con
   «Aplicando calidad…» y `renderer.compileAsync` para no bloquear). Las libres quedan con
   `intensity = 0`; nunca `visible = false`, `add/remove`, cambio de tipo ni `castShadow` en caliente.
3. **Sombras.** Solo el sol, con `shadowMap.autoUpdate = false` y `needsUpdate` al cambiar objetos
   (P5-06). Ninguna luz del pool proyecta sombras (cada puntual con sombra = +6 pasadas y
   +2 programas).
4. **Emisivo «falso» para todas las luminarias** (`toneMapped: false`): coste despreciable; es lo
   único que ven las luminarias que no caben en el pool. Si hubiera muchas tiras, fusionar sus mallas
   por material para no sumar draw calls.
5. **Bloom (P5-07)** selectivo sobre emisivos (no sobre toda la escena HDR), a media resolución en
   Media y desactivado en Baja; medir el *composer* en la GPU integrada antes de fijar MSAA en el
   destino intermedio, porque es la parte cara.
6. **Material.** Mantener `MeshStandardMaterial` (coherente con los GLB PBR). Lambert reduce el coste
   por luz a la mitad en CPU y ≈25 % en GPU, pero cambia el aspecto y obliga a recompilar al cambiar
   de calidad; solo se reconsidera si P7-04 lo pide.

## 5. Prototipo

Código en `tools/spikes/light-cost/` (rama `spike/28-light-cost`), sin dependencias nuevas, fuera de
`apps/web` y `packages/core`. Es desechable: P5-05 lo sustituye y puede borrarse entonces, igual que
el de P4-01.
