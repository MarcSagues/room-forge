import { createEditorSession, type ObjectId, removeObjects, setObjectProps } from '@roomforge/core';
import { buildDocument, createFixtureCatalog } from '@roomforge/core/testing';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SelectionSummary } from './selection-summary';

const DESK = 'desk-1' as ObjectId;
const MONITOR = 'monitor-1' as ObjectId;

function setup() {
  const session = createEditorSession({
    initialDocument: buildDocument(),
    catalog: createFixtureCatalog(),
  });
  render(<SelectionSummary session={session} />);
  return session;
}

describe('SelectionSummary', () => {
  it('shows the hint when nothing is selected', () => {
    setup();
    expect(screen.getByText('Select an object to edit its properties.')).toBeInTheDocument();
  });

  it('shows the selected object and follows renames', () => {
    const session = setup();
    act(() => session.select([DESK]));
    expect(screen.getByRole('heading', { name: 'Unnamed object' })).toBeInTheDocument();
    expect(screen.getByText('desk.basic.120')).toBeInTheDocument();
    act(() => {
      session.execute(setObjectProps([DESK], { name: 'Main desk' }));
    });
    expect(screen.getByRole('heading', { name: 'Main desk' })).toBeInTheDocument();
  });

  it('counts a multi-selection', () => {
    const session = setup();
    act(() => session.select([DESK, MONITOR]));
    expect(screen.getByText('2 objects selected')).toBeInTheDocument();
  });

  it('clears when the selected object is deleted', () => {
    const session = setup();
    act(() => session.select([MONITOR]));
    act(() => {
      session.execute(removeObjects([DESK]));
    });
    expect(screen.getByText('Select an object to edit its properties.')).toBeInTheDocument();
  });
});
