import type { APIRoute } from 'astro';
import { CATEGORIES } from '../data/categories.js';
import dailyArticles from '../data/daily-articles.json';

export const GET: APIRoute = () => {
  const articles: object[] = [];

  // Category articles (published only)
  for (const cat of Object.values(CATEGORIES)) {
    for (const article of cat.articles) {
      if (!article.comingSoon) {
        articles.push({
          title: article.title,
          excerpt: article.excerpt,
          href: article.href,
          category: cat.title,
          icon: cat.icon,
          type: 'article',
        });
      }
    }
  }

  // Daily briefings
  for (const brief of dailyArticles) {
    articles.push({
      title: brief.title,
      excerpt: brief.excerpt,
      href: brief.href,
      category: '데일리 브리핑',
      icon: '📰',
      type: 'daily',
    });
  }

  return new Response(JSON.stringify(articles), {
    headers: { 'Content-Type': 'application/json' },
  });
};
