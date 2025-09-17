// /api/sitemap/dynamic.js - 動的サイトマップ生成API
import { supabase } from '../_supabase.js';

export default async function handler(req, res) {
  try {
    const db = supabase();
    
    // 最新のスレッド一覧を取得（最大1000件）
    const { data: threads, error } = await db
      .from('threads')
      .select('id, title, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(1000);

    if (error) {
      console.error('Supabase threads error:', error);
      throw error;
    }

    // XMLサイトマップを生成
    const currentDate = new Date().toISOString().split('T')[0];
    
    let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">

  <!-- メインページ -->
  <url>
    <loc>https://www.studychannel.net/</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>

  <!-- 固定ページ -->
  <url>
    <loc>https://www.studychannel.net/favorites.html</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>

  <url>
    <loc>https://www.studychannel.net/myposts.html</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>

  <url>
    <loc>https://www.studychannel.net/replies.html</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.6</priority>
  </url>
`;

    // 各スレッドのURLを追加
    if (threads && threads.length > 0) {
      for (const thread of threads) {
        const lastMod = thread.updated_at 
          ? new Date(thread.updated_at).toISOString().split('T')[0]
          : new Date(thread.created_at).toISOString().split('T')[0];
        
        sitemap += `
  <!-- スレッド: ${thread.title?.slice(0, 50) || 'Untitled'}... -->
  <url>
    <loc>https://www.studychannel.net/thread.html?id=${thread.id}</loc>
    <lastmod>${lastMod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`;
      }
    }

    sitemap += `
</urlset>`;

    // XMLとして返す
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Cache-Control', 'public, max-age=3600'); // 1時間キャッシュ
    return res.status(200).send(sitemap);

  } catch (error) {
    console.error('Dynamic sitemap error:', error);
    
    // エラー時は基本的なサイトマップを返す
    const basicSitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://www.studychannel.net/</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`;

    res.setHeader('Content-Type', 'application/xml');
    return res.status(200).send(basicSitemap);
  }
}