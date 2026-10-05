import React from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { DesktopTitlebar } from './DesktopTitlebar';
import { desktopWindowChromeClassName } from '../lib/desktopWindow';
import {
  defaultWorkspaceDestination, localizedSetupError, setupReducer, workspaceFolderName,
  type BootstrapStatus, type PreparationStage, type SetupPage,
} from '../lib/workspaceOnboardingModel';
import notebookArt from '../assets/onboarding/notebook.png';
import folderArt from '../assets/onboarding/folder.png';
import identityArt from '../assets/onboarding/identity.png';
import syncArt from '../assets/onboarding/sync.png';
import { CodeBlockView } from '../../../frontend/src/components/ui/CodeBlockView';
import { AiEngineSettings } from './AiEngineSettings';
import './WorkspaceOnboarding.css';

const logo = new URL('../../src-tauri/icons/64x64.png', import.meta.url).href;
const emptyBootstrap: BootstrapStatus = { state: 'needs_workspace', project_root: null, project_name: null, error: null };
const createPages: SetupPage[] = ['location', 'identity', 'profile', 'ai', 'starter', 'review'];
const joinPages: SetupPage[] = ['repository', 'join-location'];
const stageLabels: Record<PreparationStage, string> = {
  checking_access: '正在验证仓库访问权限', cloning: '正在准备本机内容仓库',
  synchronizing: '正在检查并同步仓库', creating: '正在创建笔记与工作空间',
  indexing: '正在检查内容并建立本地索引', activating: '正在记录这台设备的工作空间',
};
const pageCopy: Record<SetupPage, { title: string; caption: string; art: string }> = {
  welcome: { title: '从这里开始', caption: '先记录一个想法。', art: notebookArt },
  ai: { title: '配置 AI 引擎', caption: '让工具配合你的思考。', art: syncArt },
  location: { title: '工作空间放在哪里？', caption: '你的内容，你来保管。', art: folderArt },
  profile: { title: '完善你的资料', caption: '用熟悉的方式表达。', art: identityArt },
  identity: { title: '如何称呼你？', caption: '让内容留下你的署名。', art: identityArt },
  starter: { title: '从哪一页开始？', caption: '从一个问题开始。', art: notebookArt },
  review: { title: '准备好开始写作了', caption: '先写下来。', art: notebookArt },
  repository: { title: '连接你的内容仓库', caption: '在新设备上，继续研究。', art: syncArt },
  'join-location': { title: '把内容放在这台电脑上', caption: '让熟悉的内容回到手边。', art: folderArt },
  open: { title: '打开本机工作空间', caption: '继续上次的思考。', art: folderArt },
  repair: { title: '重新找到你的工作空间', caption: '内容也许只是换了位置。', art: folderArt },
  recovery: { title: '从已发布站点恢复', caption: '找回已经发布的内容。', art: syncArt },
  complete: { title: '工作空间已准备好', caption: '下一页，由你来写。', art: notebookArt },
};

function SetupButton({ variant = 'secondary', className = '', type = 'button', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' }) {
  return <button {...props} type={type} className={`setup-button setup-button--${variant} ${className}`} />;
}

function Choice({ title, selected, onSelect }: {
  title: string; selected: boolean; onSelect: () => void;
}) {
  return <label className="setup-choice" data-selected={selected}>
    <input type="radio" checked={selected} onChange={onSelect} name="setup-choice" />
    <span><strong>{title}</strong></span>
  </label>;
}

function TextField({ label, id, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; id: string }) {
  return <div className="setup-field"><label htmlFor={id}>{label}</label>
    <input {...props} id={id} />
  </div>;
}

export function WorkspaceBootstrapGate({ children }: { children: React.ReactNode }) {
  const preview = !isTauri() && new URLSearchParams(window.location.search).get('onboarding') === 'preview';
  const [state, dispatch] = React.useReducer(setupReducer, { kind: isTauri() || preview ? 'checking' : 'ready' });
  const [bootstrap, setBootstrap] = React.useState<BootstrapStatus>(emptyBootstrap);
  const [mode, setMode] = React.useState<'new' | 'open' | 'join'>('new');
  const [name, setName] = React.useState('我的研究空间');
  const [parent, setParent] = React.useState('~/Silan Workspaces');
  const [author, setAuthor] = React.useState('');
  const [avatar, setAvatar] = React.useState<{ file: File; url: string } | null>(null);
  const avatarPicker = React.useRef<HTMLInputElement>(null);
  const [language, setLanguage] = React.useState(navigator.language.startsWith('zh') ? 'zh' : 'en');
  const [aiConfigured, setAiConfigured] = React.useState(false);
  const [includeExample, setIncludeExample] = React.useState(true);
  const [repository, setRepository] = React.useState('');
  const [branch, setBranch] = React.useState('');
  const [joinDestination, setJoinDestination] = React.useState('');
  const [localPath, setLocalPath] = React.useState('');
  const [deploymentKey, setDeploymentKey] = React.useState('');
  const [picking, setPicking] = React.useState(false);
  const [pickerError, setPickerError] = React.useState<string | null>(null);
  const heading = React.useRef<HTMLHeadingElement>(null);
  const operation = React.useRef(false);
  const destination = `${parent.replace(/[\\/]+$/, '')}/${workspaceFolderName(name)}`;
  const page = state.kind === 'page' ? state.page : state.kind === 'working' ? state.returnPage : 'welcome';
  const copy = pageCopy[page];
  const busy = state.kind === 'working' || state.kind === 'checking';

  React.useEffect(() => {
    if (!isTauri() && !preview) return;
    let active = true;
    const read = preview ? Promise.resolve(emptyBootstrap) : invoke<BootstrapStatus>('get_workspace_bootstrap_status');
    read.then(status => {
      if (!active) return;
      setBootstrap(status);
      setLocalPath(status.project_root || '');
      dispatch({ type: 'bootstrap', status });
    }).catch(reason => { if (active) dispatch({ type: 'failed', error: localizedSetupError(reason) }); });
    return () => { active = false; };
  }, [preview]);

  React.useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    setPickerError(null);
  }, [page]);

  React.useEffect(() => () => { if (avatar) URL.revokeObjectURL(avatar.url); }, [avatar]);

  const selectAvatar = async (file?: File) => {
    if (!file || picking) return;
    setPickerError(null);
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 12 * 1024 * 1024) {
      setPickerError('请选择 12 MB 以内的 PNG、JPEG 或 WebP 图片。');
      return;
    }
    setPicking(true);
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      if (image.naturalWidth > 4096 || image.naturalHeight > 4096) throw new Error('请选择宽高不超过 4096 像素的图片。');
      setAvatar({ file, url });
    } catch (reason) {
      URL.revokeObjectURL(url);
      setPickerError(reason instanceof Error ? reason.message : '无法读取这张图片。');
    } finally { setPicking(false); }
  };

  const navigate = (next: SetupPage) => dispatch({ type: 'navigate', page: next });
  const run = async (stage: PreparationStage, action: () => Promise<void>, target: SetupPage) => {
    if (operation.current) return;
    if (!isTauri()) { dispatch({ type: 'failed', error: '请在桌面应用中完成配置。' }); return; }
    operation.current = true;
    dispatch({ type: 'start', stage });
    let unlisten: (() => void) | undefined;
    try {
      unlisten = await listen<PreparationStage>('workspace-preparation', event => dispatch({ type: 'progress', stage: event.payload }));
      await action();
      dispatch({ type: 'completed', page: target });
      return true;
    } catch (reason) { dispatch({ type: 'failed', error: localizedSetupError(reason) }); }
    finally { unlisten?.(); operation.current = false; }
  };
  const chooseFolder = async (setPath: (value: string) => void) => {
    if (!isTauri()) { setPickerError('请在桌面应用中使用文件夹选择器；预览时可直接输入路径。'); return; }
    setPicking(true); setPickerError(null);
    try {
      const path = await open({ directory: true, multiple: false, title: '选择文件夹' });
      if (typeof path === 'string') setPath(path);
    } catch (reason) { setPickerError(localizedSetupError(reason)); }
    finally { setPicking(false); }
  };
  const openLocal = () => run('indexing', async () => {
    setBootstrap(await invoke<BootstrapStatus>('open_local_workspace', { path: localPath.trim() }));
  }, 'complete');
  const createLocal = () => run('creating', async () => {
    setBootstrap(await invoke<BootstrapStatus>('create_local_workspace', { input: {
      name: name.trim(), destination, author: author.trim(), language, includeExample,
      avatar: avatar ? { bytes: Array.from(new Uint8Array(await avatar.file.arrayBuffer())) } : null,
    } }));
  }, 'complete').then(success => { if (success) dispatch({ type: 'enter' }); });
  const verify = () => run('checking_access', async () => {
    await invoke('verify_workspace_repository', { input: { repositoryUrl: repository.trim() } });
    setJoinDestination(current => current || defaultWorkspaceDestination(repository));
  }, 'join-location');
  const join = () => run('checking_access', async () => {
    const result = await invoke<{ project_root: string; project_name: string }>('join_workspace', { input: {
      repositoryUrl: repository.trim(), destination: joinDestination.trim(), branch: branch.trim() || null,
    } });
    // Preparation and activation are distinct; deployment access is optional.
    setBootstrap({ state: 'deployment_key', project_root: result.project_root, project_name: result.project_name, error: null });
    setBootstrap(await invoke<BootstrapStatus>('complete_workspace_onboarding', { input: { deploymentKeyPath: null } }));
  }, 'complete');
  const enter = () => {
    if (bootstrap.state === 'ready' && !deploymentKey.trim()) dispatch({ type: 'enter' });
    else void run('activating', async () => {
      if (deploymentKey.trim()) await invoke('validate_workspace_deployment_key', { path: deploymentKey.trim() });
      setBootstrap(await invoke<BootstrapStatus>('complete_workspace_onboarding', { input: { deploymentKeyPath: deploymentKey.trim() || null } }));
    }, 'complete').then(success => { if (success) dispatch({ type: 'enter' }); });
  };

  if (state.kind === 'ready') return <>{children}</>;
  const steps = createPages.includes(page) ? createPages : joinPages.includes(page) ? joinPages : [];
  const index = steps.indexOf(page);
  const next = (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || picking) return;
    switch (page) {
      case 'welcome': navigate(mode === 'new' ? 'location' : mode === 'open' ? 'open' : 'repository'); break;
      case 'location': navigate('identity'); break;
      case 'identity': navigate('profile'); break;
      case 'profile': navigate('ai'); break;
      case 'ai': navigate('starter'); break;
      case 'starter': navigate('review'); break;
      case 'review': void createLocal(); break;
      case 'repository': void verify(); break;
      case 'join-location': void join(); break;
      case 'open': case 'repair': void openLocal(); break;
      case 'complete': enter(); break;
    }
  };
  const back = () => {
    const previous: Partial<Record<SetupPage, SetupPage>> = { location: 'welcome', identity: 'location', profile: 'identity', ai: 'profile', starter: 'ai', review: 'starter', repository: 'welcome', 'join-location': 'repository', open: 'welcome', repair: 'welcome', recovery: 'welcome' };
    if (previous[page]) navigate(previous[page]!);
  };
  const actionLabel = page === 'ai' ? (aiConfigured ? '继续' : '暂不配置') : page === 'review' ? '创建并进入' : page === 'repository' ? '验证并继续'
    : page === 'join-location' ? '下载并准备' : page === 'open' ? '打开工作空间'
    : page === 'repair' ? '重新打开' : page === 'complete' ? '进入工作空间' : '继续';

  return <main className={`workspace-onboarding setup-wizard ${desktopWindowChromeClassName}`} lang="zh-CN" aria-busy={busy}>
    <DesktopTitlebar title="Silan Context System" showWorkspaceNavigation={false} />
    <aside className="setup-story">
      <div className="setup-brand"><img src={logo} alt="" /><div><strong>Silan Context System</strong></div></div>
    </aside>
    <section className="setup-stage">
      <form className="setup-page" key={page} onSubmit={next}>
        <header><h1 ref={heading} tabIndex={-1}>{state.kind === 'checking' ? '正在寻找你的工作空间' : busy ? '正在准备你的工作空间' : copy.title}</h1></header>
        <div className="setup-content-layout">
          <div className="setup-artwork">
      <figure key={copy.art} className="setup-illustration"><img src={copy.art} alt="" /></figure>
      <div className="setup-story-copy" key={page}><h2>{copy.caption}</h2></div>
          </div>
          <div className="setup-controls">
        <div className="setup-page-body">
          {busy ? <div className="setup-working" role="status" aria-live="polite"><div className="setup-working-track"><span /></div><strong>{state.kind === 'working' ? stageLabels[state.stage] : '读取这台设备的工作空间记录'}</strong></div> : <>
            {page === 'welcome' && <fieldset className="setup-choices"><legend className="sr-only">选择开始方式</legend>
              <Choice title="创建新工作空间" selected={mode === 'new'} onSelect={() => setMode('new')} />
              <Choice title="打开本机工作空间" selected={mode === 'open'} onSelect={() => setMode('open')} />
              <Choice title="从其他设备继续" selected={mode === 'join'} onSelect={() => setMode('join')} />
            </fieldset>}
            {page === 'location' && <>
              <TextField id="workspace-name" label="工作空间名称" value={name} onChange={e => setName(e.target.value)} required maxLength={100} />
              <div className="setup-folder-field"><TextField id="workspace-parent" label="保存位置" value={parent} onChange={e => setParent(e.target.value)} required spellCheck={false} />
                <SetupButton type="button" variant="secondary" onClick={() => void chooseFolder(setParent)} disabled={picking}>{picking ? '正在选择…' : '选择文件夹'}</SetupButton></div>
              <div className="setup-path-preview"><span>完整路径</span><code>{destination}</code></div>

            </>}
            {page === 'identity' && <>
              <TextField id="author-name" label="作者名称" value={author} onChange={e => setAuthor(e.target.value)} placeholder="你的名字或笔名" required maxLength={100} autoComplete="name" />
            </>}
            {page === 'profile' && <>
              <div className="setup-avatar-field">
                <div className="setup-avatar-preview">{avatar ? <img src={avatar.url} alt="头像预览" /> : <span aria-label="默认头像">{Array.from(author.trim())[0] || '你'}</span>}</div>
                <input ref={avatarPicker} type="file" accept="image/png,image/jpeg,image/webp" hidden aria-label="选择头像文件" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void selectAvatar(file); }} />
                <div className="setup-avatar-actions"><SetupButton disabled={picking} onClick={() => avatarPicker.current?.click()}>{picking ? '正在读取…' : avatar ? '更换头像' : '选择头像'}</SetupButton>
                {avatar && <SetupButton disabled={picking} onClick={() => { setAvatar(null); setPickerError(null); }}>移除</SetupButton>}</div>
              </div>
              <fieldset className="setup-language"><legend>主要写作语言</legend>{[['zh', '中文'], ['en', 'English']].map(([value, label]) => <label key={value} data-selected={language === value}><input type="radio" name="writing-language" value={value} checked={language === value} onChange={() => setLanguage(value)} /><span>{label}</span></label>)}</fieldset>

            </>}
            {page === 'ai' && <AiEngineSettings onBusyChange={setPicking} onConfiguredChange={setAiConfigured} />}
            {page === 'starter' && <>
              <fieldset className="setup-choices"><legend className="sr-only">选择起步内容</legend>
                <Choice title="添加入门笔记" selected={includeExample} onSelect={() => setIncludeExample(true)} />
                <Choice title="空白开始" selected={!includeExample} onSelect={() => setIncludeExample(false)} />
              </fieldset>
              {includeExample && <div className="setup-note-preview"><h3>{language === 'zh' ? '我的第一篇笔记' : 'My first note'}</h3><p>{language === 'zh' ? '我想理解什么？' : 'What do I want to understand?'}</p><p>{language === 'zh' ? '有哪些证据？' : 'What evidence do I have?'}</p><p>{language === 'zh' ? '下一步准备验证什么？' : 'What will I investigate next?'}</p></div>}
            </>}
            {page === 'review' && <>{avatar && <div className="setup-avatar-preview setup-avatar-summary"><img src={avatar.url} alt="已选择的头像" /></div>}<dl className="setup-summary"><div><dt>工作空间</dt><dd>{name}</dd></div><div><dt>作者</dt><dd>{author}</dd></div><div><dt>写作语言</dt><dd>{language === 'zh' ? '中文' : 'English'}</dd></div><div><dt>起步内容</dt><dd>{includeExample ? '入门笔记' : '空白开始'}</dd></div></dl><div className="setup-path-preview"><span>保存位置</span><code>{destination}</code></div></>}
            {page === 'repository' && <>
              <TextField id="repository-url" label="Git 仓库" value={repository} onChange={e => { setRepository(e.target.value); setJoinDestination(''); }} placeholder="git@github.com:owner/research.git" required spellCheck={false} autoCapitalize="none" autoCorrect="off" />
              <details className="setup-details"><summary>高级选项 · 分支</summary><TextField id="repository-branch" label="分支名称" value={branch} onChange={e => setBranch(e.target.value)} placeholder="仓库默认分支" spellCheck={false} /></details>
              <details className="setup-details"><summary>还没有访问权限？查看连接指南</summary><p>SSH：先用终端确认这台设备的 SSH 密钥有仓库读取权限，并已加入 SSH agent。</p><p>HTTPS：先在系统 Git 凭据管理器中登录。不要把密码或访问令牌写进仓库地址。</p><p>只有本地文件时，请返回并选择「打开本机工作空间」。</p></details>
            </>}
            {page === 'join-location' && <>
              <div className="setup-verified"><span>✓</span><div><strong>仓库读取权限已验证</strong><code>{repository}</code></div></div>
              <TextField id="join-destination" label="本机工作空间文件夹" value={joinDestination} onChange={e => setJoinDestination(e.target.value)} required spellCheck={false} />
              <SetupButton variant="secondary" type="button" onClick={() => void chooseFolder(path => setJoinDestination(`${path}/${workspaceFolderName(repository.split(/[/:]/).at(-1)?.replace(/\.git$/, '') || 'research')}`))} disabled={picking}>选择保存位置</SetupButton>


            </>}
            {(page === 'open' || page === 'repair') && <>
              {page === 'repair' && <div className="setup-repair-note">{bootstrap.project_root && <code>{bootstrap.project_root}</code>}{bootstrap.error && <details><summary>查看诊断信息</summary><p>{bootstrap.error}</p></details>}</div>}
              <div className="setup-folder-field"><TextField id="local-workspace" label="工作空间文件夹" value={localPath} onChange={e => setLocalPath(e.target.value)} placeholder="/Users/you/Silan Workspaces/research" required spellCheck={false} />
                <SetupButton type="button" variant="secondary" onClick={() => void chooseFolder(setLocalPath)} disabled={picking}>{picking ? '正在选择…' : '选择文件夹'}</SetupButton></div>

              {page === 'repair' && <SetupButton variant="secondary" type="button" onClick={() => navigate('welcome')}>打开其他工作空间</SetupButton>}
            </>}
            {page === 'recovery' && <div className="setup-recovery"><strong>通过已安装的 CLI 恢复</strong><p>在终端运行以下命令，并将站点地址和目标位置替换为自己的配置。目标文件夹必须不存在或为空。</p><CodeBlockView language="bash" content={'silan site recover \\\n  --from https://your-site.example \\\n  --to ~/Silan-Recovered/content'} onCopyError={() => setPickerError('复制失败，请手动选择命令复制。')} /><p>CLI 会安全提示输入站点访问令牌。恢复完成后，返回选择「打开本机工作空间」。</p><p>恢复范围仅限已部署的公开内容，不包含私有笔记、未发布草稿或原始 Git 历史。</p></div>}
            {page === 'complete' && <><div className="setup-verified"><span>✓</span><div><strong>{bootstrap.project_name || '你的工作空间'}</strong><code>{bootstrap.project_root}</code></div></div>{bootstrap.deployment_key_required && <details className="setup-details"><summary>可选：配置此设备的部署密钥</summary><TextField id="deployment-key" label="部署私钥路径" value={deploymentKey} onChange={e => setDeploymentKey(e.target.value)} placeholder="~/.ssh/site-deploy" spellCheck={false} /></details>}</>}
          </>}

        </div>
        <footer className="setup-actions">
          {page === 'welcome' ? <SetupButton type="button" variant="secondary" disabled={busy} onClick={() => navigate('recovery')}>从已发布站点恢复</SetupButton>
            : page !== 'complete' ? <SetupButton type="button" variant="secondary" disabled={busy || picking} onClick={back}>返回</SetupButton> : <span />}
          {page !== 'recovery' && <SetupButton type="submit" variant="primary" disabled={busy || picking}>{busy ? '正在准备…' : actionLabel}</SetupButton>}
        </footer>
        <p className="setup-feedback" role="status" aria-live="polite" aria-atomic="true">{!busy ? (state.kind === 'page' && state.error || pickerError || '') : ''}</p>
          </div>
        </div>
      </form>
      <div className="setup-progress" aria-label={steps.length ? `第 ${index + 1} 步，共 ${steps.length} 步` : '开始配置'}>
        <ol>{steps.map((step, i) => <li key={step} aria-current={i === Math.max(index, 0) ? 'step' : undefined} data-complete={i < index}><span /></li>)}</ol>
        <span>{busy ? '正在准备' : steps.length ? `${createPages.includes(page) ? '创建工作空间' : '从其他设备继续'} · ${String(index + 1).padStart(2, '0')} / ${String(steps.length).padStart(2, '0')}` : page === 'complete' ? '准备完成' : '欢迎使用'}</span>
      </div>
    </section>
  </main>;
}
