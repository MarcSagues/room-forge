# RoomForge — Checklist del visor móvil en dispositivos reales (P7-06)

La emulación de Playwright (`apps/web/e2e/mobile.spec.ts`: Pixel 7 e iPhone 14 en Chromium, con toques reales vía DevTools) comprueba la distribución, el tamaño de los controles, los gestos y que el documento no cambia. **No** mide FPS reales, el comportamiento de Safari/WebKit ni el de las barras del navegador: eso se comprueba a mano con esta lista y se archiva el resultado en la PR (o en `docs/perf/` para los FPS).

## Dispositivos a probar

| Prioridad | Dispositivo | Navegador | Por qué |
|---|---|---|---|
| Obligatorio | Android de gama media (p. ej. Pixel 6a/7a, Galaxy A54 o similar, 2022+) | Chrome | Hardware de referencia móvil del PRD (≥ 30 FPS). |
| Obligatorio | iPhone con *notch* o Dynamic Island (iPhone 12 o posterior) | Safari | WebKit, *safe areas*, barra de direcciones que se esconde. |
| Recomendado | iPad (cualquiera, iPadOS 17+) | Safari | Táctil a ≥ 768 px: debe ser el editor (cajones), no el visor. |
| Opcional | Android de gama baja (≤ 4 GB de RAM) | Chrome | Margen de rendimiento con la calidad baja. |

Hasta que el propietario fije el hardware de referencia (PRD Q7), anotar el modelo exacto, la versión del sistema y la del navegador.

## Preparación

1. Abrir un proyecto en un ordenador con ~30 objetos y algunas luminarias, pulsar **Compartir** y enviarse el enlace.
2. En el móvil, abrir el enlace (`/view/#v1.…`) y también `/editor/`.
3. Para FPS en Android: Chrome → `chrome://inspect` desde el ordenador y el panel *Performance* / *Rendering → Frame rendering stats*. En iOS: Safari del Mac → *Desarrollo* → el iPhone → *Línea de tiempo*.

## Checklist

**Enlace compartido (`/view/`)**
- [ ] Carga y muestra la sala; el aviso «A shared room, read-only» y «Make a copy to edit» se ven completos.
- [ ] Un dedo orbita con fluidez (≥ 30 FPS sostenidos durante 10 s de órbita continua).
- [ ] Dos dedos: pellizcar acerca/aleja y arrastrar desplaza.
- [ ] Doble toque encuadra la sala; el botón **Frame** hace lo mismo.
- [ ] Tocar o arrastrar sobre un objeto **no** lo selecciona ni lo mueve: la cámara orbita.
- [ ] Ningún gesto sobre la escena hace scroll de la página, *pull-to-refresh* ni zoom del navegador.
- [ ] **Perspective / Top / Walls / Frame**: fáciles de pulsar con el pulgar (≥ 44 px) y responden al primer toque.
- [ ] El menú de paredes se abre y se elige una opción sin errores.

**Editor en el móvil (`/editor/`)**
- [ ] Se ve el aviso «Open RoomForge on a computer to edit.», el viewport y los controles de vista; no hay barra superior, catálogo, propiedades ni deshacer.
- [ ] Mismos gestos que en el visor; ningún objeto se puede seleccionar ni mover.

**Rotación y *safe areas***
- [ ] Girar a horizontal: sigue siendo el visor (no aparecen los cajones del editor) y la escena se redimensiona sin saltos ni barras de scroll.
- [ ] En iPhone horizontal, el *notch* no tapa el aviso ni los botones; en vertical, el indicador de inicio no tapa la barra inferior.
- [ ] Volver a vertical: la cámara conserva su encuadre razonable.

**Rendimiento y estabilidad**
- [ ] Con la pantalla quieta, la batería/CPU no trabaja (render bajo demanda: 0 frames sin interacción, visible en el contador de frames de desarrollo).
- [ ] 2 minutos de uso continuado sin recargas, sin «WebGL context lost» y sin calentamiento excesivo.
- [ ] Pasar la app a segundo plano y volver: la escena sigue ahí.

**iPad (recomendado)**
- [ ] En vertical (768 px) y horizontal (1024 px) aparece el editor; los gestos táctiles orbitan en vacío y arrastran objetos.

## Notas conocidas

- La calidad en táctil se fija al cargar: pool de luces bajo (4 puntuales) y DPR ≤ 1,5. Cambiará con el selector de calidad (P5-10).
- Día/noche y luces globales aún no existen (P5-09): el visor móvil solo tiene vista, paredes y encuadre.
