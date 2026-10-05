import assert from 'node:assert/strict';
import test from 'node:test';
import {
  contentSettingsPageTitle,
  contentSettingsPagesFor,
  seriesSettingsPageTitle,
  seriesSettingsPages,
} from './contentSettings.tsx';

test('every settings page title equals its navigation label', () => {
  for (const page of contentSettingsPagesFor('blog', true)) {
    assert.equal(contentSettingsPageTitle(page.id), page.label);
  }
  for (const page of seriesSettingsPages) {
    assert.equal(seriesSettingsPageTitle(page.id), page.label);
  }
  assert.equal(contentSettingsPageTitle('publishing'), 'Publishing');
  assert.equal(seriesSettingsPageTitle('publishing'), 'Publishing');
});

test('Blog and Moment share the same sections in the same order', () => {
  const shared = ['overview', 'relations', 'publishing', 'source'];
  const order = (kind, cover) => contentSettingsPagesFor(kind, cover)
    .map((page) => page.id)
    .filter((id) => shared.includes(id));
  assert.deepEqual(order('blog', true), shared);
  assert.deepEqual(order('moment', false), shared);
  assert.deepEqual(contentSettingsPagesFor('moment', false).map((page) => page.id), shared);
});
