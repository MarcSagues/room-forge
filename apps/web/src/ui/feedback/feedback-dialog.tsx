'use client';

import { type FormEvent, type RefObject, useId, useState } from 'react';
import { Button } from '../components/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/dialog';
import { type Locale, type MessageKey, translate } from '../i18n';
import type { CollectDetails } from './feedback-context';
import {
  buildFeedbackUrl,
  detailsText,
  FEEDBACK_KINDS,
  type FeedbackInput,
  type FeedbackKind,
  feedbackText,
  type TechnicalDetails,
} from './feedback-report';

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev';
const MESSAGE_MAX = 5000;

type Status = 'opened' | 'clipped' | 'copied' | 'copy-failed' | 'empty' | null;

const STATUS_KEY: Record<Exclude<Status, null>, MessageKey> = {
  opened: 'feedback.opened',
  clipped: 'feedback.clipped',
  copied: 'feedback.copied',
  'copy-failed': 'feedback.copyFailed',
  empty: 'feedback.empty',
};

function readDetails(collect: CollectDetails): TechnicalDetails {
  let extra: ReturnType<CollectDetails> = {};
  try {
    extra = collect();
  } catch {
    // A detail that cannot be read is left out; the feedback still goes.
  }
  return { ...extra, appVersion: APP_VERSION, browser: navigator.userAgent };
}

export interface FeedbackDialogProps {
  locale: Locale;
  open: boolean;
  onOpenChange(open: boolean): void;
  collect: CollectDetails;
  /** Gets the focus back on closing: the dialog opens from state, not from a Radix trigger. */
  returnFocus?: RefObject<HTMLElement | null>;
}

/**
 * The feedback form, in its own chunk. Sending opens a prefilled GitHub issue in a new tab (a
 * navigation: the CSP allows no request to GitHub and none is made); copying puts the same text on
 * the clipboard. Only the kind, the message and, if ticked, the technical details are used.
 */
export function FeedbackDialog(props: FeedbackDialogProps) {
  const { locale, open, onOpenChange, collect, returnFocus } = props;
  const t = (key: MessageKey) => translate(locale, key);
  const id = useId();
  const [kind, setKind] = useState<FeedbackKind>('bug');
  const [message, setMessage] = useState('');
  const [details, setDetails] = useState<TechnicalDetails | null>(null);
  const [status, setStatus] = useState<Status>(null);

  const input = (): FeedbackInput | null => {
    if (message.trim() === '') {
      setStatus('empty');
      return null;
    }
    return details ? { kind, message, details } : { kind, message };
  };

  const send = (event: FormEvent) => {
    event.preventDefault();
    const feedback = input();
    if (!feedback) return;
    const { url, clipped } = buildFeedbackUrl(feedback);
    window.open(url, '_blank', 'noopener,noreferrer');
    setStatus(clipped ? 'clipped' : 'opened');
  };

  const copy = async () => {
    const feedback = input();
    if (!feedback) return;
    try {
      await navigator.clipboard.writeText(feedbackText(feedback));
      setStatus('copied');
    } catch {
      setStatus('copy-failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        lang={locale}
        showCloseButton={false}
        className="sm:max-w-md"
        onCloseAutoFocus={(event) => {
          if (!returnFocus?.current) return;
          event.preventDefault();
          returnFocus.current.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('feedback.title')}</DialogTitle>
          <DialogDescription>{t('feedback.description')}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={send}>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 font-medium">{t('feedback.kind')}</legend>
            {FEEDBACK_KINDS.map((option) => (
              <label key={option} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`${id}-kind`}
                  value={option}
                  checked={kind === option}
                  onChange={() => setKind(option)}
                  className="accent-primary"
                />
                {t(`feedback.kind.${option}` as MessageKey)}
              </label>
            ))}
          </fieldset>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-message`} className="font-medium">
              {t('feedback.message')}
            </label>
            <textarea
              id={`${id}-message`}
              value={message}
              maxLength={MESSAGE_MAX}
              rows={5}
              aria-required="true"
              aria-invalid={status === 'empty' || undefined}
              aria-describedby={`${id}-privacy`}
              onChange={(event) => {
                setMessage(event.target.value);
                if (status === 'empty') setStatus(null);
              }}
              className="w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive"
            />
            <p id={`${id}-privacy`} className="text-muted-foreground text-xs">
              {t('feedback.privacy')}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={details !== null}
                onChange={(event) => setDetails(event.target.checked ? readDetails(collect) : null)}
                aria-describedby={`${id}-details-hint`}
                className="accent-primary"
              />
              {t('feedback.details')}
            </label>
            <p id={`${id}-details-hint`} className="text-muted-foreground text-xs">
              {t('feedback.detailsHint')}
            </p>
            {details ? (
              <figure>
                <figcaption className="sr-only">{t('feedback.detailsPreview')}</figcaption>
                <pre className="whitespace-pre-wrap break-all rounded-md bg-muted p-2 text-xs">
                  {detailsText(details)}
                </pre>
              </figure>
            ) : null}
          </div>
          <p role="status" className="min-h-5 text-xs">
            {status ? t(STATUS_KEY[status]) : ''}
          </p>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                {t('feedback.close')}
              </Button>
            </DialogClose>
            <Button type="button" variant="outline" onClick={copy}>
              {t('feedback.copy')}
            </Button>
            <Button type="submit">{t('feedback.submit')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
