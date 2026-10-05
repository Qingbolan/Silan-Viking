import React from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { emptyAiSettings, type AiCapability, type AiEngineProfile, type AiEngineStatus } from '../lib/aiEngines';
import './AiEngineSettings.css';

const capabilities: { id: AiCapability; label: string }[] = [{ id: 'text', label: '文本' }, { id: 'image', label: '图像' }, { id: 'speech', label: '语音' }];
const blankProfile = (): AiEngineProfile => ({ provider: 'openai_compatible', baseUrl: 'https://api.openai.com/v1', model: '' });
type Phase = 'loading' | 'idle' | 'saving' | 'testing' | 'removing';

export function AiEngineSettings({ onBusyChange, onConfiguredChange }: { onBusyChange?: (busy: boolean) => void; onConfiguredChange?: (configured: boolean) => void }) {
  const [status, setStatus] = React.useState<AiEngineStatus>({ configured: false, settings: emptyAiSettings });
  const [capability, setCapability] = React.useState<AiCapability>('text');
  const [draft, setDraft] = React.useState<AiEngineProfile>(blankProfile);
  const [key, setKey] = React.useState('');
  const [phase, setPhase] = React.useState<Phase>('loading');
  const [message, setMessage] = React.useState('');
  const drafts = React.useRef<Partial<Record<AiCapability, { profile: AiEngineProfile; key: string }>>>({});
  const busy = phase !== 'idle';
  const saved = status.settings[capability];
  const dirty = !saved || draft.provider !== saved.provider || draft.baseUrl !== saved.baseUrl || draft.model !== saved.model || Boolean(key);
  React.useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  React.useEffect(() => { onConfiguredChange?.(Boolean(status.settings.text || status.settings.image || status.settings.speech)); }, [status, onConfiguredChange]);
  React.useEffect(() => {
    let active = true;
    if (!isTauri()) { setPhase('idle'); return; }
    invoke<AiEngineStatus>('get_ai_engines').then(value => { if (active) { setStatus(value); setDraft(value.settings.text || blankProfile()); } })
      .catch(reason => { if (active) setMessage(String(reason)); }).finally(() => { if (active) setPhase('idle'); });
    return () => { active = false; };
  }, []);
  const selectCapability = (next: AiCapability) => {
    drafts.current[capability] = { profile: draft, key };
    const pending = drafts.current[next];
    setCapability(next); setDraft(pending?.profile || status.settings[next] || blankProfile()); setKey(pending?.key || ''); setMessage('');
  };
  const update = (patch: Partial<AiEngineProfile>) => { setDraft(current => ({ ...current, ...patch })); setMessage(''); };
  const act = async (operation: 'saving' | 'testing' | 'removing') => {
    if (busy) return;
    if (!isTauri()) { setMessage('请在桌面应用中保存或测试 AI 配置。'); return; }
    if (operation === 'saving' && (!draft.model.trim() || !draft.baseUrl.trim())) { setMessage('请输入 API 地址和模型名称。'); return; }
    setPhase(operation); setMessage('');
    try {
      if (operation === 'testing') { setMessage(await invoke<string>('test_ai_engine', { capability })); }
      else {
        const result = await invoke<AiEngineStatus>('save_ai_engine', { input: { capability, profile: operation === 'removing' ? null : draft, apiKey: key || null } });
        delete drafts.current[capability];
        setStatus(result); setDraft(result.settings[capability] || blankProfile()); setKey(''); setMessage(operation === 'removing' ? '已停用' : '已保存');
      }
    } catch (reason) { setMessage(String(reason)); } finally { setPhase('idle'); }
  };
  return <div className="ai-engine-settings" aria-busy={busy}>
    <div className="ai-engine-tabs" role="tablist" aria-label="AI 能力">{capabilities.map(item => <button key={item.id} type="button" role="tab" aria-selected={capability === item.id} disabled={busy} onClick={() => selectCapability(item.id)}>{item.label}</button>)}</div>
    <label>服务<select value={draft.provider} disabled={busy} onChange={e => { setKey(''); update({ provider: e.target.value as AiEngineProfile['provider'], baseUrl: e.target.value === 'ollama' ? 'http://localhost:11434/v1' : 'https://api.openai.com/v1', model: '', credentialId: null }); }}><option value="openai_compatible">OpenAI 兼容服务</option>{capability === 'text' && <option value="ollama">Ollama</option>}</select></label>
    <label>API 地址<input type="url" value={draft.baseUrl} disabled={busy} spellCheck={false} onChange={e => update({ baseUrl: e.target.value })} /></label>
    <label>模型<input value={draft.model} disabled={busy} placeholder="输入服务中的模型名称" spellCheck={false} onChange={e => update({ model: e.target.value })} /></label>
    <label>API Key{draft.provider === 'ollama' ? '（可选）' : ''}<input type="password" value={key} disabled={busy} placeholder={saved?.credentialId && saved.baseUrl === draft.baseUrl ? '已保存，留空保持' : 'API Key'} autoComplete="new-password" spellCheck={false} onChange={e => { setKey(e.target.value); setMessage(''); }} /></label>
    <div className="ai-engine-actions"><button type="button" disabled={busy || !dirty} onClick={() => void act('saving')}>{phase === 'saving' ? '保存中…' : '保存'}</button><button type="button" disabled={busy || dirty} onClick={() => void act('testing')}>{phase === 'testing' ? '测试中…' : '测试连接'}</button>{saved && <button type="button" disabled={busy} onClick={() => void act('removing')}>停用</button>}</div>
    <p className="ai-engine-status" role="status" aria-live="polite">{message}</p>
  </div>;
}
