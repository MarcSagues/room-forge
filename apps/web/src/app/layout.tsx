import '@fontsource-variable/inter';
import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers, translate } from '@/ui';

export const metadata: Metadata = {
  title: translate('en', 'app.name'),
  description: 'Design rooms, offices and gaming setups in 3D with LED/RGB lighting.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // data-theme is set by /theme-init.js before first paint, so React must not reset it.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script src="/theme-init.js" />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
