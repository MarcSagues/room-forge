import { render, screen, within } from '@testing-library/react';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import { modelCatalog } from '@/asset-library';
import type { LegalDocument } from './legal-document';
import { LegalPage } from './legal-page';
import { LicensesPage, shippedDependencies } from './licenses-page';
import { privacyPolicy } from './privacy';
import { termsOfUse } from './terms';

const docs = { privacyPolicy, termsOfUse };

async function seriousViolations() {
  const results = await axe.run(document.body, {
    // happy-dom does not lay out or paint: contrast is checked in the browser (e2e).
    rules: { 'color-contrast': { enabled: false } },
  });
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`);
}

describe.each(Object.entries(docs))('%s', (_, doc) => {
  it('has the same sections in Spanish and English', () => {
    const outline = (d: LegalDocument) => d.sections.map((s) => s.paragraphs.length);
    expect(outline(doc.en)).toEqual(outline(doc.es));
    expect(doc.en.updated).toBe(doc.es.updated);
    expect(doc.en.draft).toBe(doc.es.draft);
  });

  it('is plain text: no markup, no empty paragraph', () => {
    for (const locale of ['en', 'es'] as const) {
      for (const section of doc[locale].sections) {
        for (const paragraph of section.paragraphs) {
          expect(paragraph.trim()).not.toBe('');
          expect(paragraph).not.toMatch(/<[a-z/]/i);
        }
      }
    }
  });
});

describe('LegalPage', () => {
  it('shows the title, the date, the draft notice and one h2 per section', async () => {
    render(<LegalPage doc={privacyPolicy.es} locale="es" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Política de privacidad' })).toBeVisible();
    expect(screen.getByText(/Última actualización: 12 de octubre de 2026/)).toBeVisible();
    expect(screen.getByRole('note')).toHaveTextContent('Borrador pendiente de revisión legal');
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(
      privacyPolicy.es.sections.length,
    );
    expect(await seriousViolations()).toEqual([]);
  });

  it('has no draft notice once the text is reviewed', () => {
    render(<LegalPage doc={{ ...termsOfUse.en, draft: false }} locale="en" />);
    expect(screen.queryByRole('note')).toBeNull();
  });
});

describe('LicensesPage', () => {
  it('lists every catalog model and every shipped dependency', () => {
    const { container } = render(<LicensesPage locale="en" models={modelCatalog.entries()} />);
    // Plain DOM queries: role queries over ~170 rows are slow in happy-dom.
    const [models, software] = container.querySelectorAll('table');
    if (!models || !software) throw new Error('two tables expected');
    expect(models.querySelectorAll('tbody tr')).toHaveLength(modelCatalog.entries().length);
    expect(software.querySelectorAll('tbody tr')).toHaveLength(shippedDependencies.length);
    const names = [...software.querySelectorAll('tbody th')].map((cell) => cell.textContent);
    expect(names).toContain('three');
  });

  it('has no serious accessibility violations (axe)', async () => {
    render(
      <LicensesPage
        locale="en"
        models={modelCatalog.entries().slice(0, 2)}
        packages={shippedDependencies.slice(0, 3)}
      />,
    );
    expect(within(screen.getAllByRole('table')[1] as HTMLElement).getAllByRole('row')).toHaveLength(
      4,
    );
    expect(await seriousViolations()).toEqual([]);
  });

  it('shows the attribution and the source of third-party models', () => {
    const [own] = modelCatalog.entries();
    if (!own) throw new Error('empty catalog');
    const thirdParty = {
      ...own,
      license: {
        spdx: 'CC-BY-4.0',
        author: 'Jane Doe',
        origin: 'x',
        attribution: '“Desk” by Jane Doe, CC BY 4.0',
        sourceUrl: 'https://models.test/desk',
      },
    };
    render(<LicensesPage locale="es" models={[own, thirdParty]} packages={[]} />);
    expect(
      screen.getAllByText('Modelo original de RoomForge, todos los derechos reservados'),
    ).toHaveLength(1);
    expect(screen.getByText(/Desk” by Jane Doe/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'https://models.test/desk' })).toHaveAttribute(
      'href',
      'https://models.test/desk',
    );
  });
});
