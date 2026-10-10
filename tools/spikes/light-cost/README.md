# Coste de luces — prototipo desechable P2-11 / #28

Página independiente que mide, en una sala de 5 × 4 m con 30 objetos (≈87 draw calls,
≈54 k triángulos), el coste de `PointLight`, `SpotLight` y `RectAreaLight` con
`MeshStandardMaterial`, `MeshPhongMaterial` y `MeshLambertMaterial` (N = 0, 2, 4, 8, 16),
sombras (ninguna, sol 2048², puntual 1024²), 20 tiras emisivas y bloom, y qué cambios de luz
recompilan shaders. No es código de producto: no lo importa `apps/web` y se puede borrar
cuando P5-05 implemente el pool definitivo.

Desde la raíz del repositorio, con las dependencias ya instaladas:

```powershell
node tools/spikes/light-cost/build.mjs
node tools/spikes/light-cost/run.mjs            # d3d11 (GPU real) y swiftshader
node tools/spikes/light-cost/run.mjs swiftshader # solo CPU
```

`run.mjs` levanta `apps/web/scripts/serve-static.mjs` en el puerto **4197**, abre el Chromium
de Playwright del proyecto (un navegador nuevo por medición, sin caché de shaders) y escribe
`dist/results-<backend>.json` y capturas en `dist/screenshots/`. `dist/` está ignorada por Git.

Para medir en otro equipo (p. ej. el portátil de referencia con GPU integrada) basta con servir
`dist/` y abrir la página en Chrome: `?auto=1&w=1920&h=1080&k=120&r=3` mide la matriz,
`?auto=1&mode=recompile` el experimento de recompilación, y el botón «Copiar JSON» copia los datos.
`?view=point-8`, `?view=rect-8`, `?view=point-0+strips` o `?view=point-8+bloom` muestran la escena
nocturna para comparar el aspecto.

Método: cada configuración renderiza un primer frame (incluye compilación) y luego 5 de
calentamiento y K medidos. Cada frame se sincroniza con `readPixels` de 1 px (tiempo de pared =
CPU + GPU + sincronización) y, si existe `EXT_disjoint_timer_query_webgl2`, se mide el tiempo de
GPU. Se repite la matriz `r` veces y se toma la mediana. El informe con los resultados está en
`docs/research/LIGHT_COST_P2_11.md`. three se copia desde `apps/web` (licencia MIT en
`dist/vendor/LICENSE`); no se añade ninguna dependencia.
