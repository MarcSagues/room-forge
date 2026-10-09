import { createEditorSession, type RoomId } from '@roomforge/core';
import { buildDocument, createFixtureCatalog } from '@roomforge/core/testing';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { RoomMaterialsPanel } from './room-materials-panel';

const ROOM = 'room-1' as RoomId;

function setup() {
  const session = createEditorSession({
    initialDocument: buildDocument(),
    catalog: createFixtureCatalog(),
  });
  render(<RoomMaterialsPanel session={session} />);
  const room = () => {
    const found = session.getState().document.rooms[ROOM];
    if (!found) throw new Error('room missing');
    return found;
  };
  return { session, room };
}

const surface = (name: string) => screen.getByRole('button', { name });

describe('RoomMaterialsPanel', () => {
  it('changes the floor with a preset, and only the floor', async () => {
    const { session, room } = setup();
    const before = structuredClone(room());
    await userEvent.click(surface('Oak'));
    expect(room().floor.material.presetId).toBe('wood.oak');
    expect(room().ceiling.material).toEqual(before.ceiling.material);
    expect(room().walls.north.material).toEqual(before.walls.north.material);
    expect(screen.getByRole('button', { name: 'Oak' })).toHaveAttribute('aria-pressed', 'true');
    expect(session.getState().history.undoLabel).toBe('Change room material');
  });

  it('paints one wall or all four, as chosen', async () => {
    const { room } = setup();
    await userEvent.click(surface('East wall'));
    await userEvent.click(surface('Deep navy'));
    expect(room().walls.east.material.presetId).toBe('paint.navy');
    expect(room().walls.west.material.presetId).not.toBe('paint.navy');

    await userEvent.click(surface('All walls'));
    await userEvent.click(surface('Light grey'));
    for (const wall of ['north', 'east', 'south', 'west'] as const) {
      expect(room().walls[wall].material.presetId).toBe('paint.grey');
    }
    expect(room().floor.material.presetId).not.toBe('paint.grey');
  });

  it('undoes a preset change in one step', async () => {
    const { session, room } = setup();
    const before = structuredClone(room());
    await userEvent.click(surface('Ceiling'));
    await userEvent.click(surface('Charcoal'));
    act(() => session.undo());
    expect(room()).toEqual(before);
  });

  it('applies a typed hex tint, normalised', async () => {
    const { room } = setup();
    const field = screen.getByRole('textbox', { name: 'Tint colour (hex)' });
    await userEvent.type(field, 'ABC{Enter}');
    expect(room().floor.material.tint).toBe('#aabbcc');
    expect(field).toHaveValue('#aabbcc');
  });

  it('tints with a swatch of the quick palette, and shows which one is on', async () => {
    const { room } = setup();
    await userEvent.click(surface('Tint #7fb8c9'));
    expect(room().floor.material.tint).toBe('#7fb8c9');
    expect(surface('Tint #7fb8c9')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('textbox', { name: 'Tint colour (hex)' })).toHaveValue('#7fb8c9');
  });

  it('refuses an invalid hex tint: says so, changes nothing, and adds no history', async () => {
    const { session, room } = setup();
    const before = structuredClone(room());
    const field = screen.getByRole('textbox', { name: 'Tint colour (hex)' });
    await userEvent.type(field, '#12zz{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('Use a colour like #aabbcc.');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(room()).toEqual(before);
    expect(session.getState().history.canUndo).toBe(false);

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(field).toHaveValue('');
  });

  it('removes the tint, either by emptying the field or with the button', async () => {
    const { room } = setup();
    const field = screen.getByRole('textbox', { name: 'Tint colour (hex)' });
    await userEvent.type(field, '#336699{Enter}');
    expect(room().floor.material.tint).toBe('#336699');
    await userEvent.click(surface('Remove tint'));
    expect(room().floor.material.tint).toBeUndefined();
    expect(surface('Remove tint')).toBeDisabled();

    await userEvent.type(field, '#336699{Enter}');
    await userEvent.clear(field);
    await userEvent.keyboard('{Enter}');
    expect(room().floor.material.tint).toBeUndefined();
  });

  it('turns a colour drag into one undo step', () => {
    const { session, room } = setup();
    const picker = screen.getByLabelText('Pick a tint colour');
    for (const colour of ['#102030', '#203040', '#304050', '#405060']) {
      fireEvent.change(picker, { target: { value: colour } });
    }
    expect(room().floor.material.tint).toBe('#405060');
    act(() => session.undo());
    expect(room().floor.material.tint).toBeUndefined();
    expect(session.getState().history.canUndo).toBe(false);
  });

  it('moves the finish sliders with the keyboard, keeping the rest of the material', async () => {
    const { room } = setup();
    await userEvent.click(surface('Walnut'));
    const roughness = screen.getByRole('slider', { name: 'Roughness' });
    act(() => roughness.focus());
    await userEvent.keyboard('{ArrowRight}');
    expect(room().floor.material.presetId).toBe('wood.walnut');
    expect(room().floor.material.roughness).toBeCloseTo(0.61, 5);
    expect(room().floor.material.metalness).toBeUndefined();
  });

  it('shows the material of the surface it is pointed at', async () => {
    const { session } = setup();
    act(() => {
      session.execute({
        type: 'test/paint-ceiling',
        label: 'x',
        apply(draft) {
          const room = draft.rooms[ROOM];
          if (room) room.ceiling.material = { presetId: 'panel.white', tint: '#102030' };
        },
      });
    });
    await userEvent.click(surface('Ceiling'));
    expect(surface('White panel')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('textbox', { name: 'Tint colour (hex)' })).toHaveValue('#102030');
    await userEvent.click(surface('Floor'));
    expect(surface('White panel')).toHaveAttribute('aria-pressed', 'false');
  });

  it('gives every control a name', () => {
    setup();
    for (const button of screen.getAllByRole('button')) {
      expect(button, button.outerHTML).toHaveAccessibleName();
    }
    expect(screen.getAllByRole('slider')).toHaveLength(2);
  });
});
