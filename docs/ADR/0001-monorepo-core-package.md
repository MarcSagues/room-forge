# ADR-0001 — Monorepo pnpm con `core` puro y `web`

- **Estado:** **Aceptada** (2026-10-08)
- **Fecha:** 2026-10-08
- **Decisores:** Marc (propietario) + equipo de planificación
- **Revisar cuando:** el número de paquetes necesarios supere 4, o aparezca un segundo consumidor de `core` que justifique más separación (p. ej. servidor de IA).

## Contexto
El brief exige que «el motor del editor no debe depender directamente de los componentes React». Una carpeta `src/core` con una regla de lint depende de disciplina y de que la regla no se desactive. Además, `core` (dominio, comandos, historial, serialización) es lógica pura que se beneficia de tests rápidos en Node y que la Fase 9 reutilizará en servidor (validación, generador de IA).

## Decisión
Usar un **workspace pnpm con dos paquetes**: `packages/core` (TypeScript puro; `tsconfig` con `lib: ["ES2023"]`, sin `react`, `three` ni DOM) y `apps/web` (Next.js). Los módulos restantes (scene-engine, asset-library, persistence, export, editor, ui, ai) son **carpetas dentro de `apps/web/src`** con fronteras verificadas por dependency-cruiser.

## Alternativas consideradas
| Alternativa | Pros | Contras | Por qué no |
|---|---|---|---|
| Paquete único con carpetas | Mínima configuración | Pureza solo por convención/lint | Es justo lo que el brief quiere evitar. |
| Monorepo con 6–8 paquetes (`scene-engine`, `catalog`, `persistence`…) | Fronteras máximas | Mucha fricción (builds, versiones, tsconfig) para un equipo de uno | Sobreingeniería. Se extraerán cuando haya un segundo consumidor. |
| Turborepo/Nx | Caché de tareas | Complejidad extra | Con 2 paquetes, `pnpm -r` basta. |

## Consecuencias
- (+) La pureza de `core` es un error de compilación, no una opinión.
- (+) Tests de `core` en Node, ms de arranque.
- (+) Reutilizable en Workers/Node en Fase 9.
- (−) Next debe transpilar `core` (`transpilePackages`) o consumirlo ya compilado; configuración inicial en P1-01.
- (−) Dos `tsconfig` y referencias de proyecto.

## Verificación
P1-02: un test de arquitectura (dependency-cruiser) falla si `core` importa `react`/`three`/DOM; CI lo ejecuta.
