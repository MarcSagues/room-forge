import type { Metadata, Viewport } from 'next';
import { translate } from '@/ui';
import { EditorRoot } from '../editor/editor-root';

export const metadata: Metadata = {
  title: `${translate('en', 'viewer.title')} · ${translate('en', 'app.name')}`,
};

/** Edge to edge on phones with a notch, like the editor (P7-06). */
export const viewport: Viewport = { viewportFit: 'cover' };

/** `/view/#v1.<payload>`: a shared room, read-only (ADR-0010). The fragment never reaches a server. */
export default function ViewPage() {
  return <EditorRoot app="viewer" />;
}
