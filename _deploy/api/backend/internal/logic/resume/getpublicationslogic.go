package resume

import (
	"context"
	"strings"

	"silan-backend/internal/ent"
	"silan-backend/internal/ent/publication"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type GetPublicationsLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Get publications list
func NewGetPublicationsLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetPublicationsLogic {
	return &GetPublicationsLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GetPublicationsLogic) GetPublications(req *types.ResumeRequest) (resp []types.Publication, err error) {
	publications, err := l.svcCtx.DB.Publication.Query().
		WithUser().
		// WithAuthors(). // 暂时注释掉，因为数据库中缺少updated_at字段
		Order(ent.Asc(publication.FieldSortOrder)).
		All(l.ctx)
	if err != nil {
		return nil, err
	}

	var result []types.Publication
	for _, pub := range publications {
		var publishedAt string
		if !pub.PublicationDate.IsZero() {
			publishedAt = pub.PublicationDate.Format("2006-01-02")
		}

		// Get user ID from edge relationship
		var userID string
		if pub.Edges.User != nil {
			userID = pub.Edges.User.ID.String()
		}

		// Get authors from edge relationship - 暂时使用空字符串
		var authors []string
		// if pub.Edges.Authors != nil {
		// 	for _, author := range pub.Edges.Authors {
		// 		authors = append(authors, author.AuthorName)
		// 	}
		// }
		authorsStr := ""
		if len(authors) > 0 {
			authorsStr = strings.Join(authors, ", ")
		}

		result = append(result, types.Publication{
			ID:            pub.ID.String(),
			UserID:        userID,
			Title:         pub.Title,
			Authors:       authorsStr,
			Journal:       pub.JournalName,
			Conference:    pub.ConferenceName,
			Publisher:     "", // Publisher field not in schema
			PublishedAt:   publishedAt,
			DOI:           pub.Doi,
			URL:           pub.URL,
			CitationCount: pub.CitationCount,
			CreatedAt:     pub.CreatedAt.Format("2006-01-02 15:04:05"),
			UpdatedAt:     pub.UpdatedAt.Format("2006-01-02 15:04:05"),
		})
	}

	return result, nil
}
