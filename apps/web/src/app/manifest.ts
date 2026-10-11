import type { MetadataRoute } from 'next';
import { siteMessages } from '@/ui';

export const dynamic = 'force-static';

/** Basic web app manifest: name, colours and icon. Installing it as a PWA is not a goal yet. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'RoomForge',
    short_name: 'RoomForge',
    description: siteMessages.en.meta.description,
    start_url: '/',
    display: 'standalone',
    background_color: '#0b0d12',
    theme_color: '#0b0d12',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
