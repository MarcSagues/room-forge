import { createTemplateDocument, TEMPLATE_IDS } from '@roomforge/core';
import { createFixtureCatalog } from '@roomforge/core/testing';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TemplateDialog } from './template-dialog';
import { TemplatePlan } from './template-plan';

const catalog = createFixtureCatalog([
  { id: 'desk.gaming.160', size: { w: 1.6, h: 0.75, d: 0.75 }, placement: { surfaces: ['floor'] } },
  {
    id: 'light.bars.pair',
    size: { w: 0.38, h: 0.33, d: 0.09 },
    placement: { surfaces: ['floor'] },
    light: { kind: 'bar', cost: 1, defaultColor: '#22d3ee' },
  },
]);

function setup() {
  const onCreate = vi.fn();
  const onOpenChange = vi.fn();
  render(<TemplateDialog open onOpenChange={onOpenChange} catalog={catalog} onCreate={onCreate} />);
  return { onCreate, onOpenChange };
}

describe('TemplateDialog', () => {
  it('offers every template as a radio with its description, the gaming setup first chosen', () => {
    setup();
    expect(screen.getByRole('dialog', { name: 'Start from a template' })).toBeInTheDocument();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(TEMPLATE_IDS.length);
    expect(screen.getByRole('radio', { name: 'Gaming setup' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Home office' })).toHaveAccessibleDescription(
      /arm monitor/,
    );
  });

  it('creates the template chosen, and Cancel creates nothing', async () => {
    const { onCreate, onOpenChange } = setup();
    await userEvent.click(screen.getByRole('radio', { name: 'Streaming corner' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create project' }));
    expect(onCreate).toHaveBeenCalledWith('streaming');

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('moves between templates with the arrow keys, as a radio group does', async () => {
    setup();
    screen.getByRole('radio', { name: 'Gaming setup' }).focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('radio', { name: 'Home office' })).toBeChecked();
  });
});

describe('TemplatePlan', () => {
  it('draws the room, its door and each known item, luminaires in their colour', () => {
    const document = createTemplateDocument('gaming', catalog);
    const { container } = render(<TemplatePlan document={document} catalog={catalog} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    // The room, then the desk and the light bars: the other items are unknown to this catalog.
    expect(container.querySelectorAll('rect')).toHaveLength(3);
    expect(container.querySelectorAll('line')).toHaveLength(1);
    const bars = document.objectOrder
      .map((id) => document.objects[id])
      .find((object) => object?.catalogId === 'light.bars.pair');
    expect(container.querySelector(`rect[fill="${bars?.light?.color}"]`)).not.toBeNull();
  });
});
