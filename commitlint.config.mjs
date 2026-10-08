// Conventional Commits as defined in docs/WORKFLOW.md §4.
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'refactor', 'perf', 'test', 'docs', 'chore', 'ci', 'build', 'revert'],
    ],
    'scope-enum': [
      2,
      'always',
      [
        'core',
        'scene',
        'ui',
        'editor',
        'catalog',
        'persistence',
        'export',
        'ai',
        'infra',
        'deps',
        'adr',
        'planning',
      ],
    ],
    'header-max-length': [2, 'always', 72],
    'subject-case': [0],
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
  },
};
