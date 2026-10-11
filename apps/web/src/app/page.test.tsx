import { render, screen, within } from '@testing-library/react';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import SpanishHomePage from './es/page';
import HomePage from './page';

// next/link only appends the trailing slash configured in next.config.ts at build time.
const hrefOf = (name: string | RegExp) =>
  screen.getByRole('link', { name }).getAttribute('href') ?? '';

describe('HomePage', () => {
  it('presents the product with one h1 and links to the editor and the projects', () => {
    render(<HomePage />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'RoomForge' })).toBeInTheDocument();
    expect(hrefOf('Open the editor')).toMatch(/^\/editor\/?$/);
    expect(hrefOf('My projects')).toMatch(/^\/projects\/?$/);
    for (const link of screen.getAllByRole('link', { name: 'Start designing' })) {
      expect(link.getAttribute('href')).toMatch(/^\/editor\/?$/);
    }
  });

  it('has the landmarks, the features and an FAQ that works without script', () => {
    const { container } = render(<HomePage />);
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'content');
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Private by design' })).toBeVisible();
    expect(container.querySelectorAll('details > summary').length).toBeGreaterThanOrEqual(5);
    expect(screen.getByRole('img', { name: /illustration/i })).toBeInTheDocument();
  });

  it('links to the Spanish version, marked as Spanish', () => {
    render(<HomePage />);
    const link = screen.getByRole('link', { name: 'Leer en español' });
    expect(link).toHaveAttribute('href', '/es/');
    expect(link).toHaveAttribute('hreflang', 'es');
  });

  it('has no serious accessibility violations (axe)', async () => {
    render(<HomePage />);
    const results = await axe.run(document.body, {
      // happy-dom does not lay out or paint: contrast is checked in the browser (e2e).
      rules: { 'color-contrast': { enabled: false } },
    });
    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)).toEqual([]);
  });
});

describe('SpanishHomePage', () => {
  it('is in Spanish and links back to English', () => {
    const { container } = render(<SpanishHomePage />);
    expect(container.firstElementChild).toHaveAttribute('lang', 'es');
    const banner = screen.getByRole('banner');
    expect(within(banner).getByRole('link', { name: 'Abrir el editor' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Preguntas frecuentes' })).toBeVisible();
    expect(hrefOf('Read in English')).toBe('/');
  });
});
