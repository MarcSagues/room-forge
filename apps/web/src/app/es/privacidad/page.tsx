import type { Metadata } from 'next';
import { LegalPage, privacyPolicy, SitePage } from '@/ui';
import { legalMetadata } from '../../seo';

export const metadata: Metadata = legalMetadata('privacy', 'es', privacyPolicy.es);

export default function SpanishPrivacyPage() {
  return (
    <SitePage locale="es" page="privacy">
      <LegalPage doc={privacyPolicy.es} locale="es" />
    </SitePage>
  );
}
