import { UiKit } from '@/ui';

// Internal component gallery. The `.dev.tsx` page extension only exists in development
// (see next.config.ts), so this route is never part of the production export.
export default function UiKitPage() {
  return <UiKit />;
}
