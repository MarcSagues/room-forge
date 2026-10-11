/** Public pages, by locale. The editor, the project list and shared views are not listed. */
export const PUBLIC_PAGES = {
  home: { en: '/', es: '/es/' },
  privacy: { en: '/privacy/', es: '/es/privacidad/' },
  terms: { en: '/terms/', es: '/es/terminos/' },
  licenses: { en: '/licenses/', es: '/es/licencias/' },
} as const;

export type PublicPage = keyof typeof PUBLIC_PAGES;
