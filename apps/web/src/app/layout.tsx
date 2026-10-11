import '@fontsource-variable/inter';
import './globals.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Providers, siteMessages } from '@/ui';
import { OG_IMAGE } from './seo';
import { site } from './site-config';

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: 'RoomForge',
  applicationName: 'RoomForge',
  description: siteMessages.en.meta.description,
  openGraph: { type: 'website', siteName: 'RoomForge', images: [OG_IMAGE] },
  twitter: { card: 'summary_large_image', images: [OG_IMAGE] },
};

export const viewport: Viewport = { themeColor: '#0b0d12', colorScheme: 'dark light' };

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
