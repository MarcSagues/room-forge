import { createEditorSession, type RoomId } from '@roomforge/core';
import { buildDocument, createFixtureCatalog } from '@roomforge/core/testing';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { RoomSizePanel } from './room-size-panel';

const ROOM = 'room-1' as RoomId;

function setup() {
  const session = createEditorSession({
    initialDocument: buildDocument(),
    catalog: createFixtureCatalog(),
  });
  render(<RoomSizePanel session={session} />);
  const room = () => {
    const found = session.getState().document.rooms[ROOM];
    if (!found) throw new Error('room missing');
    return found;
  };
  return { session, room };
}

const field = (name: string) => screen.getByRole('textbox', { name });
const apply = () => screen.getByRole('button', { name: 'Apply size' });

async function typeInto(name: string, text: string) {
  const input = field(name);
  await userEvent.clear(input);
  if (text) await userEvent.type(input, text);
}

describe('RoomSizePanel', () => {
  it('shows the room size and has nothing to apply until something changes', () => {
    setup();
    expect(field('Width')).toHaveValue('4');
    expect(field('Depth')).toHaveValue('3');
    expect(field('Height')).toHaveValue('2.6');
    expect(apply()).toBeDisabled();
  });

  it('resizes the room in one history entry that undo brings back', async () => {
    const { session, room } = setup();
    await typeInto('Width', '5.5');
    await typeInto('Depth', '4,25');
    expect(apply()).toBeEnabled();
    await userEvent.click(apply());
    expect(room().shape).toMatchObject({ width: 5.5, depth: 4.25 });
    expect(room().height).toBe(2.6);
    expect(apply()).toBeDisabled();

    act(() => session.undo());
    expect(room().shape).toMatchObject({ width: 4, depth: 3 });
    expect(session.getState().history.canUndo).toBe(false);
  });

  it('applies with Enter', async () => {
    const { room } = setup();
    await userEvent.clear(field('Height'));
    await userEvent.type(field('Height'), '3{Enter}');
    expect(room().height).toBe(3);
  });

  it('reads and shows centimetres, converting what was typed when the unit changes', async () => {
    const { room } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'cm' }));
    expect(field('Width')).toHaveValue('400');
    expect(field('Height')).toHaveValue('260');
    await typeInto('Width', '525');
    await userEvent.click(screen.getByRole('button', { name: 'm' }));
    expect(field('Width')).toHaveValue('5.25');
    await userEvent.click(apply());
    expect(room().shape.width).toBe(5.25);
  });

  it.each([
    ['1.5', 'At least 2 m.'],
    ['12.5', 'At most 12 m.'],
    ['', 'Enter a number.'],
    ['wide', 'That is not a number.'],
  ])('cannot confirm a width of %j: says %j and changes nothing', async (text, message) => {
    const { session, room } = setup();
    await typeInto('Width', text);
    const input = field('Width');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(message);
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(apply()).toBeDisabled();
    await userEvent.type(input, '{Enter}');
    expect(room().shape.width).toBe(4);
    expect(session.getState().history.canUndo).toBe(false);
  });

  it('holds the height to its own limits, and says them in the unit in use', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'cm' }));
    await typeInto('Height', '200');
    expect(screen.getByRole('alert')).toHaveTextContent('At least 220 cm.');
    await typeInto('Height', '410');
    expect(screen.getByRole('alert')).toHaveTextContent('At most 400 cm.');
  });

  it('refuses to shrink the room around the furniture: lists it, changes nothing, can select it', async () => {
    const { session, room } = setup();
    const before = structuredClone(room());
    await typeInto('Width', '2');
    await userEvent.click(apply());

    const alert = screen.getByText('Not applied. These would end up outside the room:');
    const listed = within(alert.parentElement as HTMLElement).getAllByRole('listitem');
    expect(listed.length).toBeGreaterThan(0);
    expect(room()).toEqual(before);
    expect(session.getState().history.canUndo).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: 'Show them' }));
    expect(session.getState().selection).toContain('desk-1');
  });

  it('forgets the conflict as soon as the value is edited', async () => {
    setup();
    await typeInto('Width', '2');
    await userEvent.click(apply());
    expect(screen.getByText('Not applied. These would end up outside the room:')).toBeVisible();
    await typeInto('Width', '3.5');
    expect(screen.queryByText('Not applied. These would end up outside the room:')).toBeNull();
  });

  it('follows the document: an undo from elsewhere shows the old size again', async () => {
    const { session } = setup();
    await typeInto('Depth', '5');
    await userEvent.click(apply());
    expect(field('Depth')).toHaveValue('5');
    act(() => session.undo());
    expect(field('Depth')).toHaveValue('3');
  });
});
