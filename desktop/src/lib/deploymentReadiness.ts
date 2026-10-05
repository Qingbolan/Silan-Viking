export type DeploymentPlanState = 'loading' | 'ready' | 'error';

export type DeploymentReadinessState =
  | 'not_configured'
  | 'uncommitted'
  | 'comparing'
  | 'synchronized'
  | 'remote_ahead'
  | 'diverged'
  | 'remote_unknown'
  | 'pulling'
  | 'ready_with_unsaved'
  | 'blocked_uncommitted'
  | 'checking'
  | 'check_failed'
  | 'ready'
  | 'deploying';

export type DeploymentReadiness = {
  state: DeploymentReadinessState;
  canDeploy: boolean;
  canPull: boolean;
  message: string;
  actionTitle: string;
};

type DeploymentReadinessInput = {
  localCommitCount: number | null;
  remoteCommitCount: number;
  syncState: 'synchronized' | 'local_ahead' | 'remote_ahead' | 'diverged' | 'remote_unknown' | 'not_configured' | 'uncommitted' | null;
  workspaceChangeCount: number;
  unsavedDocumentCount: number;
  planState: DeploymentPlanState;
  planError?: string | null;
  deploying: boolean;
  pulling: boolean;
};

type DeliverySyncSnapshot = {
  local_head: string;
  remote_head: string;
  state: 'synchronized' | 'local_ahead' | 'remote_ahead' | 'diverged' | 'remote_unknown' | 'not_configured' | 'uncommitted';
};

/**
 * One stable key per safe automatic pull attempt. A caller remembers keys it
 * has attempted so a failed remote never creates a polling retry loop.
 */
export const automaticDeploymentPullKey = (
  status: DeliverySyncSnapshot | null,
  unsavedDocumentCount: number,
) => {
  if (!status || unsavedDocumentCount > 0) return null;
  if (status.state !== 'remote_ahead' && status.state !== 'remote_unknown') return null;
  return `${status.local_head}:${status.remote_head}`;
};

export const clearResolvedSynchronizationError = (
  error: string | null,
  status: DeliverySyncSnapshot,
) => {
  if (!error?.includes('workspace synchronization stopped safely')) return error;
  return status.state === 'remote_ahead' || status.state === 'remote_unknown' ? error : null;
};

const countLabel = (count: number, singular: string, plural = `${singular}s`) => (
  `${count} ${count === 1 ? singular : plural}`
);

const conciseError = (message: string | null | undefined) => (
  message?.replace(/^Error:\s*/i, '').trim() || 'The deployment plan could not be loaded.'
);

/**
 * The dashboard's single deploy-readiness state machine. The status copy,
 * button availability, and tooltip must all come from this result so the UI
 * cannot claim a release is ready while silently disabling its action.
 */
export const deploymentReadinessFor = ({
  localCommitCount,
  remoteCommitCount,
  syncState,
  workspaceChangeCount,
  unsavedDocumentCount,
  planState,
  planError,
  deploying,
  pulling,
}: DeploymentReadinessInput): DeploymentReadiness => {
  if (syncState === 'not_configured' || syncState === 'uncommitted') {
    return {
      state: syncState, canDeploy: false, canPull: false,
      message: syncState === 'not_configured' ? 'Local workspace · publishing is not configured' : 'Create your first commit before publishing',
      actionTitle: syncState === 'not_configured' ? 'Configure a deployment target and device access when you are ready to publish' : 'Review and commit your local content first',
    };
  }
  if (localCommitCount === null) {
    return {
      state: 'comparing',
      canDeploy: false,
      canPull: false,
      message: 'Comparing local and deployed versions…',
      actionTitle: 'Wait for the local and deployed versions to be compared',
    };
  }

  if (pulling) {
    return {
      state: 'pulling',
      canDeploy: false,
      canPull: false,
      message: `Pulling ${countLabel(remoteCommitCount, 'deployed moment')}…`,
      actionTitle: 'Deployed content is being pulled into this workspace',
    };
  }

  if (syncState === 'diverged') {
    return {
      state: 'diverged',
      canDeploy: false,
      canPull: false,
      message: 'Local and deployed histories have diverged',
      actionTitle: 'Reconcile the local and deployed histories before continuing',
    };
  }

  if (syncState === 'remote_ahead' || syncState === 'remote_unknown') {
    const remoteLabel = countLabel(remoteCommitCount, 'moment');
    const hasUnsavedDocuments = unsavedDocumentCount > 0;
    return {
      state: syncState,
      canDeploy: false,
      canPull: !hasUnsavedDocuments,
      message: hasUnsavedDocuments
        ? `${remoteLabel} ${remoteCommitCount === 1 ? 'exists' : 'exist'} remotely; save editor changes before pulling`
        : `${remoteLabel} ${remoteCommitCount === 1 ? 'exists' : 'exist'} on the deployed version`,
      actionTitle: hasUnsavedDocuments
        ? 'Save open editor changes before pulling deployed content'
        : 'Pull deployed content while preserving non-conflicting workspace changes',
    };
  }

  if (localCommitCount === 0) {
    return {
      state: 'synchronized',
      canDeploy: false,
      canPull: false,
      message: 'Local and deployed content match',
      actionTitle: 'There are no committed changes to deploy',
    };
  }

  if (deploying) {
    return {
      state: 'deploying',
      canDeploy: false,
      canPull: false,
      message: `Deploying ${countLabel(localCommitCount, 'committed moment')}…`,
      actionTitle: 'Deployment is in progress',
    };
  }

  if (workspaceChangeCount > 0) {
    const changeLabel = countLabel(workspaceChangeCount, 'uncommitted change');
    return {
      state: 'blocked_uncommitted',
      canDeploy: false,
      canPull: false,
      message: `${changeLabel} must be committed first`,
      actionTitle: `Commit ${changeLabel} before deploying`,
    };
  }

  if (planState === 'loading') {
    return {
      state: 'checking',
      canDeploy: false,
      canPull: false,
      message: 'Checking deployment configuration…',
      actionTitle: 'Wait for the deployment check to finish',
    };
  }

  if (planState === 'error') {
    const error = conciseError(planError);
    return {
      state: 'check_failed',
      canDeploy: false,
      canPull: false,
      message: `Deployment check failed: ${error}`,
      actionTitle: `Retry deployment check. ${error}`,
    };
  }

  if (unsavedDocumentCount > 0) {
    const commitLabel = countLabel(localCommitCount, 'committed moment');
    const unsavedLabel = countLabel(unsavedDocumentCount, 'unsaved Markdown file');
    return {
      state: 'ready_with_unsaved',
      canDeploy: true,
      canPull: false,
      message: `${commitLabel} ready; ${unsavedLabel} will stay local`,
      actionTitle: `Deploy committed content. ${unsavedLabel} will stay local`,
    };
  }

  return {
    state: 'ready',
    canDeploy: true,
    canPull: false,
    message: `${countLabel(localCommitCount, 'committed moment')} ready to deploy`,
    actionTitle: 'Deploy committed content to the production website',
  };
};
