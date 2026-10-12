import {
  createEditorSession,
  type EditorSession,
  type OpeningId,
  type SceneDocument,
} from '@roomforge/core';
import {
  buildDocument,
  buildOpening,
  buildRoom,
  createFixtureCatalog,
} from '@roomforge/core/testing';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import { SelectionSummary } from './selection-summary';

const DOOR = 'door-1' as OpeningId;

function setup(initialDocument: SceneDocument = buildDocument()) {
  const session: EditorSession = createEditorSession({
    initialDocument,
    catalog: createFixtureCatalog(),
  });
  const view = render(<SelectionSummary session={session} catalog={createFixtureCatalog()} />);
  act(() => session.select([DOOR]));
  return { session, view, door: () => session.getState().document.openings[DOOR] };
}

describe('DoorProperties', () => {
  it('shows the selected door with its open, swing and hinge switches', async () => {
    const { view } = setup();
    expect(screen.getByRole('heading', { name: 'Door, south wall' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Open' })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: 'Opens outwards' })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: 'Hinge on the right' })).not.toBeChecked();
    const results = await axe.run(view.container);
    expect(
      results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
    ).toEqual([]);
  });

  it('opens, swings and hinges with the keyboard, each one undoable step', async () => {
    const { session, door } = setup();
    const user = userEvent.setup();
    screen.getByRole('switch', { name: 'Open' }).focus();
    await user.keyboard(' ');
    expect(door()?.open).toBe(1);
    expect(screen.getByRole('switch', { name: 'Open' })).toBeChecked();
    await user.click(screen.getByRole('switch', { name: 'Opens outwards' }));
    await user.click(screen.getByRole('switch', { name: 'Hinge on the right' }));
    expect(door()).toMatchObject({ swing: 'out', hinge: 'right', open: 1 });
    // Swing and hinge are one family: changed in a row, one undo takes both back.
    act(() => {
      session.undo();
    });
    expect(door()).toMatchObject({ swing: 'in', hinge: 'left', open: 1 });
  });

  it('says why when the leaf would hit the opposite wall', async () => {
    const room = buildRoom({ shape: { kind: 'rect', width: 4, depth: 2 } });
    const wide = buildOpening({ wall: 'north', offset: 0.5, width: 2.4 });
    setup({
      ...buildDocument(),
      rooms: { [room.id]: room },
      openings: { [wide.id]: wide },
      objects: {},
      objectOrder: [],
    });
    await userEvent.setup().click(screen.getByRole('switch', { name: 'Open' }));
    expect(screen.getByRole('alert')).toHaveTextContent('The door would hit the opposite wall.');
  });
});
