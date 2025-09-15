// Supabase connection test API
import { supabase } from '../_supabase.js';

export default async function handler(req, res) {
  try {
    console.log('=== Supabase Connection Test ===');
    
    // Check environment variables
    const envVars = {
      SUPABASE_URL: !!process.env.SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      VITE_SUPABASE_URL: !!process.env.VITE_SUPABASE_URL,
      SUPABASE_ANON_KEY: !!process.env.SUPABASE_ANON_KEY,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      VITE_SUPABASE_ANON_KEY: !!process.env.VITE_SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY
    };
    
    console.log('Environment variables:', envVars);
    
    // Try to get Supabase client
    let db;
    try {
      db = supabase();
      console.log('Supabase client created successfully');
    } catch (clientError) {
      console.error('Failed to create Supabase client:', clientError);
      return res.status(500).json({
        error: 'Failed to create Supabase client',
        message: clientError.message,
        envVars
      });
    }
    
    // Test basic connection - try to query a simple table
    console.log('Testing basic connection...');
    
    try {
      // Test 1: Try to list tables (this should work with anon key)
      const { data: threadsData, error: threadsError } = await db
        .from('threads')
        .select('count')
        .limit(1);
      
      console.log('Threads query result:', { data: threadsData, error: threadsError });
      
      // Test 2: Try comments table
      const { data: commentsData, error: commentsError } = await db
        .from('comments') 
        .select('count')
        .limit(1);
        
      console.log('Comments query result:', { data: commentsData, error: commentsError });
      
      // Test 3: Check RLS policies
      const { data: rlsTest, error: rlsError } = await db
        .from('threads')
        .select('id, title')
        .limit(1);
        
      console.log('RLS test result:', { data: rlsTest, error: rlsError });
      
      return res.status(200).json({
        success: true,
        message: 'Supabase connection tests completed',
        envVars,
        tests: {
          client_creation: 'success',
          threads_query: {
            success: !threadsError,
            error: threadsError?.message,
            data_count: threadsData?.length || 0
          },
          comments_query: {
            success: !commentsError,
            error: commentsError?.message,
            data_count: commentsData?.length || 0
          },
          rls_test: {
            success: !rlsError,
            error: rlsError?.message,
            data_count: rlsTest?.length || 0
          }
        }
      });
      
    } catch (queryError) {
      console.error('Query test failed:', queryError);
      return res.status(500).json({
        error: 'Database query failed',
        message: queryError.message,
        envVars,
        tests: {
          client_creation: 'success',
          query_test: 'failed'
        }
      });
    }
    
  } catch (error) {
    console.error('Supabase test error:', error);
    return res.status(500).json({
      error: 'Supabase test failed',
      message: error.message,
      stack: error.stack
    });
  }
}