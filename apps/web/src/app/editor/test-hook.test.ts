import { createEditorSession, createEmptyDocument } from '@roomforge/core';
import { afterEach, describe, expect, it } from 'vitest';
import { emptyCatalog } from '@/asset-library';
import type { RenderInfo, SceneHandle } from '@/scene-engine';
import { E2E_ENABLED, installTestHook } from './test-hook';

const session = createEditorSession({
  initialDocument: createEmptyDocument(),
  catalog: emptyCatalog,
});

const info: RenderInfo = {
  frame: 3,
  calls: 1,
  triangles: 2,
  points: 0,
  lines: 0,
  geometries: 1,
  textures: 0,
  programs: 1,
};

describe('installTestHook', () => {
  afterEach(() => {
    delete window.__RF__;
  });

  it('is disabled unless the build sets NEXT_PUBLIC_E2E=1', () => {
    expect(E2E_ENABLED).toBe(false);
    installTestHook(window, { session, getScene: () => null });
    expect(window.__RF__).toBeUndefined();
  });

  it('exposes the session, command factories and render info in E2E builds', () => {
    const scene = { renderInfo: () => info } as unknown as SceneHandle;
    installTestHook(window, { session, getScene: () => scene }, true);
    const hook = window.__RF__;
    expect(hook?.session).toBe(session);
    expect(Object.keys(hook?.commands ?? {}).sort()).toEqual(['createRoom', 'resizeRoom']);
    expect(hook?.info()).toEqual(info);
  });

  it('reports no render info until the canvas is mounted', () => {
    installTestHook(window, { session, getScene: () => null }, true);
    expect(window.__RF__?.info()).toBeNull();
  });

  it('cleans up after itself, but never removes a newer hook', () => {
    const uninstall = installTestHook(window, { session, getScene: () => null }, true);
    uninstall();
    expect(window.__RF__).toBeUndefined();

    const first = installTestHook(window, { session, getScene: () => null }, true);
    installTestHook(window, { session, getScene: () => null }, true);
    const newer = window.__RF__;
    first();
    expect(window.__RF__).toBe(newer);
  });
});
