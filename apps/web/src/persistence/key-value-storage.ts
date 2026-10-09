/** The part of `localStorage` this module uses; a lookalike in tests and nothing where blocked. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
