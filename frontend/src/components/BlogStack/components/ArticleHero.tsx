import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import AuthorByline from './AuthorByline';
import './ArticleHero.css';

interface ArticleHeroProps {
  id: string;
  title: string;
  author: string;
  date?: string;
  readTime?: string;
  category?: string;
  tags?: string[];
  coverImage?: string;
  language: string;
}

/** Article identity lives above the reader grid, independent of outline width. */
const ArticleHero: React.FC<ArticleHeroProps> = ({
  id, title, author, date, readTime, category, tags, coverImage, language,
}) => (
  <header data-ds id={id} className="article-hero scroll-mt-24">
    {coverImage && (
      <img
        key={coverImage}
        src={coverImage}
        alt=""
        aria-hidden="true"
        loading="eager"
        decoding="async"
        className="article-hero__image"
      />
    )}
    <div className="article-hero__wash" aria-hidden="true" />
    <div className="article-hero__content">
      <h1 className="article-hero__title font-display text-ds-fg">{title}</h1>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-ds-sm text-ds-fg-muted">
        <AuthorByline name={author} />
        {date && <><span aria-hidden="true">|</span><span>{date}</span></>}
        {readTime && <><span aria-hidden="true">·</span><span>{readTime}</span></>}
      </div>
      <nav aria-label={language === 'zh' ? '面包屑导航' : 'Breadcrumb'} className="mt-7 text-ds-sm text-ds-fg-muted">
        <ol className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
          <li><Link className="article-hero__link" to="/">{language === 'zh' ? '首页' : 'Home'}</Link></li>
          <li aria-hidden="true"><ChevronRight className="size-4 text-ds-primary" /></li>
          <li><Link className="article-hero__link" to="/blog/">{language === 'zh' ? '博客' : 'Blog'}</Link></li>
          <li aria-hidden="true"><ChevronRight className="size-4 text-ds-primary" /></li>
          <li aria-current="page" className="min-w-0 max-w-full break-words text-ds-fg">{title}</li>
        </ol>
      </nav>
      {(category || Boolean(tags?.length)) && (
        <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1 text-ds-xs text-ds-fg-muted">
          {category && <span>{category}</span>}
          {tags?.slice(0, 3).map((tag) => <span key={tag}>#{tag}</span>)}
        </div>
      )}
    </div>
  </header>
);

export default ArticleHero;
