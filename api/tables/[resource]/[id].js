// /api/tables/[resource]/[id].js
import { supabase } from '../../../_supabase.js';

export default async function handler(req, res) {
  try {
    console.log('API call:', { method: req.method, resource: req.query.resource, id: req.query.id });
    
    const sb = supabase(true); // Use service role for all operations to bypass RLS
    console.log('Supabase client created successfully');

    const { resource, id } = req.query;
    if (!resource || !id) {
      console.log('Missing params:', { resource, id });
      return res.status(400).json({ error: 'missing params' });
    }

    console.log('Fetching record:', { resource, id });
    const { data: record, error: getErr } = await sb.from(resource).select('*').eq('id', id).maybeSingle();
    
    if (getErr) {
      console.error('Supabase error:', getErr);
      return res.status(500).json({ error: getErr.message, details: getErr });
    }
    
    if (!record) {
      console.log('Record not found:', { resource, id });
      return res.status(404).json({ error: 'not found' });
    }
    
    console.log('Record found:', { id: record.id, resource });

    if (req.method === 'GET') return res.status(200).json({ data: record });

    let body = {};
    try {
      body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    } catch {
      return res.status(400).json({ error: 'invalid json body' });
    }

    const { user_fingerprint, ...fields } = body;
    if (!user_fingerprint || user_fingerprint !== record.user_fingerprint)
      return res.status(403).json({ error: 'forbidden' });

    if (req.method === 'PATCH') {
      const updatable = {};
      ['title','content','category','subcategory','hashtags','images'].forEach(k => {
        if (k in fields) updatable[k] = fields[k];
      });
      const { data, error } = await sb.from(resource).update(updatable).eq('id', id).select().single();
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ data });
    }

    if (req.method === 'DELETE') {
      const { error } = await sb.from(resource).delete().eq('id', id);
      if (error) return res.status(400).json({ error: error.message });
      return res.status(204).end();
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    console.error('Unexpected error in [resource]/[id] API:', e);
    return res.status(500).json({ 
      error: e.message || 'server error',
      stack: process.env.NODE_ENV === 'development' ? e.stack : undefined,
      details: e
    });
  }
}

