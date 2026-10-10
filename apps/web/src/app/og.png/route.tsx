import { ImageResponse } from 'next/og';
import { siteMessages } from '@/ui';

/**
 * The Open Graph / Twitter card image, drawn once at build time into the static export as
 * `/og.png` (an extension, so any static host serves it as image/png). No stock photo to license;
 * the font is the one next/og bundles.
 */
export const dynamic = 'force-static';

export function GET() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: 80,
        background: 'linear-gradient(135deg, #0b0d12 0%, #141824 55%, #1a1e27 100%)',
        color: '#e8ebf2',
      }}
    >
      <div
        style={{
          width: 520,
          height: 14,
          borderRadius: 7,
          background: 'linear-gradient(90deg, #ff7a45, #5aa9ff)',
          marginBottom: 48,
        }}
      />
      <div style={{ fontSize: 96, fontWeight: 700 }}>RoomForge</div>
      <div style={{ fontSize: 44, color: '#a3acbd', marginTop: 24, maxWidth: 980 }}>
        {siteMessages.en.hero.lead}
      </div>
    </div>,
    { width: 1200, height: 630 },
  );
}
