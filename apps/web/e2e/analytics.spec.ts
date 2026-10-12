import { expect, test } from '@playwright/test';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

/**
 * ADR-0011: a build without NEXT_PUBLIC_ANALYTICS_ENDPOINT (every build until the owner sets one)
 * sends no analytics at all, whatever the person does in the editor.
 */
test('without an endpoint, editing, saving, exporting and sharing send nothing', async ({
  page,
}) => {
  const posts: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET') posts.push(`${request.method()} ${request.url()}`);
  });

  await page.goto('/editor/');
  await page.waitForFunction(
    () => (window.__RF__?.info()?.frame ?? 0) >= 1 && window.__RF__?.camera.snapshot() != null,
  );
  await page.evaluate(() => {
    const hook = window.__RF__;
    if (!hook) throw new Error('E2E hook missing');
    const roomId = Object.keys(hook.session.getState().document.rooms)[0] as never;
    const result = hook.session.execute(
      hook.commands.addObject({
        id: 'box',
        catalogId: 'test.box',
        roomId,
        position: [2, 0, 2],
        rotationY: 0,
      }),
    );
    if (!result.ok) throw new Error(result.error.message);
  });
  await expect
    .poll(() => page.evaluate(() => window.__RF__?.autosave.state()?.status))
    .toBe('saved');

  await page.getByRole('button', { name: 'Export' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Project (.roomforge.json)' }).click();
  await download;

  await page.getByRole('button', { name: 'Share' }).click();
  await expect(page.getByText(/Link copied\. Anyone with it/)).toBeVisible();

  expect(posts).toEqual([]);
});
