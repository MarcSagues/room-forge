import {
  duplicateObjects,
  type EditorSession,
  nextWallMode,
  type ObjectId,
  removeObjects,
} from '@roomforge/core';
import type { ShortcutDef } from './registry';

export interface EditorShortcutDeps {
  session: EditorSession;
  /** Frames the room in the viewport (the scene owns the camera). */
  fit(): void;
}

/**
 * The editor's own shortcuts (DESIGN_SYSTEM §4): history, selection and the view. Each acts on the
 * session, or on the camera through `fit`. Shortcuts that belong to another module (the panels,
 * the help dialog, moving and turning objects) are registered by that module.
 */
export function editorShortcuts({ session, fit }: EditorShortcutDeps): ShortcutDef[] {
  const selected = () => session.getState().selection as readonly ObjectId[];
  const hasSelection = () => selected().length > 0;

  return [
    {
      id: 'edit.undo',
      keys: [{ mod: true, key: 'z' }],
      category: 'edit',
      description: 'shortcut.undo',
      repeat: true,
      enabled: () => session.getState().history.canUndo,
      handler: () => {
        session.undo();
      },
    },
    {
      id: 'edit.redo',
      keys: [
        { mod: true, shift: true, key: 'z' },
        { ctrl: true, key: 'y' },
      ],
      category: 'edit',
      description: 'shortcut.redo',
      repeat: true,
      enabled: () => session.getState().history.canRedo,
      handler: () => {
        session.redo();
      },
    },
    {
      id: 'edit.duplicate',
      keys: [{ mod: true, key: 'd' }],
      category: 'edit',
      description: 'shortcut.duplicate',
      enabled: hasSelection,
      handler: () => {
        const before = session.getState().document.objectOrder.length;
        const result = session.execute(duplicateObjects(selected()));
        if (!result.ok) return;
        // Select the copies of what was selected, not the objects that came along on top of them.
        const { objectOrder, objects } = session.getState().document;
        const added = objectOrder.slice(before);
        const roots = added.filter((id) => {
          const parent = objects[id as ObjectId]?.parentId;
          return !parent || !added.includes(parent);
        });
        session.select(roots as ObjectId[], 'replace');
      },
    },
    {
      id: 'edit.delete',
      keys: [{ key: 'Delete' }, { key: 'Backspace' }],
      category: 'edit',
      description: 'shortcut.delete',
      enabled: hasSelection,
      handler: () => {
        session.execute(removeObjects(selected()));
      },
    },
    {
      id: 'selection.clear',
      keys: [{ key: 'Escape' }],
      category: 'selection',
      description: 'shortcut.deselect',
      enabled: hasSelection,
      handler: () => session.select([]),
    },
    {
      id: 'view.perspective',
      keys: [{ code: ['Digit1', 'Numpad1'] }],
      category: 'view',
      description: 'shortcut.perspective',
      handler: () => session.setView('perspective'),
    },
    {
      id: 'view.top',
      keys: [{ code: ['Digit2', 'Numpad2'] }],
      category: 'view',
      description: 'shortcut.top',
      handler: () => session.setView('top'),
    },
    {
      id: 'view.fit',
      keys: [{ key: 'f' }],
      category: 'view',
      description: 'shortcut.fit',
      handler: fit,
    },
    {
      id: 'view.walls',
      keys: [{ key: 'w' }],
      category: 'view',
      description: 'shortcut.walls',
      handler: () => session.setWallMode(nextWallMode(session.getState().wallMode)),
    },
    {
      id: 'view.ceiling',
      keys: [{ key: 'c' }],
      category: 'view',
      description: 'shortcut.ceiling',
      handler: () => session.setShowCeiling(!session.getState().showCeiling),
    },
  ];
}
