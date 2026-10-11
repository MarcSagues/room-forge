/**
 * A night view of a desk lit by an LED strip, drawn in SVG: no image to download, no third-party
 * artwork to license, and sharp at any size. Always dark, like the editor's night mode.
 */
export function RoomIllustration({ label }: { label: string }) {
  return (
    <svg
      viewBox="0 0 480 300"
      role="img"
      aria-label={label}
      className="h-auto w-full rounded-xl border border-subtle"
    >
      <defs>
        <linearGradient id="rf-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#141824" />
          <stop offset="1" stopColor="#0b0d12" />
        </linearGradient>
        <radialGradient id="rf-glow-warm" cx="0.3" cy="0.5" r="0.6">
          <stop offset="0" stopColor="#ff7a45" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ff7a45" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="rf-glow-cool" cx="0.7" cy="0.5" r="0.6">
          <stop offset="0" stopColor="#5aa9ff" stopOpacity="0.5" />
          <stop offset="1" stopColor="#5aa9ff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="rf-strip" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ff7a45" />
          <stop offset="1" stopColor="#5aa9ff" />
        </linearGradient>
      </defs>
      <rect width="480" height="300" fill="url(#rf-wall)" />
      <polygon points="0,230 480,230 480,300 0,300" fill="#10131b" />
      <ellipse cx="170" cy="120" rx="190" ry="110" fill="url(#rf-glow-warm)" />
      <ellipse cx="310" cy="120" rx="190" ry="110" fill="url(#rf-glow-cool)" />
      <rect x="110" y="62" width="260" height="6" rx="3" fill="url(#rf-strip)" />
      <rect x="168" y="86" width="144" height="84" rx="6" fill="#1a1e27" stroke="#5f6a7f" />
      <rect x="176" y="94" width="128" height="68" rx="3" fill="#232834" />
      <path d="M184 150 L214 120 L236 138 L262 108 L296 150 Z" fill="#ff7a45" opacity="0.7" />
      <rect x="234" y="170" width="12" height="22" fill="#5f6a7f" />
      <rect x="96" y="192" width="288" height="10" rx="3" fill="#252c39" />
      <rect x="108" y="202" width="8" height="28" fill="#252c39" />
      <rect x="364" y="202" width="8" height="28" fill="#252c39" />
      <path d="M384 140 h44 a8 8 0 0 1 8 8 v58 h-60 v-58 a8 8 0 0 1 8 -8 Z" fill="#1a1e27" />
      <rect x="372" y="206" width="70" height="12" rx="4" fill="#232834" />
      <rect x="404" y="218" width="6" height="16" fill="#5f6a7f" />
      <rect x="388" y="232" width="38" height="4" rx="2" fill="#5f6a7f" />
    </svg>
  );
}
