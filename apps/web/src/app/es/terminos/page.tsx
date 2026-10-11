import type { Metadata } from 'next';
import { LegalPage, SitePage, termsOfUse } from '@/ui';
import { legalMetadata } from '../../seo';

export const metadata: Metadata = legalMetadata('terms', 'es', termsOfUse.es);

export default function SpanishTermsPage() {
  return (
    <SitePage locale="es" page="terms">
      <LegalPage doc={termsOfUse.es} locale="es" />
    </SitePage>
  );
}
