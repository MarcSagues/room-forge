import type { NextConfig } from 'next';

const isProduction = process.env.NODE_ENV === 'production';

// Static export (ADR-0002): the MVP has no server. Redirects, headers and middleware
// are not available in `output: 'export'`; they live in platform files (see DEPLOYMENT.md).
const config: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  // `page.dev.tsx` files (e.g. /dev/ui) are routes only in development.
  pageExtensions: isProduction ? ['tsx', 'ts'] : ['tsx', 'ts', 'dev.tsx'],
  // @roomforge/core ships TypeScript sources (ADR-0001); Next compiles them.
  transpilePackages: ['@roomforge/core'],
};

export default config;
