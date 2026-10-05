import assert from 'node:assert/strict';
import test from 'node:test';
import {
  describePaidAiRequest,
  paidAiActionCapability,
  paidAiActionNeedsConfirmation,
  paidAiAvailability,
  paidAiConfirmationTransition,
  paidAiRoute,
} from './paidAiActions.ts';

const legacyReady = { openai: 'ready', deepseek: 'ready' };
const noEngines = { configured: false, settings: { version: 1, text: null, image: null, speech: null } };
const engines = {
  configured: true,
  settings: {
    version: 1,
    text: { provider: 'openai_compatible', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', credentialId: 'text-1' },
    image: null,
    speech: { provider: 'ollama', baseUrl: 'http://localhost:11434/v1', model: 'whisper' },
  },
};

test('every paid action spends one engine capability', () => {
  for (const kind of ['reader_review', 'commit_message', 'translation', 'selection_edit']) {
    assert.equal(paidAiActionCapability[kind], 'text');
  }
  assert.equal(paidAiActionCapability.cover_generation, 'image');
  assert.equal(paidAiActionCapability.dictation, 'speech');
});

test('without shared engines, actions keep their legacy device key', () => {
  assert.equal(paidAiRoute('reader_review', noEngines, legacyReady).label, 'DeepSeek');
  assert.equal(paidAiRoute('translation', noEngines, legacyReady).label, 'OpenAI');
  const missing = paidAiRoute('reader_review', noEngines, { openai: 'ready', deepseek: 'missing' });
  assert.equal(missing.state, 'missing');
});

test('configured engines route by capability and name the real destination', () => {
  const text = paidAiRoute('translation', engines, legacyReady);
  assert.deepEqual(text, { label: 'api.deepseek.com', state: 'ready', paid: true });
  assert.equal(paidAiRoute('dictation', engines, legacyReady).paid, false);
  const image = paidAiRoute('cover_generation', engines, legacyReady);
  assert.equal(image.state, 'missing', 'a configured setup without an image engine must not fall back to a legacy key');
});

test('a missing or invalid engine disables the action with a Settings-fixable reason', () => {
  const missing = paidAiAvailability('cover_generation', paidAiRoute('cover_generation', engines, legacyReady));
  assert.equal(missing.enabled, false);
  assert.equal(missing.settingsFixable, true);
  assert.match(missing.reason, /AI image engine in Settings/);
  assert.match(paidAiAvailability('translation', { label: 'OpenAI', state: 'invalid', paid: true }).reason, /OpenAI/);
  assert.equal(paidAiAvailability('translation', paidAiRoute('translation', null, legacyReady)).enabled, false);
  assert.deepEqual(paidAiAvailability('translation', paidAiRoute('translation', engines, legacyReady)), {
    enabled: true,
    reason: null,
    settingsFixable: false,
  });
});

test('paid requests wait in one shared confirmation that names provider and scope', () => {
  const request = { kind: 'reader_review', action: 'Reader review', scope: 'Current language · Post · en' };
  const confirming = paidAiConfirmationTransition({ phase: 'idle' }, { type: 'requested', request });
  assert.equal(confirming.phase, 'confirming');
  const other = { kind: 'translation', action: 'Translation', scope: 'Whole article' };
  assert.equal(
    paidAiConfirmationTransition(confirming, { type: 'requested', request: other }),
    confirming,
    'a second request must not replace the confirmation being read',
  );
  const copy = describePaidAiRequest(request, paidAiRoute('reader_review', noEngines, legacyReady));
  assert.match(copy.title, /DeepSeek/);
  assert.match(copy.detail, /Current language · Post · en/);
  assert.match(copy.detail, /paid/);
  const local = describePaidAiRequest(request, { label: 'Ollama', state: 'ready', paid: false });
  assert.doesNotMatch(local.detail, /paid/);
  assert.deepEqual(paidAiConfirmationTransition(confirming, { type: 'cancelled' }), { phase: 'idle' });
  assert.deepEqual(paidAiConfirmationTransition(confirming, { type: 'confirmed' }), { phase: 'idle' });
});

test('dictation stays one click while every other paid action is confirmed', () => {
  assert.equal(paidAiActionNeedsConfirmation('dictation'), false);
  for (const kind of ['reader_review', 'translation', 'selection_edit', 'cover_generation', 'commit_message']) {
    assert.equal(paidAiActionNeedsConfirmation(kind), true);
  }
});
