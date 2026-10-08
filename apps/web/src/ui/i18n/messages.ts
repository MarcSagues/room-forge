/**
 * UI strings (PRD Q1: EN + ES). English is the source of truth; Spanish must provide every key
 * (enforced by the type and by i18n.test.ts). Never concatenate sentences: use {placeholders}.
 */
export const en = {
  'app.name': 'RoomForge',
  'home.tagline': 'Design rooms, offices and gaming setups in 3D.',
  'home.openEditor': 'Open the editor',
  'editor.title': 'Editor',
  'editor.comingSoon': 'Coming soon.',
  'editor.corePackage': 'Core package: {name}',
  'theme.label': 'Theme',
  'theme.system': 'System',
  'theme.light': 'Light',
  'theme.dark': 'Dark',
  'devui.title': 'UI kit',
  'devui.toast.show': 'Show a toast',
  'devui.toast.message': 'Saved. Your design is safe.',
} as const;

export type MessageKey = keyof typeof en;

export const es: Record<MessageKey, string> = {
  'app.name': 'RoomForge',
  'home.tagline': 'Diseña habitaciones, despachos y setups gaming en 3D.',
  'home.openEditor': 'Abrir el editor',
  'editor.title': 'Editor',
  'editor.comingSoon': 'Próximamente.',
  'editor.corePackage': 'Paquete core: {name}',
  'theme.label': 'Tema',
  'theme.system': 'Sistema',
  'theme.light': 'Claro',
  'theme.dark': 'Oscuro',
  'devui.title': 'Kit de interfaz',
  'devui.toast.show': 'Mostrar un aviso',
  'devui.toast.message': 'Guardado. Tu diseño está a salvo.',
};
