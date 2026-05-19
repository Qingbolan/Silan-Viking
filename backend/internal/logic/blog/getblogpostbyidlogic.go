package blog

import (
	"context"
	"fmt"

	"silan-backend/internal/contenttag"
	"silan-backend/internal/ent/blogpost"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type GetBlogPostByIdLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Get single blog post by ID
func NewGetBlogPostByIdLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetBlogPostByIdLogic {
	return &GetBlogPostByIdLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GetBlogPostByIdLogic) GetBlogPostById(req *types.BlogByIdRequest) (resp *types.BlogData, err error) {
	postId := req.ID

	post, err := l.svcCtx.DB.BlogPost.Query().
		Where(
			blogpost.ID(postId),
			blogpost.StatusEQ(blogpost.StatusPublished),
			blogpost.VisibilityEQ(blogpost.VisibilityPublic),
		).
		WithCategory().
		WithTranslations().
		First(l.ctx)
	if err != nil {
		return nil, err
	}

	// `published_at` is a plain date string.
	publishDate := post.PublishedAt

	var readTime string
	if post.ReadingTimeMinutes > 0 {
		readTime = fmt.Sprintf("%d min read", post.ReadingTimeMinutes)
	}

	var category string
	if post.Edges.Category != nil {
		category = post.Edges.Category.Name
	}

	// Tags come from the cross-type `content_tag` table — the engine no
	// longer populates the legacy ent `Tags` edge.
	tags, err := contenttag.Lookup(l.ctx, l.svcCtx.RawDB, "blog", post.ID)
	if err != nil {
		l.Errorf("content_tag lookup for blog %s: %v", post.ID, err)
	}

	// Single-owner system: content has no per-item author.
	var author string

	// The content engine keeps title/excerpt in blog_post_translations and
	// the prose body in item_part_translation (the main blog_posts row
	// leaves them empty), so always resolve from those sources.
	title := post.Title
	excerpt := post.Excerpt
	if tr := pickBlogTranslation(post.Edges.Translations, req.Language); tr != nil {
		if tr.Title != "" {
			title = tr.Title
		}
		if tr.Excerpt != "" {
			excerpt = tr.Excerpt
		}
	}
	body := post.Content
	if synced := blogBody(l.ctx, l.svcCtx, post.ID, req.Language); synced != "" {
		body = synced
	}

	// A blog's series is just the `series_id` / `series_order` fields on the
	// post itself — the silan-viking model has no separate `blog_series`
	// table. `series_id` is the series slug; it doubles as id and slug.
	var seriesID, seriesSlug, seriesTitle, seriesTitleZh, seriesDescription, seriesDescriptionZh, seriesImage string
	var episodeNumber, totalEpisodes int
	contentType := string(post.ContentType)
	if post.SeriesID != "" {
		seriesID = post.SeriesID
		seriesSlug = post.SeriesID
		seriesTitle = post.SeriesID
		episodeNumber = post.SeriesOrder
	}

	content := []types.BlogContent{
		{
			Type:    "text",
			Content: body,
			ID:      post.ID + "-content",
		},
	}

	return &types.BlogData{
		ID:                  post.ID,
		Title:               title,
		Slug:                post.Slug,
		Author:              author,
		PublishDate:         publishDate,
		ReadTime:            readTime,
		Category:            category,
		Tags:                tags,
		Content:             content,
		Likes:               int64(post.LikeCount),
		Views:               int64(post.ViewCount),
		Summary:             excerpt,
		FeaturedImageURL:    post.FeaturedImageURL,
		Type:                contentType,
		SeriesID:            seriesID,
		SeriesSlug:          seriesSlug,
		SeriesTitle:         seriesTitle,
		SeriesTitleZh:       seriesTitleZh,
		SeriesDescription:   seriesDescription,
		SeriesDescriptionZh: seriesDescriptionZh,
		EpisodeNumber:       episodeNumber,
		TotalEpisodes:       totalEpisodes,
		SeriesImage:         seriesImage,
	}, nil
}
