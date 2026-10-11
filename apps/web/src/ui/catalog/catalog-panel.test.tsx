import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CatalogPanel, type CatalogPanelItem } from './catalog-panel';

const ITEMS: CatalogPanelItem[] = [
  { id: 'desk', name: 'Desk', color: '#8b6f9e', size: { w: 1.4, h: 0.75, d: 0.7 } },
  { id: 'chair', name: 'Office chair', color: '#4a5568', size: { w: 0.6, h: 1, d: 0.6 } },
  { id: 'bed', name: 'Single bed', color: '#8fb8de', size: { w: 0.9, h: 0.5, d: 2 } },
];

function setup(onPlaceResult = true) {
  const placement = {
    begin: vi.fn((_id: string) => true),
    move: vi.fn((_x: number, _y: number, _free: boolean) => {}),
    end: vi.fn((_x: number, _y: number) => true),
    cancel: vi.fn(),
  };
  const onPlace = vi.fn((_id: string) => onPlaceResult);
  const { unmount } = render(
    <CatalogPanel items={ITEMS} placement={placement} onPlace={onPlace} />,
  );
  const item = (name: string) => screen.getByRole('button', { name: new RegExp(name, 'i') });
  return { placement, onPlace, item, unmount };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('CatalogPanel: list and search', () => {
  it('lists every item with its name and footprint in centimetres', () => {
    setup();
    const list = screen.getByRole('list', { name: 'Catalog items' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByRole('button', { name: /Desk/ })).toHaveTextContent('140 × 70 cm');
    expect(screen.getByRole('button', { name: /Single bed/ })).toHaveTextContent('90 × 200 cm');
  });

  it('filters by name as you type, ignoring case and spaces around it', async () => {
    setup();
    const search = screen.getByRole('searchbox', { name: 'Search the catalog' });
    await userEvent.type(search, '  CHAIR ');
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Office chair/ })).toBeInTheDocument();
    await userEvent.clear(search);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('says so when nothing matches', async () => {
    setup();
    await userEvent.type(screen.getByRole('searchbox'), 'zzz');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.getByText('No items match "zzz".')).toBeInTheDocument();
  });

  it('explains how to place an item', () => {
    setup();
    expect(screen.getByText(/Drag an item into the room, or press Enter/)).toBeInTheDocument();
  });
});

describe('CatalogPanel: placing from the keyboard or with a click', () => {
  it('Enter on a focused item places it in the middle of the view and announces it', async () => {
    const { onPlace, item } = setup();
    await userEvent.tab(); // the search box
    await userEvent.tab(); // the first item
    expect(item('Desk')).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onPlace).toHaveBeenCalledExactlyOnceWith('desk');
    expect(screen.getByRole('status')).toHaveTextContent('Desk placed.');
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
