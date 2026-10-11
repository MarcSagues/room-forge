import type { Metadata } from 'next';
import { LegalPage, privacyPolicy, SitePage } from '@/ui';
import { legalMetadata } from '../seo';

export const metadata: Metadata = legalMetadata('privacy', 'en', privacyPolicy.en);

export default function PrivacyPage() {
  return (
    <SitePage locale="en" page="privacy">
      <LegalPage doc={privacyPolicy.en} locale="en" />
    </SitePage>
  );
}
