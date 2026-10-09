import { createEditorSession, type EditorSession, type ObjectId } from '@roomforge/core';
import { buildDocument, createFixtureCatalog } from '@roomforge/core/testing';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { LiveTransform } from './object-properties';
import { SelectionSummary } from './selection-summary';

// Fixture room 4 × 3 at the world origin; desk-1 (1.2 × 0.6 × 0.75) at (2, 0, 1.5), with monitor-1
// (0.62 × 0.45 × 0.2) standing on it.
const DESK = 'desk-1' as ObjectId;
const MONITOR = 'monitor-1' as ObjectId;

let session: EditorSession;

function setup(live?: LiveTransform) {
  session = createEditorSession({
    initialDocument: buildDocument(),
    catalog: createFixtureCatalog(),
  });
  render(
    <SelectionSummary
      session={session}
      catalog={createFixtureCatalog()}
      {...(live ? { live } : {})}
    />,
  );
  act(() => session.select([DESK]));
}

const desk = () => session.getState().document.objects[DESK];
const field = (name: string) => screen.getByRole('spinbutton', { name });
const history = () => session.getState().history;

beforeEach(() => setup());

describe('ObjectProperties: what it shows', () => {
  it('names the object, its catalog item and its size in centimetres', () => {
    expect(screen.getByRole('heading', { name: 'Unnamed object' })).toBeInTheDocument();
    expect(screen.getByText('desk.basic.120')).toBeInTheDocument();
    expect(screen.getByText('120 × 60 × 75 cm')).toBeInTheDocument();
  });

  it('shows position and rotation in centimetres and degrees', () => {
    expect(field('X')).toHaveValue('200');
    expect(field('Z')).toHaveValue('150');
    expect(field('Elevation')).toHaveValue('0');
    expect(field('Elevation')).toHaveAttribute('readonly');
    expect(field('Rotation')).toHaveValue('0');
  });

  it('scales the size with the object scale', () => {
    act(() => {
      session.execute({
        type: 'test/scale',
        label: 'scale',
        apply(draft) {
          const target = draft.objects[DESK];
          if (target) target.transform.scale = [2, 1, 1];
        },
      });
    });
    expect(screen.getByText('240 × 60 × 75 cm')).toBeInTheDocument();
  });

  it('reflects the lock and visibility switches', () => {
    expect(screen.getByRole('switch', { name: 'Locked' })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: 'Visible' })).toBeChecked();
  });

  it("shows an object standing on another one in that object's frame", () => {
    act(() => session.select([MONITOR]));
    expect(field('X')).toHaveValue('0');
    expect(field('Z')).toHaveValue('-20');
    expect(field('Elevation')).toHaveValue('75');
  });
});

describe('ObjectProperties: editing', () => {
  it('changing X moves the object in one history entry that undo reverts', async () => {
    await userEvent.clear(field('X'));
    await userEvent.type(field('X'), '250{Enter}');
    expect(desk()?.transform.position).toEqual([2.5, 0, 1.5]);
    expect(history()).toMatchObject({ canUndo: true, undoLabel: 'Move object' });
    expect(field('X')).toHaveValue('250');

    act(() => {
      session.undo();
    });
    expect(desk()?.transform.position).toEqual([2, 0, 1.5]);
    expect(field('X')).toHaveValue('200');
    expect(history().canUndo).toBe(false);
  });

  it('typing and arrow keys in one field are a single history entry', async () => {
    await userEvent.click(field('Z'));
    await userEvent.keyboard('{ArrowUp}{ArrowUp}{ArrowUp}');
    expect(desk()?.transform.position[2]).toBeCloseTo(1.53);
    await userEvent.keyboard('{Shift>}{ArrowDown}{/Shift}');
    expect(desk()?.transform.position[2]).toBeCloseTo(1.43);
    act(() => {
      session.undo();
    });
    expect(desk()?.transform.position[2]).toBe(1.5);
    expect(history().canUndo).toBe(false);
  });

  it('dragging the label scrubs the value, again as one entry', () => {
    const label = screen.getByText('X');
    fireEvent.pointerDown(label, { button: 0, clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(label, { clientX: 140, pointerId: 1 });
    fireEvent.pointerMove(label, { clientX: 180, pointerId: 1 });
    fireEvent.pointerUp(label, { button: 0, clientX: 180, pointerId: 1 });
    expect(desk()?.transform.position[0]).toBeCloseTo(2.2);
    act(() => {
      session.undo();
    });
    expect(desk()?.transform.position[0]).toBe(2);
  });

  it('refuses a position outside the room, with an accessible message, and changes nothing', async () => {
    const before = session.getState().document;
    await userEvent.clear(field('X'));
    await userEvent.type(field('X'), '900{Enter}');
    expect(field('X')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('It does not fit inside the room');
    expect(field('X')).toHaveAccessibleDescription('It does not fit inside the room');
    expect(session.getState().document).toBe(before);
  });

  it('turns the object when the rotation changes', async () => {
    await userEvent.clear(field('Rotation'));
    await userEvent.type(field('Rotation'), '90{Enter}');
    expect(desk()?.transform.rotationY).toBeCloseTo(Math.PI / 2);
    expect(history().undoLabel).toBe('Rotate object');
    expect(field('Rotation')).toHaveValue('90');
  });

  it('refuses a rotation that would not fit', async () => {
    act(() => {
      session.execute({
        type: 'test/place',
        label: 'place',
        apply(draft) {
          const target = draft.objects[DESK];
          if (target) target.transform.position = [2, 0, 2.7]; // against the south wall
        },
      });
    });
    await userEvent.clear(field('Rotation'));
    await userEvent.type(field('Rotation'), '90{Enter}');
    expect(field('Rotation')).toHaveAttribute('aria-invalid', 'true');
    expect(desk()?.transform.rotationY).toBe(0);
  });

  it('renames the object, and clearing the name goes back to unnamed', async () => {
    const name = screen.getByRole('textbox', { name: 'Name' });
    await userEvent.type(name, 'Main desk{Enter}');
    expect(screen.getByRole('heading', { name: 'Main desk' })).toBeInTheDocument();
    expect(desk()?.name).toBe('Main desk');
    await userEvent.clear(name);
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('heading', { name: 'Unnamed object' })).toBeInTheDocument();
    expect(desk()?.name).toBeUndefined();
  });

  it('locks and hides the object with the switches', async () => {
    await userEvent.click(screen.getByRole('switch', { name: 'Locked' }));
    expect(desk()?.locked).toBe(true);
    expect(screen.getByRole('switch', { name: 'Locked' })).toBeChecked();
    await userEvent.click(screen.getByRole('switch', { name: 'Visible' }));
    expect(desk()?.hidden).toBe(true);
    expect(screen.getByRole('switch', { name: 'Visible' })).not.toBeChecked();
  });
});

describe('ObjectProperties: actions', () => {
  it('Duplicate adds a copy, in one entry, and selects it', async () => {
    const before = Object.keys(session.getState().document.objects).length;
    await userEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    const ids = Object.keys(session.getState().document.objects);
    expect(ids.length).toBeGreaterThan(before);
    const selected = session.getState().selection;
    expect(selected).toHaveLength(1);
    expect(selected[0]).not.toBe(DESK);
    expect(history().undoLabel).toBe('Duplicate object');
  });

  it('Delete removes the object and the panel goes back to the hint', async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(session.getState().document.objects[DESK]).toBeUndefined();
    expect(screen.getByText('Select an object to edit its properties.')).toBeInTheDocument();
  });
});

describe('ObjectProperties: following a drag in the scene', () => {
  it('shows the live X, Z and rotation of the dragged object, then the committed ones', () => {
    let pose: { id: string; x: number; z: number; rotationY: number } | null = null;
    const listeners = new Set<() => void>();
    const live: LiveTransform = {
      read: () => pose,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    cleanup(); // the panel from beforeEach has no live source
    setup(live);
    const notify = () => {
      for (const listener of listeners) listener();
    };
    act(() => {
      pose = { id: DESK, x: 1.234, z: 0.8, rotationY: Math.PI / 2 };
      notify();
    });
    expect(field('X')).toHaveValue('123.4');
    expect(field('Z')).toHaveValue('80');
    expect(field('Rotation')).toHaveValue('90');

    // Another object's drag does not touch this panel.
    act(() => {
      pose = { id: 'other', x: 3, z: 3, rotationY: 0 };
      notify();
    });
    expect(field('X')).toHaveValue('200');

    act(() => {
      pose = null;
      notify();
    });
    expect(field('X')).toHaveValue('200');
  });
});

describe('SelectionSummary: the other states', () => {
  it('says how many objects are selected, without fields', () => {
    act(() => session.select([DESK, MONITOR]));
    expect(screen.getByText('2 objects selected')).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  });

  it('shows the hint when nothing is selected', () => {
    act(() => session.select([]));
    const hint = screen.getByText('Select an object to edit its properties.');
    expect(within(hint.parentElement as HTMLElement).queryAllByRole('spinbutton')).toHaveLength(0);
  });
});
