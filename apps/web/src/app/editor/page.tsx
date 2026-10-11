import type { Viewport } from 'next';
import { EditorRoot } from './editor-root';

/**
 * The viewport fills the screen edge to edge on phones with a notch; the viewer pads its bars with
 * the safe-area insets (P7-06). Only the editor and the viewer opt in: the other pages keep the
 * browser's own margins.
 */
export const viewport: Viewport = { viewportFit: 'cover' };

export default function EditorPage() {
  return <EditorRoot />;
}
