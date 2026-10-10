import { describe, expect, it } from 'vitest';
import { appCatalog, catalogEntries } from './app-catalog';
import { stubEntries } from './stub-catalog';

describe('appCatalog', () => {
  it('lists the nine models first, then the stub boxes, with unique ids', () => {
    const entries = catalogEntries();
    expect(entries).toHaveLength(9 + stubEntries().length);
    expect(entries[0]?.id).toBe('desk.office.140');
    expect(entries.slice(9)).toEqual(stubEntries());
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length);
  });

  it('knows both kinds of item, and only models have a GLB', () => {
    expect(appCatalog.getItem('chair.gaming.racing')?.size).toEqual({ w: 0.68, h: 1.3, d: 0.7 });
    expect(appCatalog.getItem('bed.single')?.size).toEqual({ w: 0.9, h: 0.5, d: 2.0 });
    expect(appCatalog.getItem('test.box')).toBeUndefined();
    expect(appCatalog.modelUrlOf('chair.gaming.racing')).toBe(
      '/assets/models/chair.gaming.racing.glb',
    );
    expect(appCatalog.modelUrlOf('bed.single')).toBeUndefined();
  });

  it('colours a model placeholder with its first slot, and a stub box with its own colour', () => {
    expect(appCatalog.colorOf('desk.office.140')).toBe('#c6a47d');
    expect(appCatalog.colorOf('bed.single')).toBe('#8fb8de');
  });
});
