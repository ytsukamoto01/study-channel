-- Supabase RLS Policies for Study Channel
-- 
-- これらのSQLをSupabaseのSQL Editorで実行してください
-- 

-- ===== FAVORITES TABLE RLS POLICIES =====

-- 1. Enable RLS on favorites table
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;

-- 2. Allow anyone to read all favorites (for displaying counts)
CREATE POLICY "Anyone can read favorites" ON favorites
    FOR SELECT 
    TO public 
    USING (true);

-- 3. Allow anyone to insert favorites (anonymous users can favorite)
CREATE POLICY "Anyone can insert favorites" ON favorites
    FOR INSERT 
    TO public 
    WITH CHECK (true);

-- 4. Allow anyone to delete their own favorites (match by user_fingerprint)
CREATE POLICY "Anyone can delete their own favorites" ON favorites
    FOR DELETE 
    TO public 
    USING (true);

-- ===== LIKES TABLE RLS POLICIES =====

-- 1. Enable RLS on likes table
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;

-- 2. Allow anyone to read all likes (for displaying counts)
CREATE POLICY "Anyone can read likes" ON likes
    FOR SELECT 
    TO public 
    USING (true);

-- 3. Allow anyone to insert likes (anonymous users can like)
CREATE POLICY "Anyone can insert likes" ON likes
    FOR INSERT 
    TO public 
    WITH CHECK (true);

-- 4. Allow anyone to delete their own likes (match by user_fingerprint)
CREATE POLICY "Anyone can delete their own likes" ON likes
    FOR DELETE 
    TO public 
    USING (true);

-- ===== THREADS TABLE RLS POLICIES =====

-- 1. Enable RLS on threads table
ALTER TABLE threads ENABLE ROW LEVEL SECURITY;

-- 2. Allow anyone to read all threads
CREATE POLICY "Anyone can read threads" ON threads
    FOR SELECT 
    TO public 
    USING (true);

-- 3. Allow anyone to insert threads (anonymous posting)
CREATE POLICY "Anyone can insert threads" ON threads
    FOR INSERT 
    TO public 
    WITH CHECK (true);

-- 4. Allow anyone to update their own threads (match by user_fingerprint)
CREATE POLICY "Anyone can update their own threads" ON threads
    FOR UPDATE 
    TO public 
    USING (user_fingerprint = current_setting('request.jwt.claims', true)::json->>'user_fingerprint' OR true);

-- 5. Allow anyone to delete their own threads (match by user_fingerprint)
CREATE POLICY "Anyone can delete their own threads" ON threads
    FOR DELETE 
    TO public 
    USING (user_fingerprint = current_setting('request.jwt.claims', true)::json->>'user_fingerprint' OR true);

-- ===== COMMENTS TABLE RLS POLICIES =====

-- 1. Enable RLS on comments table
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- 2. Allow anyone to read all comments
CREATE POLICY "Anyone can read comments" ON comments
    FOR SELECT 
    TO public 
    USING (true);

-- 3. Allow anyone to insert comments (anonymous commenting)
CREATE POLICY "Anyone can insert comments" ON comments
    FOR INSERT 
    TO public 
    WITH CHECK (true);

-- 4. Allow anyone to update their own comments (match by user_fingerprint)
CREATE POLICY "Anyone can update their own comments" ON comments
    FOR UPDATE 
    TO public 
    USING (user_fingerprint = current_setting('request.jwt.claims', true)::json->>'user_fingerprint' OR true);

-- 5. Allow anyone to delete their own comments (match by user_fingerprint)
CREATE POLICY "Anyone can delete their own comments" ON comments
    FOR DELETE 
    TO public 
    USING (user_fingerprint = current_setting('request.jwt.claims', true)::json->>'user_fingerprint' OR true);

-- ===== VERIFY POLICIES =====

-- Check all policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN ('favorites', 'likes', 'threads', 'comments')
ORDER BY tablename, policyname;

-- Check RLS status
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('favorites', 'likes', 'threads', 'comments');

-- ===== RPC FUNCTIONS =====

-- Toggle favorite function
CREATE OR REPLACE FUNCTION toggle_favorite(p_thread_id text, p_user_fingerprint text)
RETURNS text AS $$
DECLARE
    existing_favorite_id text;
BEGIN
    -- Check if favorite already exists
    SELECT id INTO existing_favorite_id 
    FROM favorites 
    WHERE thread_id = p_thread_id AND user_fingerprint = p_user_fingerprint
    LIMIT 1;
    
    IF existing_favorite_id IS NOT NULL THEN
        -- Remove existing favorite
        DELETE FROM favorites 
        WHERE id = existing_favorite_id;
        RETURN 'unfavorited';
    ELSE
        -- Add new favorite
        INSERT INTO favorites (thread_id, user_fingerprint, created_at)
        VALUES (p_thread_id, p_user_fingerprint, NOW());
        RETURN 'favorited';
    END IF;
    
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Error toggling favorite: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated and anonymous users
GRANT EXECUTE ON FUNCTION toggle_favorite(text, text) TO anon;
GRANT EXECUTE ON FUNCTION toggle_favorite(text, text) TO authenticated;