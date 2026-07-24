import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { OpenAiCredentialStatus } from '../types';

export type OpenAiCredentialPhase =
  | 'loading'
  | 'ready'
  | 'saving'
  | 'testing'
  | 'removing'
  | 'failed';

export type OpenAiCredentialViewState = {
  phase: OpenAiCredentialPhase;
  status: OpenAiCredentialStatus | null;
  draft: string;
  error: string | null;
};

type OpenAiCredentialEvent =
  | { type: 'draft_changed'; draft: string }
  | { type: 'operation_started'; phase: 'saving' | 'testing' | 'removing' }
  | { type: 'operation_succeeded'; status: OpenAiCredentialStatus; clearDraft: boolean }
  | { type: 'operation_failed'; error: string };

const initialState: OpenAiCredentialViewState = {
  phase: 'loading',
  status: null,
  draft: '',
  error: null,
};

function transition(
  state: OpenAiCredentialViewState,
  event: OpenAiCredentialEvent,
): OpenAiCredentialViewState {
  switch (event.type) {
    case 'draft_changed':
      return { ...state, draft: event.draft, error: null };
    case 'operation_started':
      return { ...state, phase: event.phase, error: null };
    case 'operation_succeeded':
      return {
        phase: 'ready',
        status: event.status,
        draft: event.clearDraft ? '' : state.draft,
        error: null,
      };
    case 'operation_failed':
      return { ...state, phase: 'failed', error: event.error };
  }
}

const errorMessage = (reason: unknown) => String(reason);

export function useOpenAiCredentials() {
  const [state, dispatch] = React.useReducer(transition, initialState);

  React.useEffect(() => {
    let active = true;
    void invoke<OpenAiCredentialStatus>('get_openai_credentials')
      .then((status) => {
        if (active) {
          dispatch({ type: 'operation_succeeded', status, clearDraft: true });
        }
      })
      .catch((reason) => {
        if (active) dispatch({ type: 'operation_failed', error: errorMessage(reason) });
      });
    return () => {
      active = false;
    };
  }, []);

  const save = React.useCallback(async () => {
    const apiKey = state.draft.trim();
    if (!apiKey) {
      dispatch({ type: 'operation_failed', error: 'Enter an OpenAI Platform API key.' });
      return;
    }
    dispatch({ type: 'operation_started', phase: 'saving' });
    try {
      const status = await invoke<OpenAiCredentialStatus>('save_openai_credentials', { apiKey });
      dispatch({ type: 'operation_succeeded', status, clearDraft: true });
    } catch (reason) {
      dispatch({ type: 'operation_failed', error: errorMessage(reason) });
    }
  }, [state.draft]);

  const test = React.useCallback(async () => {
    dispatch({ type: 'operation_started', phase: 'testing' });
    try {
      const status = await invoke<OpenAiCredentialStatus>('test_openai_credentials');
      dispatch({ type: 'operation_succeeded', status, clearDraft: false });
    } catch (reason) {
      dispatch({ type: 'operation_failed', error: errorMessage(reason) });
    }
  }, []);

  const remove = React.useCallback(async () => {
    dispatch({ type: 'operation_started', phase: 'removing' });
    try {
      const status = await invoke<OpenAiCredentialStatus>('remove_openai_credentials');
      dispatch({ type: 'operation_succeeded', status, clearDraft: true });
    } catch (reason) {
      dispatch({ type: 'operation_failed', error: errorMessage(reason) });
    }
  }, []);

  return {
    state,
    setDraft: (draft: string) => dispatch({ type: 'draft_changed', draft }),
    save,
    test,
    remove,
  };
}
