import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NewRoomDialog } from './new-room-dialog';

function setup() {
  const onCreate = vi.fn();
  const onOpenChange = vi.fn();
  const view = render(<NewRoomDialog open onOpenChange={onOpenChange} onCreate={onCreate} />);
  return { onCreate, onOpenChange, ...view };
}

const field = (name: string) => screen.getByRole('textbox', { name });
const create = () => screen.getByRole('button', { name: 'Create project' });

async function typeInto(name: string, text: string) {
  const input = field(name);
  await userEvent.clear(input);
  if (text) await userEvent.type(input, text);
}

describe('NewRoomDialog', () => {
  it('opens on the default size, which can be created straight away', async () => {
    const { onCreate } = setup();
    expect(screen.getByRole('dialog', { name: 'New room' })).toBeInTheDocument();
    expect(field('Width')).toHaveValue('4');
    expect(field('Depth')).toHaveValue('4.5');
    expect(field('Height')).toHaveValue('2.6');
    expect(screen.getByRole('button', { name: /^Gaming/ })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(create());
    expect(onCreate).toHaveBeenCalledWith({ width: 4, depth: 4.5, height: 2.6 });
  });

  it('fills the size from a preset and says which one is chosen', async () => {
    const { onCreate } = setup();
    await userEvent.click(screen.getByRole('button', { name: /^Small/ }));
    expect(field('Width')).toHaveValue('3');
    expect(field('Depth')).toHaveValue('3');
    expect(screen.getByRole('button', { name: /^Small/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^Gaming/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    await userEvent.click(screen.getByRole('button', { name: /^Office/ }));
    expect(field('Depth')).toHaveValue('3.5');
    await userEvent.click(create());
    expect(onCreate).toHaveBeenCalledWith({ width: 4, depth: 3.5, height: 2.6 });
  });

  it('a typed size stops matching a preset and is the one created, in either unit', async () => {
    const { onCreate } = setup();
    await typeInto('Width', '5,25');
    expect(screen.getByRole('button', { name: /^Gaming/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await userEvent.click(screen.getByRole('button', { name: 'cm' }));
    expect(field('Width')).toHaveValue('525');
    await typeInto('Height', '300');
    await userEvent.click(create());
    expect(onCreate).toHaveBeenCalledWith({ width: 5.25, depth: 4.5, height: 3 });
  });

  it.each([
    ['Width', '1.9', 'At least 2 m.'],
    ['Depth', '12.5', 'At most 12 m.'],
    ['Height', '2', 'At least 2.2 m.'],
    ['Height', '4.1', 'At most 4 m.'],
    ['Width', '', 'Enter a number.'],
    ['Depth', 'big', 'That is not a number.'],
  ])('cannot create with %s = %j: says %j and does nothing', async (name, text, message) => {
    const { onCreate } = setup();
    await typeInto(name, text);
    expect(field(name)).toHaveAttribute('aria-invalid', 'true');
    expect(field(name)).toHaveAccessibleDescription(message);
    expect(create()).toBeDisabled();
    await userEvent.type(field(name), '{Enter}');
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('draws the plan of the size typed, and fades it while a value is wrong', async () => {
    setup();
    expect(screen.getByRole('img', { name: 'Plan of a room 4 by 4.5 m' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Small/ }));
    const plan = screen.getByRole('img', { name: 'Plan of a room 3 by 3 m' });
    expect(plan).not.toHaveClass('opacity-40');
    await typeInto('Width', 'x');
    expect(screen.getByRole('img', { name: /^Plan of a room/ })).toHaveClass('opacity-40');
  });

  it('creates with Enter from a field, and Cancel creates nothing', async () => {
    const { onCreate, onOpenChange } = setup();
    await userEvent.type(field('Depth'), '{Enter}');
    expect(onCreate).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('every control has a name', () => {
    setup();
    for (const button of screen.getAllByRole('button')) {
      expect(button, button.outerHTML).toHaveAccessibleName();
    }
    for (const input of screen.getAllByRole('textbox')) {
      expect(input, input.outerHTML).toHaveAccessibleName();
    }
  });
});
