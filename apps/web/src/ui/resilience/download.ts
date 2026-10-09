/** Saves `text` as a file, from the browser. Returns false where that is not possible. */
export function downloadText(filename: string, text: string): boolean {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return false;
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before the address goes away.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
