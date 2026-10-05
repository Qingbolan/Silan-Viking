import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDashboardRankingItems, groupEvidenceByAgent } from './trafficInsights.ts';

const evidence = (subject, visits, subjectKind = 'page') => ({
  agent: 'ByteDance Bytespider',
  event: 'AI crawl',
  subject_kind: subjectKind,
  subject,
  visits,
});

test('crawler evidence keeps every backend subject: pages and machine files', () => {
  const [group] = groupEvidenceByAgent([
    evidence('Homepage', 4),
    evidence('Llms.txt', 2),
    evidence('Robots.txt', 1),
    evidence('Blog · Agent Memory', 3),
  ]);

  assert.equal(group.agent, 'ByteDance Bytespider');
  assert.equal(group.visits, 10);
  assert.deepEqual(group.subjects.map((subject) => subject.label), [
    'Homepage',
    'Blog · Agent Memory',
    'Llms.txt',
    'Robots.txt',
  ]);
  assert.equal(group.hiddenSubjectCount, 0);
  assert.equal('technicalVisits' in group, false, 'asset classification belongs to the backend');
});

test('crawler evidence caps the visible subject list', () => {
  const [group] = groupEvidenceByAgent(
    Array.from({ length: 8 }, (_, index) => evidence(`Page ${index}`, 8 - index)),
  );
  assert.equal(group.subjects.length, 6);
  assert.equal(group.hiddenSubjectCount, 2);
});

test('AI crawler ranking sums crawl evidence per content item', () => {
  const day = (content) => ({ date: '2026-10-04', visits: 0, unique_visitors: 0, content });
  const item = (title, visits, event = 'AI crawl') => ({
    content_type: 'blog',
    title,
    visits,
    unique_visitors: 0,
    comments: 0,
    evidence: [{ agent: 'GPTBot', event, subject_kind: 'page', subject: title, visits }],
    visitors: [],
  });
  const items = buildDashboardRankingItems({
    metric: 'ai_crawlers',
    dashboard: {
      daily_geo_visits: [
        day([item('Agent Memory', 3), item('Homepage', 2)]),
        day([item('Homepage', 2), item('Agent Memory', 4, 'Referral click')]),
      ],
    },
    contentMetadata: new Map(),
    engagementRanking: [],
  });
  assert.deepEqual(items.map(({ title, count }) => [title, count]), [
    ['Homepage', 4],
    ['Agent Memory', 3],
  ]);
});
