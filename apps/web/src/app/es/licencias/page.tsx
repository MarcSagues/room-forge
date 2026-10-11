import type { Metadata } from 'next';
import { modelCatalog } from '@/asset-library';
import { LicensesPage, SitePage, siteMessages } from '@/ui';
import { legalMetadata } from '../../seo';

export const metadata: Metadata = legalMetadata('licenses', 'es', siteMessages.es.licensesPage);

/** Generated from the catalog manifest and the dependency report: no hand-copied list. */
export default function SpanishLicensesRoute() {
  return (
    <SitePage locale="es" page="licenses">
      <LicensesPage locale="es" models={modelCatalog.entries()} />
    </SitePage>
  );
}
