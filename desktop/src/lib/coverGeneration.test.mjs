import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCoverBrief,
  initialCoverGenerationState,
  transitionCoverGeneration,
} from './coverGeneration.ts';

test('Chinese content creates an audience-first XHS cover brief', () => {
  const brief = createCoverBrief({
    contentKind: 'blog',
    title: 'Researcher 为论文做网站，能不能只是完成一次更新？',
    description: '几分钟完成一次更新，让研究进展被记录、理解和发现。',
    language: 'zh',
  });

  assert.equal(brief.language, 'zh');
  assert.equal(brief.headline, 'Researcher 为论文做网站，能不能只是完成一次更新？');
  assert.equal(brief.value, '几分钟完成一次更新，让研究进展被记录、理解和发现。');
  assert.match(brief.audience, /快速判断/);
});

test('series covers use the series context and portrait orientation when selected', () => {
  const brief = createCoverBrief({
    contentKind: 'series',
    title: 'Field Notes',
    description: 'A practical research diary.',
    language: 'en',
  });

  assert.equal(brief.contentKind, 'series');
  assert.equal(brief.audience, 'Readers deciding whether to follow this topic');
  assert.equal(brief.value, 'A practical research diary.');
});

test('project covers describe the project audience instead of article readers', () => {
  const brief = createCoverBrief({
    contentKind: 'project',
    title: 'Silan Viking',
    description: 'Make research work findable.',
    language: 'en',
  });

  assert.equal(brief.contentKind, 'project');
  assert.match(brief.audience, /project/);
  assert.equal(brief.value, 'Make research work findable.');
});

test('cover generation requires an explicit candidate and apply transition', () => {
  const asset = {
    uri: 'silan://resources/blog/example/assets/cover.png',
    relative_path: 'blog/example/assets/cover.png',
    file_name: 'cover.png',
    byte_count: 100,
    markdown: '![cover](silan://resources/blog/example/assets/cover.png)',
    local_path: '/tmp/cover.png',
  };

  const generating = transitionCoverGeneration(initialCoverGenerationState, { type: 'started' });
  assert.equal(generating.phase, 'generating');
  const candidate = transitionCoverGeneration(generating, { type: 'succeeded', asset });
  assert.equal(candidate.phase, 'candidate');
  assert.equal(candidate.asset.uri, asset.uri);
  const applied = transitionCoverGeneration(candidate, { type: 'applied' });
  assert.equal(applied.phase, 'applied');
});
