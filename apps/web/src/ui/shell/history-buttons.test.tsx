import {
  createEditorSession,
  type EditorSession,
  moveObjects,
  type ObjectId,
} from '@roomforge/core';
import { buildDocument, createFixtureCatalog } from '@roomforge/core/testing';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { HistoryButtons } from './history-buttons';

const DESK = 'desk-1' as ObjectId;
let session: EditorSession;

beforeEach(() => {
  session = createEditorSession({
    initialDocument: buildDocument(),
    catalog: createFixtureCatalog(),
  });
  render(<HistoryButtons session={session} />);
});

const move = () =>
  act(() => {
    session.execute(moveObjects([{ id: DESK, position: [3, 0, 1.5] }]));
  });

describe('HistoryButtons', () => {
  it('are disabled while there is nothing to undo or redo', () => {
    expect(screen.getByRole('button', { name: 'Nothing to undo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Nothing to redo' })).toBeDisabled();
  });

  it('name what they would undo and redo, in their label and tooltip', async () => {
    move();
    const undo = screen.getByRole('button', { name: 'Undo: Move object' });
    expect(undo).toBeEnabled();
    expect(undo).toHaveAttribute('title', 'Undo: Move object');
    await userEvent.click(undo);
    expect(session.getState().document.objects[DESK]?.transform.position[0]).toBe(2);

    const redo = screen.getByRole('button', { name: 'Redo: Move object' });
    expect(redo).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Nothing to undo' })).toBeDisabled();
    await userEvent.click(redo);
    expect(session.getState().document.objects[DESK]?.transform.position[0]).toBe(3);
    expect(screen.getByRole('button', { name: 'Nothing to redo' })).toBeDisabled();
  });

  it('follow the history when it changes elsewhere (a shortcut, the E2E hook)', () => {
    move();
    act(() => {
      session.undo();
    });
    expect(screen.getByRole('button', { name: 'Redo: Move object' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Nothing to undo' })).toBeDisabled();
  });
});
