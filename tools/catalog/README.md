# tools/catalog — pipeline del catálogo

Genera los modelos propios del catálogo (ADR-0007) a partir de código. Nada de la salida se edita a mano.

```bash
pnpm catalog:build                                   # modelos, miniaturas nuevas, manifiesto y ATTRIBUTION.md
node tools/catalog/build-models.mjs --thumbnails     # además vuelve a dibujar todas las miniaturas
node tools/catalog/build-models.mjs --check          # no escribe nada; falla si algo no coincide (corre en pnpm check)
pnpm catalog:validate                                # --check + tests del manifiesto
```

## Qué hace `pnpm catalog:build`

1. **Geometría** (`models.mjs`): cada variante se construye con three.js; las piezas de un mismo color se fusionan y sus vértices se sueldan (`mergeVertices`). Se gira para que el frente mire a +Z y se comprueba que cabe en la caja declarada.
2. **Optimización** (`optimize.mjs`): cuantización `KHR_mesh_quantization` —posiciones a int16 dentro de un cubo que la transformación del nodo devuelve a metros, normales a int16 y UV a uint16 si caben en [0, 1]—. three la lee sin decodificador, así que la CSP estricta no necesita `wasm-unsafe-eval`. El cargador (`asset-library/models/load-model.ts`) la convierte a float al cargar. Soldar, deduplicar y podar ya no tienen nada que hacer: el generador suelda y el exportador solo escribe lo que hay en la escena, un material por ranura.
3. **Nombres con hash**: `models/<catalogId>.<sha256:10>.glb` y `thumbnails/<catalogId>.<sha256:10>.webp`. El manifiesto apunta al nombre con hash; el host los sirve con `Cache-Control: immutable`. Los archivos que el manifiesto ya no nombra se borran.
4. **Miniaturas** (`thumbnails.mjs`): WebP de 256 px con fondo transparente, dibujadas con three en el Chromium headless de Playwright (SwiftShader), con la misma cámara (tres cuartos desde delante a la derecha), luces y colores por defecto del manifiesto. Solo se dibujan las de los modelos cuyo archivo cambió; el resto se conserva.
5. **Manifiesto** (`apps/web/src/asset-library/manifest/catalog.json`) y `docs/ATTRIBUTION.md`, y el **informe de presupuestos** (triángulos, materiales, bytes de textura, bytes antes/después) en la consola.

Es idempotente: con la misma entrada da los mismos bytes y hashes (lo comprueban `tools/checks/catalog-models.test.mjs` y `catalog-pipeline.test.mjs`). `--check` no dibuja: en CI el render puede variar algún píxel, así que comprueba que cada miniatura existe y que su nombre lleva el hash de su contenido.

## Añadir un modelo

1. Añade la variante a `variants` (y su familia a `slots` si es nueva) en `models.mjs`.
2. Añade su id de catálogo y nombres en `CATALOG` de `build-models.mjs` (y en `LIGHTS`/`DOUBLE_SIDED` si aplica).
3. `pnpm catalog:build`: revisa el informe (≤ 20 000 triángulos, ≤ 300 kB) y mira la miniatura nueva en `apps/web/public/assets/thumbnails/`.
4. Ajusta los tests que cuentan los modelos (`manifest.test.ts`, `catalog-models.test.mjs`) y ejecuta `pnpm check`.
5. Haz commit de todo lo generado: GLB, WebP, manifiesto y `ATTRIBUTION.md`.

## Fuera de alcance (por ahora)

Texturas WebP/KTX2, simplificación y Meshopt/Draco: los modelos propios no tienen texturas ni triángulos de sobra, y Meshopt/Draco necesitan un decodificador WebAssembly (`wasm-unsafe-eval` en la CSP). Se reconsiderarán si entran assets de terceros (`assets-src/`).
