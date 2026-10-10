// Assembles the throwaway light-cost page into dist/ using the three already installed in apps/web.
import { cp, mkdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const requireWeb = createRequire(resolve(here, '../../../apps/web/package.json'));
const threeRoot = resolve(dirname(requireWeb.resolve('three')), '..');
const output = resolve(here, 'dist');

await rm(output, { recursive: true, force: true });
await mkdir(resolve(output, 'vendor/addons'), { recursive: true });
for (const file of ['three.module.js', 'three.core.js']) {
  await cp(resolve(threeRoot, 'build', file), resolve(output, 'vendor', file));
}
// Only the addon folders the bench imports (bloom chain and RectAreaLight LTC tables).
for (const folder of ['postprocessing', 'shaders', 'lights']) {
  await cp(resolve(threeRoot, 'examples/jsm', folder), resolve(output, 'vendor/addons', folder), {
    recursive: true,
  });
}
await cp(resolve(threeRoot, 'LICENSE'), resolve(output, 'vendor/LICENSE'));
for (const file of ['index.html', 'bench.js']) {
  await cp(resolve(here, file), resolve(output, file));
}
console.log(`light-cost spike built in ${output}`);
