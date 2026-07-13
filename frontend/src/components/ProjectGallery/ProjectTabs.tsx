// ProjectTabs — a project detail's content surface.
//
// Two kinds of tab share one strip:
//  - **content Part tabs** — data-driven, open-set: one tab per Part the
//    project actually has, in `sort_order`. An agent can add a Part with a
//    role the SCHEMA never declared and it becomes a tab with no code change.
//  - **runtime tabs** — `community` and `issues`. These are *registered*
//    fixed tabs, not content Parts: declared here, always present, never
//    extended by an agent. They sit after the content Parts.
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Users, MessageSquareText } from 'lucide-react';
import ContentParts, { type ExtraTab } from '../content/ContentParts';
import ProjectDiscussion from './ProjectDiscussion';
import ProjectIssuesList from './ProjectIssuesList';
import type { ContentPart } from '../../types';

interface ProjectTabsProps {
  projectData: { parts?: ContentPart[] };
  projectId: string;
  documentTitle: string;
}

const ProjectTabs: React.FC<ProjectTabsProps> = ({ projectData, projectId, documentTitle }) => {
  const { t, i18n } = useTranslation();

  // The fixed runtime tabs — always registered, regardless of content.
  const extraTabs: ExtraTab[] = [
        {
          key: 'community',
          label: t('projects.community'),
          icon: <Users size={16} />,
          render: () => <ProjectDiscussion projectId={projectId} />,
        },
        {
          key: 'issues',
          label: i18n.language.startsWith('zh') ? '反馈' : 'Feedback',
          icon: <MessageSquareText size={16} />,
          render: () => <ProjectIssuesList projectId={projectId} />,
        },
      ];

  return <ContentParts parts={projectData.parts ?? []} extraTabs={extraTabs} documentTitle={documentTitle} />;
};

export default ProjectTabs;
