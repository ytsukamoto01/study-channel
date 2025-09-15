// Resource API with Supabase integration
import { supabase } from '../../_supabase.js';

export default async function handler(req, res) {
  try {
    console.log('=== API Request ===');
    console.log('Method:', req.method);
    console.log('URL:', req.url);
    console.log('Query:', req.query);
    
    const { resource, id } = req.query;
    // anon client for read / ownership checks
    const db = supabase();
    // service role client for updates/deletes (RLS blocks anon)
    const svc = supabase(true);

    // Basic validation
    if (!resource || !id) {
      console.log('Missing params - resource:', resource, 'id:', id);
      return res.status(400).json({
        error: 'missing params',
        received: { resource, id },
        debug: 'API called but missing required parameters'
      });
    }

    console.log(`Processing ${req.method} request for ${resource}/${id}`);

    // Parse request body when needed (works with native Node server)
    let body = {};
    if (['POST', 'PATCH', 'DELETE'].includes(req.method)) {
      if (typeof req.body === 'string') {
        body = JSON.parse(req.body || '{}');
      } else if (typeof req.body === 'object' && req.body !== null) {
        body = req.body;
      } else {
        let bodyText = '';
        for await (const chunk of req) {
          bodyText += chunk.toString();
        }
        body = bodyText ? JSON.parse(bodyText) : {};
      }
    }


    // Handle GET request
    if (req.method === 'GET') {
      console.log(`Fetching ${resource} with id ${id} from Supabase`);

      const { data, error } = await db
        .from(resource)
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) {
        console.error('Supabase GET error:', error);
        return res.status(500).json({ error: error.message });
      }

      if (!data) {
        console.log('No data found for', resource, id);
        return res.status(404).json({ error: 'Not found', resource, id });
      }

      console.log('Successfully fetched from Supabase:', resource, id);
      return res.status(200).json({ data });
    }

    // Handle PATCH request
    if (req.method === 'PATCH') {
      try {
        console.log('PATCH request for', resource, id, 'with data:', body);
        
        // For threads, check user_fingerprint ownership
        if (resource === 'threads') {
          const { data: existingThread } = await db
            .from('threads')
            .select('user_fingerprint')
            .eq('id', id)
            .maybeSingle();
          
          if (!existingThread) {
            return res.status(404).json({ error: 'Thread not found' });
          }
          
          // Check ownership via user_fingerprint
          if (body.user_fingerprint !== existingThread.user_fingerprint) {
            console.log('Ownership check failed:', body.user_fingerprint, '!=', existingThread.user_fingerprint);
            return res.status(403).json({ error: 'Not authorized to edit this thread' });
          }
        }
        
        // Prepare update data (exclude user_fingerprint from updates)
        const updateData = { ...body };
        delete updateData.user_fingerprint;
        
        const { data, error } = await svc
          .from(resource)
          .update(updateData)
          .eq('id', id)
          .select()
          .single();
        
        if (error) {
          console.error('Supabase PATCH error:', error);
          throw error;
        }
        
        console.log('Successfully updated', resource, id);
        return res.status(200).json({ data: data });
        
      } catch (supabaseError) {
        console.error('Supabase PATCH error:', supabaseError);
        return res.status(500).json({ error: supabaseError.message });
      }
    }

    // Handle DELETE request  
    if (req.method === 'DELETE') {
      try {
        console.log('DELETE request for', resource, id, 'with body:', body);
        
        // For threads, check user_fingerprint ownership
        if (resource === 'threads') {
          const { data: existingThread } = await db
            .from('threads')
            .select('user_fingerprint')
            .eq('id', id)
            .maybeSingle();

          if (!existingThread) {
            return res.status(404).json({ error: 'Thread not found' });
          }

          // Check ownership via user_fingerprint
          if (body.user_fingerprint !== existingThread.user_fingerprint) {
            console.log('Ownership check failed:', body.user_fingerprint, '!=', existingThread.user_fingerprint);
            return res.status(403).json({ error: 'Not authorized to delete this thread' });
          }

          // Collect comment ids so related likes can be removed
          const { data: comments } = await svc
            .from('comments')
            .select('id')
            .eq('thread_id', id);

          if (comments && comments.length > 0) {
            const ids = comments.map(c => c.id);
            const { error: commentLikesError } = await svc
              .from('likes')
              .delete()
              .eq('target_type', 'comment')
              .in('target_id', ids);
            if (commentLikesError) {
              console.error('Failed to delete comment likes:', commentLikesError);
            }
          }

          // Remove likes directly attached to the thread
          const { error: threadLikesError } = await svc
            .from('likes')
            .delete()
            .eq('target_type', 'thread')
            .eq('target_id', id);
          if (threadLikesError) {
            console.error('Failed to delete thread likes:', threadLikesError);
          }
        }

        const { error } = await svc
          .from(resource)
          .delete()
          .eq('id', id);

        if (error) {
          console.error('Supabase DELETE error:', error);
          throw error;
        }

        console.log('Successfully deleted', resource, id);
        return res.status(200).json({ success: true });
        
      } catch (supabaseError) {
        console.error('Supabase DELETE error:', supabaseError);
        return res.status(500).json({ error: supabaseError.message });
      }
    }

    return res.status(405).json({ error: 'method not allowed' });

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message,
      details: 'Simple API implementation'
    });
  }
}
