package projects

import (
	"context"
	"strings"

	"silan-backend/internal/ent/contentrelation"
	"silan-backend/internal/ent/project"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/google/uuid"
	"github.com/zeromicro/go-zero/core/logx"
)

type GetProjectGraphDataLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Get project graph data for visualization
func NewGetProjectGraphDataLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetProjectGraphDataLogic {
	return &GetProjectGraphDataLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GetProjectGraphDataLogic) GetProjectGraphData(req *types.GraphRequest) (resp *types.GraphData, err error) {
	query := l.svcCtx.DB.Project.Query().
		Where(project.VisibilityEQ(project.VisibilityPublic))
	if req.Category != "" && req.Category != "all" {
		query = query.Where(project.ProjectTypeEQ(req.Category))
	}

	projects, err := query.All(l.ctx)
	if err != nil {
		return nil, err
	}

	nodesByID := make(map[string]types.GraphNode)
	projectIDs := make([]uuid.UUID, 0, len(projects))
	for _, proj := range projects {
		id := graphNodeID("project", proj.ID)
		nodesByID[id] = types.GraphNode{ID: id, Group: 1}
		projectIDs = append(projectIDs, proj.ID)
	}

	links := make([]types.GraphLink, 0)
	if len(projectIDs) > 0 {
		relations, err := l.svcCtx.DB.ContentRelation.Query().
			Where(contentrelation.Or(
				contentrelation.And(
					contentrelation.FromTypeEQ(contentrelation.FromTypeProject),
					contentrelation.FromIDIn(projectIDs...),
				),
				contentrelation.And(
					contentrelation.ToTypeEQ(contentrelation.ToTypeProject),
					contentrelation.ToIDIn(projectIDs...),
				),
			)).
			All(l.ctx)
		if err != nil {
			return nil, err
		}

		for _, relation := range relations {
			source := graphNodeID(string(relation.FromType), relation.FromID)
			target := graphNodeID(string(relation.ToType), relation.ToID)
			nodesByID[source] = types.GraphNode{ID: source, Group: graphGroup(string(relation.FromType))}
			nodesByID[target] = types.GraphNode{ID: target, Group: graphGroup(string(relation.ToType))}
			links = append(links, types.GraphLink{
				Source: source,
				Target: target,
				Value:  graphWeight(string(relation.RelationType)),
			})
		}
	}

	nodes := make([]types.GraphNode, 0, len(nodesByID))
	for _, node := range nodesByID {
		nodes = append(nodes, node)
	}

	return &types.GraphData{
		Nodes: nodes,
		Links: links,
	}, nil
}

func graphNodeID(entityType string, id uuid.UUID) string {
	return strings.ToLower(entityType) + ":" + id.String()
}

func graphGroup(entityType string) int {
	switch entityType {
	case "project":
		return 1
	case "blog":
		return 2
	case "idea":
		return 3
	case "episode":
		return 4
	case "update":
		return 5
	default:
		return 9
	}
}

func graphWeight(relationType string) int {
	switch relationType {
	case "evolved_into":
		return 5
	case "documents":
		return 4
	case "references":
		return 3
	case "supersedes":
		return 2
	default:
		return 1
	}
}
