/** A legal text (privacy policy, terms): a title and sections of plain paragraphs, no HTML. */
export interface LegalDocument {
  readonly title: string;
  /** For the `<meta name="description">` of the page. */
  readonly description: string;
  /** ISO date of the last change, shown as "last updated". */
  readonly updated: string;
  /**
   * Drafts show a notice until the owner has had them reviewed (P8-01: legal review pending).
   * Set it to false once the reviewed text is in.
   */
  readonly draft: boolean;
  readonly sections: readonly LegalSection[];
}

export interface LegalSection {
  readonly heading: string;
  readonly paragraphs: readonly string[];
}
