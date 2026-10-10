import type { Metadata } from 'next';
import { translate } from '@/ui';
import { EditorRoot } from '../editor/editor-root';

export const metadata: Metadata = {
  title: `${translate('en', 'viewer.title')} · ${translate('en', 'app.name')}`,
};

/** `/view/#v1.<payload>`: a shared room, read-only (ADR-0010). The fragment never reaches a server. */
export default function ViewPage() {
  return <EditorRoot app="viewer" />;
}
