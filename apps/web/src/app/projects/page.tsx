import type { Metadata } from 'next';
import { translate } from '@/ui';
import { ProjectsApp } from './projects-app';

export const metadata: Metadata = {
  title: `${translate('en', 'projects.title')} · ${translate('en', 'app.name')}`,
};

export default function ProjectsPage() {
  return <ProjectsApp />;
}
