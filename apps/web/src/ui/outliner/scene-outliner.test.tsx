import {
  addObject,
  createEditorSession,
  type EditorSession,
  type ObjectId,
  type RoomId,
} from '@roomforge/core';
import { buildDocument, createFixtureCatalog } from '@roomforge/core/testing';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { beforeEach, describe, expect, it } from 'vitest';
import { SceneOutliner } from './scene-outliner';

// buildDocument: room "Room" with a door (south), a window (north), desk-1 and monitor-1 on it.
const DESK = 'desk-1' as ObjectId;
const MONITOR = 'monitor-1' as ObjectId;
const NAMES: Record<string, string> = { 'desk.basic.120': 'Desk', 'monitor.27': 'Monitor' };

let session: EditorSession;

beforeEach(() => {
  session = createEditorSession({
    initialDocument: buildDocument(),
    catalog: createFixtureCatalog(),
  });
  render(<SceneOutliner session={session} itemName={(id) => NAMES[id]} />);
});

const tree = () => screen.getByRole('tree', { name: 'Scene outline' });
const row = (name: string | RegExp) => within(tree()).getByRole('treeitem', { name });
const doc = () => session.getState().document;
const status = () => screen.getByRole('status');

/** Focuses a row by clicking it (which also selects it), then presses keys on it. */
async function on(name: string | RegExp, ...keys: string[]) {
  const user = userEvent.setup();
  row(name).focus();
  for (const key of keys) await user.keyboard(key);
  return user;
}

describe('SceneOutliner: the tree', () => {
  it('shows the room, its openings and its objects with their children, as a tree', () => {
    const items = within(tree()).getAllByRole('treeitem');
    expect(items.map((item) => item.getAttribute('aria-level'))).toEqual(['1', '2', '2', '2', '3']);
    expect(row('Room')).toHaveAttribute('aria-expanded', 'true');
    expect(row('Door, south wall')).not.toHaveAttribute('aria-expanded');
    expect(row('Window, north wall')).toHaveAttribute('aria-posinset', '2');
    expect(row('Desk')).toHaveAttribute('aria-setsize', '3');
    expect(row('Monitor')).toHaveAttribute('aria-level', '3');
  });

  it('has one tab stop (roving tabindex) and every row has a name', () => {
    const items = within(tree()).getAllByRole('treeitem');
    expect(items.filter((item) => item.tabIndex === 0)).toHaveLength(1);
    expect(items[0]).toHaveAttribute('tabindex', '0');
  });

  it('has no serious accessibility violations (axe)', async () => {
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

describe('SceneOutliner: keyboard', () => {
  it('moves between rows with the arrows, Home and End', async () => {
    await on('Room', '{ArrowDown}', '{ArrowDown}');
    expect(row('Window, north wall')).toHaveFocus();
    expect(row('Window, north wall')).toHaveAttribute('tabindex', '0');
    await on('Window, north wall', '{End}');
    expect(row('Monitor')).toHaveFocus();
    await on('Monitor', '{Home}');
    expect(row('Room')).toHaveFocus();
  });

  it('collapses with ArrowLeft, expands with ArrowRight and goes to the parent', async () => {
    await on('Monitor', '{ArrowLeft}');
    expect(row('Desk')).toHaveFocus();
    await on('Desk', '{ArrowLeft}');
    expect(row('Desk')).toHaveAttribute('aria-expanded', 'false');
    expect(within(tree()).queryByRole('treeitem', { name: 'Monitor' })).toBeNull();
    await on('Desk', '{ArrowRight}');
    expect(row('Monitor')).toBeInTheDocument();
    await on('Desk', '{ArrowRight}');
    expect(row('Monitor')).toHaveFocus();
  });

  it('selects with Enter and announces it', async () => {
    await on('Desk', '{Enter}');
    expect(session.getState().selection).toEqual([DESK]);
    expect(row('Desk')).toHaveAttribute('aria-selected', 'true');
    expect(status()).toHaveTextContent('Desk selected');
  });

  it('follows a selection made in the viewport, and announces it', () => {
    act(() => session.select([MONITOR]));
    expect(row('Monitor')).toHaveAttribute('aria-selected', 'true');
    expect(row('Monitor')).toHaveAttribute('tabindex', '0');
    expect(status()).toHaveTextContent('Monitor selected');
    act(() => session.select([]));
    expect(status()).toHaveTextContent('Nothing selected');
  });

  it('hides and locks with H and L; both are undoable and shown on the row', async () => {
    await on('Desk', 'h');
    expect(doc().objects[DESK]?.hidden).toBe(true);
    expect(status()).toHaveTextContent('Desk hidden');
    expect(row('Desk hidden')).toBeInTheDocument();
    await on('Desk hidden', 'l');
    expect(doc().objects[DESK]?.locked).toBe(true);
    expect(row('Desk hidden, locked')).toBeInTheDocument();
    act(() => void session.undo());
    act(() => void session.undo());
    expect(doc().objects[DESK]).toMatchObject({ hidden: false, locked: false });
  });

  it('renames with F2 and Enter; Escape keeps the old name; one undo restores it', async () => {
    const user = await on('Desk', '{F2}');
    const field = screen.getByRole('textbox', { name: 'Name of Desk' });
    expect(field).toHaveFocus();
    await user.type(field, 'Main desk{Enter}');
    expect(doc().objects[DESK]?.name).toBe('Main desk');
    expect(status()).toHaveTextContent('Renamed to Main desk');
    expect(row('Main desk')).toHaveFocus();

    await on('Main desk', '{F2}');
    await user.type(screen.getByRole('textbox'), 'x{Escape}');
    expect(doc().objects[DESK]?.name).toBe('Main desk');

    act(() => void session.undo());
    expect(doc().objects[DESK]).not.toHaveProperty('name');
  });

  it('deletes the row with Delete, moves focus on, and does not reach the global shortcut', async () => {
    act(() => session.select([DESK]));
    row('Monitor').focus();
    const event = fireEvent.keyDown(row('Monitor'), { key: 'Delete' });
    expect(event).toBe(false); // defaultPrevented: the global "delete selection" stays out.
    expect(doc().objects[MONITOR]).toBeUndefined();
    expect(doc().objects[DESK]).toBeDefined();
    expect(status()).toHaveTextContent('Monitor deleted');
    expect(row('Desk')).toHaveFocus();
    await on('Door, south wall', '{Delete}');
    expect(doc().openings).not.toHaveProperty('door-1');
  });

  it('reorders siblings with Alt+arrows in one undoable step', async () => {
    act(() => {
      session.execute(
        addObject({
          id: 'chair-1',
          catalogId: 'chair.office',
          roomId: 'room-1' as RoomId,
          position: [1, 0, 2.2],
          rotationY: 0,
        }),
      );
    });
    await on('Desk', '{Alt>}{ArrowDown}{/Alt}');
    expect(doc().objectOrder).toEqual([MONITOR, 'chair-1', DESK]);
    expect(status()).toHaveTextContent('Desk moved down');
    expect(row('Desk')).toHaveFocus();
    const items = within(tree()).getAllByRole('treeitem');
    expect(items.map((item) => item.dataset.entityId)).toEqual([
      'room-1',
      'door-1',
      'window-1',
      'chair-1',
      DESK,
      MONITOR,
    ]);
    act(() => void session.undo());
    expect(doc().objectOrder).toEqual([DESK, MONITOR, 'chair-1']);
  });

  it('lets other keys through to the global shortcuts', () => {
    row('Desk').focus();
    expect(fireEvent.keyDown(row('Desk'), { key: 'z', ctrlKey: true })).toBe(true);
    expect(fireEvent.keyDown(row('Room'), { key: 'h' })).toBe(true);
  });
});

describe('SceneOutliner: pointer', () => {
  it('selects on click and toggles visibility and lock without selecting', async () => {
    const user = userEvent.setup();
    await user.click(row('Desk'));
    expect(session.getState().selection).toEqual([DESK]);
    await user.click(screen.getByRole('button', { name: 'Hide Monitor' }));
    expect(doc().objects[MONITOR]?.hidden).toBe(true);
    expect(screen.getByRole('button', { name: 'Show Monitor' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Lock Monitor' }));
    expect(doc().objects[MONITOR]?.locked).toBe(true);
    expect(session.getState().selection).toEqual([DESK]);
  });

  it('renames on double click', async () => {
    const user = userEvent.setup();
    await user.dblClick(row('Monitor'));
    expect(screen.getByRole('textbox', { name: 'Name of Monitor' })).toHaveFocus();
  });
});
