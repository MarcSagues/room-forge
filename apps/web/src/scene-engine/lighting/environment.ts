import {
  BackSide,
  BufferAttribute,
  Color,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  SphereGeometry,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from 'three';

/** Sky, horizon and ground of the environment, top to bottom (linear colours, > 1 is brighter). */
const SKY = new Color('#b9d4f2');
const HORIZON = new Color('#f2efe9');
const GROUND = new Color('#6d6a66');

/**
 * Builds the scene's environment in code (no HDR download, ARCHITECTURE §6.3 #15): a gradient
 * dome with two bright panels, like drei's `Lightformer`s, baked once into a PMREM texture. It is
 * made before the first frame and never replaced, because swapping `scene.environment` would
 * recompile every material; day and night only change `scene.environmentIntensity`.
 */
export function createEnvironment(renderer: WebGLRenderer): WebGLRenderTarget {
  const scene = new Scene();
  const dome = new SphereGeometry(10, 32, 16);
  paintGradient(dome);
  const domeMaterial = new MeshBasicMaterial({ vertexColors: true, side: BackSide });
  scene.add(new Mesh(dome, domeMaterial));

  const panel = new PlaneGeometry(1, 1);
  const panelMaterial = new MeshBasicMaterial({ color: new Color(6, 6, 6) });
  // A wide soft box overhead and a window-like panel to one side.
  const overhead = new Mesh(panel, panelMaterial);
  overhead.scale.set(8, 8, 1);
  overhead.position.set(0, 6, 0);
  overhead.rotation.x = Math.PI / 2;
  const side = new Mesh(panel, panelMaterial);
  side.scale.set(6, 3, 1);
  side.position.set(-7, 2.5, 2);
  side.rotation.y = Math.PI / 2;
  scene.add(overhead, side);

  const generator = new PMREMGenerator(renderer);
  const target = generator.fromScene(scene, 0.04);
  generator.dispose();
  for (const resource of [dome, domeMaterial, panel, panelMaterial]) resource.dispose();
  return target;
}

function paintGradient(geometry: SphereGeometry): void {
  const positions = geometry.getAttribute('position');
  const colors = new Float32Array(positions.count * 3);
  const color = new Color();
  for (let i = 0; i < positions.count; i += 1) {
    const height = positions.getY(i) / 10; // -1 at the bottom, 1 at the top
    if (height >= 0) color.lerpColors(HORIZON, SKY, Math.min(1, height * 1.5));
    else color.lerpColors(HORIZON, GROUND, Math.min(1, -height * 3));
    color.toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
}
