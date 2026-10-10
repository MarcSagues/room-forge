# Muestras de modelos — P4-01 / #29

Nueve modelos propios: tres escritorios, tres sillas gaming y tres monitores. Vista web
independiente con controles de color por ranura, día/noche, ES/EN y descarga de GLB
con los colores elegidos. El editor de producto sigue usando su catálogo provisional.

Desde la raíz del repositorio, con las dependencias ya instaladas:

```powershell
node tools/spikes/model-variants/build.mjs
$env:PORT = '4189'
node apps/web/scripts/serve-static.mjs tools/spikes/model-variants/dist
```

Abrir <http://127.0.0.1:4189>. En otra terminal:

```powershell
node tools/spikes/model-variants/verify.mjs
```

`dist/` contiene los nueve GLB, el manifiesto con medidas/ranuras/licencia,
el visor sin conexiones externas y las capturas e informe de verificación.
Es una carpeta generada e ignorada por Git. `build.mjs` usa la versión de three
ya instalada en `apps/web`; no añade dependencias. `verify.mjs` usa el Chromium
de Playwright del proyecto y el servidor local del comando anterior.

Las geometrías se reutilizan por variante; cada instancia tiene materiales
independientes. La caché queda acotada a las nueve variantes y se libera al cerrar
la vista. Los colores se recuerdan por variante durante la sesión; guardar proyectos
y undo corresponden a la integración posterior mediante comandos y MaterialFactory.

Los GLB propios no usan imágenes ni assets externos. Autoría del proyecto RoomForge,
derechos reservados según la política del repositorio. `LicenseRef-RoomForge-Proprietary`
identifica esa política; no representa una licencia CC0.

Los tres GLB de `assets-src/kenney/` son referencias CC0 para comparación:
su licencia original y procedencia exacta se conservan en `LICENSE.txt` y `source.json`.
No se usan para construir los nueve modelos propios. El ZIP descargado y el resto del
pack están ignorados. La copia del runtime three conserva su licencia MIT en el visor.

El informe de decisiones está en `docs/research/ASSET_SPIKE_P4_01.md`. La evaluación
con tres personas y el visto bueno visual siguen pendientes; la ADR permanece provisional.
