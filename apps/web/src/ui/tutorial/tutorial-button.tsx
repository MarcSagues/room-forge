'use client';

import { GraduationCapIcon } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/ui/components/button';
import { translate } from '@/ui/i18n';
import { markTutorialSeen, tutorialSeen } from './tutorial-steps';

const t = (key: Parameters<typeof translate>[1]) => translate('en', key);

// The tour is not needed to draw the editor: it loads when it opens (the `/editor/` budget).
const TutorialTour = dynamic(
  () => import('./tutorial-tour').then((module) => module.TutorialTour),
  {
    ssr: false,
  },
);

/**
 * The tour's button in the top bar (P8-02). The tour opens by itself on the first visit; finishing
 * or skipping it is remembered, and this button opens it again at any time.
 */
export function TutorialButton() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!tutorialSeen()) setOpen(true);
  }, []);
  const close = useCallback(() => {
    markTutorialSeen();
    setOpen(false);
  }, []);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t('tutorial.open')}
        title={t('tutorial.open')}
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <GraduationCapIcon />
      </Button>
      {open ? <TutorialTour onClose={close} /> : null}
    </>
  );
}
