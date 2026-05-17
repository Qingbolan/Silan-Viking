package resume

import (
	"context"

	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type GetResumeDataLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Get complete resume data
func NewGetResumeDataLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetResumeDataLogic {
	return &GetResumeDataLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GetResumeDataLogic) GetResumeData(req *types.ResumeRequest) (resp *types.ResumeData, err error) {
	// Get personal info
	personalInfoLogic := NewGetPersonalInfoLogic(l.ctx, l.svcCtx)
	personalInfo, err := personalInfoLogic.GetPersonalInfo(&types.PersonalInfoRequest{Language: req.Language})
	if err != nil {
		return nil, err
	}

	// Get education
	educationLogic := NewGetEducationLogic(l.ctx, l.svcCtx)
	education, err := educationLogic.GetEducation(req)
	if err != nil {
		return nil, err
	}

	// Get work experience
	workExpLogic := NewGetWorkExperienceLogic(l.ctx, l.svcCtx)
	experience, err := workExpLogic.GetWorkExperience(req)
	if err != nil {
		return nil, err
	}

	// Get research projects
	researchLogic := NewGetResearchProjectsLogic(l.ctx, l.svcCtx)
	research, err := researchLogic.GetResearchProjects(req)
	if err != nil {
		return nil, err
	}

	// Get publications
	pubLogic := NewGetPublicationsLogic(l.ctx, l.svcCtx)
	publications, err := pubLogic.GetPublications(req)
	if err != nil {
		return nil, err
	}

	// Get awards
	awardsLogic := NewGetAwardsLogic(l.ctx, l.svcCtx)
	awards, err := awardsLogic.GetAwards(req)
	if err != nil {
		return nil, err
	}

	// Get recent updates
	updatesLogic := NewGetRecentUpdatesLogic(l.ctx, l.svcCtx)
	recentUpdates, err := updatesLogic.GetRecentUpdates(req)
	if err != nil {
		return nil, err
	}

	// Get skills from project technologies
	skills, err := l.getSkillsFromProjects()
	if err != nil {
		l.Logger.Errorf("Failed to get skills: %v", err)
		skills = []string{} // fallback to empty slice
	}

	return &types.ResumeData{
		PersonalInfo:  *personalInfo,
		Education:     education,
		Experience:    experience,
		Research:      research,
		Publications:  publications,
		Awards:        awards,
		RecentUpdates: recentUpdates,
		Skills:        skills,
	}, nil
}

// getSkillsFromProjects extracts unique skills from all project technologies
func (l *GetResumeDataLogic) getSkillsFromProjects() ([]string, error) {
	// Get all project technologies
	technologies, err := l.svcCtx.DB.ProjectTechnology.Query().
		WithProject().
		All(l.ctx)
	if err != nil {
		return nil, err
	}

	// Use a map to collect unique skills
	skillSet := make(map[string]bool)
	
	for _, tech := range technologies {
		// Only include technologies from public projects
		if tech.Edges.Project != nil && tech.Edges.Project.IsPublic {
			skillSet[tech.TechnologyName] = true
		}
	}

	// Convert map to slice
	skills := make([]string, 0, len(skillSet))
	for skill := range skillSet {
		skills = append(skills, skill)
	}

	return skills, nil
}
