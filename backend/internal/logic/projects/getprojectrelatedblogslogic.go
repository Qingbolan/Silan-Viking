package projects

import (
	"context"
	"fmt"
	"sort"

	"silan-backend/internal/ent/blogpost"
	"silan-backend/internal/ent/contentrelation"
	"silan-backend/internal/ent/project"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type GetProjectRelatedBlogsLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Get project related blogs
func NewGetProjectRelatedBlogsLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetProjectRelatedBlogsLogic {
	return &GetProjectRelatedBlogsLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GetProjectRelatedBlogsLogic) GetProjectRelatedBlogs(req *types.ProjectDetailRequest) (resp []types.ProjectBlogRef, err error) {
	projectID := req.ID

	exists, err := l.svcCtx.DB.Project.Query().
		Where(project.ID(projectID), project.VisibilityEQ(project.VisibilityPublic)).
		Exist(l.ctx)
	if err != nil {
		return nil, err
	}
	if !exists {
		return []types.ProjectBlogRef{}, nil
	}

	relations, err := l.svcCtx.DB.ContentRelation.Query().
		Where(contentrelation.Or(
			contentrelation.And(
				contentrelation.FromTypeEQ(contentrelation.FromTypeProject),
				contentrelation.FromIDEQ(projectID),
				contentrelation.ToTypeEQ(contentrelation.ToTypeBlog),
			),
			contentrelation.And(
				contentrelation.FromTypeEQ(contentrelation.FromTypeBlog),
				contentrelation.ToTypeEQ(contentrelation.ToTypeProject),
				contentrelation.ToIDEQ(projectID),
			),
		)).
		All(l.ctx)
	if err != nil {
		return nil, err
	}
	if len(relations) == 0 {
		return []types.ProjectBlogRef{}, nil
	}

	relevanceByBlogID := make(map[string]string)
	blogIDs := make([]string, 0, len(relations))
	seen := make(map[string]struct{})
	for _, relation := range relations {
		var blogID string
		if relation.FromType == contentrelation.FromTypeBlog {
			blogID = relation.FromID
		} else if relation.ToType == contentrelation.ToTypeBlog {
			blogID = relation.ToID
		} else {
			continue
		}
		if _, ok := seen[blogID]; !ok {
			seen[blogID] = struct{}{}
			blogIDs = append(blogIDs, blogID)
		}
		relevanceByBlogID[blogID] = string(relation.RelationType)
	}

	posts, err := l.svcCtx.DB.BlogPost.Query().
		Where(
			blogpost.IDIn(blogIDs...),
			blogpost.StatusEQ(blogpost.StatusPublished),
			blogpost.VisibilityEQ(blogpost.VisibilityPublic),
		).
		All(l.ctx)
	if err != nil {
		return nil, err
	}

	resp = make([]types.ProjectBlogRef, 0, len(posts))
	for _, post := range posts {
		// SCHEMA.md `blog.category` is a free-text label written straight
		// into `category_id`; see BlogPost.Edges.
		category := post.CategoryID

		// Tags come from the cross-type `content_tag` table — the engine no
		// longer populates the legacy ent `Tags` edge.
		tags, tagErr := l.svcCtx.ContentTags.Lookup(l.ctx, "blog", post.ID)
		if tagErr != nil {
			l.Errorf("content_tag lookup for blog %s: %v", post.ID, tagErr)
		}
		sort.Strings(tags)

		// `published_at` is a plain date string.
		publishDate := post.PublishedAt

		readTime := ""
		if post.ReadingTimeMinutes > 0 {
			readTime = fmt.Sprintf("%d min read", post.ReadingTimeMinutes)
		}

		resp = append(resp, types.ProjectBlogRef{
			ID:          post.ID,
			Title:       post.Title,
			Summary:     post.Excerpt,
			PublishDate: publishDate,
			Category:    category,
			Tags:        tags,
			ReadTime:    readTime,
			URL:         "/blog/" + post.Slug,
			Relevance:   relevanceByBlogID[post.ID],
			Description: post.Excerpt,
		})
	}

	sort.Slice(resp, func(i, j int) bool {
		return resp[i].PublishDate > resp[j].PublishDate
	})

	return resp, nil
}
