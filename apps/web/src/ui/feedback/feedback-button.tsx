'use client';

import { MessageSquareIcon } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useRef, useState } from 'react';
import { Button } from '../components/button';
import { type Locale, loadLocale, translate } from '../i18n';
import { useCollectDetails } from './feedback-context';

// The dialog (Radix Dialog and the form) is not needed to draw the page: it loads when it first
// opens (the `/` and `/editor/` bundle budgets).
const FeedbackDialog = dynamic(
  () => import('./feedback-dialog').then((module) => module.FeedbackDialog),
  { ssr: false },
);

export interface FeedbackButtonProps {
  locale: Locale;
  /** `icon` for the editor's top bar; `link` for a footer, with its own `label`. */
  variant: 'icon' | 'link';
  label?: string;
}

/** "Send feedback" (P8-04): a dialog that prepares a GitHub issue, with no backend involved. */
export function FeedbackButton({ locale, variant, label }: FeedbackButtonProps) {
  const [open, setOpen] = useState(false);
  // Mounted from the first opening on, so that closing keeps its exit animation.
  const [opened, setOpened] = useState(false);
  const collect = useCollectDetails();
  const trigger = useRef<HTMLButtonElement>(null);
  const name = label ?? translate(locale, 'feedback.open');

  const show = () => {
    // The dialog's texts in this language come with it; English is always there.
    void loadLocale(locale)
      .catch(() => undefined)
      .then(() => {
        setOpened(true);
        setOpen(true);
      });
  };

  return (
    <>
      {variant === 'icon' ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label={name}
          title={name}
          ref={trigger}
          aria-haspopup="dialog"
          onClick={show}
        >
          <MessageSquareIcon />
        </Button>
      ) : (
        <button
          type="button"
          ref={trigger}
          aria-haspopup="dialog"
          className="rounded-sm underline-offset-4 hover:text-fg hover:underline"
          onClick={show}
        >
          {name}
        </button>
      )}
      {opened ? (
        <FeedbackDialog
          locale={locale}
          open={open}
          onOpenChange={setOpen}
          collect={collect}
          returnFocus={trigger}
        />
      ) : null}
    </>
  );
}
