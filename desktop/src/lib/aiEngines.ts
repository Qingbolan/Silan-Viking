export type AiCapability = 'text' | 'image' | 'speech';
export type AiProvider = 'openai_compatible' | 'ollama';
export interface AiEngineProfile { provider: AiProvider; baseUrl: string; model: string; credentialId?: string | null }
export interface AiEngineSettings { version: 1; text: AiEngineProfile | null; image: AiEngineProfile | null; speech: AiEngineProfile | null }
export interface AiEngineStatus { configured: boolean; settings: AiEngineSettings }
export const emptyAiSettings: AiEngineSettings = { version: 1, text: null, image: null, speech: null };
