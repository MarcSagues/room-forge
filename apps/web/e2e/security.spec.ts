import { expect, type Page, test } from '@playwright/test';

declare global {
  interface Window {
    __violations?: string[];
  }
}

/** Records every Content-Security-Policy violation the page reports, and every console error. */
async function watch(page: Page) {
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    // Errors, and anything the browser says about the policy. Deprecation warnings of the
    // libraries (three's own THREE.Clock notice, for one) are not about security.
    const aboutPolicy = /content security policy|refused to/i.test(message.text());
    if (message.type() === 'error' || aboutPolicy) {
      consoleErrors.push(`${message.type()}: ${message.text()}`);
    }
  });
  await page.addInitScript(() => {
    window.__violations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__violations?.push(`${event.violatedDirective} blocked ${event.blockedURI}`);
    });
  });
  return {
    consoleErrors,
    violations: () => page.evaluate(() => window.__violations ?? []),
  };
}

const PAGES = ['/', '/projects/', '/editor/'];

test.describe('headers of every page', () => {
  for (const path of PAGES) {
    test(`${path} carries the security headers and a strict policy`, async ({ page }) => {
      const response = await page.goto(path);
      const headers = response?.headers() ?? {};
      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(headers['permissions-policy']).toBe('camera=(), microphone=(), geolocation=()');

      const policy = headers['content-security-policy'] ?? '';
      const directives: Record<string, string[]> = Object.fromEntries(
        policy.split(';').map((part): [string, string[]] => {
          const [name = '', ...values] = part.trim().split(/\s+/);
          return [name, values];
        }),
      );
      // One policy (not two joined by a comma), no eval, and no inline scripts except hashed ones.
      expect(policy).not.toContain(',');
      expect(policy).not.toContain('unsafe-eval');
      expect(directives['script-src']).not.toContain("'unsafe-inline'");
      expect(directives['script-src']?.some((source) => source.startsWith("'sha256-"))).toBe(true);
      expect(directives['frame-ancestors']).toEqual(["'none'"]);
      expect(directives['object-src']).toEqual(["'none'"]);
      expect(directives['base-uri']).toEqual(["'self'"]);
    });
  }

  test('built files are cached for good, because their names carry a hash', async ({ page }) => {
    const assets: Array<{ url: string; cache: string | undefined }> = [];
    page.on('response', (response) => {
      if (response.url().includes('/_next/static/')) {
        assets.push({ url: response.url(), cache: response.headers()['cache-control'] });
      }
    });
    await page.goto('/projects/');
    await expect.poll(() => assets.length).toBeGreaterThan(0);
    for (const { url, cache } of assets) {
      expect(cache, url).toBe('public, max-age=31536000, immutable');
    }
  });
});

test.describe('the app works under the policy, with a clean console', () => {
  test('the home page', async ({ page }) => {
    const seen = await watch(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'RoomForge' })).toBeVisible();
    expect(await seen.violations()).toEqual([]);
    expect(seen.consoleErrors).toEqual([]);
  });

  test('the projects screen, creating and exporting a project', async ({ page }) => {
    const seen = await watch(page);
    await page.goto('/projects/');
    await page.getByRole('button', { name: 'New project' }).last().click();
    await expect(page.getByRole('heading', { level: 2, name: 'Untitled project' })).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export Untitled project' }).click();
    await download;
    expect(await seen.violations()).toEqual([]);
    expect(seen.consoleErrors).toEqual([]);
  });

  test('the editor, drawing the scene with WebGL', async ({ page }) => {
    const seen = await watch(page);
    await page.goto('/editor/');
    await page.waitForFunction(
      () => (window.__RF__?.info()?.frame ?? 0) >= 1 && window.__RF__?.camera.snapshot() != null,
    );
    expect(await seen.violations()).toEqual([]);
    expect(seen.consoleErrors).toEqual([]);
  });
});

test.describe('the policy is really enforced', () => {
  test('an inline script that was not in the page does not run', async ({ page }) => {
    const seen = await watch(page);
    await page.goto('/projects/');
    await page.evaluate(() => {
      const script = document.createElement('script');
      script.textContent = 'window.pwned = true';
      document.body.append(script);
    });
    expect(await page.evaluate(() => (window as { pwned?: boolean }).pwned)).toBeUndefined();
    await expect.poll(() => seen.violations()).toEqual([expect.stringContaining('script-src')]);
  });

  test('eval and new Function are refused', async ({ page }) => {
    // Code run through page.evaluate is exempt from the page's policy (it comes from the test
    // driver), so the attempt is made by a script the page loads like any other of its own.
    await page.route('**/__probe.js', (route) =>
      route.fulfill({
        contentType: 'text/javascript',
        body: `window.__outcome = [() => eval('1 + 1'), () => new Function('return 1')()].map((attempt) => {
          try { attempt(); return 'ran'; } catch (error) { return error.name; }
        });`,
      }),
    );
    await page.goto('/projects/');
    await page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = '/__probe.js';
          script.onload = resolve;
          script.onerror = reject;
          document.body.append(script);
        }),
    );
    const outcome = await page.evaluate(() => (window as { __outcome?: string[] }).__outcome);
    expect(outcome).toEqual(['EvalError', 'EvalError']);
  });

  test('a script from another origin is refused', async ({ page }) => {
    const seen = await watch(page);
    await page.goto('/projects/');
    await page.evaluate(() => {
      const script = document.createElement('script');
      script.src = 'https://example.invalid/evil.js';
      document.body.append(script);
    });
    await expect.poll(() => seen.violations()).toEqual([expect.stringContaining('script-src')]);
  });

  test('the page cannot be framed by another site', async ({ page }) => {
    const response = await page.goto('/editor/');
    expect(response?.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
  });
});
