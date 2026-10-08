import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import HomePage from './page';

describe('HomePage', () => {
  it('presents the product and links to the editor', () => {
    render(<HomePage />);
    expect(screen.getByRole('heading', { level: 1, name: 'RoomForge' })).toBeInTheDocument();
    // next/link only appends the trailing slash configured in next.config.ts at build time.
    expect(screen.getByRole('link', { name: /open the editor/i }).getAttribute('href')).toMatch(
      /^\/editor\/?$/,
    );
  });
});
