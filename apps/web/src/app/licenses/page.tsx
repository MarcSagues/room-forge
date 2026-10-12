import type { Metadata } from 'next';
import { modelCatalog } from '@/asset-library';
import { LicensesPage, SitePage, siteMessages } from '@/ui';
import { legalMetadata } from '../seo';

export const metadata: Metadata = legalMetadata('licenses', 'en', siteMessages.en.licensesPage);

/** Generated from the catalog manifest and the dependency report: no hand-copied list. */
export default function LicensesRoute() {
  return (
    <SitePage locale="en" page="licenses">
      <LicensesPage locale="en" models={modelCatalog.entries()} />
    </SitePage>
  );
}
