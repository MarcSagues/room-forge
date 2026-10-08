# ADR-0003 — Estado en capas y comandos con parches de Immer

- **Estado:** **Aceptada** (2026-10-08)
- **Fecha:** 2026-10-08
- **Revisar cuando:** documentos >5 000 entidades, o necesidad de colaboración en tiempo real.

## Contexto
Hay que soportar undo/redo fiable, autoguardado, comandos reutilizables por la IA, y un viewport a 60 fps sin re-renders innecesarios. Mezclar todo en un único store React provoca problemas de rendimiento y de corrección.

## Decisión
1. **Cuatro capas de estado** (documento, sesión de editor, UI, interacción transitoria) — ver ARCHITECTURE §3.
2. El documento es **JSON inmutable** modificado **solo** por **Comandos** que se ejecutan con `produceWithPatches` de **Immer**; el historial almacena `patches` e `inverse` (undo/redo sin escribir inversos a mano).
3. El store es `zustand/vanilla` dentro de `core` (sin React); `web` lo consume con hooks y selectores.
4. Los gestos continuos (arrastre) **no** pasan por el store: se hace commit de **un** comando al soltar.
5. Los comandos validan invariantes y devuelven `Result` (no lanzan por errores de dominio).

## Alternativas consideradas
| Alternativa | Pros | Contras | Por qué no |
|---|---|---|---|
| Comando con `undo()` manual | Control total | Doble implementación, fuente de bugs | Immer lo da gratis y es verificable con property tests. |
| Snapshots completos por paso | Trivial | Memoria creciente; no sirve para sincronizar | Documentos pequeños lo toleran, pero los patches habilitan colaboración/IA. |
| Redux Toolkit | Maduro, devtools | Más boilerplate; Zustand ya viene con R3F | Sin ventaja decisiva. |
| Yjs/CRDT desde ya | Colaboración | Complejidad enorme | Fuera del MVP; patches dejan la puerta abierta. |
| Todo en React state/context | Sencillo | Re-renders masivos en el canvas | Incompatible con el rendimiento buscado. |

## Consecuencias
- (+) Undo/redo, autosave incremental y logs de operaciones con la misma pieza.
- (+) Tests de propiedades: `undo ∘ apply = identidad`.
- (−) Immer añade ~3 kB gz y requiere `enablePatches()`.
- (−) Disciplina: nadie muta el documento fuera de un comando (regla de review en AGENTS.md; el store expone el documento como `DeepReadonly`).

## Verificación
P2-02/P2-03: suite fast-check de 1 000 secuencias aleatorias; P2-09: test de conteo de renders.
