# ADR-0004 — Persistencia local con IndexedDB tras un puerto

- **Estado:** **Aceptada** (2026-10-08)
- **Fecha:** 2026-10-08
- **Revisar cuando:** Fase 9 (cuentas y sincronización) o si el desalojo de almacenamiento genera pérdidas reales de usuarios.

## Contexto
MVP sin backend. Los documentos son pequeños (decenas de KB) pero hay miniaturas (Blob) y varios proyectos. `localStorage` es síncrono y limitado (~5 MB).

## Decisión
- Usar **IndexedDB** mediante **`idb`** con los almacenes `projects`, `documents` y `meta`.
- Exponer un puerto `ProjectRepository` (definido en `core/ports`) con implementación `IndexedDbProjectRepository` en `web/persistence`. En Fase 9 se añade `ApiProjectRepository` (Postgres) detrás del mismo puerto.
- **Autoguardado** con debounce, además de `pagehide`/`visibilitychange`.
- Solicitar `navigator.storage.persist()` y ofrecer recordatorios de copia (exportar JSON).

## Alternativas consideradas
| Alternativa | Pros | Contras | Por qué no |
|---|---|---|---|
| `localStorage` | Trivial | Síncrono, 5 MB, sin Blobs | Insuficiente. |
| Dexie | API rica, consultas | Peso y potencia innecesarios | No hay consultas complejas. |
| OPFS (Origin Private File System) | Archivos grandes | Soporte/ergonomía menor | Para assets pesados futuros. |
| Backend desde el día 1 | Sincronización | Coste, cuentas, privacidad | Fuera de MVP. |

## Consecuencias
- (+) Datos del usuario nunca salen del navegador (privacidad por defecto).
- (−) El navegador puede desalojar datos (p. ej. Safari por inactividad, modo privado) ⇒ mitigaciones y UX de copia de seguridad.
- (−) Sin sincronización entre dispositivos hasta la Fase 9 (mitigado por exportar JSON y enlaces).

## Verificación
P6-02 (tests con `fake-indexeddb`), P6-03 (autosave), P6-09 (robustez), P7-01 (E2E de persistencia tras recarga), P7-07 (WebKit).
