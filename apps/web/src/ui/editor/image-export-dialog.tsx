'use client';

import { type FormEvent, type ReactNode, useEffect, useId, useState } from 'react';
import { Button } from '@/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/ui/components/dialog';
import { type ImageMessageKey, translateImage } from '@/ui/i18n/messages-image';
import {
  IMAGE_QUALITIES,
  IMAGE_SCALES,
  type ImageBackground,
  type ImageExporter,
  type ImageExporterLoader,
  type ImageExportFailure,
  type ImageExportOptions,
  type ImageExportStage,
  type ImageQuality,
  type ImageScale,
} from './image-export';

const t = (key: ImageMessageKey, vars?: Record<string, string | number>) =>
  translateImage('en', key, vars);

type BackgroundKind = ImageBackground['kind'];
const BACKGROUNDS: readonly BackgroundKind[] = ['viewport', 'transparent', 'color'];

type Phase =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'busy'; stage: ImageExportStage }
  | { kind: 'failed'; reason: ImageExportFailure };

export interface ImageExportDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  load: ImageExporterLoader;
  /** Tells the person the image was saved (a toast); `message` is already translated. */
  onSaved(message: string): void;
}

/**
 * The PNG export (P6-06): size (1×/2×/4× the viewport, shrunk with a warning when the device
 * cannot render that much), background and quality, then a busy state while the image is rendered
 * and saved. It cannot be closed half-way (the download would still happen). The choices are kept
 * between openings.
 */
export function ImageExportDialog({ open, onOpenChange, load, onSaved }: ImageExportDialogProps) {
  const [exporter, setExporter] = useState<ImageExporter | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [scale, setScale] = useState<ImageScale>(2);
  const [quality, setQuality] = useState<ImageQuality>('standard');
  const [backgroundKind, setBackgroundKind] = useState<BackgroundKind>('viewport');
  const [color, setColor] = useState('#ffffff');

  // Loaded again on every opening (cheap once its code is in): the view may have changed size, or
  // been mounted since the last time.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    load().then(
      (loaded) => {
        if (cancelled) return;
        setExporter(loaded);
        setPhase({ kind: 'ready' });
      },
      () => !cancelled && setPhase({ kind: 'failed', reason: 'failed' }),
    );
    return () => {
      cancelled = true;
    };
  }, [open, load]);

  const background: ImageBackground =
    backgroundKind === 'color' ? { kind: 'color', color } : { kind: backgroundKind };
  const options: ImageExportOptions = { scale, quality, background };
  const busy = phase.kind === 'busy';
  const plan = exporter?.plan(options) ?? null;

  function close(next: boolean) {
    if (busy) return;
    if (!next && phase.kind === 'failed' && exporter) setPhase({ kind: 'ready' });
    onOpenChange(next);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!exporter || busy) return;
    setPhase({ kind: 'busy', stage: 'rendering' });
    const result = await exporter.export(options, (stage) => setPhase({ kind: 'busy', stage }));
    if (result.ok) {
      setPhase({ kind: 'ready' });
      onOpenChange(false);
      onSaved(t('image.saved', { file: result.filename }));
    } else {
      setPhase({ kind: 'failed', reason: result.reason });
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        showCloseButton={!busy}
        className="sm:max-w-md"
        onEscapeKeyDown={(event) => busy && event.preventDefault()}
        onInteractOutside={(event) => busy && event.preventDefault()}
      >
        <form onSubmit={submit} className="grid gap-4" aria-busy={busy}>
          <DialogHeader>
            <DialogTitle>{t('image.title')}</DialogTitle>
            <DialogDescription>{t('image.intro')}</DialogDescription>
          </DialogHeader>
          {phase.kind === 'loading' ? (
            <p role="status" className="text-fg-muted">
              {t('image.preparing')}
            </p>
          ) : null}
          {exporter ? (
            <fieldset disabled={busy} className="grid gap-4">
              <Choices legend={t('image.size')}>
                {IMAGE_SCALES.map((value) => {
                  const size = exporter.plan({ ...options, scale: value });
                  return (
                    <Radio
                      key={value}
                      name="image-scale"
                      checked={scale === value}
                      onChange={() => setScale(value)}
                    >
                      {t('image.scale', {
                        scale: value,
                        width: size?.width ?? '–',
                        height: size?.height ?? '–',
                      })}
                    </Radio>
                  );
                })}
              </Choices>
              <p aria-live="polite" className="empty:hidden text-sm">
                {plan?.clamped ? (
                  <span className="block rounded-lg border border-warning px-3 py-2">
                    {t('image.clamped', { width: plan.width, height: plan.height })}
                  </span>
                ) : null}
              </p>
              <Choices legend={t('image.background')}>
                {BACKGROUNDS.map((value) => (
                  <Radio
                    key={value}
                    name="image-background"
                    checked={backgroundKind === value}
                    onChange={() => setBackgroundKind(value)}
                  >
                    {t(`image.background.${value}`)}
                  </Radio>
                ))}
                <label className="flex items-center gap-2 pl-6">
                  <input
                    type="color"
                    value={color}
                    onChange={(event) => {
                      setColor(event.target.value);
                      setBackgroundKind('color');
                    }}
                    className="h-7 w-10 cursor-pointer rounded border border-control bg-transparent"
                  />
                  <span className="text-fg-muted">{t('image.backgroundColor')}</span>
                </label>
              </Choices>
              <Choices legend={t('image.quality')}>
                {IMAGE_QUALITIES.map((value) => (
                  <Radio
                    key={value}
                    name="image-quality"
                    checked={quality === value}
                    onChange={() => setQuality(value)}
                  >
                    {t(`image.quality.${value}`)}
                  </Radio>
                ))}
              </Choices>
              <p className="break-all text-fg-muted text-xs">
                {t('image.file', { file: exporter.fileName() })}
              </p>
            </fieldset>
          ) : null}
          {busy ? (
            <div role="status" className="grid gap-1.5">
              <span>{t(phase.stage === 'rendering' ? 'image.rendering' : 'image.encoding')}</span>
              <progress
                aria-label={t('image.progress')}
                max={2}
                value={phase.stage === 'rendering' ? 1 : 2}
                className="h-1.5 w-full accent-accent"
              />
            </div>
          ) : null}
          {phase.kind === 'failed' ? (
            <p role="alert" className="text-destructive">
              {t(`image.error.${phase.reason}`)}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => close(false)}>
              {t('image.cancel')}
            </Button>
            <Button type="submit" disabled={!exporter || busy || plan === null}>
              {t('image.export')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Choices({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-1.5">
      <legend className="mb-1.5 font-medium">{legend}</legend>
      {children}
    </fieldset>
  );
}

function Radio(props: { name: string; checked: boolean; onChange(): void; children: ReactNode }) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="radio"
        name={props.name}
        checked={props.checked}
        onChange={props.onChange}
        className="size-4 accent-accent"
      />
      <label htmlFor={id}>{props.children}</label>
    </div>
  );
}
