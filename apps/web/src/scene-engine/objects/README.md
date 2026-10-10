# Vistas por entidad (`scene-engine/objects`)

Patrón obligatorio para dibujar entidades del documento en el canvas (P2-09, ADR-0006, [R3F_PERFORMANCE §2.12](../../../../../docs/research/R3F_PERFORMANCE.md)). Objetivo: **un cambio en una entidad re-renderiza solo su vista**.

## Piezas

| Pieza | Se suscribe a | Re-renderiza cuando |
|---|---|---|
| `ObjectList` | `useEntityIds()`: ids de los objetos apoyados en una sala, comparados con `useShallow` | Se añade, elimina, reordena o cambia de padre un objeto raíz. **Nunca** al mover. |
| `RootObject` → `RoomFrame` | `roomId` del objeto y el origen de su sala como **dos números** | El objeto cambia de sala o la sala se desplaza. |
| `ObjectView id` (`React.memo`) | `useEntity(id, o => o.transform)`, `useEntity(id, o => o.hidden)` | Cambia **ese** objeto. Immer conserva por referencia los objetos no tocados. |
| `ChildObjects` | `useChildIds(parentId)` | Cambian los objetos apoyados en ese padre. Se dibujan dentro del grupo del padre, así que mover el padre no re-renderiza a los hijos. |

`useEntityIds` y `useChildIds` leen un índice padre → hijos que se calcula **una vez por versión del documento** (`WeakMap` por documento): sin él, cada vista filtraría `objectOrder` y un cambio costaría O(n²).

## Reglas

1. Selecciona lo mínimo: un campo o el objeto, nunca el estado entero ni `state.document`.
2. Los selectores que devuelven arrays u objetos nuevos van con `useShallow`.
3. Las vistas por entidad van envueltas en `memo` y reciben solo el `id` como prop.
4. Ocultar es `visible={false}`, no desmontar (regla 7 de AGENTS.md).
5. Geometrías y materiales compartidos, con `dispose={null}`: `placeholderResources()` para las cajas y, para los items con modelo, `ModelBody` (geometrías del registro de modelos, materiales de `MaterialFactory`).

## Registro de refs

`EntityRegistry` (`Map<EntityId, Object3D>`) da a los controladores (arrastre, gizmos) el `Object3D` de una entidad sin pasar por React. Cada `ObjectView` se registra con `useRegisterEntity(id)`, un *ref callback* de React 19 cuya limpieza borra la entrada al desmontar. Una entrada solo la borra quien la registró, así que remontar con el mismo id no deja huecos.

## Cómo se verifica

`object-views.test.tsx` usa `@react-three/test-renderer` (reconciliador de R3F sin WebGL) y el contador `countRender` / `renderCount` (desactivado salvo en tests):

- Con 300 objetos (el máximo del dominio) y una sesión real: mover uno con un comando ⇒ 1 render de su vista, 0 del resto y 0 de la lista; añadir uno ⇒ 1 render de la lista y 0 de las vistas existentes.
- Con 500 objetos (arnés que actualiza el store directamente, porque los comandos rechazan más de 300): mismas condiciones.
- 200 ciclos añadir/eliminar ⇒ el registro conserva su tamaño.
- Quitar `memo` de `ObjectView` hace fallar 4 de los tests (comprobado): el arnés detecta la regresión.
