import React from 'react';
import { ImagePlus, Film, X } from 'lucide-react';
import { extractVideoCover, type VideoCoverState } from '../lib/videoCover';

function useObjectUrl(file?: File) {
  const [url, setUrl] = React.useState('');
  React.useEffect(() => {
    if (!file) { setUrl(''); return; }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
}

export function CaptureVideo({ file, cover, disabled, chinese, onCover, onRemove }: {
  file: File;
  cover?: VideoCoverState;
  disabled: boolean;
  chinese: boolean;
  onCover: (file: File, state: VideoCoverState) => void;
  onRemove: () => void;
}) {
  const src = useObjectUrl(file);
  const poster = useObjectUrl(cover?.status === 'ready' ? cover.file : undefined);
  const player = React.useRef<HTMLVideoElement>(null);
  const input = React.useRef<HTMLInputElement>(null);
  const pending = React.useRef<AbortController | null>(null);
  const prepare = React.useCallback(async (time: number) => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    onCover(file, { status: 'preparing' });
    try {
      const image = await extractVideoCover(file, time, controller.signal);
      if (!controller.signal.aborted) onCover(file, { status: 'ready', file: image, source: 'frame', time });
    } catch (error) {
      if (!controller.signal.aborted) onCover(file, { status: 'error', message: String(error) });
    }
  }, [file, onCover]);
  React.useEffect(() => {
    if (!cover || cover.status === 'preparing') void prepare(0);
    return () => pending.current?.abort();
    // Cover changes must not restart extraction or overwrite a chosen image.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prepare]);
  return (
    <section className="capture-video" aria-label={chinese ? '视频与封面' : 'Video and cover'}>
      <div className="capture-video__player">
        <video ref={player} src={src} poster={poster || undefined} controls playsInline preload="metadata" />
        <button className="capture-video__remove" type="button" onClick={onRemove} disabled={disabled}
          aria-label={chinese ? '移除视频' : 'Remove video'}><X size={17} /></button>
      </div>
      <div className="capture-video__details">
        <div><strong>{file.name}</strong><span>{(file.size / 1024 / 1024).toFixed(1)} MB</span></div>
        <div className="capture-video__cover">
          {poster ? <img src={poster} alt={chinese ? '视频封面' : 'Video cover'} /> : <Film size={24} />}
          <div>
            <strong>{chinese ? '视频封面' : 'Video cover'}</strong>
            <span>{cover?.status === 'preparing' ? (chinese ? '正在提取第一帧…' : 'Preparing cover…')
              : cover?.status === 'ready' && cover.source === 'upload' ? (chinese ? '自选图片' : 'Custom image')
              : cover?.status === 'ready' && cover.time ? `${cover.time.toFixed(1)}s`
              : (chinese ? '默认使用第一帧' : 'First frame by default')}</span>
          </div>
        </div>
        <div className="capture-video__actions">
          <button type="button" disabled={disabled} onClick={() => input.current?.click()}>
            <ImagePlus size={15} />{chinese ? '上传封面' : 'Choose image'}
          </button>
          <button type="button" disabled={disabled || cover?.status === 'preparing'}
            onClick={() => void prepare(player.current?.currentTime || 0)}>{chinese ? '使用当前帧' : 'Use current frame'}</button>
          <button type="button" disabled={disabled || cover?.status === 'preparing'}
            onClick={() => void prepare(0)}>{chinese ? '恢复第一帧' : 'Reset to first frame'}</button>
        </div>
        {cover?.status === 'error' && <p role="alert">{chinese ? '无法读取视频帧，请上传封面图片。' : cover.message}</p>}
        <input ref={input} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={event => {
          const image = event.target.files?.[0];
          event.target.value = '';
          if (!image) return;
          pending.current?.abort();
          onCover(file, { status: 'ready', file: image, source: 'upload' });
        }} />
      </div>
    </section>
  );
}
