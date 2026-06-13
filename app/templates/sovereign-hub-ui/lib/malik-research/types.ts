export type SearchResult = {
  title: string;
  url: string;
  domain: string;
  snippet?: string;
  publishedAt?: string;
};

export type FetchedSource = {
  title: string;
  url: string;
  domain: string;
  text: string;
  snippet?: string;
  publishedAt?: string;
};

export type ResearchFinal = {
  answer: string;
  sources: SearchResult[];
  webSourceCount: number;
  cached: boolean;
  tookMs: number;
};
