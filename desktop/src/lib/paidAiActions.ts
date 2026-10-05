/**
 * The single owner of paid AI action rules: which engine capability each
 * action spends, whether that engine is usable, and the explicit confirmation
 * every request passes before any provider call starts.
 *
 * Routing mirrors the desktop backend (`ai_engines.rs`): once shared AI
 * engines are configured, each capability uses its own engine profile;
 * before that, the legacy device keys (DeepSeek for review and commit
 * messages, OpenAI for everything else) remain the route.
 */
import type { AiCapability, AiEngineProfile, AiEngineStatus } from './aiEngines';

export type PaidAiActionKind =
  | 'reader_review'
  | 'translation'
  | 'selection_edit'
  | 'cover_generation'
  | 'commit_message'
  | 'dictation';

export type LegacyAiProvider = 'openai' | 'deepseek';

export type PaidAiCredentialState = 'loading' | 'missing' | 'invalid' | 'ready' | 'unavailable';

/** Where one action's request goes, and whether it can go there now. */
export type PaidAiRoute = {
  /** Human name of the destination, e.g. "DeepSeek" or "api.example.com". */
  label: string;
  state: PaidAiCredentialState;
  /** False for a local engine (Ollama): no billing sentence. */
  paid: boolean;
};

export type PaidAiAvailability = {
  enabled: boolean;
  /** Why the action is disabled; null when enabled. */
  reason: string | null;
  /** True when configuring an engine in Settings fixes the reason. */
  settingsFixable: boolean;
};

/** A concrete paid request, described before the owner confirms it. */
export type PaidAiRequest = {
  kind: PaidAiActionKind;
  /** Short action name, e.g. "Reader review". */
  action: string;
  /** What is sent, e.g. "Current language · Blog title · en". */
  scope: string;
};

export type PaidAiConfirmationState =
  | { phase: 'idle' }
  | { phase: 'confirming'; request: PaidAiRequest };

export type PaidAiConfirmationEvent =
  | { type: 'requested'; request: PaidAiRequest }
  | { type: 'confirmed' }
  | { type: 'cancelled' };

export const paidAiActionCapability: Record<PaidAiActionKind, AiCapability> = {
  reader_review: 'text',
  commit_message: 'text',
  translation: 'text',
  selection_edit: 'text',
  cover_generation: 'image',
  dictation: 'speech',
};

/** The device key each action used before shared engines were configured. */
export const legacyAiActionProvider: Record<PaidAiActionKind, LegacyAiProvider> = {
  reader_review: 'deepseek',
  commit_message: 'deepseek',
  translation: 'openai',
  selection_edit: 'openai',
  cover_generation: 'openai',
  dictation: 'openai',
};

export const legacyAiProviderLabel: Record<LegacyAiProvider, string> = {
  openai: 'OpenAI',
  deepseek: 'DeepSeek',
};

export function aiEngineLabel(profile: AiEngineProfile) {
  if (profile.provider === 'ollama') return 'Ollama';
  try {
    return new URL(profile.baseUrl).hostname || profile.baseUrl;
  } catch {
    return profile.baseUrl;
  }
}

/**
 * Resolve the route for one action. `engines` is null until the engine status
 * has loaded; `legacy` holds the device-key states used only while no shared
 * engine is configured.
 */
export function paidAiRoute(
  kind: PaidAiActionKind,
  engines: AiEngineStatus | null | 'unavailable',
  legacy: Record<LegacyAiProvider, PaidAiCredentialState>,
): PaidAiRoute {
  const capability = paidAiActionCapability[kind];
  if (engines === 'unavailable') return { label: 'AI', state: 'unavailable', paid: true };
  if (engines === null) return { label: 'AI', state: 'loading', paid: true };
  if (engines.configured) {
    const profile = engines.settings[capability];
    return profile
      ? { label: aiEngineLabel(profile), state: 'ready', paid: profile.provider !== 'ollama' }
      : { label: `AI ${capability} engine`, state: 'missing', paid: true };
  }
  const provider = legacyAiActionProvider[kind];
  return { label: legacyAiProviderLabel[provider], state: legacy[provider], paid: true };
}

/** Dictation stays one click; every other paid action is confirmed first. */
export const paidAiActionNeedsConfirmation = (kind: PaidAiActionKind) => kind !== 'dictation';

export function paidAiAvailability(kind: PaidAiActionKind, route: PaidAiRoute): PaidAiAvailability {
  const capability = paidAiActionCapability[kind];
  switch (route.state) {
    case 'ready':
      return { enabled: true, reason: null, settingsFixable: false };
    case 'loading':
      return { enabled: false, reason: 'Checking AI engine settings…', settingsFixable: false };
    case 'missing':
      return {
        enabled: false,
        reason: `Set up the AI ${capability} engine in Settings → AI connection to use this.`,
        settingsFixable: true,
      };
    case 'invalid':
      return {
        enabled: false,
        reason: `The stored ${route.label} API key is invalid. Replace it in Settings → AI connection.`,
        settingsFixable: true,
      };
    case 'unavailable':
      return {
        enabled: false,
        reason: 'AI actions are available in the desktop app only.',
        settingsFixable: false,
      };
  }
}

/** The confirmation copy: names the destination, what is sent, and whether it is billed. */
export function describePaidAiRequest(request: PaidAiRequest, route: PaidAiRoute) {
  const provider = route.label;
  const billing = route.paid ? ` It is a paid API call billed to your ${provider} account.` : '';
  return {
    provider,
    title: `${request.action} with ${provider}?`,
    detail: `This sends ${request.scope} to ${provider}.${billing}`,
    confirmLabel: `Send to ${provider}`,
  };
}

export function paidAiConfirmationTransition(
  state: PaidAiConfirmationState,
  event: PaidAiConfirmationEvent,
): PaidAiConfirmationState {
  switch (event.type) {
    case 'requested':
      // One pending confirmation at a time; a second request is refused
      // instead of silently replacing the one the owner is reading.
      return state.phase === 'idle' ? { phase: 'confirming', request: event.request } : state;
    case 'confirmed':
    case 'cancelled':
      return { phase: 'idle' };
  }
}
