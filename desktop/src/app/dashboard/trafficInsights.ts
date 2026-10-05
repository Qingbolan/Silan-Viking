import { contentStateSummary } from '../../lib/contentVisibility';
import type { ContentKind, DashboardData, TrafficEvidence } from '../../types';
import { isContentKind } from '../content/contentModel';

export type DashboardRankingMetric =
  | 'views'
  | 'likes'
  | 'comments'
  | 'crawlers'
  | 'ai_crawlers'
  | 'search_bots'
  | 'ai_chat';

export type DashboardRankingItem = {
  kind: ContentKind;
  title: string;
  slug: string;
  count: number;
  detail: string;
  updatedAt: string;
};

type LocationDisplayInput = {
  country_code: string;
  region_code?: string;
  region_name?: string;
  city?: string;
  postal_code?: string;
  place_name?: string;
  place_feature_code?: string;
  place_distance_km?: string;
  latitude?: string;
  longitude?: string;
  time_zone?: string;
  accuracy_radius?: number;
};

type DashboardContentMetadata = Map<string, {
  kind: ContentKind;
  title: string;
  slug: string;
  visibility: string;
  updatedAt: string;
}>;

type DashboardEngagementRecord = {
  kind: ContentKind;
  title: string;
  slug: string;
  visibility: string;
  updatedAt: string;
  likes: number;
  comments: number;
};

export const dashboardRankingLabels: Record<DashboardRankingMetric, string> = {
  views: 'Views ranking',
  likes: 'Likes ranking',
  comments: 'Comments ranking',
  crawlers: 'Crawler ranking',
  ai_crawlers: 'AI crawler ranking',
  search_bots: 'Search bot ranking',
  ai_chat: 'AI chat ranking',
};

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

const pushUniqueLocationPart = (parts: string[], value?: string) => {
  const clean = value?.trim();
  if (!clean) return;
  if (!parts.some((part) => part.toLowerCase() === clean.toLowerCase())) {
    parts.push(clean);
  }
};

export const formatLocationLabel = (location: LocationDisplayInput) => {
  const parts: string[] = [];
  pushUniqueLocationPart(
    parts,
    location.country_code ? regionNames.of(location.country_code) || location.country_code : '',
  );
  pushUniqueLocationPart(parts, location.region_name || location.region_code);
  pushUniqueLocationPart(parts, location.city);
  pushUniqueLocationPart(parts, location.place_name);
  pushUniqueLocationPart(parts, location.postal_code);
  return parts.join(' · ') || 'Location unavailable';
};

export const formatCountryFlag = (countryCode?: string) => {
  const code = countryCode?.trim().toUpperCase();
  if (!code || !/^[A-Z]{2}$/.test(code)) return '';
  return Array.from(code, (letter) => (
    String.fromCodePoint(0x1f1e6 + letter.charCodeAt(0) - 65)
  )).join('');
};

export const formatLocationDetail = (location: LocationDisplayInput) => {
  const details: string[] = [];
  if (location.latitude || location.longitude) {
    details.push([location.latitude, location.longitude].filter(Boolean).join(', '));
  }
  if (location.accuracy_radius && location.accuracy_radius > 0) {
    details.push(`±${location.accuracy_radius} km`);
  }
  if (location.place_name && location.place_distance_km) {
    details.push(`nearest ${location.place_distance_km} km`);
  }
  if (location.time_zone) {
    details.push(location.time_zone);
  }
  return details.join(' · ');
};

// Asset requests (bundles, fonts, images) never reach this evidence: the
// backend classifies request resources at ingestion and in its stats
// projection, so every subject here is a page or a machine-readable file.
export const groupEvidenceByAgent = (evidence: TrafficEvidence[]) => {
  const grouped: Record<string, {
    visits: number;
    events: Set<string>;
    subjects: Record<string, { kind: TrafficEvidence['subject_kind']; visits: number }>;
  }> = {};
  evidence.forEach((item) => {
    grouped[item.agent] ||= { visits: 0, events: new Set(), subjects: {} };
    const group = grouped[item.agent];
    group.visits += item.visits;
    group.events.add(item.event);
    if (item.subject) {
      const key = `${item.subject_kind}:${item.subject}`;
      group.subjects[key] ||= { kind: item.subject_kind, visits: 0 };
      group.subjects[key].visits += item.visits;
    }
  });
  return Object.entries(grouped)
    .map(([agent, group]) => {
      const subjects = Object.entries(group.subjects)
        .map(([key, value]) => ({
          label: key.slice(key.indexOf(':') + 1),
          ...value,
        }))
        .sort((left, right) => right.visits - left.visits || left.label.localeCompare(right.label));
      return {
        agent,
        visits: group.visits,
        event: [...group.events].join(' · '),
        subjects: subjects.slice(0, 6),
        hiddenSubjectCount: Math.max(0, subjects.length - 6),
      };
    })
    .sort((left, right) => right.visits - left.visits || left.agent.localeCompare(right.agent));
};

export const evidenceSourceLabel = (kind: TrafficEvidence['subject_kind']) => {
  switch (kind) {
    case 'ai_query': return 'AI query';
    case 'attributed_topic': return 'Prompt topic';
    case 'keyword':
    case 'search_query':
      return 'Keyword';
    case 'landing_page':
    case 'page':
      return 'Website';
    default:
      return 'Source';
  }
};

export const evidenceEventSourceLabel = (event: string) => {
  if (/\b(referral|click)\b/i.test(event)) return 'Website';
  if (/\b(crawl|crawler|fetch|index|training)\b/i.test(event)) return 'Crawler';
  return 'Source';
};

export const dashboardRankingNoun = (
  metric: DashboardRankingMetric,
  count: number,
) => {
  switch (metric) {
    case 'likes': return count === 1 ? 'like' : 'likes';
    case 'comments': return count === 1 ? 'comment' : 'comments';
    case 'views': return count === 1 ? 'view' : 'views';
    case 'search_bots': return count === 1 ? 'search bot hit' : 'search bot hits';
    case 'ai_crawlers': return count === 1 ? 'AI crawler hit' : 'AI crawler hits';
    case 'ai_chat': return count === 1 ? 'AI chat referral' : 'AI chat referrals';
    default: return count === 1 ? 'crawler hit' : 'crawler hits';
  }
};

export const buildDashboardRankingItems = ({
  metric,
  dashboard,
  contentMetadata,
  engagementRanking,
}: {
  metric: DashboardRankingMetric | null;
  dashboard: DashboardData | null;
  contentMetadata: DashboardContentMetadata;
  engagementRanking: DashboardEngagementRecord[];
}): DashboardRankingItem[] => {
  if (!metric) return [];
  const fromMetadata = (contentType: string, title: string) => {
    const metadata = contentMetadata.get(`${contentType}:${title}`);
    const kind = isContentKind(contentType) ? contentType : 'blog';
    return metadata || {
      kind,
      title,
      slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      visibility: '',
      updatedAt: '',
    };
  };
  const toRankingItem = (
    contentType: string,
    title: string,
    count: number,
    detail?: string,
  ): DashboardRankingItem => {
    const metadata = fromMetadata(contentType, title);
    return {
      kind: metadata.kind,
      title: metadata.title,
      slug: metadata.slug,
      count,
      detail: detail || (metadata.visibility
        ? contentStateSummary(metadata.visibility)
        : contentType),
      updatedAt: metadata.updatedAt,
    };
  };
  if (metric === 'likes' || metric === 'comments') {
    return engagementRanking
      .map((item) => toRankingItem(
        item.kind,
        item.title,
        item[metric],
        contentStateSummary(item.visibility),
      ))
      .filter((item) => item.count > 0)
      .sort((left, right) => (
        right.count - left.count
        || right.updatedAt.localeCompare(left.updatedAt)
        || left.title.localeCompare(right.title)
      ));
  }
  if (metric === 'views') {
    return (dashboard?.top_content || [])
      .map((item) => toRankingItem(item.content_type, item.title, item.views))
      .filter((item) => item.count > 0)
      .sort((left, right) => right.count - left.count || left.title.localeCompare(right.title));
  }

  const counts = new Map<string, { contentType: string; title: string; count: number }>();
  const addTraffic = (
    days: DashboardData['daily_visits'],
    counter: (item: DashboardData['daily_visits'][number]['content'][number]) => number,
  ) => {
    days.forEach((day) => {
      day.content.forEach((item) => {
        const count = counter(item);
        if (count <= 0) return;
        const key = `${item.content_type}:${item.title}`;
        const current = counts.get(key) || { contentType: item.content_type, title: item.title, count: 0 };
        current.count += count;
        counts.set(key, current);
      });
    });
  };
  if (metric === 'search_bots' || metric === 'crawlers') {
    addTraffic(dashboard?.daily_seo_visits || [], (item) => (
      item.evidence
        .filter((trafficEvidence) => trafficEvidence.event === 'Search indexing')
        .reduce((sum, trafficEvidence) => sum + trafficEvidence.visits, 0)
    ));
  }
  if (metric === 'ai_crawlers' || metric === 'crawlers') {
    addTraffic(dashboard?.daily_geo_visits || [], (item) => (
      item.evidence
        .filter((trafficEvidence) => trafficEvidence.event !== 'Referral click')
        .reduce((sum, trafficEvidence) => sum + trafficEvidence.visits, 0)
    ));
  }
  if (metric === 'ai_chat') {
    addTraffic(dashboard?.daily_geo_visits || [], (item) => (
      item.evidence
        .filter((trafficEvidence) => trafficEvidence.event === 'Referral click')
        .reduce((sum, trafficEvidence) => sum + trafficEvidence.visits, 0)
    ));
  }
  return Array.from(counts.values())
    .map((item) => toRankingItem(item.contentType, item.title, item.count))
    .filter((item) => item.count > 0)
    .sort((left, right) => right.count - left.count || left.title.localeCompare(right.title));
};
