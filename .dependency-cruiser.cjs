/** @type {import('dependency-cruiser').IConfiguration} */
const path = require('node:path');
const { buildRules } = require('./tools/checks/arch-rules.cjs');

module.exports = {
  forbidden: buildRules(),
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(\\.next|out|coverage)/' },
    tsConfig: { fileName: path.join(__dirname, 'apps/web/tsconfig.json') },
    tsPreCompilationDeps: true,
    // Only its `resolve.alias` is used (the `@/*` alias of apps/web); see the file for details.
    webpackConfig: { fileName: path.join(__dirname, 'tools/checks/depcruise-resolve.cjs') },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
  },
};
