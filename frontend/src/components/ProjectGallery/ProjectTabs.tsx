// ProjectTabs — a project detail's content surface.
//
// The tabs are data-driven: `ContentParts` renders one tab per Part the
// project actually has, in `sort_order`. The silan-viking SCHEMA `parts`
// set is a recommendation, not a closed whitelist — a project Part with a
// role the SCHEMA never declared still becomes its own tab, with no change
// here. `community` and `issues` are runtime features, not content Parts;
// they render below the Part content as their own sections.
import React from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Users, Bug } from 'lucide-react';
import ContentParts from '../content/ContentParts';
import ProjectCommunityFeedback from './ProjectCommunityFeedback';
import ProjectIssuesList from './ProjectIssuesList';
import type { ContentPart } from '../../types';

interface ProjectTabsProps {
  projectData: { parts?: ContentPart[] };
}

const ProjectTabs: React.FC<ProjectTabsProps> = ({ projectData }) => {
  const { id: projectId } = useParams<{ id: string }>();
  const { t } = useTranslation();

  return (
    <div className="w-full">
      {/* Content Parts — data-driven tabs. */}
      <ContentParts parts={projectData.parts ?? []} />

      {/* Runtime sections — not content Parts, so they sit below. */}
      {projectId && (
        <div className="mt-12 space-y-10">
          <section>
            <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-theme-primary">
              <Users size={18} />
              {t('projects.community')}
            </h3>
            <ProjectCommunityFeedback projectId={projectId} />
          </section>
          <section>
            <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-theme-primary">
              <Bug size={18} />
              {t('projects.issues')}
            </h3>
            <ProjectIssuesList projectId={projectId} />
          </section>
        </div>
      )}
    </div>
  );
};

export default ProjectTabs;
