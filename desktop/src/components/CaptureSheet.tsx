import React from 'react';
import { CaptureVideo } from './CaptureVideo';
import type { VideoCoverState } from '../lib/videoCover';
import { isVideoFile } from '../lib/media';
import { invoke } from '@tauri-apps/api/core';
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

type CaptureCategoryOption = { value: IdeaCategory; label: string; Icon: typeof Sparkles };

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
  const requestSelectionAssist = React.useCallback(async (
    request: MarkdownSelectionAssistRequest,
  ) => invoke<MarkdownSelectionAssistResult>('edit_markdown_selection', {
    input: {
      action: request.action,
      language,
      title: target === 'moment' ? 'Moment capture' : 'Article draft capture',
      selected_text: request.selectedText,
      before_context: request.beforeContext,
      after_context: request.afterContext,
      instruction: request.instruction,
    },
  }), [language, target]);

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
  const documentTitle = target === 'moment'
    ? (isChinese ? '未命名事件' : 'Untitled moment')
    : (isChinese ? '未命名文章' : 'Untitled article');
  const videos = attachments.filter(isVideoFile);
  const coversReady = videos.every(file => covers.get(file)?.status === 'ready');
  const editedLabel = isChinese ? '刚刚编辑' : 'Edited just now';

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
        <nav className="capture-mode-tabs" role="tablist" aria-label="快速书写模式">
          <button
            type="button"
            role="tab"
            aria-selected={target === 'blog'}
            className={target === 'blog' ? 'active' : ''}
            onClick={() => onTargetChange('blog')}
            disabled={phase === 'submitting' || sourceCreated}
          >
            快速写文章
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={target === 'moment'}
            className={target === 'moment' ? 'active' : ''}
            onClick={() => onTargetChange('moment')}
            disabled={phase === 'submitting' || sourceCreated}
          >
            记录事件
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

      <div className="capture-workspace">
        <article className="capture-document" aria-labelledby="capture-document-title">
          {target === 'moment' && (
            <div className="capture-media-stage">
              {videos.map(file => <CaptureVideo key={`${file.name}:${file.size}:${file.lastModified}`}
                file={file} cover={covers.get(file)} disabled={phase === 'submitting'} chinese={isChinese}
                onCover={onCoverChange} onRemove={() => onRemoveAttachment(attachments.indexOf(file))} />)}
              {videos.length === 0 && (
                <button className="capture-video-empty" type="button" disabled={phase === 'submitting'} onClick={editorAssist.openFilePicker}>
                  <FileImage size={30} />
                  <strong>{isChinese ? '分享这一刻的视频' : 'Share a video moment'}</strong>
                  <span>{isChinese ? '选择视频，再写下你想记录的文字' : 'Choose a video, then add a few words'}</span>
                  <small>MP4 · MOV · WebM · M4V</small>
                </button>
              )}
            </div>
          )}
          <header className="capture-document-header">
            <h1 id="capture-document-title">
              <input
                className="capture-title-input"
                aria-label={isChinese ? '标题' : 'Title'}
                value={title}
                placeholder={documentTitle}
                disabled={phase === 'submitting'}
                onChange={(event) => onTitleChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing) return;
                  if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey) {
                    event.preventDefault();
                    if (target === 'moment') event.currentTarget.closest('article')?.querySelector<HTMLTextAreaElement>('.capture-caption')?.focus();
                    else if (inputRef && typeof inputRef !== 'function') inputRef.current?.focus();
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
              <span className="capture-categories__label" aria-hidden="true">{isChinese ? '文章意图' : 'Article intent'}</span>
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
            {target === 'moment' ? (
              <textarea className="capture-caption" aria-label={isChinese ? '文字说明' : 'Caption'}
                value={note} rows={4} disabled={phase === 'submitting'}
                placeholder={isChinese ? '写下这一刻的故事、进展或想法（选填）…' : 'Add a story, update or thought (optional)…'}
                onChange={event => onNoteChange(event.target.value)} />
            ) : <MarkdownEditor
              ref={inputRef}
              value={note}
              disabled={phase === 'submitting'}
              toolbarVisible
              slashCommands={editorAssist.slashCommands}
              onImportImages={importCaptureImages}
              ariaLabel="文章草稿"
              placeholder="先把文章草稿写下来... 输入 / 插入结构块，[[ 连接已有内容"
              onChange={onNoteChange}
              onKeyDown={onKeyDown}
              onSelectionAssist={requestSelectionAssist}
            />}
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
          title={isChinese ? '添加图片或视频' : 'Add photos or videos'}
        >
          <Paperclip size={16} />
          {isChinese ? '图片 / 视频' : 'Photos / videos'}
        </button>
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
          disabled={(!title.trim() && !note.trim() && attachments.length === 0) || phase === 'submitting' || voicePhase !== 'idle' || (target === 'moment' && !coversReady)}
          onClick={onSubmit}
          title={target === 'moment' ? '记录事件' : '保存文章草稿'}
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
