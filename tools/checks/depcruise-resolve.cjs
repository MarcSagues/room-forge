'use strict';
// Read by dependency-cruiser (options.webpackConfig) only for its `resolve` section:
// it mirrors the `@/*` path alias of apps/web/tsconfig.json, which enhancedResolveOptions
// cannot express. No webpack is involved.
const path = require('node:path');

module.exports = {
  resolve: { alias: { '@': path.join(__dirname, '..', '..', 'apps', 'web', 'src') } },
};
