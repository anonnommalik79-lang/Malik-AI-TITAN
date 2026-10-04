export type SearchResult = {
  title: string;
  url: string;
  domain: string;
  snippet?: string;
  publishedAt?: string;
  score?: number;
  provider?: string;
};

export type FetchedSource = {
  title: string;
  url: string;
  domain: string;
  text: string;
  snippet?: string;
  publishedAt?: string;
  provider?: string;
  /** The page's own preview picture (og:image / twitter:image), https only. */
  image?: string;
};

export type ResearchFinal = {
  answer: string;
  sources: SearchResult[];
  webSourceCount: number;
  cached: boolean;
  tookMs: number;
};
