import { checkInvariants, createTemplateDocument, STARTER_TEMPLATES } from '@roomforge/core';
import { describe, expect, it } from 'vitest';
import { appCatalog } from './app-catalog';

// Core checks the templates against a mirror of the catalog; this checks them against the real one,
// so a model that changes size or loses its light cannot leave a template broken.
describe('starter templates with the app catalog', () => {
  it.each(STARTER_TEMPLATES.map((template) => template.id))(
    'builds "%s" from real models only, inside the invariants',
    (id) => {
      const template = STARTER_TEMPLATES.find((entry) => entry.id === id);
      for (const object of template?.objects ?? []) {
        expect(appCatalog.modelUrlOf(object.catalogId), object.catalogId).toBeDefined();
        expect(Boolean(appCatalog.getItem(object.catalogId)?.light), object.catalogId).toBe(
          object.light !== undefined,
        );
      }
      const document = createTemplateDocument(id, appCatalog);
      expect(checkInvariants(document, appCatalog)).toEqual([]);
    },
  );
});
