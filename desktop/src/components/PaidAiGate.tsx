import React from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { KeyRound, Sparkles } from 'lucide-react';
import { emptyAiSettings, type AiEngineStatus } from '../lib/aiEngines';
import {
  describePaidAiRequest,
  paidAiActionNeedsConfirmation,
  paidAiAvailability,
  paidAiConfirmationTransition,
  paidAiRoute,
  type LegacyAiProvider,
  type PaidAiActionKind,
  type PaidAiAvailability,
  type PaidAiCredentialState,
  type PaidAiRequest,
} from '../lib/paidAiActions';
import type { ApiCredentialStatus } from '../types';
import { Button } from './ds/Button';
import { Dialog, DialogActions, DialogCard, DialogDescription, DialogTitle } from './ds/Dialog';

type PaidAiGateValue = {
  availability: (kind: PaidAiActionKind) => PaidAiAvailability;
  providerLabel: (kind: PaidAiActionKind) => string;
  /**
   * Resolves true only after the owner explicitly confirms the request (or,
   * for dictation, immediately when its key is ready). Every paid call site
   * awaits this before invoking the provider.
   */
  confirm: (request: PaidAiRequest) => Promise<boolean>;
  openSettings: () => void;
  /** The workspace shell registers how Settings → AI connection is opened. */
  registerSettingsHandler: (handler: () => void) => () => void;
  refreshCredentials: () => void;
};

const PaidAiGateContext = React.createContext<PaidAiGateValue | null>(null);

const legacyCredentialCommands: Record<LegacyAiProvider, string> = {
  openai: 'get_openai_credentials',
  deepseek: 'get_deepseek_credentials',
};

export function PaidAiGateProvider({ children }: { children: React.ReactNode }) {
  const settingsHandlerRef = React.useRef<(() => void) | null>(null);
  const [engines, setEngines] = React.useState<AiEngineStatus | null | 'unavailable'>(
    () => (isTauri() ? null : 'unavailable'),
  );
  const [legacy, setLegacy] = React.useState<Record<LegacyAiProvider, PaidAiCredentialState>>(
    { openai: 'loading', deepseek: 'loading' },
  );
  const [confirmation, dispatch] = React.useReducer(paidAiConfirmationTransition, { phase: 'idle' });
  const confirmationRef = React.useRef(confirmation);
  confirmationRef.current = confirmation;
  const resolverRef = React.useRef<((confirmed: boolean) => void) | null>(null);

  const setLegacyCredential = React.useCallback((provider: LegacyAiProvider, state: PaidAiCredentialState) => {
    setLegacy((current) => (current[provider] === state ? current : { ...current, [provider]: state }));
  }, []);

  const registerSettingsHandler = React.useCallback((handler: () => void) => {
    settingsHandlerRef.current = handler;
    return () => {
      if (settingsHandlerRef.current === handler) settingsHandlerRef.current = null;
    };
  }, []);

  const refreshCredentials = React.useCallback(() => {
    if (!isTauri()) return;
    void invoke<AiEngineStatus>('get_ai_engines')
      .then(setEngines)
      .catch(() => setEngines({ configured: false, settings: emptyAiSettings }));
    (Object.keys(legacyCredentialCommands) as LegacyAiProvider[]).forEach((provider) => {
      void invoke<ApiCredentialStatus>(legacyCredentialCommands[provider])
        .then((status) => setLegacyCredential(provider, status.state))
        .catch(() => setLegacyCredential(provider, 'missing'));
    });
  }, [setLegacyCredential]);

  React.useEffect(() => {
    refreshCredentials();
    window.addEventListener('focus', refreshCredentials);
    return () => window.removeEventListener('focus', refreshCredentials);
  }, [refreshCredentials]);

  const route = React.useCallback(
    (kind: PaidAiActionKind) => paidAiRoute(kind, engines, legacy),
    [engines, legacy],
  );
  const availability = React.useCallback(
    (kind: PaidAiActionKind) => paidAiAvailability(kind, route(kind)),
    [route],
  );

  const confirm = React.useCallback((request: PaidAiRequest) => {
    if (!availability(request.kind).enabled) return Promise.resolve(false);
    if (!paidAiActionNeedsConfirmation(request.kind)) return Promise.resolve(true);
    if (confirmationRef.current.phase !== 'idle') return Promise.resolve(false);
    dispatch({ type: 'requested', request });
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, [availability]);

  const settle = React.useCallback((confirmed: boolean) => {
    dispatch({ type: confirmed ? 'confirmed' : 'cancelled' });
    resolverRef.current?.(confirmed);
    resolverRef.current = null;
  }, []);

  const value = React.useMemo<PaidAiGateValue>(() => ({
    availability,
    providerLabel: (kind) => route(kind).label,
    confirm,
    openSettings: () => settingsHandlerRef.current?.(),
    registerSettingsHandler,
    refreshCredentials,
  }), [availability, confirm, refreshCredentials, registerSettingsHandler, route]);

  const copy = confirmation.phase === 'confirming'
    ? describePaidAiRequest(confirmation.request, route(confirmation.request.kind))
    : null;

  return (
    <PaidAiGateContext.Provider value={value}>
      {children}
      <Dialog open={Boolean(copy)} onClose={() => settle(false)}>
        {copy && (
          <DialogCard role="alertdialog" aria-labelledby="paid-ai-confirm-title" aria-describedby="paid-ai-confirm-detail">
            <div className="new-project-badge"><Sparkles size={17} /></div>
            <DialogTitle id="paid-ai-confirm-title">{copy.title}</DialogTitle>
            <DialogDescription id="paid-ai-confirm-detail">{copy.detail}</DialogDescription>
            <DialogActions>
              <Button type="button" variant="secondary" size="sm" data-autofocus onClick={() => settle(false)}>
                Cancel
              </Button>
              <Button type="button" variant="primary" size="sm" onClick={() => settle(true)}>
                {copy.confirmLabel}
              </Button>
            </DialogActions>
          </DialogCard>
        )}
      </Dialog>
    </PaidAiGateContext.Provider>
  );
}

const unavailableGate: PaidAiGateValue = {
  availability: (kind) => paidAiAvailability(kind, paidAiRoute(kind, 'unavailable', { openai: 'unavailable', deepseek: 'unavailable' })),
  providerLabel: () => 'AI',
  confirm: () => Promise.resolve(false),
  openSettings: () => undefined,
  registerSettingsHandler: () => () => undefined,
  refreshCredentials: () => undefined,
};

export function usePaidAiGate() {
  return React.useContext(PaidAiGateContext) || unavailableGate;
}

/** Inline reason for a disabled paid action, with a link to fix it. */
export function PaidAiUnavailableHint({ kind, className = '' }: { kind: PaidAiActionKind; className?: string }) {
  const gate = usePaidAiGate();
  const state = gate.availability(kind);
  if (state.enabled || !state.reason) return null;
  return (
    <p className={`paid-ai-hint ${className}`} role="note">
      <KeyRound size={12} aria-hidden="true" />
      <span>{state.reason}</span>
      {state.settingsFixable && (
        <button type="button" onClick={gate.openSettings}>Open Settings</button>
      )}
    </p>
  );
}
