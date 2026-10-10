import type { Locale } from './index';

/**
 * Texts of the image export dialog (P6-06), in both locales. They live apart from the main
 * dictionaries because only the dialog uses them and it is loaded the first time it opens: the
 * `/editor/` initial JS budget has no room for them. Same rules as `messages.ts`.
 */
const en = {
  'image.title': 'Export image',
  'image.intro': 'A PNG of the view as it is now, without the grid, selection and editing guides.',
  'image.preparing': 'Getting the export ready…',
  'image.size': 'Size',
  'image.scale': '{scale}× · {width} × {height} px',
  'image.clamped':
    'This device can render at most {width} × {height} px, so the image will be that size.',
  'image.background': 'Background',
  'image.background.viewport': 'As in the viewport',
  'image.background.transparent': 'Transparent',
  'image.background.color': 'Solid colour',
  'image.backgroundColor': 'Background colour',
  'image.quality': 'Quality',
  'image.quality.draft': 'Draft (fastest, no smoothing)',
  'image.quality.standard': 'Standard',
  'image.quality.high': 'High (smoother edges)',
  'image.file': 'File: {file}',
  'image.rendering': 'Rendering the image…',
  'image.encoding': 'Saving the PNG…',
  'image.progress': 'Export progress',
  'image.export': 'Export PNG',
  'image.cancel': 'Cancel',
  'image.saved': 'Image saved as {file}.',
  'image.error.context-lost':
    'The graphics context was lost, so nothing was exported. Wait for the view to come back and try again.',
  'image.error.too-large':
    'This device cannot make an image that large. Choose a smaller size or a lower quality.',
  'image.error.unavailable': 'The view is not ready yet. Try again in a moment.',
  'image.error.failed': 'The image could not be exported. Try again.',
} as const;

export type ImageMessageKey = keyof typeof en;

const es: Record<ImageMessageKey, string> = {
  'image.title': 'Exportar imagen',
  'image.intro':
    'Un PNG de la vista tal como está, sin la rejilla, la selección ni las guías de edición.',
  'image.preparing': 'Preparando la exportación…',
  'image.size': 'Tamaño',
  'image.scale': '{scale}× · {width} × {height} px',
  'image.clamped':
    'Este equipo puede generar como máximo {width} × {height} px, así que la imagen tendrá ese tamaño.',
  'image.background': 'Fondo',
  'image.background.viewport': 'Como en el visor',
  'image.background.transparent': 'Transparente',
  'image.background.color': 'Color sólido',
  'image.backgroundColor': 'Color de fondo',
  'image.quality': 'Calidad',
  'image.quality.draft': 'Borrador (más rápido, sin suavizado)',
  'image.quality.standard': 'Estándar',
  'image.quality.high': 'Alta (bordes más suaves)',
  'image.file': 'Archivo: {file}',
  'image.rendering': 'Generando la imagen…',
  'image.encoding': 'Guardando el PNG…',
  'image.progress': 'Progreso de la exportación',
  'image.export': 'Exportar PNG',
  'image.cancel': 'Cancelar',
  'image.saved': 'Imagen guardada como {file}.',
  'image.error.context-lost':
    'Se perdió el contexto gráfico y no se exportó nada. Espera a que vuelva la vista e inténtalo de nuevo.',
  'image.error.too-large':
    'Este equipo no puede generar una imagen tan grande. Elige un tamaño menor o una calidad más baja.',
  'image.error.unavailable': 'La vista aún no está lista. Inténtalo de nuevo en un momento.',
  'image.error.failed': 'No se pudo exportar la imagen. Inténtalo de nuevo.',
};

export const imageMessages: Record<Locale, Record<ImageMessageKey, string>> = { en, es };

export function translateImage(
  locale: Locale,
  key: ImageMessageKey,
  vars?: Record<string, string | number>,
): string {
  // Same filling as `translate`, written out so this chunk does not pull the i18n module apart.
  return imageMessages[locale][key].replace(/\{(\w+)\}/g, (match, name: string) =>
    vars && name in vars ? String(vars[name]) : match,
  );
}
