// Runs synchronously in <head> before first paint so the page never flashes the wrong theme.
// Mirrors resolveTheme() in src/ui/theme.ts (src/ui/theme.test.ts checks they agree).
// Kept as an external file (not inline) so a strict CSP (script-src 'self') keeps working.
(() => {
  let theme = 'dark';
  try {
    const stored = localStorage.getItem('rf.theme');
    const preference =
      stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'dark';
    if (preference === 'system') {
      theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    } else {
      theme = preference;
    }
  } catch (_) {
    // Storage or matchMedia unavailable: keep the dark default.
  }
  document.documentElement.dataset.theme = theme;
})();
