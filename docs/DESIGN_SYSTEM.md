# RoomForge — Sistema de diseño y UX

> Estado: **borrador para aprobación** · Implementación en P1-05 (tokens/shadcn) y P1-06 (shell).
> Principios y referencias: [PRODUCT.md §5 y §8](PRODUCT.md)

## 1. Personalidad visual

**«Taller de precisión con chispa».** Interfaz sobria, densa y silenciosa (referencia de claridad: Linear) que se aparta para que **la escena y los colores RGB sean los protagonistas**. Una sola nota cálida de acento — *ember* — ligada al nombre «Forge». Nada de neón en la UI: el neón vive en el 3D.

- Neutros fríos (azul-grisáceo) + un acento cálido = contraste con las luces RGB.
- Tema **oscuro por defecto** (el editor se ve mejor y las luces destacan); tema claro disponible.
- Bordes finos, radios moderados, sombras mínimas, movimiento breve y funcional.

## 2. Tokens

Todos los valores de texto verificados con ratio WCAG (cálculo reproducible: ver tabla). Se definen como variables CSS en `:root` y `.dark`/`[data-theme=dark]` y se exponen a Tailwind v4 mediante `@theme`.

### 2.1 Color

| Token | Oscuro | Claro | Uso |
|---|---|---|---|
| `--bg-canvas` | `#0B0D12` | `#F4F5F8` | Fondo de la app |
| `--bg-surface` | `#12151C` | `#FFFFFF` | Paneles |
| `--bg-elevated` | `#1A1E27` | `#FFFFFF` | Popovers, inputs, menús |
| `--bg-hover` | `#232834` | `#ECEEF3` | Fondo de elementos en hover/selección suave |
| `--border-subtle` | `#242A35` | `#DFE3EA` | Separadores (decorativos) |
| `--border-control` | `#5F6A7F` | `#848DA0` | Borde de inputs/botones (≥3:1, WCAG 1.4.11) |
| `--text-primary` | `#E8EBF2` | `#12151C` | Texto principal |
| `--text-secondary` | `#A3ACBD` | `#4A5365` | Etiquetas, ayudas |
| `--text-tertiary` | `#7F889B` | `#646E82` | Placeholders, metadatos |
| `--accent` | `#FF7A45` | `#C2410C` | Acción primaria, selección, foco |
| `--accent-hover` | `#FF8F63` | `#A8350A` | Acción primaria en hover |
| `--accent-fg` | `#1A0B04` | `#FFFFFF` | Texto sobre acento |
| `--success` | `#3DD68C` | `#0F7B4F` | Guardado, válido |
| `--warning` | `#F5B73B` | `#8A5A00` | Avisos, colisión leve |
| `--danger` | `#F2555A` | `#C62828` | Errores, destructivo, colocación inválida |
| `--danger-fg` | `#1A0B04` | `#FFFFFF` | Texto sobre `--danger` (botón destructivo) |
| `--info` | `#5AA9FF` | `#1D5FBF` | Información |

Contrastes calculados (WCAG 2.x):

| Par | Oscuro | Claro |
|---|---|---|
| `text-primary` / `bg-surface` | 15,3 | 18,3 |
| `text-secondary` / `bg-surface` | 8,0 | 7,7 |
| `text-tertiary` / `bg-elevated` | 4,7 | 5,1 |
| `accent` / `bg-surface` | 7,1 | 5,2 |
| `accent-fg` / `accent` | 7,4 | 5,2 |
| `border-control` / `bg-surface` | 3,4 | 3,3 |
| `danger` / `bg-surface` | 5,4 | 5,6 |

> Regla: **nunca** transmitir información solo por color (colocación inválida = rojo **y** icono/etiqueta; luz encendida = color **y** estado textual).

### 2.2 Tipografía

| Rol | Fuente | Tamaño / interlineado | Peso |
|---|---|---|---|
| UI | Inter (variable, *self-hosted*) | 13/18 (base de paneles), 14/20 (diálogos) | 400/500/600 |
| Números y valores | Inter con `font-variant-numeric: tabular-nums` | 12/16 | 500 |
| Código/atajos | JetBrains Mono (subset) o `ui-monospace` | 12/16 | 500 |
| Títulos de página | Inter | 24/32, 32/40 | 600 |

*Self-hosted* (sin Google Fonts en runtime) por rendimiento y privacidad.

### 2.3 Espaciado, forma y elevación

- Rejilla base **4 px**. Escala: 4, 8, 12, 16, 24, 32, 48.
- Radios: `--radius-sm 4px` (inputs, chips), `--radius-md 8px` (tarjetas, botones), `--radius-lg 12px` (diálogos).
- Elevación: paneles planos con borde; solo popovers/diálogos llevan sombra (`0 8px 24px rgb(0 0 0 / .35)` oscuro, `/ .12` claro).
- Densidad: filas de propiedades 28 px; botones 32 px (compactos 28 px); barra superior e inferior 44–48 px.

### 2.4 Movimiento

| Tipo | Duración | Curva |
|---|---|---|
| Micro (hover, foco) | 100 ms | ease-out |
| Paneles/diálogos | 160–200 ms | ease-out |
| Transición de cámara | 450–600 ms | ease-in-out (amortiguada) |
| Día ↔ noche | 700 ms | ease-in-out |

`prefers-reduced-motion`: sin transiciones de cámara animadas (corte directo), sin efectos RGB animados por defecto.

### 2.5 Implementación (P1-05)

- **Tokens:** `apps/web/src/ui/tokens.css` (variables CSS, tema oscuro por defecto; `<html data-theme="light">` para el claro). `apps/web/src/app/globals.css` los expone a Tailwind v4 con `@theme inline`: `bg-canvas`, `bg-surface`, `bg-elevated`, `bg-hover`, `text-fg`, `text-fg-muted`, `text-fg-subtle`, `border-subtle`, `border-control`, `bg-ember`/`text-ember`, `text-success|warning|danger|info`. Los nombres semánticos de shadcn/ui (`background`, `primary`, `muted`, `destructive`…) se mapean sobre estos tokens.
- **Tema:** preferencia `system | light | dark` (por defecto `dark`) en `localStorage` (`rf.theme`). Un script bloqueante en `<head>` (`public/theme-init.js`) fija `data-theme` antes del primer pintado, sin parpadeo; `ui/theme.ts` + `ui/use-theme.ts` lo gestionan en el cliente.
- **Componentes:** shadcn/ui (base Radix) en `apps/web/src/ui/components/`, adaptados a los tokens y a TypeScript estricto. Se importan siempre desde el índice público `@/ui` (regla de fronteras).
- **i18n mínima:** `ui/i18n/` (EN/ES, claves tipadas, sin librería).
- **Catálogo vivo:** `/dev/ui` (solo en desarrollo: `page.dev.tsx` + `pageExtensions`; no se exporta a producción).
- **Verificación:** `tools/checks/contrast.test.mjs` comprueba WCAG de los valores reales y que superan las razones de la tabla de §2.1.

## 3. Layout del editor

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ ◧ RoomForge  ▸ Mi setup ●Guardado    ↶ ↷     [Vista ▾]      Exportar ▾  Compartir │ 48px  (TopBar)
├──────────────┬───────────────────────────────────────────────┬───────────────┤
│ Catálogo     │                                               │ Propiedades   │
│ 🔍 Buscar     │                                               │ ─ Objeto      │
│ [Todo][Escr.]│               VIEWPORT 3D                     │  Nombre       │
│ ┌───┐ ┌───┐  │        (R3F Canvas, cámara orbital /          │  Posición X Z │
│ │ ▢ │ │ ▢ │  │               vista superior)                 │  Rotación     │
│ └───┘ └───┘  │                                               │  Material     │
│ ┌───┐ ┌───┐  │   Hint contextual · Mini ViewCube (futuro)    │  Luz (RGB)    │
│ │ ▢ │ │ ▢ │  │                                               │ ─ Escena      │
│  …           │                                               │  Outliner     │
├──────────────┴───────────────────────────────────────────────┴───────────────┤
│ ⌖ Seleccionar  ⊞ Snap 10cm  ↻ 15°   │ ⬒ Perspectiva ⬓ Superior │ ☀/☾ Día/Noche  💡 Luces │ 44px (BottomBar)
└──────────────────────────────────────────────────────────────────────────────┘
```

| Región | Tamaño | Notas |
|---|---|---|
| TopBar | 48 px | Logo, proyecto (renombrar inline), estado de guardado, undo/redo, menú Exportar, Compartir. |
| Panel izquierdo (Catálogo) | 280 px (240–360, redimensionable, colapsable) | Búsqueda, categorías, rejilla de tarjetas con miniaturas, arrastrar al viewport. |
| Viewport | flexible | Es el protagonista; sin marcos recargados. |
| Panel derecho (Propiedades/Escena) | 300 px (260–380) | Pestañas: **Propiedades** / **Escena** (outliner). |
| BottomBar | 44 px | Herramienta, snap, vista, día/noche, luces globales, calidad. |

### Responsive

| Ancho | Comportamiento |
|---|---|
| ≥ 1280 | Layout completo. |
| 1024–1279 | Paneles más estrechos; el derecho se colapsa a pestañas si el viewport < 640 px. |
| 768–1023 | Paneles como *drawers* superpuestos; edición posible pero no prioritaria. |
| < 768 | **Modo visor**: viewport a pantalla completa, orbitar con táctil, selector de vista y día/noche, banner «Abre en un ordenador para editar». |

## 4. Interacción en el viewport (lenguaje visual 3D)

| Elemento | Representación |
|---|---|
| Fondo | Degradado suave (día: azul pálido; noche: azul muy oscuro), sin skybox pesado. |
| Rejilla | Líneas finas a 10 cm / marcadas cada 1 m, desvanecidas con la distancia; se oculta en exportación. |
| Hover | Contorno fino `--accent` al 60 %. |
| Selección | Contorno `--accent` 100 % + caja de dimensiones con cotas (cm). |
| Fantasma al colocar | Material translúcido: válido = acento; **inválido = `--danger` + icono ⛔**. |
| Guías de snap | Línea acento punteada a pared/objeto cercano; badge «Pared» al alinear. |
| Paredes | Modos *arriba / corte / abajo*; en corte, las que miran a la cámara se atenúan. |
| Techo | Oculto en edición; visible en «Vista previa». |
| Etiquetas | Solo bajo demanda (hover/selección) para no saturar. |

### Gestos y controles

| Acción | Ratón | Teclado |
|---|---|---|
| Orbitar | Botón derecho / arrastrar fondo | — |
| Desplazar | Botón central / `Shift`+arrastrar | `W A S D` (opcional) |
| Zoom | Rueda | `+` `−` |
| Seleccionar | Clic | `Esc` deselecciona |
| Mover | Arrastrar objeto sobre el suelo | Flechas (paso de snap), `Shift` = ×10 |
| Rotar | Asa circular · `R` (+15°) · `Shift+R` (−15°) | `Alt` = sin snap |
| Duplicar | `Alt`+arrastrar | `Ctrl/⌘+D` |
| Eliminar | — | `Supr` / `Retroceso` |
| Deshacer / Rehacer | Botones | `Ctrl/⌘+Z` · `Ctrl/⌘+Shift+Z` / `Ctrl+Y` |
| Alternar snap | Botón | `G` |
| Vista superior / perspectiva | Selector | `1` / `2` |
| Encuadrar sala | Botón | `F` |
| Paredes arriba / corte / abajo | Botón | `W` (cicla) |
| Techo (vista previa) | Botón | `C` |
| Día / Noche | Botón | `N` |
| Paleta de comandos | — | `Ctrl/⌘+K` (P2) |
| Ayuda de atajos | — | `?` |

Los atajos son **datos** (`ShortcutRegistry`), se muestran en el diálogo de ayuda y no se activan mientras hay foco en un campo de texto.

## 5. Componentes

### 5.1 Base (shadcn/ui sobre Radix, estilizados con los tokens)
`Button`, `IconButton`, `Input`, `Select`, `Tabs`, `Tooltip`, `Popover`, `Dialog`, `DropdownMenu`, `Command` (paleta), `Slider`, `Switch`, `ScrollArea`, `Separator`, `Toast (sonner)`, `Resizable` (react-resizable-panels), `Skeleton`.

### 5.2 Específicos del editor (se construyen en la fase indicada)

| Componente | Fase | Descripción |
|---|---|---|
| `Panel`, `PanelSection` | P1-06 | Contenedor con cabecera colapsable. |
| `ScrubInput` | P3-07 | Campo numérico con unidad; **arrastrar la etiqueta cambia el valor** (estilo Figma), flechas ±, `Shift` ×10, Enter confirma, coalescing de historial. |
| `CatalogCard` | P4-06 | Miniatura, nombre, medidas; arrastrable; estado de carga. |
| `ColorField` / `RgbPicker` | P5-03/09 | Selector de color con presets y valor hex; accesible por teclado. |
| `ToolButton` + `Kbd` | P3-09 | Botón de herramienta con tooltip y atajo. |
| `StatusPill` | P3-09/P6-03 | «Guardado · Guardando… · Error». |
| `OutlinerRow` | P3-15 | Fila con visibilidad, bloqueo, renombrado. |
| `ViewportHud` | P3-09 | Pistas contextuales, FPS opcional (dev). |
| `EmptyState` | P6-04 | Ilustración mínima + CTA. |

### 5.3 Estados obligatorios en cada componente interactivo
Default · Hover · Focus-visible (anillo `--accent` 2 px, offset 2 px) · Active · Disabled · Loading · Error.

## 6. Accesibilidad (objetivo WCAG 2.2 AA)

- Navegación completa por teclado en paneles y diálogos; orden de tabulación lógico; *focus trap* en diálogos.
- Objetivos táctiles ≥ 44 px en modo visor móvil; ≥ 24 px en escritorio (WCAG 2.5.8).
- **Outliner** = alternativa accesible al canvas: seleccionar, mover con flechas, renombrar, borrar sin ratón.
- Anuncios `aria-live` para acciones relevantes («Escritorio colocado», «Deshacer: mover»).
- No depender solo del color; contraste verificado (ver §2.1).
- Respeta `prefers-reduced-motion` y `prefers-color-scheme`.
- Comprobación automática con axe en E2E (P7-05).

## 7. Contenido y tono

- Directo, breve, en segunda persona del singular («Arrastra un objeto…»). Sin jerga 3D («mesh», «normales»).
- Mensajes de error **accionables**: qué pasó + qué hacer («No se pudo guardar. Exporta una copia para no perder el diseño.»).
- Textos externalizados (es/en) con claves estables; sin concatenación de frases.
- Nombres de producto del catálogo **genéricos** (sin marcas registradas): «Teclado mecánico», no «Corsair K70».

## 8. Estados vacíos, carga y error

| Situación | Tratamiento |
|---|---|
| Sin proyectos | Estado vacío con CTA «Empezar con una plantilla» / «Sala nueva». |
| Cargando editor | Esqueleto del layout + barra de progreso del Canvas (primera carga ≤5 s). |
| Modelo cargando | Caja *placeholder* con las medidas reales (translúcida). |
| Modelo falló | Caja roja discontinua + etiqueta; el resto sigue funcionando. |
| Sin WebGL / contexto perdido | Pantalla de fallo con explicación, botón «Reintentar» y exportar JSON. |

## 9. Cómo evoluciona
- Los tokens son la única fuente de verdad (`apps/web/src/ui/tokens.css`); cambios de marca = cambiar tokens.
- Un `Storybook` **no** se adopta en el MVP (coste > beneficio); una página interna `/dev/ui` lista los componentes (P1-05).
