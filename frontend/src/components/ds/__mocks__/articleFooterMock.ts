// Mock data for ArticleFooter — silan-viking / Agent infra conversations.
// Replace with real API once backend comment/like endpoints land.

import type { LucideIcon } from 'lucide-react';
import {
  ThumbsUp,
  Heart,
  Sparkles,
  HelpCircle,
  Lightbulb,
  Eye,
  PartyPopper,
  Hand,
} from 'lucide-react';

export interface MockLiker {
  name: string;
  avatar?: string;
}

export interface MockReaction {
  icon: LucideIcon;
  label: string;        // a11y label, e.g. "Like"
  count: number;
  mine?: boolean;
}

export interface MockComment {
  id: string;
  username: string;
  avatar?: string;
  content: string;
  createdAt: string;
  ipRegion?: string;
  reactions?: MockReaction[];
  replyTo?: string;
  replies?: MockComment[];
}

// Reaction presets — bind a semantic label to a lucide icon so call sites
// don't sprinkle lucide imports everywhere.
export const Reactions = {
  Like:     { icon: ThumbsUp,    label: 'Like' },
  Love:     { icon: Heart,       label: 'Love' },
  Brilliant:{ icon: Sparkles,    label: 'Brilliant' },
  Thinking: { icon: HelpCircle,  label: 'Thinking' },
  Insight:  { icon: Lightbulb,   label: 'Insight' },
  Watching: { icon: Eye,         label: 'Watching' },
  Celebrate:{ icon: PartyPopper, label: 'Celebrate' },
  Clap:     { icon: Hand,        label: 'Clap' },
} as const;

export const mockRecentLikers: MockLiker[] = [
  { name: 'FireflyNote' },
  { name: '凉冰' },
  { name: 'NoahQ' },
  { name: '海峰' },
  { name: '莫浩' },
  { name: '晓雯' },
  { name: 'Xiaokui Xiao' },
  { name: '吃饭第一名' },
  { name: 'ideal' },
  { name: '瀚博' },
  { name: '王云飞' },
  { name: '山药旦子' },
  { name: 'Silan' },
];

export const mockComments: MockComment[] = [
  {
    id: 'c1',
    username: '凉冰',
    content: '把 status 和 visibility 拆成两个轴这个设计太对了，我之前在做 EasyNet 的时候吃过把 lifecycle 和 publish 混在一起的亏。',
    createdAt: '2026-04-21 14:32',
    ipRegion: '新加坡',
    reactions: [
      { ...Reactions.Like, count: 24 },
      { ...Reactions.Brilliant, count: 5 },
    ],
  },
  {
    id: 'c2',
    username: 'ideal',
    content: '请问 silan-viking 的 propose / accept 模型跟 Git 的 PR 流程在心智模型上是一致的吗？还是说 propose 更像是 stash？',
    createdAt: '2026-04-25 23:06',
    reactions: [
      { ...Reactions.Thinking, count: 8 },
    ],
    replies: [
      {
        id: 'c2r1',
        username: 'Silan',
        content: '更像 PR — 每个 propose 是一个独立分支，accept 是 fast-forward 合到 main，CI gate 全绿才能 accept。MCP 那一端的 agent 只能 propose，不能 accept。',
        createdAt: '2026-04-26 09:14',
      },
      {
        id: 'c2r2',
        username: '吃饭第一名',
        content: 'Agent 不能 accept 这个边界是结构性的还是只是默认配置？',
        createdAt: '2026-04-27 10:42',
      },
      {
        id: 'c2r3',
        username: 'Silan',
        replyTo: '吃饭第一名',
        content: '结构性的。MCP server 根本没实现 accept 工具，所以 agent 即使越权也调不出来。owner 必须用 CLI。',
        createdAt: '2026-04-27 11:08',
        ipRegion: '新加坡',
        reactions: [
          { ...Reactions.Like, count: 12 },
        ],
      },
    ],
  },
  {
    id: 'c3',
    username: '海峰',
    content: '这套 Rust → Go → React 三语言一份 schema 的契约用什么 CI 来卡？光靠 review 不放心。',
    createdAt: '2026-05-02 16:49',
    ipRegion: '北京',
    reactions: [
      { ...Reactions.Like, count: 18 },
      { ...Reactions.Watching, count: 3 },
    ],
  },
  {
    id: 'c4',
    username: '瀚博(Ian)',
    content: '我自己用 silan-viking 一周了，最大的感受是「idea 不会再丢」。以前 idea 写在 notes app 里就再也找不到了，现在 status: experimenting 的卡放着我自己会回去看。',
    createdAt: '2026-05-10 22:15',
    reactions: [
      { ...Reactions.Love, count: 31 },
      { ...Reactions.Celebrate, count: 4 },
    ],
  },
  {
    id: 'c5',
    username: 'NoahQ',
    content: '想问下 silan://agent/ 的 memory namespace 现在能跨 agent 共享吗？还是每个 agent 一个独立的 namespace？',
    createdAt: '2026-05-15 11:30',
  },
  {
    id: 'c6',
    username: '王云飞',
    content: '六类内容里 episode 跟 update 这两个边界我有点没分清 — 「教程的一集」跟「项目的一次更新」感觉可以合并？',
    createdAt: '2026-05-18 19:44',
    ipRegion: '湖北',
    reactions: [
      { ...Reactions.Thinking, count: 6 },
    ],
    replies: [
      {
        id: 'c6r1',
        username: '凉冰',
        replyTo: '王云飞',
        content: 'episode 是面向读者的连续叙事（一本书的一章），update 是面向自己/团队的工作日志（这周做了什么）。受众和写作语气都不一样，分开是对的。',
        createdAt: '2026-05-18 20:12',
        ipRegion: '新加坡',
        reactions: [
          { ...Reactions.Insight, count: 9 },
        ],
      },
    ],
  },
];
