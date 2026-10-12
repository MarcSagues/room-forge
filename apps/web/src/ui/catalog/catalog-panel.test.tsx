import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CatalogPanel } from './catalog-panel';
import type { CatalogCategoryOption, CatalogPanelItem } from './catalog-types';

const ITEMS: CatalogPanelItem[] = [
  {
    id: 'desk',
    name: 'Desk',
    color: '#8b6f9e',
    size: { w: 1.4, h: 0.75, d: 0.7 },
    category: 'desk',
    keywords: ['Escritorio', 'office'],
    thumbnail: '/assets/thumbnails/desk.0123456789.webp',
  },
  {
    id: 'chair',
    name: 'Office chair',
    color: '#4a5568',
    size: { w: 0.6, h: 1, d: 0.6 },
    category: 'seating',
    keywords: ['Silla de oficina'],
  },
  {
    id: 'bed',
    name: 'Single bed',
    color: '#8fb8de',
    size: { w: 0.9, h: 0.5, d: 2 },
    keywords: ['Cama individual'],
  },
  {
    id: 'lamp',
    name: 'Floor lamp',
    color: '#f4d58d',
    size: { w: 0.4, h: 1.6, d: 0.4 },
    category: 'lighting',
    keywords: ['Lámpara de pie', 'light'],
    thumbnail: '/assets/thumbnails/lamp.0123456789.webp',
  },
];
const CATEGORIES: CatalogCategoryOption[] = [
  { id: 'desk', label: 'Desks' },
  { id: 'seating', label: 'Seating' },
  { id: 'lighting', label: 'Lighting' },
];

function setup(onPlaceResult = true, items: readonly CatalogPanelItem[] = ITEMS) {
  const placement = {
    begin: vi.fn((_id: string) => true),
    move: vi.fn((_x: number, _y: number, _free: boolean) => {}),
    end: vi.fn((_x: number, _y: number) => true),
    cancel: vi.fn(),
  };
  const onPlace = vi.fn((_id: string) => onPlaceResult);
  const { unmount } = render(
    <CatalogPanel items={items} categories={CATEGORIES} placement={placement} onPlace={onPlace} />,
  );
  const item = (name: string) =>
    within(screen.getByRole('list', { name: 'Catalog items' })).getByRole('button', {
      name: new RegExp(`^${name}`, 'i'),
    });
  return { placement, onPlace, item, unmount };
}

const names = () =>
  within(screen.getByRole('list', { name: 'Catalog items' }))
    .getAllByRole('listitem')
    .map((entry) => entry.querySelector('.font-medium')?.textContent);
const search = () => screen.getByRole('searchbox', { name: 'Search the catalog' });
const category = (name: string) => screen.getByRole('button', { name });

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('CatalogPanel: cards', () => {
  it('lists every item with its name and footprint in centimetres', () => {
    const { item } = setup();
    expect(names()).toEqual(['Desk', 'Office chair', 'Single bed', 'Floor lamp']);
    expect(item('Desk')).toHaveTextContent('140 × 70 cm');
    expect(item('Single bed')).toHaveTextContent('90 × 200 cm');
  });

  it('shows a lazy, sized, decorative thumbnail, or a swatch of the colour without one', () => {
    const { item } = setup();
    const picture = item('Desk').querySelector('img');
    expect(picture).toHaveAttribute('src', '/assets/thumbnails/desk.0123456789.webp');
    expect(picture).toHaveAttribute('loading', 'lazy');
    expect(picture).toHaveAttribute('width', '128');
    expect(picture).toHaveAttribute('height', '128');
    expect(picture).toHaveAttribute('alt', '');
    expect(item('Desk')).toHaveAccessibleName('Desk 140 × 70 cm');

    expect(item('Office chair').querySelector('img')).toBeNull();
    const swatch = item('Office chair').querySelector('[aria-hidden="true"]');
    expect(swatch).toHaveStyle({ backgroundColor: '#4a5568' });
  });

  it('falls back to the swatch when the thumbnail fails to load', () => {
    const { item } = setup();
    const picture = item('Floor lamp').querySelector('img');
    if (!picture) throw new Error('no thumbnail');
    fireEvent.error(picture);
    expect(item('Floor lamp').querySelector('img')).toBeNull();
    expect(item('Floor lamp').querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });

  it('explains how to place an item', () => {
    setup();
    expect(screen.getByText(/Drag an item into the room, or press Enter/)).toBeInTheDocument();
  });

  it('has no serious accessibility violations (axe)', async () => {
    setup();
    await userEvent.click(category('Lighting'));
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

describe('CatalogPanel: search', () => {
  it('filters by name as you type, ignoring case and spaces around it', async () => {
    setup();
    await userEvent.type(search(), '  CHAIR ');
    expect(names()).toEqual(['Office chair']);
    await userEvent.clear(search());
    expect(names()).toHaveLength(4);
  });

  it('ignores accents and finds the name in the other language and the tags', async () => {
    setup();
    await userEvent.type(search(), 'lamp');
    expect(names()).toEqual(['Floor lamp']);
    await userEvent.clear(search());
    await userEvent.type(search(), 'lámp');
    expect(names()).toEqual(['Floor lamp']); // its Spanish name, "Lámpara de pie"
    await userEvent.clear(search());
    await userEvent.type(search(), 'LAMPARA');
    expect(names()).toEqual(['Floor lamp']);
    await userEvent.clear(search());
    await userEvent.type(search(), 'office');
    expect(names()).toEqual(['Desk', 'Office chair']); // a tag, and a name
  });

  it('needs every word, in any order', async () => {
    setup();
    await userEvent.type(search(), 'chair office');
    expect(names()).toEqual(['Office chair']);
    await userEvent.clear(search());
    await userEvent.type(search(), 'silla cama');
    expect(screen.queryByRole('list', { name: 'Catalog items' })).not.toBeInTheDocument();
  });

  it('says so when nothing matches, and offers to show everything again', async () => {
    setup();
    await userEvent.type(search(), 'zzz');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.getByText('No items match "zzz".')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show everything' }));
    expect(search()).toHaveValue('');
    expect(names()).toHaveLength(4);
  });

  it('says the catalog is empty when it has no items', () => {
    setup(true, []);
    expect(screen.getByText('There is nothing in the catalog yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show everything' })).not.toBeInTheDocument();
  });
});

describe('CatalogPanel: categories', () => {
  it('offers All and the host categories; All is pressed at first', () => {
    setup();
    const group = screen.getByRole('group', { name: 'Categories' });
    expect(
      within(group)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['All', 'Desks', 'Seating', 'Lighting']);
    expect(category('All')).toHaveAttribute('aria-pressed', 'true');
  });

  it('filters by category, together with the search; items without one are under All only', async () => {
    setup();
    await userEvent.click(category('Seating'));
    expect(category('Seating')).toHaveAttribute('aria-pressed', 'true');
    expect(category('All')).toHaveAttribute('aria-pressed', 'false');
    expect(names()).toEqual(['Office chair']);

    await userEvent.type(search(), 'desk');
    expect(screen.getByText('Nothing in Seating matches "desk".')).toBeInTheDocument();
    await userEvent.click(category('Desks'));
    expect(names()).toEqual(['Desk']);

    await userEvent.clear(search());
    await userEvent.click(category('All'));
    expect(names()).toContain('Single bed');
  });

  it('is hidden when the host gives no categories', () => {
    render(
      <CatalogPanel
        items={ITEMS}
        placement={{ begin: () => true, move: () => {}, end: () => true, cancel: () => {} }}
        onPlace={() => true}
      />,
    );
    expect(screen.queryByRole('group', { name: 'Categories' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
  });
});

describe('CatalogPanel: placing from the keyboard or with a click', () => {
  it('the cards are one tab stop; Enter places the focused one and announces it', async () => {
    const { onPlace, item } = setup();
    await userEvent.tab(); // the search box
    for (let i = 0; i <= CATEGORIES.length; i += 1) await userEvent.tab(); // All and the categories
    await userEvent.tab(); // the cards
    expect(item('Desk')).toHaveFocus();
    expect(item('Office chair')).toHaveAttribute('tabindex', '-1');
    await userEvent.keyboard('{Enter}');
    expect(onPlace).toHaveBeenCalledExactlyOnceWith('desk');
    expect(screen.getByRole('status')).toHaveTextContent('Desk placed.');
    await userEvent.tab();
    expect(document.body).toHaveFocus(); // past the cards in one step
  });

  it('the arrow keys move along rows and columns (two per row), Home and End to the ends', async () => {
    const { onPlace, item } = setup();
    item('Desk').focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(item('Office chair')).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(item('Floor lamp')).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}'); // no row below: stays
    expect(item('Floor lamp')).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(item('Single bed')).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}');
    expect(item('Desk')).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(item('Floor lamp')).toHaveFocus();
    expect(item('Floor lamp')).toHaveAttribute('tabindex', '0');
    await userEvent.keyboard('{Home}');
    expect(item('Desk')).toHaveFocus();
    await userEvent.keyboard('{End}{Enter}');
    expect(onPlace).toHaveBeenCalledExactlyOnceWith('lamp');
  });

  it('keeps a tab stop when a filter removes the card that had it', async () => {
    const { item } = setup();
    item('Floor lamp').focus();
    await userEvent.click(category('Seating'));
    expect(item('Office chair')).toHaveAttribute('tabindex', '0');
  });

  it('a click places it too; a refusal is announced', async () => {
    const { onPlace, item } = setup(false);
    await userEvent.click(item('Office chair'));
    expect(onPlace).toHaveBeenCalledWith('chair');
    expect(screen.getByRole('status')).toHaveTextContent('Office chair could not be placed.');
  });
});

describe('CatalogPanel: dragging an item into the viewport', () => {
  const press = (element: HTMLElement, x = 20, y = 20, init: PointerEventInit = {}) =>
    fireEvent.pointerDown(element, { button: 0, clientX: x, clientY: y, pointerId: 1, ...init });
  const moveTo = (x: number, y: number, init: PointerEventInit = {}) =>
    fireEvent.pointerMove(window, { clientX: x, clientY: y, pointerId: 1, ...init });
  const release = (x: number, y: number) =>
    fireEvent.pointerUp(window, { button: 0, clientX: x, clientY: y, pointerId: 1 });

  it('starts after the click slop, follows the pointer, and drops where it is released', () => {
    const { placement, onPlace, item } = setup();
    press(item('Desk'));
    moveTo(22, 21); // still a click
    expect(placement.begin).not.toHaveBeenCalled();
    moveTo(60, 40);
    expect(placement.begin).toHaveBeenCalledExactlyOnceWith('desk');
    moveTo(300, 200, { altKey: true });
    expect(placement.move).toHaveBeenLastCalledWith(300, 200, true);
    release(320, 210);
    expect(placement.end).toHaveBeenCalledExactlyOnceWith(320, 210);
    expect(onPlace).not.toHaveBeenCalled(); // the click that follows a drag is not a placement
    expect(screen.getByRole('status')).toHaveTextContent('Desk placed.');
  });

  it('swallows the click that follows a drag, but not the next one', async () => {
    const { onPlace, item } = setup();
    press(item('Desk'));
    moveTo(80, 80);
    release(90, 90);
    fireEvent.click(item('Desk'));
    expect(onPlace).not.toHaveBeenCalled();
    await userEvent.click(item('Desk'));
    expect(onPlace).toHaveBeenCalledTimes(1);
  });

  it('announces a drop that created nothing (outside the viewport, over a panel)', () => {
    const { placement, item } = setup();
    placement.end.mockReturnValueOnce(false);
    press(item('Single bed'));
    moveTo(80, 80);
    release(10, 10);
    expect(screen.getByRole('status')).toHaveTextContent('Single bed could not be placed.');
  });

  it('Escape cancels the placement and nothing is dropped', () => {
    const { placement, item } = setup();
    press(item('Desk'));
    moveTo(80, 80);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(placement.cancel).toHaveBeenCalledOnce();
    release(90, 90);
    expect(placement.end).not.toHaveBeenCalled();
    moveTo(100, 100);
    expect(placement.move).toHaveBeenCalledTimes(1); // only the move that started the drag
  });

  it('a pointer cancel (the browser takes the gesture) cancels the placement', () => {
    const { placement, item } = setup();
    press(item('Desk'));
    moveTo(80, 80);
    fireEvent.pointerCancel(window, { pointerId: 1 });
    expect(placement.cancel).toHaveBeenCalledOnce();
    expect(placement.end).not.toHaveBeenCalled();
  });

  it('ignores other buttons and a drag the scene refuses to start', () => {
    const { placement, item } = setup();
    press(item('Desk'), 20, 20, { button: 2 });
    moveTo(80, 80);
    expect(placement.begin).not.toHaveBeenCalled();

    placement.begin.mockReturnValueOnce(false);
    press(item('Desk'));
    moveTo(80, 80);
    moveTo(90, 90);
    release(90, 90);
    expect(placement.move).not.toHaveBeenCalled();
    expect(placement.end).not.toHaveBeenCalled();
  });

  it('cancels a drag in progress when the panel goes away', () => {
    const { placement, item, unmount } = setup();
    press(item('Desk'));
    moveTo(80, 80);
    unmount();
    expect(placement.cancel).toHaveBeenCalledOnce();
    moveTo(100, 100);
    expect(placement.move).toHaveBeenCalledTimes(1); // only the move before unmounting
  });
});

describe('CatalogPanel: the Structure tab (doors and windows)', () => {
  const OPENINGS: CatalogPanelItem[] = [
    { id: 'door.single', name: 'Door', color: '#b88a55', size: { w: 0.9, h: 2.1, d: 0.1 } },
    {
      id: 'window.large',
      name: 'Large window',
      color: '#cfe3ee',
      size: { w: 1.8, h: 1.4, d: 0.1 },
    },
  ];

  function setupTabs() {
    const placement = {
      begin: vi.fn(() => true),
      move: vi.fn(),
      end: vi.fn(() => true),
      cancel: vi.fn(),
    };
    const structure = {
      items: OPENINGS,
      placement: {
        begin: vi.fn(() => true),
        move: vi.fn(),
        end: vi.fn(() => true),
        cancel: vi.fn(),
      },
      onPlace: vi.fn(() => true),
    };
    render(
      <CatalogPanel
        items={ITEMS}
        placement={placement}
        onPlace={vi.fn(() => true)}
        structure={structure}
      />,
    );
    return { placement, structure };
  }

  it('opens on the objects; the Structure tab lists doors and windows by width × height', async () => {
    setupTabs();
    expect(screen.getByRole('list', { name: 'Catalog items' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Structure' }));
    const list = screen.getByRole('list', { name: 'Doors and windows' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('button', { name: /Large window/ })).toHaveTextContent('180 × 140 cm');
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });

  it('places a door with Enter and drags a window through the structure placement', async () => {
    const { placement, structure } = setupTabs();
    await userEvent.click(screen.getByRole('tab', { name: 'Structure' }));
    screen.getByRole('button', { name: /Door/ }).focus();
    await userEvent.keyboard('{Enter}');
    expect(structure.onPlace).toHaveBeenCalledWith('door.single');
    expect(await screen.findByText('Door placed.')).toBeInTheDocument();

    const window = screen.getByRole('button', { name: /Large window/ });
    fireEvent.pointerDown(window, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(globalThis.window, { clientX: 300, clientY: 200 });
    fireEvent.pointerUp(globalThis.window, { clientX: 300, clientY: 200 });
    expect(structure.placement.begin).toHaveBeenCalledWith('window.large');
    expect(structure.placement.end).toHaveBeenCalledWith(300, 200);
    expect(placement.begin).not.toHaveBeenCalled();
  });
});
