export type StatsFilter = {
  period?: string;
  from?: string;
  to?: string;
  q?: string;
  sort?: string;
  userId?: string;
  articleId?: string;
  templateId?: string;
  page?: string;
};
export type PersonStats = {
  id: string;
  username: string;
  name: string;
  disabled: boolean;
  visits: number;
  effectiveReads: number | null;
  effectiveArticles: number | null;
  activeSeconds: number | null;
  activeDays: number;
  downloads: number;
  distinctTemplates: number;
  favorites: number;
  logins: number;
  lastLoginAt: Date | null;
  lastActiveAt: Date | null;
};
export type ArticleStats = {
  id: string;
  stableId: string;
  title: string;
  visits: number;
  readers: number;
  effectiveReads: number | null;
  effectiveReaders: number | null;
  activeSeconds: number | null;
  favorites: number;
};
export type TemplateStats = {
  id: string;
  stableId: string;
  name: string;
  downloads: number;
  downloaders: number;
};
export type LearningReport = {
  range: { start: Date; end: Date; from: string; to: string };
  collectedSince: Date | null;
  people: PersonStats[];
  articles: ArticleStats[];
  templates: TemplateStats[];
  overview: {
    activeUsers: number;
    visits: number;
    effectiveReads: number | null;
    activeSeconds: number | null;
    downloads: number;
    logins: number;
  };
  trend: {
    day: string;
    activeUsers: number;
    visits: number;
    activeSeconds: number | null;
    downloads: number;
  }[];
  details: {
    page: number;
    pageSize: number;
    totalReads: number;
    totalDownloads: number;
    totalLogins: number;
    reads: {
      id: string;
      userId: string;
      name: string;
      articleId: string;
      articleTitle: string;
      readAt: Date;
      activeSeconds: number | null;
      qualified: boolean | null;
    }[];
    downloads: {
      id: string;
      userId: string;
      name: string;
      templateId: string;
      templateName: string;
      versionLabel: string;
      downloadedAt: Date;
    }[];
    logins: { id: string; userId: string; name: string; occurredAt: Date }[];
  };
};
