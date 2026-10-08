# ADR-0006 — Estrategia de render con React Three Fiber

- **Estado:** **Aceptada (provisional)** (2026-10-08) — se confirma o enmienda con los datos de los spikes P2-11 y P5-05
- **Fecha:** 2026-10-08
- **Revisar cuando:** los presupuestos de [R3F_PERFORMANCE §3](../research/R3F_PERFORMANCE.md) no se cumplan en el hardware de referencia, o WebGPU alcance madurez en el ecosistema usado.

## Contexto
Editor con interacción continua, iluminación dinámica y objetivo de funcionar en GPU integrada. Los problemas típicos de R3F son re-renders por estado, asignaciones en el bucle, recursos duplicados/dispuestos y recompilación de shaders.

## Decisión
1. `Canvas frameloop="demand"` + puente `document:changed → invalidate()`.
2. Ningún `setState` en `useFrame`/`pointermove`; interacción por refs + controladores; transient store ≤1 act/frame.
3. Una vista por entidad con suscripción granular; `ResourceRegistry` y `MaterialFactory` con conteo de referencias.
4. **Pool fijo de luces** por nivel de calidad, con presupuesto; emisivo + bloom para el resto.
5. Una sola sombra direccional acotada a la sala; sin sombras de luces puntuales por defecto.
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

## Verificación
P2-06 (spike de `demand`), P2-09 (conteo de renders), P5-05 (spike del pool), P7-03/P7-04 (presupuestos y profiling).
