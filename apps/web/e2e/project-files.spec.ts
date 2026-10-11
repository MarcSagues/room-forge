import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';

// A modal dialog hides the page behind it from the accessibility tree: count the cards anyway.
const cards = (page: Page) =>
  page
    .getByRole('list', { name: 'Your projects', includeHidden: true })
    .getByRole('listitem', { includeHidden: true });
const heading = (page: Page, name: string) => page.getByRole('heading', { level: 2, name });

function watchConsole(page: Page) {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`);
  });
  return problems;
}

async function openWithOneProject(page: Page) {
  await page.goto('/projects/');
  await page.getByRole('button', { name: 'New project' }).last().click();
  await expect(heading(page, 'Untitled project')).toBeVisible();
}

/** Clicks Export on a card and returns the text of the file the browser downloaded. */
async function exportFile(page: Page, projectName: string) {
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: `Export ${projectName}` }).click();
  const download = await downloading;
  const path = await download.path();
  return { filename: download.suggestedFilename(), text: readFileSync(path, 'utf8') };
}

const chooseFile = (page: Page, text: string, name = 'project.roomforge.json') =>
  page.setInputFiles('input[type="file"]', {
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });

test('a project exported and imported again is the same project, as a new one', async ({
  page,
}) => {
  const problems = watchConsole(page);
  await openWithOneProject(page);

  const exported = await exportFile(page, 'Untitled project');
  expect(exported.filename).toMatch(/^untitled-project-\d{4}-\d\d-\d\d\.roomforge\.json$/);
  const original = JSON.parse(exported.text);
  expect(original).toMatchObject({
    format: 'roomforge-scene',
    formatVersion: 1,
    project: { name: 'Untitled project' },
  });
  expect(original.document.roomOrder).toHaveLength(1);
  await expect(page.getByRole('status')).toContainText('Exported “Untitled project”.');

  // Import it: a preview first, and nothing is saved until it is confirmed.
  await chooseFile(page, exported.text, exported.filename);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Import a project' })).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: 'Name of the new project' })).toHaveValue(
    'Untitled project 2',
  );
  await expect(dialog).toContainText('Your existing projects are not changed.');
  await expect(cards(page)).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Import as new project' }).click();
  await expect(dialog).toBeHidden();
  await expect(cards(page)).toHaveCount(2);
  await expect(heading(page, 'Untitled project 2')).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Imported “Untitled project 2”.');

  // Exporting the copy gives the same document, deeply.
  const again = JSON.parse((await exportFile(page, 'Untitled project 2')).text);
  expect(again.document).toEqual(original.document);
  expect(again.project.name).toBe('Untitled project 2');

  // Both survive a reload.
  await page.reload();
  await expect(cards(page)).toHaveCount(2);
  expect(problems).toEqual([]);
});

test('files that cannot be imported say why, in words, and change nothing', async ({ page }) => {
  const problems = watchConsole(page);
  await openWithOneProject(page);
  const valid = (await exportFile(page, 'Untitled project')).text;
  const dialog = page.getByRole('dialog');

  const rejected: Array<[string, string, RegExp]> = [
    ['not json', '{ this is not json', /not valid JSON/],
    ['another kind of file', JSON.stringify({ hello: 'world' }), /not a RoomForge project file/],
    [
      'hostile keys',
      '{"format":"roomforge-scene","formatVersion":1,"project":{"name":"x"},"document":{"schemaVersion":1,"__proto__":{"polluted":true}}}',
      /refuses to open/,
    ],
    [
      'a newer version',
      JSON.stringify({ ...JSON.parse(valid), formatVersion: 99 }),
      /Update RoomForge to open it/,
    ],
    [
      'a scene that is not valid',
      JSON.stringify({
        ...JSON.parse(valid),
        document: { ...JSON.parse(valid).document, rooms: 'many' },
      }),
      /scene inside this file is not valid/,
    ],
  ];
  for (const [label, text, message] of rejected) {
    await chooseFile(page, text);
    await expect(dialog, label).toContainText(message);
    await expect(dialog, label).toContainText('Your projects were not changed.');
    await expect(dialog.getByRole('button', { name: 'Import as new project' })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeHidden();
    await expect(cards(page), label).toHaveCount(1);
  }

  // The newer version names both versions.
  await chooseFile(page, JSON.stringify({ ...JSON.parse(valid), formatVersion: 99 }));
  await expect(dialog).toContainText('File version 99; this version reads up to 1.');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await page.reload();
  await expect(cards(page)).toHaveCount(1);
  expect(problems).toEqual([]);
});

test('a file dropped on the window is imported the same way, with a hint while dragging', async ({
  page,
}) => {
  await openWithOneProject(page);
  const text = (await exportFile(page, 'Untitled project')).text;
  const dataTransfer = await page.evaluateHandle((content) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([content], 'dropped.roomforge.json', { type: 'application/json' }));
    return transfer;
  }, text);

  await page.dispatchEvent('body', 'dragenter', { dataTransfer });
  await expect(page.getByText('Drop a RoomForge project file to import it')).toBeVisible();
  await page.dispatchEvent('body', 'dragleave', { dataTransfer });
  await expect(page.getByText('Drop a RoomForge project file to import it')).toBeHidden();

  await page.dispatchEvent('body', 'dragenter', { dataTransfer });
  await page.dispatchEvent('body', 'drop', { dataTransfer });
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Import a project' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Import as new project' }).click();
  await expect(cards(page)).toHaveCount(2);
});

test('the Import button opens the file chooser', async ({ page }) => {
  await openWithOneProject(page);
  const choosing = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import' }).click();
  const chooser = await choosing;
  expect(chooser.isMultiple()).toBe(false);
});
