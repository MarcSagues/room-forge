import Link from 'next/link';
import { buttonVariants } from '../components/button';
import type { Locale } from '../i18n';
import { RoomIllustration } from './room-illustration';
import { siteMessages } from './site-messages';

/**
 * The landing page (P8-01). Plain HTML from a server component: no three.js and no client code
 * beyond what every page loads, so it stays inside the `/` bundle budget. The FAQ uses
 * `<details>`, which is keyboard accessible without any script.
 */
export function Landing({ locale }: { locale: Locale }) {
  const t = siteMessages[locale];
  return (
    <>
      <section
        aria-labelledby="hero-title"
        className="mx-auto grid max-w-5xl items-center gap-10 px-6 py-16 md:grid-cols-2"
      >
        <div className="flex flex-col items-start gap-5">
          <p className="font-medium text-ember text-sm">{t.hero.eyebrow}</p>
          <h1 id="hero-title" className="font-semibold text-5xl tracking-tight">
            RoomForge
          </h1>
          <p className="text-2xl text-fg leading-snug">{t.hero.lead}</p>
          <p className="text-base text-fg-muted">{t.hero.body}</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/editor/" className={buttonVariants({ size: 'lg' })}>
              {t.hero.primary}
            </Link>
            <Link href="/projects/" className={buttonVariants({ size: 'lg', variant: 'outline' })}>
              {t.hero.secondary}
            </Link>
          </div>
          <p className="text-fg-muted text-sm">{t.hero.note}</p>
        </div>
        <RoomIllustration label={t.hero.illustration} />
      </section>

      <section aria-labelledby="features-title" className="border-subtle border-t bg-surface">
        <div className="mx-auto max-w-5xl px-6 py-14">
          <h2 id="features-title" className="font-semibold text-3xl tracking-tight">
            {t.features.title}
          </h2>
          <ul className="mt-8 grid gap-6 sm:grid-cols-2">
            {t.features.items.map((item) => (
              <li key={item.title} className="rounded-lg border border-subtle bg-canvas p-5">
                <h3 className="font-semibold text-lg">{item.title}</h3>
                <p className="mt-2 text-fg-muted">{item.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="steps-title" className="mx-auto max-w-5xl px-6 py-14">
        <h2 id="steps-title" className="font-semibold text-3xl tracking-tight">
          {t.steps.title}
        </h2>
        <ol className="mt-6 grid list-decimal gap-3 pl-6 text-fg-muted marker:text-ember">
          {t.steps.items.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="faq-title" className="border-subtle border-t bg-surface">
        <div className="mx-auto max-w-3xl px-6 py-14">
          <h2 id="faq-title" className="font-semibold text-3xl tracking-tight">
            {t.faq.title}
          </h2>
          <div className="mt-6 divide-y divide-subtle">
            {t.faq.items.map((item) => (
              <details key={item.question} className="group py-4">
                <summary className="cursor-pointer font-medium text-lg marker:text-ember">
                  {item.question}
                </summary>
                <p className="mt-2 text-fg-muted">{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section
        aria-labelledby="closing-title"
        className="mx-auto flex max-w-5xl flex-col items-start gap-4 px-6 py-16"
      >
        <h2 id="closing-title" className="font-semibold text-3xl tracking-tight">
          {t.closing.title}
        </h2>
        <p className="text-fg-muted">{t.closing.body}</p>
        <Link href="/editor/" className={buttonVariants({ size: 'lg' })}>
          {t.closing.cta}
        </Link>
      </section>
    </>
  );
}
