# ADR-0006 — Estrategia de render con React Three Fiber

- **Estado:** **Aceptada (provisional)** (2026-10-08) — enmendada el 2026-10-10 con el spike P2-11 (puntos 4 y 5); queda provisional hasta medir en la GPU integrada de referencia (Q7) y validar en P5-05
- **Fecha:** 2026-10-08
- **Revisar cuando:** los presupuestos de [R3F_PERFORMANCE §3](../research/R3F_PERFORMANCE.md) no se cumplan en el hardware de referencia, o WebGPU alcance madurez en el ecosistema usado.

## Contexto
Editor con interacción continua, iluminación dinámica y objetivo de funcionar en GPU integrada. Los problemas típicos de R3F son re-renders por estado, asignaciones en el bucle, recursos duplicados/dispuestos y recompilación de shaders.

## Decisión
1. `Canvas frameloop="demand"` + puente `document:changed → invalidate()`.
2. Ningún `setState` en `useFrame`/`pointermove`; interacción por refs + controladores; transient store ≤1 act/frame.
3. Una vista por entidad con suscripción granular; `ResourceRegistry` y `MaterialFactory` con conteo de referencias.
4. **Pool fijo de luces** por nivel de calidad, con presupuesto; emisivo + bloom para el resto. Tras P2-11: pool por tipo **Baja 4 Point · Media 8 Point + 2 Spot · Alta 12 Point + 4 Spot**; sin `RectAreaLight` en el MVP; las luces libres se apagan con `intensity = 0` (nunca `visible = false`, añadir/quitar ni cambiar de tipo en caliente).
5. Una sola sombra direccional acotada a la sala, **estática** (`shadowMap.autoUpdate = false`, se actualiza al cambiar objetos); ninguna luz del pool proyecta sombras.
6. Calidad adaptativa (`PerformanceMonitor`, `dpr` adaptativo, regresión al orbitar) y selector manual.
7. Exportar PNG vía render target fuera de pantalla (sin `preserveDrawingBuffer`).
8. `WebGLRenderer` (no WebGPU) en el MVP.

## Alternativas consideradas
| Alternativa | Por qué no (ahora) |
|---|---|
| `frameloop="always"` | Consume GPU/batería sin necesidad. |
| three imperativo puro (sin R3F) | Pierde ergonomía de componentes; R3F es parte del stack acordado. |
| WebGPU | Compatibilidad de librerías de postproceso/drei no verificada; beneficio incierto a esta escala. |
| Luces dinámicas ilimitadas | Coste de shader por luz y recompilación al cambiar su número. |
| Instancing desde el inicio | ≤300 objetos, poca repetición. |

## Consecuencias
- (+) GPU en reposo ≈ 0; interacción fluida; sin tirones al encender/apagar luces.
- (−) Más disciplina (invalidate explícito, refs); más código de infraestructura (registry, pool).
- (−) Con `demand`, toda mutación fuera de React debe llamar a `invalidate()` (riesgo de «no se actualiza»): se cubre con helper `mutate(fn)` que invalida y con tests E2E.

## Enmienda 2026-10-10 — resultados de P2-11
Datos en [LIGHT_COST_P2_11](../research/LIGHT_COST_P2_11.md) (RTX 3060 por D3D11 y SwiftShader; **sin GPU integrada todavía**):
- Cambiar color, intensidad o posición no recompila; añadir/quitar luces, `visible = false`, `castShadow` o cambiar el tipo sí (100–190 ms por programa y variante de material). El pool fijo queda confirmado.
- Coste por luz extra (Standard, GPU, 1080p): Point 0,017 ms, Spot 0,026 ms, RectArea 0,082 ms; en CPU (SwiftShader) 3,5 / 4,9 / 12,3 ms. RectArea compila en 0,5–1,3 s con 8–16 luces.
- Sombra del sol estática: +0,04 ms frente a +0,15 ms si se actualiza cada frame; una puntual con sombra duplica de largo los draw calls.
- Emisivos: coste de un draw call. El *composer* intermedio cuesta más que el bloom; el bloom debe ser selectivo (solo emisivos) y a media resolución en calidad media.

## Verificación
P2-06 (spike de `demand`), P2-09 (conteo de renders), P5-05 (spike del pool), P7-03/P7-04 (presupuestos y profiling).
