import type { IdeaCategory } from '../types';

/**
 * Interface copy for the capture sheet, keyed by the workspace UI language.
 * Every visible capture string comes from here so the sheet follows the
 * selected language instead of mixing hard-coded languages.
 */
export type CaptureCopy = {
  modeTabsLabel: string;
  blogTab: string;
  momentTab: string;
  untitledMoment: string;
  untitledArticle: string;
  titleLabel: string;
  editedJustNow: string;
  articleIntent: string;
  categories: Record<IdeaCategory, string>;
  momentEditorLabel: string;
  articleEditorLabel: string;
  momentPlaceholder: string;
  articlePlaceholder: string;
  addMediaTitle: string;
  addMedia: string;
  saveMomentTitle: string;
  saveArticleTitle: string;
};

const english: CaptureCopy = {
  modeTabsLabel: 'Quick capture mode',
  blogTab: 'Quick article',
  momentTab: 'Log a moment',
  untitledMoment: 'Untitled moment',
  untitledArticle: 'Untitled article',
  titleLabel: 'Title',
  editedJustNow: 'Edited just now',
  articleIntent: 'Article intent',
  categories: {
    inspiration: 'Inspiration',
    thought: 'Thought',
    decision: 'Decision',
    state: 'State',
    event: 'Event',
  },
  momentEditorLabel: 'Moment content',
  articleEditorLabel: 'Article draft',
  momentPlaceholder: 'Write about this moment, or drop videos and photos here…',
  articlePlaceholder: 'Start the article draft… type / for blocks, [[ to link existing content',
  addMediaTitle: 'Add photos or videos',
  addMedia: 'Photos / videos',
  saveMomentTitle: 'Save this moment',
  saveArticleTitle: 'Save the article draft',
};

const chinese: CaptureCopy = {
  modeTabsLabel: '快速书写模式',
  blogTab: '快速写文章',
  momentTab: '记录事件',
  untitledMoment: '未命名事件',
  untitledArticle: '未命名文章',
  titleLabel: '标题',
  editedJustNow: '刚刚编辑',
  articleIntent: '文章意图',
  categories: {
    inspiration: '灵感',
    thought: '想法',
    decision: '决定',
    state: '状态',
    event: '事件',
  },
  momentEditorLabel: '事件内容',
  articleEditorLabel: '文章草稿',
  momentPlaceholder: '记录这一刻，或将视频、图片拖到这里… 输入 / 插入内容',
  articlePlaceholder: '先把文章草稿写下来... 输入 / 插入结构块，[[ 连接已有内容',
  addMediaTitle: '添加图片或视频',
  addMedia: '图片 / 视频',
  saveMomentTitle: '记录事件',
  saveArticleTitle: '保存文章草稿',
};

export const captureCopy = (language: string): CaptureCopy => (
  language === 'zh' ? chinese : english
);
