// Threads API with Supabase integration
import { supabase, parseListParams } from '../_supabase.js';

export default async function handler(req, res) {
  try {
    const db = supabase();

    if (req.method === 'GET') {
      // Parse URL to get query parameters
      const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
      const userFingerprint = url.searchParams.get('user_fingerprint');
      const { limit, sort, order } = parseListParams(req);

      console.log('GET /api/tables/threads - userFingerprint:', userFingerprint);
      console.log('Query params - limit:', limit, 'sort:', sort, 'order:', order);

      // Build query
      let query = db.from('threads').select('*');

      // If user_fingerprint is specified, filter to that user's threads only
      if (userFingerprint) {
        query = query.eq('user_fingerprint', userFingerprint);
      }

      // Apply sorting
      query = query.order(sort, { ascending: order === 'asc' });

      // Apply limit
      if (limit && limit > 0) {
        query = query.limit(limit);
      }

      const { data, error } = await query;
      if (error) {
        console.error('Supabase query error:', error);
        return res.status(500).json({ error: error.message });
      }

      console.log('Successfully fetched threads from Supabase:', data?.length || 0, 'threads');
      return res.status(200).json({ data: data || [] });
    }

    if (req.method === 'POST') {
      let body = {};
      try {
        body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
      } catch {
        return res.status(400).json({ error: 'invalid json body' });
      }

      console.log('Creating new thread:', body);

      const threadData = {
        title: body.title || 'New Thread',
        content: body.content || 'New thread content',
        category: body.category || 'General',
        subcategory: body.subcategory || null,
        author_name: body.author_name || '匿名',
        user_fingerprint: body.user_fingerprint || 'anonymous',
        like_count: 0,
        reply_count: 0,
        hashtags: body.hashtags || [],
        images: body.images || []
      };

      const { data, error } = await db
        .from('threads')
        .insert(threadData)
        .select()
        .single();

      if (error) {
        console.error('Supabase thread insert error:', error);
        return res.status(500).json({ error: error.message });
      }

      console.log('Successfully created thread in Supabase:', data.id);
      return res.status(201).json({ data });
    }

    return res.status(405).json({ error: 'method not allowed' });

  } catch (error) {
    console.error('Threads API Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}