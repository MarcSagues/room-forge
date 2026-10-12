'use client';

import {
  type Command,
  type EditorSession,
  type EntityId,
  LIMITS,
  type ObjectId,
  type OpeningId,
  removeObjects,
  removeOpenings,
  reorderObject,
  setObjectProps,
  toggleDoor,
} from '@roomforge/core';
import {
  BoxIcon,
  ChevronRightIcon,
  DoorClosedIcon,
  DoorOpenIcon,
  EyeIcon,
  EyeOffIcon,
  HouseIcon,
  LockIcon,
  LockOpenIcon,
  PanelTopIcon,
} from 'lucide-react';
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useStore } from 'zustand';
import { Button } from '@/ui/components/button';
import { Input } from '@/ui/components/input';
import { type MessageKey, translate } from '@/ui/i18n';
import { cn } from '@/ui/lib/utils';
import { buildOutline, type OutlineRow, reorderTarget, visibleRows } from './outline';

const t = (key: MessageKey, vars?: Record<string, string | number>) => translate('en', key, vars);

/**
 * Above this many rows, off-screen rows skip layout and paint (`content-visibility`). They stay in
 * the DOM, so the tree keeps working with assistive technology and the keyboard.
 */
export const LAZY_ROWS_THRESHOLD = 200;

const KIND_ICONS = {
  room: HouseIcon,
  door: DoorOpenIcon,
  window: PanelTopIcon,
  object: BoxIcon,
} as const;

/**
 * The Scene tab: rooms, openings and objects as a tree (WAI-ARIA tree pattern, roving tabindex).
 * The accessible way to work without the canvas: arrows move, Enter selects, F2 renames, H hides,
 * L locks, O opens or closes a door, Delete removes and Alt+arrows reorder. Every change is a command, so it can be undone,
 * and every action is announced.
 */
export function SceneOutliner({
  session,
  itemName,
}: {
  session: EditorSession;
  /** Display name of a catalog item, for objects without a name of their own. */
  itemName?: ((catalogId: string) => string | undefined) | undefined;
}) {
  const document = useStore(session.store, (state) => state.document);
  const selection = useStore(session.store, (state) => state.selection);
  const rows = useMemo(() => buildOutline(document), [document]);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const shown = useMemo(() => visibleRows(rows, collapsed), [rows, collapsed]);
  const [activeId, setActiveId] = useState<EntityId | null>(null);
  const [editingId, setEditingId] = useState<EntityId | null>(null);
  const [message, setMessage] = useState('');
  const elements = useRef(new Map<string, HTMLDivElement>());
  const focusNext = useRef(false);
  const lastIndex = useRef(0);
  const helpId = useId();

  const labelOf = useCallback(
    (row: OutlineRow) => {
      if (row.kind === 'object') return row.name ?? itemName?.(row.detail) ?? row.detail;
      if (row.kind === 'room') return row.name ?? '';
      const wall = t(`outliner.wall.${row.detail}` as MessageKey);
      return t(row.kind === 'door' ? 'outliner.door' : 'outliner.window', { wall });
    },
    [itemName],
  );

  // The row that takes Tab: the one last moved to, else the selection, else where it used to be.
  const selectedSet = useMemo(() => new Set<string>(selection), [selection]);
  let current = shown.findIndex((row) => row.id === activeId);
  if (current === -1) current = shown.findIndex((row) => selectedSet.has(row.id));
  if (current === -1) current = Math.min(lastIndex.current, shown.length - 1);
  const currentRow = shown[current];
  lastIndex.current = Math.max(current, 0);

  useEffect(() => {
    if (!focusNext.current || !currentRow) return;
    focusNext.current = false;
    elements.current.get(currentRow.id)?.focus();
  });

  // A selection made elsewhere (the canvas) moves the tree there and is announced; one that a
  // command caused (deleting the selected object) is not, so it does not talk over the action.
  const previous = useRef({ document, selection });
  useEffect(() => {
    const before = previous.current;
    previous.current = { document, selection };
    if (before.selection === selection || before.document !== document) return;
    const first = selection[0];
    const row = first === undefined ? undefined : rows.find((r) => r.id === first);
    if (row) {
      setActiveId(row.id);
      setCollapsed((set) => expandAncestors(set, rows, row));
      setMessage(t('outliner.selected', { name: labelOf(row) }));
    } else if (selection.length === 0) {
      setMessage(t('outliner.selectionCleared'));
    }
  }, [document, selection, rows, labelOf]);

  const run = (command: Command, done: string) => {
    const result = session.execute(command);
    setMessage(result.ok ? done : t('outliner.refused'));
  };

  const moveTo = (row: OutlineRow | undefined) => {
    if (!row) return;
    focusNext.current = true;
    setActiveId(row.id);
  };

  const setOpen = (id: EntityId, open: boolean) =>
    setCollapsed((set) => {
      const next = new Set(set);
      if (open) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleHidden = (row: OutlineRow) =>
    run(
      setObjectProps([row.id as ObjectId], { hidden: !row.hidden }),
      t(row.hidden ? 'outliner.shown' : 'outliner.hidden', { name: labelOf(row) }),
    );
  const toggleLocked = (row: OutlineRow) =>
    run(
      setObjectProps([row.id as ObjectId], { locked: !row.locked }),
      t(row.locked ? 'outliner.unlocked' : 'outliner.locked', { name: labelOf(row) }),
    );

  const toggleOpen = (row: OutlineRow) =>
    run(
      toggleDoor(row.id as OpeningId),
      t(row.open ? 'outliner.doorClosed' : 'outliner.doorOpened', { name: labelOf(row) }),
    );

  const select = (row: OutlineRow) => {
    session.select([row.id]);
    setActiveId(row.id);
    setMessage(t('outliner.selected', { name: labelOf(row) }));
  };

  const remove = (row: OutlineRow) => {
    const done = t('outliner.deleted', { name: labelOf(row) });
    focusNext.current = true;
    if (row.kind === 'object') run(removeObjects([row.id as ObjectId]), done);
    else if (row.kind !== 'room') run(removeOpenings([row.id as OpeningId]), done);
  };

  const reorder = (row: OutlineRow, step: -1 | 1) => {
    const index = reorderTarget(session.getState().document, row.id as ObjectId, step);
    if (index === null) return;
    focusNext.current = true;
    const key = step < 0 ? 'outliner.movedUp' : 'outliner.movedDown';
    run(reorderObject(row.id as ObjectId, index), t(key, { name: labelOf(row) }));
  };

  const rename = (row: OutlineRow, value: string | null) => {
    setEditingId(null);
    focusNext.current = true;
    if (value === null) return;
    const name = value.trim() === '' ? null : value.trim();
    if (name === (row.name ?? null)) return;
    const shownName = name ?? itemName?.(row.detail) ?? row.detail;
    run(setObjectProps([row.id as ObjectId], { name }), t('outliner.renamed', { name: shownName }));
  };

  /** What a key does on a row; `null` lets the key through (to the global shortcuts). */
  const actionFor = (key: string, alt: boolean, row: OutlineRow, index: number) => {
    const open = row.hasChildren && !collapsed.has(row.id);
    const object = row.kind === 'object';
    const ifObject = (action: () => void) => (object ? action : null);
    switch (key) {
      case 'ArrowDown':
        return alt ? ifObject(() => reorder(row, 1)) : () => moveTo(shown[index + 1]);
      case 'ArrowUp':
        return alt ? ifObject(() => reorder(row, -1)) : () => moveTo(shown[index - 1]);
      case 'Home':
        return () => moveTo(shown[0]);
      case 'End':
        return () => moveTo(shown[shown.length - 1]);
      case 'ArrowRight':
        if (open) return () => moveTo(shown[index + 1]);
        return () => row.hasChildren && setOpen(row.id, true);
      case 'ArrowLeft':
        if (open) return () => setOpen(row.id, false);
        return () => moveTo(shown.find((r) => r.id === row.parent));
      case 'Enter':
      case ' ':
        return () => select(row);
      case 'F2':
        return ifObject(() => setEditingId(row.id));
      // Always taken: the global shortcut would delete the selection, not this row.
      case 'Delete':
      case 'Backspace':
        return () => remove(row);
      case 'h':
      case 'H':
        return ifObject(() => toggleHidden(row));
      case 'l':
      case 'L':
        return ifObject(() => toggleLocked(row));
      case 'o':
      case 'O':
        return row.kind === 'door' ? () => toggleOpen(row) : null;
      default:
        return null;
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey) return;
    const index = shown.findIndex((row) => elements.current.get(row.id) === event.target);
    const row = shown[index];
    const action = row && actionFor(event.key, event.altKey, row, index);
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    action();
  };

  const lazy = shown.length > LAZY_ROWS_THRESHOLD;
  return (
    <div className="flex flex-col gap-2 p-2">
      <p id={helpId} className="px-1 text-fg-subtle text-xs">
        {t('outliner.help')}
      </p>
      <div
        role="tree"
        aria-label={t('outliner.label')}
        aria-describedby={helpId}
        onKeyDown={onKeyDown}
        className="flex flex-col"
      >
        {shown.map((row) => (
          <OutlinerRow
            key={row.id}
            row={row}
            label={labelOf(row)}
            active={row.id === currentRow?.id}
            selected={selectedSet.has(row.id)}
            expanded={row.hasChildren ? !collapsed.has(row.id) : undefined}
            editing={row.id === editingId}
            lazy={lazy}
            register={elements.current}
            onFocus={setActiveId}
            onSelect={select}
            onToggle={setOpen}
            onHide={toggleHidden}
            onLock={toggleLocked}
            onOpen={toggleOpen}
            onRename={rename}
            onStartRename={setEditingId}
          />
        ))}
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {message}
      </p>
    </div>
  );
}

function expandAncestors(set: ReadonlySet<string>, rows: readonly OutlineRow[], row: OutlineRow) {
  let next: Set<string> | null = null;
  for (let parent = row.parent; parent !== null; ) {
    if (set.has(parent)) {
      next ??= new Set(set);
      next.delete(parent);
    }
    const id: EntityId = parent;
    parent = rows.find((r) => r.id === id)?.parent ?? null;
  }
  return next ?? set;
}

interface RowProps {
  row: OutlineRow;
  label: string;
  active: boolean;
  selected: boolean;
  expanded: boolean | undefined;
  editing: boolean;
  lazy: boolean;
  register: Map<string, HTMLDivElement>;
  onFocus: (id: EntityId) => void;
  onSelect: (row: OutlineRow) => void;
  onToggle: (id: EntityId, open: boolean) => void;
  onHide: (row: OutlineRow) => void;
  onLock: (row: OutlineRow) => void;
  onOpen: (row: OutlineRow) => void;
  onRename: (row: OutlineRow, value: string | null) => void;
  onStartRename: (id: EntityId) => void;
}

/** `OutlinerRow` (DESIGN_SYSTEM §6): one tree item with its visibility and lock toggles. */
function OutlinerRow(props: RowProps) {
  const { row, label, active, selected, expanded, editing, lazy, register } = props;
  const id = useId();
  const Icon = KIND_ICONS[row.kind];
  const isObject = row.kind === 'object';
  const states = [
    row.hidden ? t('outliner.stateHidden') : null,
    row.locked ? t('outliner.stateLocked') : null,
    row.open ? t('outliner.stateOpen') : null,
  ].filter(Boolean);

  return (
    // The tree handles the keys of its rows; the toggles are pointer shortcuts for H and L.
    // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled by the tree (onKeyDown).
    <div
      ref={(element) => {
        if (element) register.set(row.id, element);
        else register.delete(row.id);
      }}
      role="treeitem"
      aria-level={row.level}
      aria-posinset={row.position}
      aria-setsize={row.siblings}
      aria-expanded={expanded}
      aria-selected={selected}
      aria-labelledby={`${id}-label ${id}-state`}
      tabIndex={active ? 0 : -1}
      data-entity-id={row.id}
      onFocus={(event) => event.target === event.currentTarget && props.onFocus(row.id)}
      onClick={() => props.onSelect(row)}
      onDoubleClick={() => isObject && props.onStartRename(row.id)}
      className={cn(
        'flex h-7 cursor-default items-center gap-1 rounded-sm pr-1 outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset aria-selected:bg-hover aria-selected:shadow-[inset_2px_0_0_var(--accent)]',
        lazy && '[contain-intrinsic-size:auto_28px] [content-visibility:auto]',
      )}
      style={{ paddingLeft: `${(row.level - 1) * 12 + 4}px` }}
    >
      <ChevronRightIcon
        aria-hidden
        className={cn(
          'size-3.5 shrink-0 text-fg-subtle transition-transform motion-reduce:transition-none',
          expanded === undefined && 'invisible',
          expanded && 'rotate-90',
        )}
        onClick={(event) => {
          if (expanded === undefined) return;
          event.stopPropagation();
          props.onToggle(row.id, !expanded);
        }}
      />
      <Icon aria-hidden className="size-3.5 shrink-0 text-fg-muted" />
      {editing ? (
        <RenameField
          initial={row.name ?? ''}
          label={t('outliner.rename', { name: label })}
          onDone={(value) => props.onRename(row, value)}
        />
      ) : (
        <span
          id={`${id}-label`}
          className={cn('min-w-0 flex-1 truncate', row.hidden ? 'text-fg-subtle' : 'text-fg')}
        >
          {label}
        </span>
      )}
      <span id={`${id}-state`} className="sr-only">
        {states.join(', ')}
      </span>
      {row.kind === 'door' && (
        <RowToggle
          on={row.open}
          label={t(row.open ? 'outliner.closeDoor' : 'outliner.openDoor', { name: label })}
          onClick={() => props.onOpen(row)}
        >
          {row.open ? <DoorOpenIcon /> : <DoorClosedIcon />}
        </RowToggle>
      )}
      {isObject && (
        <>
          <RowToggle
            on={row.hidden}
            label={t(row.hidden ? 'outliner.show' : 'outliner.hide', { name: label })}
            onClick={() => props.onHide(row)}
          >
            {row.hidden ? <EyeOffIcon /> : <EyeIcon />}
          </RowToggle>
          <RowToggle
            on={row.locked}
            label={t(row.locked ? 'outliner.unlock' : 'outliner.lock', { name: label })}
            onClick={() => props.onLock(row)}
          >
            {row.locked ? <LockIcon /> : <LockOpenIcon />}
          </RowToggle>
        </>
      )}
    </div>
  );
}

function RowToggle(props: {
  on: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      tabIndex={-1}
      aria-label={props.label}
      aria-pressed={props.on}
      className={cn('shrink-0', props.on ? 'text-fg' : 'text-fg-subtle')}
      onClick={(event) => {
        event.stopPropagation();
        props.onClick();
      }}
    >
      {props.children}
    </Button>
  );
}

/** Inline name editor: Enter or leaving the field keeps the name, Escape keeps the old one. */
function RenameField(props: {
  initial: string;
  label: string;
  onDone: (value: string | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const finished = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const finish = (value: string | null) => {
    if (finished.current) return;
    finished.current = true;
    props.onDone(value);
  };
  return (
    <Input
      ref={ref}
      defaultValue={props.initial}
      maxLength={LIMITS.maxNameLength}
      aria-label={props.label}
      className="h-6 min-w-0 flex-1 px-1.5"
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') finish(event.currentTarget.value);
        else if (event.key === 'Escape') finish(null);
      }}
      onBlur={(event) => finish(event.currentTarget.value)}
    />
  );
}
