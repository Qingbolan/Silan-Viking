package moments

import (
	"context"

	"silan-backend/internal/ent"
	"silan-backend/internal/ent/blogpost"
	"silan-backend/internal/ent/contentrelation"
	"silan-backend/internal/ent/moment"
	"silan-backend/internal/ent/project"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"
)

func relatedMomentOutputs(
	ctx context.Context,
	svcCtx *svc.ServiceContext,
	momentIDs []string,
	language string,
) map[string][]types.MomentRelatedOutput {
	type outputEdge struct {
		momentID string
		outputID string
		kind     string
		relation string
	}

	outputs := make(map[string][]types.MomentRelatedOutput, len(momentIDs))
	if len(momentIDs) == 0 {
		return outputs
	}

	momentAliases := momentRelationAliases(ctx, svcCtx, momentIDs)
	relationMomentKeys := make([]string, 0, len(momentAliases))
	for key := range momentAliases {
		relationMomentKeys = append(relationMomentKeys, key)
	}

	outgoing, err := svcCtx.DB.ContentRelation.Query().
		Where(
			contentrelation.FromTypeEQ(contentrelation.FromTypeMoment),
			contentrelation.FromIDIn(relationMomentKeys...),
			contentrelation.ToTypeIn(contentrelation.ToTypeBlog, contentrelation.ToTypeProject),
		).
		Order(contentrelation.BySortOrder(), contentrelation.ByCreatedAt()).
		All(ctx)
	if err != nil {
		return outputs
	}

	incoming, err := svcCtx.DB.ContentRelation.Query().
		Where(
			contentrelation.FromTypeIn(contentrelation.FromTypeBlog, contentrelation.FromTypeProject),
			contentrelation.ToTypeEQ(contentrelation.ToTypeMoment),
			contentrelation.ToIDIn(relationMomentKeys...),
		).
		Order(contentrelation.BySortOrder(), contentrelation.ByCreatedAt()).
		All(ctx)
	if err != nil {
		return outputs
	}

	edges := make([]outputEdge, 0, len(outgoing)+len(incoming))
	blogIDs := make([]string, 0)
	projectIDs := make([]string, 0)
	for _, relation := range outgoing {
		switch relation.ToType {
		case contentrelation.ToTypeBlog:
			blogIDs = append(blogIDs, relation.ToID)
			edges = append(edges, outputEdge{
				momentID: momentAliases[relation.FromID],
				outputID: relation.ToID,
				kind:     "blog",
				relation: string(relation.RelationType),
			})
		case contentrelation.ToTypeProject:
			projectIDs = append(projectIDs, relation.ToID)
			edges = append(edges, outputEdge{
				momentID: momentAliases[relation.FromID],
				outputID: relation.ToID,
				kind:     "project",
				relation: string(relation.RelationType),
			})
		}
	}
	for _, relation := range incoming {
		switch relation.FromType {
		case contentrelation.FromTypeBlog:
			blogIDs = append(blogIDs, relation.FromID)
			edges = append(edges, outputEdge{
				momentID: momentAliases[relation.ToID],
				outputID: relation.FromID,
				kind:     "blog",
				relation: inverseMomentOutputRelation(string(relation.RelationType)),
			})
		case contentrelation.FromTypeProject:
			projectIDs = append(projectIDs, relation.FromID)
			edges = append(edges, outputEdge{
				momentID: momentAliases[relation.ToID],
				outputID: relation.FromID,
				kind:     "project",
				relation: inverseMomentOutputRelation(string(relation.RelationType)),
			})
		}
	}

	blogs := momentOutputBlogs(ctx, svcCtx, blogIDs, language)
	projects := momentOutputProjects(ctx, svcCtx, projectIDs, language)
	seen := make(map[string]struct{}, len(edges))
	for _, edge := range edges {
		identity := edge.momentID + "\x00" + edge.kind + "\x00" + edge.outputID
		if _, ok := seen[identity]; ok {
			continue
		}
		seen[identity] = struct{}{}

		var output types.MomentRelatedOutput
		var ok bool
		switch edge.kind {
		case "blog":
			output, ok = blogs[edge.outputID]
		case "project":
			output, ok = projects[edge.outputID]
		}
		if !ok {
			continue
		}
		output.Relation = edge.relation
		outputs[edge.momentID] = append(outputs[edge.momentID], output)
	}
	return outputs
}

func momentRelationAliases(
	ctx context.Context,
	svcCtx *svc.ServiceContext,
	momentIDs []string,
) map[string]string {
	aliases := make(map[string]string, len(momentIDs)*2)
	for _, id := range momentIDs {
		aliases[id] = id
	}
	moments, err := svcCtx.DB.Moment.Query().
		Where(moment.IDIn(momentIDs...)).
		All(ctx)
	if err != nil {
		return aliases
	}
	for _, item := range moments {
		aliases[item.ID] = item.ID
		if item.Slug != "" {
			aliases[item.Slug] = item.ID
		}
	}
	return aliases
}

func inverseMomentOutputRelation(relation string) string {
	switch relation {
	case "evolved_from":
		return "evolved_into"
	case "documents":
		return "documented_by"
	default:
		return relation
	}
}

func momentOutputBlogs(
	ctx context.Context,
	svcCtx *svc.ServiceContext,
	ids []string,
	language string,
) map[string]types.MomentRelatedOutput {
	result := make(map[string]types.MomentRelatedOutput, len(ids))
	if len(ids) == 0 {
		return result
	}
	posts, err := svcCtx.DB.BlogPost.Query().
		Where(
			blogpost.Or(blogpost.IDIn(ids...), blogpost.SlugIn(ids...)),
			blogpost.StatusEQ(blogpost.StatusPublished),
			blogpost.VisibilityEQ(blogpost.VisibilityPublic),
		).
		WithTranslations().
		All(ctx)
	if err != nil {
		return result
	}
	for _, post := range posts {
		title := post.Title
		description := post.Excerpt
		if translation := pickMomentBlogTranslation(post.Edges.Translations, language); translation != nil {
			if translation.Title != "" {
				title = translation.Title
			}
			if translation.Excerpt != "" {
				description = translation.Excerpt
			}
		}
		tags, _ := svcCtx.ContentTags.Lookup(ctx, "blog", post.ID)
		slug := post.Slug
		if slug == "" {
			slug = post.ID
		}
		result[post.ID] = types.MomentRelatedOutput{
			Kind:        "blog",
			ID:          post.ID,
			Slug:        post.Slug,
			Title:       title,
			Description: description,
			Path:        "/blog/" + slug,
			Tags:        tags,
			Date:        post.PublishedAt,
		}
		if post.Slug != "" {
			result[post.Slug] = result[post.ID]
		}
	}
	return result
}

func momentOutputProjects(
	ctx context.Context,
	svcCtx *svc.ServiceContext,
	ids []string,
	language string,
) map[string]types.MomentRelatedOutput {
	result := make(map[string]types.MomentRelatedOutput, len(ids))
	if len(ids) == 0 {
		return result
	}
	projects, err := svcCtx.DB.Project.Query().
		Where(
			project.Or(project.IDIn(ids...), project.SlugIn(ids...)),
			project.VisibilityEQ(project.VisibilityPublic),
		).
		WithTranslations().
		All(ctx)
	if err != nil {
		return result
	}
	for _, proj := range projects {
		title := proj.Title
		description := proj.Description
		if translation := pickMomentProjectTranslation(proj.Edges.Translations, language); translation != nil {
			if translation.Title != "" {
				title = translation.Title
			}
			if translation.Description != "" {
				description = translation.Description
			}
		}
		tags, _ := svcCtx.ContentTags.Lookup(ctx, "project", proj.ID)
		slug := proj.Slug
		if slug == "" {
			slug = proj.ID
		}
		result[proj.ID] = types.MomentRelatedOutput{
			Kind:        "project",
			ID:          proj.ID,
			Slug:        proj.Slug,
			Title:       title,
			Description: description,
			Path:        "/projects/" + slug,
			Tags:        tags,
			Date:        proj.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
		}
		if proj.Slug != "" {
			result[proj.Slug] = result[proj.ID]
		}
	}
	return result
}

func pickMomentBlogTranslation(trs []*ent.BlogPostTranslation, lang string) *ent.BlogPostTranslation {
	by := func(code string) *ent.BlogPostTranslation {
		for _, translation := range trs {
			if translation.LanguageCode == code {
				return translation
			}
		}
		return nil
	}
	if translation := by(resolveLang(lang)); translation != nil {
		return translation
	}
	if translation := by("en"); translation != nil {
		return translation
	}
	if len(trs) > 0 {
		return trs[0]
	}
	return nil
}

func pickMomentProjectTranslation(trs []*ent.ProjectTranslation, lang string) *ent.ProjectTranslation {
	by := func(code string) *ent.ProjectTranslation {
		for _, translation := range trs {
			if translation.LanguageCode == code {
				return translation
			}
		}
		return nil
	}
	if translation := by(resolveLang(lang)); translation != nil {
		return translation
	}
	if translation := by("en"); translation != nil {
		return translation
	}
	if len(trs) > 0 {
		return trs[0]
	}
	return nil
}
