import type { Metadata } from 'next';
import { LegalPage, SitePage, termsOfUse } from '@/ui';
import { legalMetadata } from '../seo';

export const metadata: Metadata = legalMetadata('terms', 'en', termsOfUse.en);

export default function TermsPage() {
  return (
    <SitePage locale="en" page="terms">
      <LegalPage doc={termsOfUse.en} locale="en" />
    </SitePage>
  );
}
