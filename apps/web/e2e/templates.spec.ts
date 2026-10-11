import { expect, test } from '@playwright/test';

const FURNISHED = [
  { name: 'Gaming setup', objects: 7, mode: 'night' },
  { name: 'Home office', objects: 5, mode: 'day' },
  { name: 'Streaming corner', objects: 8, mode: 'night' },
] as const;

for (const template of FURNISHED) {
  test(`"${template.name}" creates a furnished project that opens and draws`, async ({
    page,
  }, testInfo) => {
    await page.goto('/projects/');
    await expect(page.getByText('No projects yet')).toBeVisible();
    await page.getByRole('button', { name: 'From a template…' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Start from a template' });
    await dialog.getByRole('radio', { name: template.name }).check();
    await dialog.getByRole('button', { name: 'Create project' }).click();
    await expect(dialog).toBeHidden();

    const started = Date.now();
    await page.getByRole('link', { name: `Open ${template.name}` }).click();
    await page.waitForFunction(
      () => (window.__RF__?.info()?.frame ?? 0) >= 1 && window.__RF__?.camera.snapshot() != null,
    );
    const firstFrameMs = Date.now() - started;

    const scene = await page.evaluate(() => {
      const document = window.__RF__?.session.getState().document;
      if (!document) throw new Error('no document');
      const objects = Object.values(document.objects);
      return {
        objects: objects.length,
        lights: objects.filter((object) => object.light).length,
        mode: document.lighting.mode,
      };
    });
    expect(scene.objects).toBe(template.objects);
    expect(scene.lights).toBeGreaterThanOrEqual(2);
    expect(scene.mode).toBe(template.mode);

    const info = await page.evaluate(() => window.__RF__?.info());
    expect(info?.calls ?? 0, 'something was drawn').toBeGreaterThan(0);
    await testInfo.attach(`${template.name}.json`, {
      body: JSON.stringify({ firstFrameMs, ...info }, null, 2),
      contentType: 'application/json',
    });
    // The acceptance target is 3 s on a real GPU; SwiftShader on a busy runner gets more room.
    expect(firstFrameMs).toBeLessThan(10_000);
  });
}

test('a template can be used again: each use is a project of its own', async ({ page }) => {
  await page.goto('/projects/');
  for (let round = 0; round < 2; round += 1) {
    await page.getByRole('button', { name: 'From a template…' }).first().click();
    await page.getByRole('button', { name: 'Create project' }).click();
  }
  await expect(page.getByRole('link', { name: 'Open Gaming setup', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Gaming setup 2' })).toBeVisible();
});
