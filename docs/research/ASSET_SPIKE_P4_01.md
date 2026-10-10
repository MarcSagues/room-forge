# P4-01 — Muestras de catálogo y color editable

Fecha: 2026-10-09 · Issue: #29 · Épica: #4 · Rama experimental: `spike/29-model-variants`.

Se han producido nueve modelos propios, con tres variantes por familia. La propuesta
es un estilo geométrico estilizado, bordes redondeados, materiales PBR simples y
acentos independientes. El visor permite girar cada modelo, cambiar colores, alternar
día/noche y descargar un GLB que conserva los colores elegidos.

No se considera cerrada #29: quedan la valoración del propietario, la evaluación con
tres personas y las capturas en una sala del editor. Las capturas actuales utilizan
un estudio neutro con suelo, iluminación fija y sombra, para comparar el mismo encuadre.
La elección artística siguiente es una propuesta, no una decisión de aceptación simulada.

## Entregables y medidas

Generador y visor reproducibles: `tools/spikes/model-variants/`.
Los resultados se generan en su carpeta `dist/`, ignorada por Git.

| Modelo propio | Variantes | Ranuras editables |
|---|---|---|
| Escritorio | Oficina 140, gaming 160, estudio 160 | Tablero, estructura, detalles |
| Silla gaming | Deportiva, ergonómica de lamas, acolchada | Tapizado, estructura, costuras/detalles |
| Monitor | Plano 27, curvo 34, brazo 27 | Carcasa, soporte, pantalla emisiva |

Las medidas son metros; origen a altura del suelo, frente hacia -Z. El manifiesto
registra tanto la envolvente declarada como la medida real calculada. No se ha
implementado aún la parametrización continua de dimensiones ni `supports` del catálogo.
La variante de silla «ergonómica» representa lamas estilizadas, no una textura de malla.

| Archivo | Triángulos | Bytes GLB |
|---|---:|---:|
| desk-office | 3 300 | 98 108 |
| desk-gaming | 2 480 | 75 604 |
| desk-studio | 2 560 | 78 896 |
| chair-racing | 4 736 | 145 792 |
| chair-mesh | 6 276 | 190 404 |
| chair-executive | 4 436 | 137 216 |
| monitor-flat | 1 320 | 43 176 |
| monitor-wide | 880 | 32 260 |
| monitor-arm | 1 328 | 43 480 |
| **Total** | **27 316** | **844 936** |

Todos tienen tres materiales y cero texturas de modelo. Las partes de una misma ranura
se agrupan en una malla y sus vértices se deduplican. Los GLB no tienen compresión Meshopt/Draco:
ya quedan por debajo de 200 kB cada uno; la optimización definitiva corresponde a #51.

## Comparación con GLB CC0

Se descargó [Furniture Kit desde Kenney](https://kenney.nl/assets/furniture-kit), se verificó
la declaración CC0 del sitio y el `License.txt` del ZIP. Hash SHA-256 del ZIP:
`e67652d0932cee41683f74711c03d3e192a2af9979ef8e6b237711f5482d46b0`.
La página dice versión 1.0 y el archivo de licencia dice 2.0; se conserva esa discrepancia
en `source.json` y el hash identifica exactamente el archivo usado.

Los originales `desk`, `chairDesk` y `computerScreen` se conservan sin modificaciones.
En el visor de comparación se gira el frente y se aplica escala uniforme y centrado
para encuadrarlos con los modelos propios. No se alteran sus proporciones ni se
presenta la silla de oficina como una silla gaming.

| Referencia CC0 | Triángulos | Bytes GLB | Materiales | Texturas |
|---|---:|---:|---:|---:|
| desk | 198 | 15 048 | 2 | 0 |
| chairDesk | 588 | 39 016 | 2 | 0 |
| computerScreen | 72 | 6 404 | 2 | 0 |

`dist/cc0-comparison.png` muestra cada pareja en día y noche, bajo la misma cámara y
las mismas luces. Kenney aporta una alternativa mucho más ligera, pero su escritorio
cerrado, silla de oficina y monitor básico no cubren las variantes gaming propuestas.
Los modelos propios aportan control de diseño, biseles y ranuras semánticas uniformes.
Ambas vías son compatibles con color editable; importar un GLB requiere mapear sus
materiales originales a las ranuras del manifiesto, no tintar indiscriminadamente todo.

El informe `dist/verification.json` conserva tiempos de lectura/parseo por ejecución.
En una ejecución local, el parseo de nuestros GLB en Node estuvo entre 0,5 y 7 ms;
las referencias CC0 en navegador, incluyendo descarga desde localhost, entre 5 y 17 ms.
**No son tiempos comparables ni una medida de carga en 4G**: usan entornos distintos,
no incluyen todos los shaders ni la primera subida de geometría a GPU. La elección
de vía se propone por control visual y mantenimiento, no por ese benchmark preliminar.

## Color, reutilización y rendimiento

El cambio de color conserva los mismos identificadores de geometría, modifica una
única ranura y no afecta a otra variante o instancia. Dos instancias comparten geometría,
pero usan materiales independientes en este experimento. En producto los materiales
deben obtenerse de `MaterialFactory` por clave de preset/tinte, y las geometrías del
`ResourceRegistry`; el experimento no constituye la implementación de #49 o #55.

El visor renderiza bajo demanda: no tiene bucle continuo. Mantiene tres luces fijas;
el modo día/noche cambia sus intensidades. Antes de recorrer variantes,
`renderer.info.memory.geometries` = 4; al recorrer las nueve, = 28 (27 ranuras cacheadas
+ suelo). Las texturas del renderer incluyen los recursos de sombra, aunque los modelos
no tienen imágenes. Por objeto visible se midieron hasta 7 llamadas de dibujo y
12 554 triángulos contando pasada de sombra y suelo. En reposo dejan de producirse frames.

El presupuesto propuesto sigue siendo ≤20 000 triángulos y ≤300 kB por modelo,
tres o cuatro ranuras por item y ≤3 MB de catálogo inicial con carga perezosa.
La caché de este visor se libera al cerrarlo. No se ha medido aún una escena de 30
objetos en GPU integrada, por lo que estas cifras no prueban el objetivo de FPS del MVP.

La descarga guarda los colores personalizados dentro del GLB. La memoria de colores
del visor dura hasta cerrar la página. En el editor los colores deberán persistir en
`PlacedObject.materials`, pasar por comandos reversibles y conservarse en JSON/IndexedDB.

## Propuesta de producción para los 30 items

P = paramétrico propio. G = GLB propio modelado o CC0 adaptado después de verificar
la licencia concreta. Las variantes se proponen aquí; su producción debe incorporarse
al alcance de la issue correspondiente antes de comenzar cada lote.

| ID | Vía propuesta | Variantes de diseño propuestas |
|---|:---:|---|
| desk.office.140 | P | Cuatro patas, panel lateral, caballete |
| desk.gaming.160 | P | Patas T, patas inclinadas, travesaño |
| desk.corner.l | P | Retorno izquierdo, derecho, cajonera lateral |
| chair.gaming | P/G | Deportiva, ergonómica, acolchada; validar estas muestras |
| chair.office | G | Respaldo bajo, alto, malla |
| monitor.27 | P | Peana V, rectangular, brazo |
| monitor.ultrawide.34 | P | Plano, curvo, brazo |
| laptop.generic | P | Compacto, clásico, bisel fino |
| pc.tower.rgb | P | Frontal liso, ventiladores, ventana lateral |
| keyboard.mechanical | P | Completo, compacto, reducido |
| mouse.deskmat | P | Alfombrilla compacta, extendida, esquinas redondeadas |
| speakers.pair | P | Compactos, columna, inclinados |
| headset.stand | P | Soporte T, curvo, doble |
| mic.boomarm | P | Brazo articulado, suspensión, soporte compacto |
| shelf.bookcase | P | Abierta, cubos, puertas inferiores |
| drawer.pedestal | P | Dos cajones, tres cajones, tirador integrado |
| shelf.wall | P | Flotante, escuadras, borde elevado |
| cabinet.sideboard | P | Puertas, cajones, huecos abiertos |
| tv.55 | P | Patas laterales, pedestal, soporte de pared |
| console.generic | P | Horizontal, vertical, compacta |
| beanbag.round | G | Redondo, pera, bajo |
| led.strip | P | Recta, esquina, perfil; longitud 0,5–3 m |
| light.bars.pair | P | Rectas, inclinadas, base circular |
| panel.hex | P | Lineal, racimo, panal |
| lamp.floor | P | Pantalla cónica, cilíndrica, brazo |
| lamp.desk | P | Articulada, cuello flexible, pantalla |
| neon.sign | P | Onda, rayo, anillo; formas genéricas |
| plant.potted | G | Hojas anchas, estrechas, arbusto |
| rug.rect | P | Lisa, borde, patrón geométrico |
| frame.poster | P | Marco fino, grueso, doble borde |

Los nombres no introducen marcas. El color de emisión de LED/RGB queda separado
del color del cuerpo. Los tamaños de teclado y monitor que cambien de variante
necesitan dimensiones y huellas propias; no se reduce la geometría conservando una
huella incorrecta. La UI de selección de variantes y el manifiesto definitivo
corresponden a #48/#50/#55, no al stub actual.

Estimación revisada provisional de contenido, después de #48/#49/#51/#55:
#53 (A) L, 2–3 días ideales; #54 (B) L, 2–3; #56 (C) L, 3–4 por orgánicos/licencias;
#52 (D) L, 2–3. Se estima **tres variantes por item**, sujeto al visto bueno visual y
a la división en issues/PRs que respeten el límite de tamaño. No incluye ampliar
la lógica del editor ni la validación con usuarios. Son estimaciones, no plazos prometidos.

## Verificación ejecutada y revisión pendiente

- Generación: nueve GLB; envolventes dentro de medidas declaradas y límite de triángulos.
- Lectura: los nueve GLB se reabren con `GLTFLoader`, conservando nombres de material.
- Navegador: 18 capturas propias + 6 CC0; sin errores de JavaScript.
- Color: aislamiento por ranura y por instancia, geometría compartida, memoria por variante,
  reset, descarga y reapertura de un GLB con el tablero recoloreado.
- Idiomas: controles ES/EN; render detenido al quedar en reposo.
- Proyecto: `pnpm check` verde; 114 tests de arquitectura y 1 434 tests de Vitest.
  Biome mantiene un aviso previo en `packages/core/src/session/types.ts`.

Para la evaluación con tres personas, registrar por separado: variante preferida,
nota de calidad de 1–5, si reconocen el objeto sin etiqueta y si encuentran/confirman
el cambio de color. No hay resultados de personas inventados. Tras recogerlos,
confirmar o ajustar estilo y estrategia, aceptar la ADR y continuar con los lotes.
