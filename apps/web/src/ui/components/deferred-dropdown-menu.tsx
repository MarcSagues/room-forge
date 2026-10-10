'use client';

import {
  type ComponentPropsWithRef,
  cloneElement,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
  type SyntheticEvent,
  useState,
} from 'react';

type MenuModule = typeof import('./dropdown-menu');
type TriggerProps = ComponentPropsWithRef<'button'>;
/** Spread on `DropdownMenuContent`: see `DeferredDropdownMenu`. */
export interface DeferredContentProps {
  onOpenAutoFocus?: (event: Event) => void;
}

let loading: Promise<MenuModule> | null = null;

/**
 * Radix's menu (≈ 9 kB gzip with its focus and scroll helpers) is not needed to draw the editor:
 * it loads when a menu is about to be used (P7-04). Hovering or focusing a trigger starts the load.
 */
export function loadDropdownMenu(): Promise<MenuModule> {
  loading ??= import('./dropdown-menu').catch((error: unknown) => {
    // Tried again on the next attempt (offline, or a deploy replaced the chunk).
    loading = null;
    throw error;
  });
  return loading;
}

/**
 * Radix moves the focus to the first item when a menu is opened from the keyboard, but it learns
 * that from a key listener that did not exist yet when this menu first opened: do it here.
 */
function focusFirstItem(event: Event) {
  const content = event.currentTarget;
  const first =
    content instanceof HTMLElement
      ? content.querySelector<HTMLElement>('[role^="menuitem"]')
      : null;
  if (!first) return;
  event.preventDefault();
  first.focus({ preventScroll: true });
}

/** The keys that open a Radix menu from its trigger. */
const OPEN_KEYS = new Set(['Enter', ' ', 'ArrowDown']);

function compose<E extends SyntheticEvent>(
  theirs: ((event: E) => void) | undefined,
  ours: (event: E) => void,
) {
  return (event: E) => {
    theirs?.(event);
    if (!event.defaultPrevented) ours(event);
  };
}

/**
 * A dropdown menu whose code loads on first use. Until then `trigger` is shown as it is, announced
 * as a menu button, and opens the menu the way Radix would (primary pointer down, Enter, Space,
 * ArrowDown). From then on it is a plain Radix `DropdownMenu`. The content is built from the loaded
 * module, so it never needs a static import of it. Other props (a tooltip's, for one) go to the
 * trigger.
 */
export function DeferredDropdownMenu({
  trigger,
  children,
  ...triggerProps
}: Omit<TriggerProps, 'children'> & {
  trigger: ReactElement<TriggerProps>;
  children: (menu: MenuModule, content: DeferredContentProps) => ReactNode;
}) {
  const [menu, setMenu] = useState<MenuModule | null>(null);
  const [open, setOpen] = useState(false);
  const [byKeyboard, setByKeyboard] = useState(false);

  if (menu) {
    const { DropdownMenu, DropdownMenuTrigger } = menu;
    return (
      <DropdownMenu
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          // Only the opening that loaded the menu needs the help: Radix knows about the next ones.
          if (!next) setByKeyboard(false);
        }}
      >
        <DropdownMenuTrigger asChild {...triggerProps}>
          {trigger}
        </DropdownMenuTrigger>
        {children(menu, byKeyboard ? { onOpenAutoFocus: focusFirstItem } : {})}
      </DropdownMenu>
    );
  }

  const preload = () => {
    loadDropdownMenu().catch(() => {});
  };
  const openMenu = (keyboard: boolean) => {
    loadDropdownMenu().then(
      (module) => {
        setMenu(module);
        setByKeyboard(keyboard);
        setOpen(true);
      },
      () => {},
    );
  };
  return cloneElement(trigger, {
    ...triggerProps,
    'aria-haspopup': 'menu',
    'aria-expanded': false,
    onPointerEnter: compose(triggerProps.onPointerEnter, preload),
    onFocus: compose(triggerProps.onFocus, preload),
    onPointerDown: compose(triggerProps.onPointerDown, (event: PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0 || event.ctrlKey) return;
      // As Radix does: the menu takes the focus, not the button.
      event.preventDefault();
      openMenu(false);
    }),
    onKeyDown: compose(triggerProps.onKeyDown, (event: KeyboardEvent<HTMLButtonElement>) => {
      if (!OPEN_KEYS.has(event.key)) return;
      event.preventDefault();
      openMenu(true);
    }),
  });
}
