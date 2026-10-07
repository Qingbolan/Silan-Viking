import { NativeFileDragSession } from '../lib/nativeFileDrag';
import React from 'react';
import { CaptureVideo } from './CaptureVideo';
import type { VideoCoverState } from '../lib/videoCover';
import { isVideoFile } from '../lib/media';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import {
  AlertCircle,
  Check,
  FileImage,
  LoaderCircle,
  Mic,
  Paperclip,
  Sparkles,
  Square,
  X,
} from 'lucide-react';
import { LanguageCloseControls } from './LanguageCloseControls';
import { PaidAiUnavailableHint, usePaidAiGate } from './PaidAiGate';
import { captureCopy } from '../lib/captureCopy';
import { Button } from './ds/Button';
import {
  Dialog,
  DialogActions,
  DialogCard,
  DialogDescription,
  DialogTitle,
} from './ds/Dialog';
import MarkdownEditor, {
  type MarkdownEditorHandle,
  type MarkdownImageImport,
  type MarkdownSelectionAssistRequest,
} from './MarkdownEditor';
import {
  type EditorAssistReference,
  useEditorAssistSlashCommands,
} from './editor/useEditorAssistSlashCommands';
import type {
  CapturePhase,
  CaptureTarget,
  IdeaCategory,
  MarkdownSelectionAssistResult,
} from '../types';

type CaptureCategoryOption = { value: IdeaCategory; Icon: typeof Sparkles };

type CaptureSheetProps = {
  phase: CapturePhase;
  sourceCreated: boolean;
  target: CaptureTarget;
  onTargetChange: (target: CaptureTarget) => void;
  category: IdeaCategory;
  language: string;
  onCategoryChange: (category: IdeaCategory) => void;
  onLanguageChange: (language: string) => void;
  categories: CaptureCategoryOption[];
  title: string;
  onTitleChange: (title: string) => void;
  note: string;
  onNoteChange: (note: string) => void;
  attachments: File[];
  covers: Map<File, VideoCoverState>;
  onCoverChange: (file: File, cover: VideoCoverState) => void;
  references: EditorAssistReference[];
  error: string | null;
  inputRef: React.Ref<MarkdownEditorHandle>;
  onAttachFiles: (files: File[]) => void;
  onRemoveAttachment: (index: number) => void;
  onRequestClose: () => void;
  onDiscard: () => void;
  onKeepWriting: () => void;
  onSubmit: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  onTransitionEnd: (event: React.TransitionEvent<HTMLElement>) => void;
  origin: { x: number; y: number };
  authorName: string;
  authorAvatarUrl?: string;
  authorAvatarLabel: string;
};

const MAX_DICTATION_MS = 60_000;

function CaptureAttachmentPreview({
  file,
  index,
  onRemove,
}: {
  file: File;
  index: number;
  onRemove: (index: number) => void;
}) {
  const [previewUrl, setPreviewUrl] = React.useState('');

  React.useEffect(() => {
    setPreviewUrl('');
    if (!file.type.startsWith('image/') && !isVideoFile(file)) return undefined;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <article className="capture-attachment" data-video={isVideoFile(file)}>
      <div className="capture-attachment__preview" data-video={isVideoFile(file)}>
        {previewUrl
          ? isVideoFile(file)
            ? <video src={previewUrl} controls playsInline preload="metadata" aria-label={`Video preview: ${file.name}`} />
            : <img src={previewUrl} alt={`Attachment preview: ${file.name}`} />
          : <Paperclip size={16} />}
      </div>
      <div className="capture-attachment__copy">
        <strong>{file.name}</strong>
        <span>{Math.max(1, Math.ceil(file.size / 1024))} KB</span>
      </div>
      <button
        type="button"
        aria-label={`Remove ${file.name}`}
        title="Remove attachment"
        onClick={() => onRemove(index)}
      >
        <X size={13} />
      </button>
    </article>
  );
}

export function CaptureSheet({
  phase,
  sourceCreated,
  target,
  onTargetChange,
  category,
  language,
  onCategoryChange,
  onLanguageChange,
  categories,
  title,
  onTitleChange,
  note,
  onNoteChange,
  attachments,
  covers,
  onCoverChange,
  references,
  error,
  inputRef,
  onAttachFiles,
  onRemoveAttachment,
  onRequestClose,
  onDiscard,
  onKeepWriting,
  onSubmit,
  onKeyDown,
  onTransitionEnd,
  origin,
  authorName,
  authorAvatarUrl,
  authorAvatarLabel,
}: CaptureSheetProps) {
  const [dragActive, setDragActive] = React.useState(false);
  const [dropError, setDropError] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!isTauri() || phase === 'closed' || phase === 'closing' || phase === 'submitting') return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const nativeDrag = new NativeFileDragSession();
    getCurrentWebview().onDragDropEvent(async ({ payload }) => {
      const hasFiles = nativeDrag.update(payload);
      if (payload.type === 'enter' || payload.type === 'over') { setDragActive(hasFiles); return; }
      setDragActive(false);
      if (payload.type !== 'drop' || !payload.paths.length) return;
      setDropError(null);
      try {
        const files: File[] = [];
        for (const path of payload.paths) {
          const name = path.split(/[\\/]/).pop() || 'media';
          if (!/\.(png|jpe?g|gif|svg|webp|avif|ico|mp4|webm|mov|m4v)$/i.test(name)) continue;
          const bytes = await invoke<ArrayBuffer>('read_capture_attachment', { path });
          const extension = name.split('.').pop()!.toLowerCase();
          const type = isVideoFile({name,type:''}) ? `video/${extension === 'mov' ? 'quicktime' : extension === 'm4v' ? 'mp4' : extension}` : `image/${extension === 'jpg' ? 'jpeg' : extension === 'svg' ? 'svg+xml' : extension}`;
          files.push(new File([bytes], name, { type }));
        }
        if (!disposed) onAttachFiles(files);
      } catch (reason) { if (!disposed) setDropError(String(reason)); }
    }).then(remove => { if (disposed) remove(); else unlisten = remove; }).catch(reason => setDropError(String(reason)));
    return () => { disposed = true; unlisten?.(); };
  }, [phase, onAttachFiles]);
  const [voicePhase, setVoicePhase] = React.useState<'idle' | 'recording' | 'transcribing'>('idle');
  const [voiceError, setVoiceError] = React.useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = React.useState(0);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const captureStartedAtRef = React.useRef(new Date().toISOString());
  const recordingStartedAtRef = React.useRef<number | null>(null);
  const recordingDeadlineRef = React.useRef<number | null>(null);
  const recordingClockRef = React.useRef<number | null>(null);
  const waveformCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const editorAssist = useEditorAssistSlashCommands({
    disabled: phase === 'submitting',
    importing: phase === 'submitting',
    references,
    onAttachFiles,
  });
  const importCaptureImages = React.useCallback(async (
    files: readonly File[],
  ): Promise<readonly MarkdownImageImport[]> => {
    onAttachFiles([...files]);
    return [];
  }, [onAttachFiles]);
  const paidAi = usePaidAiGate();
  const dictation = paidAi.availability('dictation');
  const selectionAssist = paidAi.availability('selection_edit');
  const requestSelectionAssist = React.useCallback(async (
    request: MarkdownSelectionAssistRequest,
  ) => {
    if (!await paidAi.confirm({
      kind: 'selection_edit',
      action: request.action === 'optimize_expression'
        ? 'Optimize expression'
        : request.action === 'agent_edit' ? 'Agent local edit' : 'Comment issue',
      scope: 'the selected passage with up to 1,600 characters of context on each side',
    })) {
      throw new Error('Cancelled · nothing was sent');
    }
    return invoke<MarkdownSelectionAssistResult>('edit_markdown_selection', {
      input: {
        action: request.action,
        language,
        title: target === 'moment' ? 'Moment capture' : 'Article draft capture',
        selected_text: request.selectedText,
        before_context: request.beforeContext,
        after_context: request.afterContext,
        instruction: request.instruction,
      },
    });
  }, [language, paidAi, target]);

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
    if (phase === 'opening') captureStartedAtRef.current = new Date().toISOString();
  }, [phase]);

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

  const isChinese = language === 'zh';
  const copy = captureCopy(language);
  const documentTitle = target === 'moment' ? copy.untitledMoment : copy.untitledArticle;
  const videos = attachments.filter(isVideoFile);
  const coversReady = videos.every(file => covers.get(file)?.status === 'ready');
  const editedLabel = copy.editedJustNow;

  return (
    <section
      className="moment-capture"
      data-phase={phase}
      data-target={target}
      aria-hidden={phase === 'closed'}
      onPasteCapture={(event) => {
        const files = Array.from(event.clipboardData.files);
        if (phase !== 'submitting' && files.some(isVideoFile)) {
          event.preventDefault();
          event.stopPropagation();
          onAttachFiles(files);
        }
      }}
      onTransitionEnd={onTransitionEnd}
      style={{
        '--capture-origin-x': `${origin.x}px`,
        '--capture-origin-y': `${origin.y}px`,
      } as React.CSSProperties}
    >
      <header className="capture-header">
        <nav className="capture-mode-tabs" role="tablist" aria-label={copy.modeTabsLabel}>
          <button
            type="button"
            role="tab"
            aria-selected={target === 'blog'}
            className={target === 'blog' ? 'active' : ''}
            onClick={() => onTargetChange('blog')}
            disabled={phase === 'submitting' || sourceCreated}
          >
            {copy.blogTab}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={target === 'moment'}
            className={target === 'moment' ? 'active' : ''}
            onClick={() => onTargetChange('moment')}
            disabled={phase === 'submitting' || sourceCreated}
          >
            {copy.momentTab}
          </button>
        </nav>
        <LanguageCloseControls
          className="capture-language-close"
          languages={[{ language: 'en' }, { language: 'zh' }]}
          activeLanguage={language}
          disabled={phase === 'submitting' || sourceCreated}
          closeLabel="Close capture"
          closeTitle="Close capture"
          onLanguageSelect={onLanguageChange}
          onClose={onRequestClose}
        />
      </header>

      <div className="capture-workspace" data-drag-active={dragActive}
        onDragOver={event => { if (phase !== 'submitting' && event.dataTransfer.types.includes('Files')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setDragActive(true); } }}
        onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false); }}
        onDropCapture={event => { if (!event.dataTransfer.types.includes('Files')) return; event.preventDefault(); event.stopPropagation(); setDragActive(false); if (phase !== 'submitting') onAttachFiles(Array.from(event.dataTransfer.files).filter(file => isVideoFile(file) || file.type.startsWith('image/'))); }}>
        {dropError && <p role="alert">{dropError}</p>}
        <article className="capture-document" aria-labelledby="capture-document-title">
          {target === 'moment' && videos.length > 0 && (
            <div className="capture-media-stage">
              {videos.map(file => <CaptureVideo key={`${file.name}:${file.size}:${file.lastModified}`}
                file={file} cover={covers.get(file)} disabled={phase === 'submitting'} chinese={isChinese}
                onCover={onCoverChange} onRemove={() => onRemoveAttachment(attachments.indexOf(file))} />)}
            </div>
          )}
          <header className="capture-document-header">
            <h1 id="capture-document-title">
              <input
                className="capture-title-input"
                aria-label={copy.titleLabel}
                value={title}
                placeholder={documentTitle}
                disabled={phase === 'submitting'}
                onChange={(event) => onTitleChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing) return;
                  if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey) {
                    event.preventDefault();
                    if (inputRef && typeof inputRef !== 'function') inputRef.current?.focus();
                  } else {
                    onKeyDown(event);
                  }
                }}
              />
            </h1>
            <div className="capture-document-meta">
              <span className="capture-document-avatar" aria-hidden="true">
                {authorAvatarUrl
                  ? <img src={authorAvatarUrl} alt="" />
                  : authorAvatarLabel}
              </span>
              <strong>{authorName}</strong>
              <span className="capture-document-meta__divider" aria-hidden="true" />
              <time dateTime={captureStartedAtRef.current}>{editedLabel}</time>
            </div>
          </header>

          {target !== 'moment' && (
            <div className="capture-categories" role="radiogroup" aria-label="Content category">
              <span className="capture-categories__label" aria-hidden="true">{copy.articleIntent}</span>
              {categories.map(({ value, Icon }) => (
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
                  {copy.categories[value]}
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
              slashCommands={editorAssist.slashCommands}
              onImportImages={importCaptureImages}
              ariaLabel={target === 'moment' ? copy.momentEditorLabel : copy.articleEditorLabel}
              placeholder={target === 'moment' ? copy.momentPlaceholder : copy.articlePlaceholder}
              onChange={onNoteChange}
              onKeyDown={onKeyDown}
              onSelectionAssist={requestSelectionAssist}
              selectionAssistDisabledReason={selectionAssist.reason}
            />
            {editorAssist.fileInput}
          </div>

          {attachments.some(file => target !== 'moment' || !isVideoFile(file)) && (
            <section className="capture-attachments" aria-label="Capture attachments">
              <header>
                <FileImage size={14} />
                <strong>{attachments.length} attachment{attachments.length === 1 ? '' : 's'}</strong>
                <span>Imported when this draft is saved</span>
              </header>
              <div>
                {attachments.map((file, index) => target === 'moment' && isVideoFile(file) ? null : (
                  <CaptureAttachmentPreview
                    key={`${file.name}:${file.size}:${file.lastModified}:${index}`}
                    file={file}
                    index={index}
                    onRemove={onRemoveAttachment}
                  />
                ))}
              </div>
            </section>
          )}

          <PaidAiUnavailableHint kind="dictation" className="capture-ai-hint" />
          {(error || voiceError) && (
            <div className="capture-error" role="alert">
              <AlertCircle size={15} />
              <span>{error || voiceError}</span>
            </div>
          )}
        </article>
      </div>

      <div className="capture-action-dock" aria-label="Capture actions">
        <button
          type="button"
          onClick={editorAssist.openFilePicker}
          disabled={phase === 'submitting'}
          title={copy.addMediaTitle}
        >
          <Paperclip size={16} />
          {copy.addMedia}
        </button>
        <button
          type="button"
          className={voicePhase === 'recording' ? 'recording' : ''}
          onClick={toggleVoiceInput}
          disabled={phase === 'submitting' || voicePhase === 'transcribing' || (voicePhase === 'idle' && !dictation.enabled)}
          title={voicePhase === 'recording'
            ? 'Stop recording'
            : dictation.reason || 'Voice input · transcribed by OpenAI'}
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
              : `Dictate · ${paidAi.providerLabel('dictation')}`}
        </button>
        <button
          type="button"
          className="capture-confirm"
          disabled={(!title.trim() && !note.trim() && attachments.length === 0) || phase === 'submitting' || voicePhase !== 'idle' || (target === 'moment' && !coversReady)}
          onClick={onSubmit}
          title={target === 'moment' ? copy.saveMomentTitle : copy.saveArticleTitle}
        >
          {phase === 'submitting' ? <LoaderCircle size={16} /> : <Check size={16} />}
          {phase === 'submitting' ? 'Saving' : 'Confirm'}
        </button>
      </div>

      {phase === 'confirming-close' && (
        <Dialog open onClose={onKeepWriting}>
          <DialogCard role="alertdialog" aria-labelledby="capture-discard-title">
            <DialogTitle id="capture-discard-title">Discard this thought?</DialogTitle>
            <DialogDescription>{sourceCreated ? 'The saved draft remains in your workspace. Unsaved changes will be discarded.' : 'Nothing has been written to your workspace yet.'}</DialogDescription>
            <DialogActions>
              <Button type="button" variant="secondary" size="sm" onClick={onKeepWriting}>Keep writing</Button>
              <Button type="button" variant="destructive" size="sm" onClick={onDiscard}>Discard</Button>
            </DialogActions>
          </DialogCard>
        </Dialog>
      )}
    </section>
  );
}
