export interface QueryDomElementSummary {
  tagName: string;
  id: string | null;
  className: string | null;
  textContent: string | null;
  attributes: Record<string, string>;
}

export interface QueryDomResult {
  total: number;
  elements: QueryDomElementSummary[];
}
