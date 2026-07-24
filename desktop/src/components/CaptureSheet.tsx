import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AlertCircle, Check, LoaderCircle, Mic, Sparkles, Square } from 'lucide-react';
import { EditorAssistDock, type EditorAssistReference } from './EditorAssistDock';
import { LanguageCloseControls } from './LanguageCloseControls';
import MarkdownEditor, { type MarkdownEditorHandle } from './MarkdownEditor';
import type { CapturePhase, CaptureTarget, IdeaCategory } from '../types';

type CaptureCategoryOption = { value: IdeaCategory; label: string; Icon: typeof Sparkles };

type CaptureSheetProps = {
  phase: CapturePhase;
  target: CaptureTarget;
  onTargetChange: (target: CaptureTarget) => void;
  category: IdeaCategory;
  language: string;
  onCategoryChange: (category: IdeaCategory) => void;
  onLanguageChange: (language: string) => void;
  categories: CaptureCategoryOption[];
  note: string;
  onNoteChange: (note: string) => void;
  attachments: File[];
  references: EditorAssistReference[];
  error: string | null;
  inputRef: React.Ref<MarkdownEditorHandle>;
  onAttachFiles: (files: File[]) => void;
  onInsertMarkdown: (markdown: string) => void;
  onRequestClose: () => void;
  onDiscard: () => void;
  onKeepWriting: () => void;
  onSubmit: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  onTransitionEnd: (event: React.TransitionEvent<HTMLElement>) => void;
  origin: { x: number; y: number };
};

const MAX_DICTATION_MS = 60_000;

export function CaptureSheet({
  phase,
  target,
  onTargetChange,
  category,
  language,
  onCategoryChange,
  onLanguageChange,
  categories,
  note,
  onNoteChange,
  attachments,
  references,
  error,
  inputRef,
  onAttachFiles,
  onInsertMarkdown,
  onRequestClose,
  onDiscard,
  onKeepWriting,
  onSubmit,
  onKeyDown,
  onTransitionEnd,
  origin,
}: CaptureSheetProps) {
  const [voicePhase, setVoicePhase] = React.useState<'idle' | 'recording' | 'transcribing'>('idle');
  const [voiceError, setVoiceError] = React.useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = React.useState(0);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const recordingStartedAtRef = React.useRef<number | null>(null);
  const recordingDeadlineRef = React.useRef<number | null>(null);
  const recordingClockRef = React.useRef<number | null>(null);
  const waveformCanvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const clearRecordingTimers = () => {
    if (recordingDeadlineRef.current !== null) window.clearTimeout(recordingDeadlineRef.current);
    if (recordingClockRef.current !== null) window.clearInterval(recordingClockRef.current);
    recordingDeadlineRef.current = null;
    recordingClockRef.current = null;
  };

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  React.useEffect(() => () => {
    clearRecordingTimers();
    recorderRef.current?.stop();
    stopStream();
  }, []);

  React.useEffect(() => {
    if (voicePhase !== 'recording' || !streamRef.current || !waveformCanvasRef.current) return;

    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(streamRef.current);
    const samples = new Uint8Array(analyser.frequencyBinCount);
    const canvas = waveformCanvasRef.current;
    const context = canvas.getContext('2d');
    let animationFrame = 0;
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.72;
    source.connect(analyser);

    const draw = () => {
      if (!context) return;
      const bounds = canvas.getBoundingClientRect();
      const pixelRatio = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(bounds.width * pixelRatio));
      const height = Math.max(1, Math.round(bounds.height * pixelRatio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      analyser.getByteFrequencyData(samples);
      context.clearRect(0, 0, width, height);
      context.fillStyle = 'rgba(255, 255, 255, 0.92)';
      context.beginPath();
      const barCount = 22;
      const gap = 2 * pixelRatio;
      const barWidth = Math.max(pixelRatio, (width - gap * (barCount - 1)) / barCount);
      for (let index = 0; index < barCount; index += 1) {
        const sampleIndex = Math.floor((index / barCount) * samples.length * 0.72);
        const strength = samples[sampleIndex] / 255;
        const barHeight = Math.max(2 * pixelRatio, strength * height * 0.92);
        const x = index * (barWidth + gap);
        const y = (height - barHeight) / 2;
        context.roundRect(x, y, barWidth, barHeight, barWidth / 2);
      }
      context.fill();
      animationFrame = window.requestAnimationFrame(draw);
    };
    draw();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      source.disconnect();
      analyser.disconnect();
      void audioContext.close();
    };
  }, [voicePhase]);

  const startVoiceInput = async () => {
    setVoiceError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
        .find((mime) => MediaRecorder.isTypeSupported(mime));
      const recorder = new MediaRecorder(stream, preferredMime ? { mimeType: preferredMime } : undefined);
      const chunks: Blob[] = [];
      streamRef.current = stream;
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = async () => {
        clearRecordingTimers();
        const startedAt = recordingStartedAtRef.current;
        const durationMs = startedAt === null
          ? 1
          : Math.max(1, Math.min(MAX_DICTATION_MS, Math.round(performance.now() - startedAt)));
        recordingStartedAtRef.current = null;
        setVoicePhase('transcribing');
        setRecordingSeconds(0);
        stopStream();
        try {
          const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
          const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
          const transcript = await invoke<string>('transcribe_audio', {
            audio: bytes,
            mimeType: blob.type || 'audio/webm',
            durationMs,
          });
          onNoteChange([note.trim(), transcript].filter(Boolean).join(note.trim() ? '\n\n' : ''));
        } catch (reason) {
          setVoiceError(String(reason));
        } finally {
          recorderRef.current = null;
          setVoicePhase('idle');
        }
      };
      recordingStartedAtRef.current = performance.now();
      recorder.start();
      setVoicePhase('recording');
      setRecordingSeconds(0);
      recordingClockRef.current = window.setInterval(() => {
        const startedAt = recordingStartedAtRef.current;
        if (startedAt !== null) {
          setRecordingSeconds(Math.min(60, Math.floor((performance.now() - startedAt) / 1000)));
        }
      }, 250);
      recordingDeadlineRef.current = window.setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop();
      }, MAX_DICTATION_MS);
    } catch (reason) {
      clearRecordingTimers();
      recordingStartedAtRef.current = null;
      stopStream();
      setVoiceError(String(reason));
      setVoicePhase('idle');
    }
  };

  const toggleVoiceInput = () => {
    if (voicePhase === 'recording') recorderRef.current?.stop();
    else if (voicePhase === 'idle') void startVoiceInput();
  };

  return (
    <section
      className="moment-capture"
      data-phase={phase}
      data-target={target}
      aria-hidden={phase === 'closed'}
      onTransitionEnd={onTransitionEnd}
      style={{
        '--capture-origin-x': `${origin.x}px`,
        '--capture-origin-y': `${origin.y}px`,
      } as React.CSSProperties}
    >
      <header className="capture-header">
        <nav className="capture-mode-tabs" role="tablist" aria-label="快速书写模式">
          <button
            type="button"
            role="tab"
            aria-selected={target === 'blog'}
            className={target === 'blog' ? 'active' : ''}
            onClick={() => onTargetChange('blog')}
            disabled={phase === 'submitting'}
          >
            快速写文章
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={target === 'moment'}
            className={target === 'moment' ? 'active' : ''}
            onClick={() => onTargetChange('moment')}
            disabled={phase === 'submitting'}
          >
            记录事件
          </button>
        </nav>
        <LanguageCloseControls
          className="capture-language-close"
          languages={[{ language: 'en' }, { language: 'zh' }]}
          activeLanguage={language}
          disabled={phase === 'submitting'}
          closeLabel="Close capture"
          closeTitle="Close capture"
          onLanguageSelect={onLanguageChange}
          onClose={onRequestClose}
        />
      </header>

      <div className="capture-workspace">
        {target !== 'moment' && (
          <div className="capture-categories" role="radiogroup" aria-label="Content category">
            {categories.map(({ value, label, Icon }) => (
              <button
                type="button"
                role="radio"
                aria-checked={category === value}
                className={category === value ? 'active' : ''}
                key={value}
                onClick={() => onCategoryChange(value)}
                disabled={phase === 'submitting'}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="capture-sheet">
          <MarkdownEditor
            ref={inputRef}
            value={note}
            disabled={phase === 'submitting'}
            toolbarVisible
            showStatus={false}
            ariaLabel={target === 'moment' ? '事件内容' : '文章草稿'}
            placeholder={target === 'moment'
              ? '记录刚发生的进展、事件或状态变化... 输入 / 插入事件模板，[[ 连接已有内容'
              : '先把文章草稿写下来... 输入 / 插入结构块，[[ 连接已有内容'}
            onChange={onNoteChange}
            onKeyDown={onKeyDown}
          />
        </div>

        {(error || voiceError) && (
          <div className="capture-error" role="alert">
            <AlertCircle size={15} />
            <span>{error || voiceError}</span>
          </div>
        )}
      </div>

      <EditorAssistDock
        disabled={phase === 'submitting'}
        importing={phase === 'submitting'}
        attachmentCount={attachments.length}
        references={references}
        onAttachFiles={onAttachFiles}
        onInsertMarkdown={onInsertMarkdown}
      />

      <div className="capture-action-dock" aria-label="Capture actions">
        <button
          type="button"
          className={voicePhase === 'recording' ? 'recording' : ''}
          onClick={toggleVoiceInput}
          disabled={phase === 'submitting' || voicePhase === 'transcribing'}
          title={voicePhase === 'recording' ? 'Stop recording' : 'Voice input'}
        >
          {voicePhase === 'transcribing'
            ? <LoaderCircle size={16} />
            : voicePhase === 'recording'
              ? <Square size={14} />
              : <Mic size={16} />}
          {voicePhase === 'transcribing'
            ? 'Transcribing'
            : voicePhase === 'recording'
              ? (
                <span className="capture-waveform">
                  <canvas ref={waveformCanvasRef} aria-hidden="true" />
                  <span>{recordingSeconds}s / 60s</span>
                </span>
              )
              : 'Dictate'}
        </button>
        <button
          type="button"
          className="capture-confirm"
          disabled={(!note.trim() && attachments.length === 0) || phase === 'submitting' || voicePhase !== 'idle'}
          onClick={onSubmit}
          title={target === 'moment' ? '记录事件' : '保存文章草稿'}
        >
          {phase === 'submitting' ? <LoaderCircle size={16} /> : <Check size={16} />}
          {phase === 'submitting' ? 'Saving' : 'Confirm'}
        </button>
      </div>

      {phase === 'confirming-close' && (
        <div className="capture-discard" role="alertdialog" aria-modal="true">
          <div>
            <strong>Discard this thought?</strong>
            <span>Nothing has been written to content/ yet.</span>
          </div>
          <button type="button" onClick={onKeepWriting}>Keep writing</button>
          <button type="button" className="destructive" onClick={onDiscard}>Discard</button>
        </div>
      )}
    </section>
  );
}
