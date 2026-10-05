export const repositoryName = (repositoryUrl: string) => {
  const normalized = repositoryUrl.trim().replace(/\/+$/, '');
  const tail = normalized.split(/[/:]/).filter(Boolean).at(-1) || 'research-workspace';
  return tail.replace(/\.git$/i, '').replace(/[^a-zA-Z0-9._-]+/g, '-');
};

export const defaultWorkspaceDestination = (repositoryUrl: string) => (
  `~/Silan Workspaces/${repositoryName(repositoryUrl)}`
);

export type SetupPage = 'welcome' | 'location' | 'identity' | 'profile' | 'ai' | 'starter' | 'review'
  | 'repository' | 'join-location' | 'open' | 'repair' | 'recovery' | 'complete';
export type BootstrapStatus = {
  state: 'ready' | 'needs_workspace' | 'invalid_workspace' | 'deployment_key';
  project_root: string | null;
  project_name: string | null;
  error: string | null;
  deployment_key_required?: boolean;
};
export type PreparationStage = 'checking_access' | 'cloning' | 'synchronizing' | 'creating' | 'indexing' | 'activating';
export type SetupState =
  | { kind: 'checking' }
  | { kind: 'page'; page: SetupPage; error: string | null }
  | { kind: 'working'; returnPage: SetupPage; stage: PreparationStage }
  | { kind: 'ready' };
export type SetupEvent =
  | { type: 'bootstrap'; status: BootstrapStatus }
  | { type: 'navigate'; page: SetupPage }
  | { type: 'start'; stage: PreparationStage }
  | { type: 'progress'; stage: PreparationStage }
  | { type: 'failed'; error: string }
  | { type: 'completed'; page: SetupPage }
  | { type: 'enter' };

const transitions: Partial<Record<SetupPage, readonly SetupPage[]>> = {
  welcome: ['location', 'open', 'repository', 'recovery'],
  location: ['welcome', 'identity'], identity: ['location', 'profile'], profile: ['identity', 'ai'], ai: ['profile', 'starter'],
  starter: ['ai', 'review'], review: ['starter'],
  repository: ['welcome'], 'join-location': ['repository'],
  open: ['welcome'], repair: ['welcome', 'open'], recovery: ['welcome'],
};

/** All navigation and in-flight transitions have one owner. Form values are
 * retained outside this reducer when navigating backward or retrying. */
export function setupReducer(state: SetupState, event: SetupEvent): SetupState {
  switch (event.type) {
    case 'bootstrap':
      if (state.kind !== 'checking') return state;
      if (event.status.state === 'ready') return { kind: 'ready' };
      return { kind: 'page', page: event.status.state === 'invalid_workspace' ? 'repair'
        : event.status.state === 'deployment_key' ? 'complete' : 'welcome', error: null };
    case 'navigate':
      return state.kind === 'page' && transitions[state.page]?.includes(event.page)
        ? { kind: 'page', page: event.page, error: null } : state;
    case 'start':
      return state.kind === 'page' ? { kind: 'working', returnPage: state.page, stage: event.stage } : state;
    case 'progress':
      return state.kind === 'working' ? { ...state, stage: event.stage } : state;
    case 'failed':
      if (state.kind === 'ready') return state;
      return { kind: 'page', page: state.kind === 'working' ? state.returnPage
        : state.kind === 'page' ? state.page : 'repair', error: event.error };
    case 'completed':
      return state.kind === 'working' ? { kind: 'page', page: event.page, error: null } : state;
    case 'enter':
      return state.kind === 'page' && state.page === 'complete' ? { kind: 'ready' } : state;
  }
}

export function workspaceFolderName(name: string): string {
  return name.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/^\.+|\.+$/g, '').trim() || 'my-research';
}

export function localizedSetupError(reason: unknown): string {
  const message = String(reason).replace(/^Error:\s*/i, '').trim();
  if (/Permission denied \(publickey\)/i.test(message)) return 'SSH 未能验证这台设备。请将有仓库权限的密钥加入 SSH agent，然后重试。';
  if (/Authentication failed|could not read Username|terminal prompts disabled/i.test(message)) return '尚未配置 Git HTTPS 访问权限。请先在系统 Git 凭据管理器中登录，再重试。';
  if (/Repository not found/i.test(message)) return '找不到这个仓库，或当前账号没有读取权限。请检查地址与权限。';
  if (/Could not resolve|Connection timed out|Failed to connect|Network is unreachable/i.test(message)) return '暂时无法连接仓库。请检查网络；已有本地文件时，可以返回并选择打开本机工作空间。';
  if (/Choose a new folder|destination appeared/i.test(message)) return '这个位置已存在文件夹。请选择一个新的文件夹名称；已有工作空间可以从首页打开。';
  if (/select the project folder|not the content directory/i.test(message)) return '请选择包含 silan-viking.toml 的工作空间文件夹，或配置中指定的内容文件夹。';
  return message || '暂时无法完成这一步，请检查设置后重试。';
}
