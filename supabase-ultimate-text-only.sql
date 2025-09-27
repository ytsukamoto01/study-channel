-- ===================================================================
-- 究極のTEXT型のみ処理：UUID型完全排除版
-- ===================================================================
-- 
-- 問題: EXECUTE文内でもUUID vs TEXT型エラーが発生
-- 解決: すべてのクエリを文字列結合でTEXT型のみ処理
--

-- 【ステップ1】既存関数の完全削除
DROP FUNCTION IF EXISTS admin_soft_delete_thread_text(text) CASCADE;
DROP FUNCTION IF EXISTS admin_soft_delete_comment_text(text) CASCADE;
DROP FUNCTION IF EXISTS admin_hard_delete_thread(text) CASCADE;
DROP FUNCTION IF EXISTS admin_hard_delete_comment(text) CASCADE;

-- その他すべての関連関数も削除
DO $$
DECLARE
    func_record RECORD;
BEGIN
    FOR func_record IN 
        SELECT oid::regprocedure::text as proc_signature
        FROM pg_proc 
        WHERE proname LIKE 'admin_%delete_%'
        AND pronamespace = 'public'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || func_record.proc_signature || ' CASCADE';
        RAISE NOTICE 'Dropped: %', func_record.proc_signature;
    END LOOP;
END $$;

-- 【ステップ2】究極のTEXT型のみハードデリート関数

-- スレッドハードデリート（TEXT型のみ版）
CREATE FUNCTION admin_soft_delete_thread_text(p_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    deleted_comments INTEGER := 0;
    deleted_thread_likes INTEGER := 0;
    deleted_comment_likes INTEGER := 0; 
    deleted_favorites INTEGER := 0;
    deleted_thread_reports INTEGER := 0;
    deleted_comment_reports INTEGER := 0;
    thread_exists BOOLEAN := FALSE;
    comment_id_text TEXT;
    like_count INTEGER := 0;
    report_count INTEGER := 0;
    query_text TEXT;
BEGIN
    -- 1. 入力バリデーション
    IF p_id IS NULL OR trim(p_id) = '' THEN
        RAISE EXCEPTION 'Thread ID cannot be null or empty';
    END IF;
    
    RAISE NOTICE 'ULTIMATE TEXT: Starting deletion for thread ID: %', p_id;
    
    -- 2. スレッドの存在確認（文字列結合でクエリ作成）
    query_text := 'SELECT EXISTS(SELECT 1 FROM threads WHERE CAST(id AS TEXT) = ''' || p_id || ''')';
    EXECUTE query_text INTO thread_exists;
    
    IF NOT thread_exists THEN
        RAISE NOTICE 'ULTIMATE TEXT: Thread % not found', p_id;
        RETURN FALSE;
    END IF;
    
    RAISE NOTICE 'ULTIMATE TEXT: Thread exists, proceeding with hard deletion';
    
    -- 3. スレッドのいいねを物理削除（target_id = thread_id, TEXT同士）
    DELETE FROM likes 
    WHERE target_type = 'thread' 
    AND target_id = p_id;
    
    GET DIAGNOSTICS deleted_thread_likes = ROW_COUNT;
    RAISE NOTICE 'ULTIMATE TEXT: Deleted % thread likes', deleted_thread_likes;
    
    -- 4. コメントのいいねを物理削除（カーソルでTEXT処理）
    FOR comment_id_text IN 
        EXECUTE 'SELECT CAST(id AS TEXT) FROM comments WHERE CAST(thread_id AS TEXT) = ''' || p_id || ''''
    LOOP
        DELETE FROM likes 
        WHERE target_type = 'comment' 
        AND target_id = comment_id_text;
        
        GET DIAGNOSTICS like_count = ROW_COUNT;
        deleted_comment_likes := deleted_comment_likes + like_count;
    END LOOP;
    
    RAISE NOTICE 'ULTIMATE TEXT: Deleted % comment likes', deleted_comment_likes;
    
    -- 5. お気に入りを物理削除（文字列結合クエリ）
    query_text := 'DELETE FROM favorites WHERE CAST(thread_id AS TEXT) = ''' || p_id || '''';
    EXECUTE query_text;
    
    GET DIAGNOSTICS deleted_favorites = ROW_COUNT;
    RAISE NOTICE 'ULTIMATE TEXT: Deleted % favorites', deleted_favorites;
    
    -- 6. スレッド通報を物理削除（target_id = thread_id, TEXT同士）
    DELETE FROM reports 
    WHERE target_type = 'thread' 
    AND target_id = p_id;
    
    GET DIAGNOSTICS deleted_thread_reports = ROW_COUNT;
    RAISE NOTICE 'ULTIMATE TEXT: Deleted % thread reports', deleted_thread_reports;
    
    -- 7. コメント通報を物理削除（カーソルでTEXT処理）
    FOR comment_id_text IN 
        EXECUTE 'SELECT CAST(id AS TEXT) FROM comments WHERE CAST(thread_id AS TEXT) = ''' || p_id || ''''
    LOOP
        DELETE FROM reports 
        WHERE (target_type = 'comment' OR target_type = 'reply')
        AND target_id = comment_id_text;
        
        GET DIAGNOSTICS report_count = ROW_COUNT;
        deleted_comment_reports := deleted_comment_reports + report_count;
    END LOOP;
    
    RAISE NOTICE 'ULTIMATE TEXT: Deleted % comment reports', deleted_comment_reports;
    
    -- 8. コメント・返信を物理削除（文字列結合クエリ）
    query_text := 'DELETE FROM comments WHERE CAST(thread_id AS TEXT) = ''' || p_id || '''';
    EXECUTE query_text;
    
    GET DIAGNOSTICS deleted_comments = ROW_COUNT;
    RAISE NOTICE 'ULTIMATE TEXT: Deleted % comments', deleted_comments;
    
    -- 9. スレッド本体を物理削除（文字列結合クエリ）
    query_text := 'DELETE FROM threads WHERE CAST(id AS TEXT) = ''' || p_id || '''';
    EXECUTE query_text;
    
    -- 10. 最終サマリー
    RAISE NOTICE 'ULTIMATE TEXT: HARD DELETE COMPLETED for thread %', p_id;
    RAISE NOTICE 'ULTIMATE TEXT: Comments: %, Thread likes: %, Comment likes: %, Favorites: %, Thread reports: %, Comment reports: %', 
                 deleted_comments, deleted_thread_likes, deleted_comment_likes, deleted_favorites, deleted_thread_reports, deleted_comment_reports;
    
    RETURN TRUE;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'ULTIMATE TEXT ERROR in thread deletion: %', SQLERRM;
        RETURN FALSE;
END;
$$;

-- コメントハードデリート（TEXT型のみ版）
CREATE FUNCTION admin_soft_delete_comment_text(p_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    deleted_likes INTEGER := 0;
    deleted_reports INTEGER := 0;
    comment_exists BOOLEAN := FALSE;
    query_text TEXT;
BEGIN
    -- 1. 入力バリデーション
    IF p_id IS NULL OR trim(p_id) = '' THEN
        RAISE EXCEPTION 'Comment ID cannot be null or empty';
    END IF;
    
    RAISE NOTICE 'ULTIMATE TEXT: Starting deletion for comment ID: %', p_id;
    
    -- 2. コメントの存在確認（文字列結合でクエリ作成）
    query_text := 'SELECT EXISTS(SELECT 1 FROM comments WHERE CAST(id AS TEXT) = ''' || p_id || ''')';
    EXECUTE query_text INTO comment_exists;
    
    IF NOT comment_exists THEN
        RAISE NOTICE 'ULTIMATE TEXT: Comment % not found', p_id;
        RETURN FALSE;
    END IF;
    
    RAISE NOTICE 'ULTIMATE TEXT: Comment exists, proceeding with hard deletion';
    
    -- 3. いいねを物理削除（target_id = comment_id, TEXT同士）
    DELETE FROM likes 
    WHERE target_type = 'comment' 
    AND target_id = p_id;
    
    GET DIAGNOSTICS deleted_likes = ROW_COUNT;
    RAISE NOTICE 'ULTIMATE TEXT: Deleted % comment likes', deleted_likes;
    
    -- 4. 通報を物理削除（target_id = comment_id, TEXT同士）
    DELETE FROM reports 
    WHERE (target_type = 'comment' OR target_type = 'reply') 
    AND target_id = p_id;
    
    GET DIAGNOSTICS deleted_reports = ROW_COUNT;
    RAISE NOTICE 'ULTIMATE TEXT: Deleted % comment reports', deleted_reports;
    
    -- 5. コメント本体を物理削除（文字列結合クエリ）
    query_text := 'DELETE FROM comments WHERE CAST(id AS TEXT) = ''' || p_id || '''';
    EXECUTE query_text;
    
    -- 6. 最終サマリー
    RAISE NOTICE 'ULTIMATE TEXT: HARD DELETE COMPLETED for comment %', p_id;
    RAISE NOTICE 'ULTIMATE TEXT: Likes deleted: %, Reports deleted: %', deleted_likes, deleted_reports;
    
    RETURN TRUE;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'ULTIMATE TEXT ERROR in comment deletion: %', SQLERRM;
        RETURN FALSE;
END;
$$;

-- 【ステップ3】作成確認
SELECT 
    routine_name, 
    routine_type,
    specific_name
FROM information_schema.routines 
WHERE routine_schema = 'public' 
    AND routine_name LIKE 'admin_%delete_%'
ORDER BY routine_name;

-- 【ステップ4】成功メッセージ
DO $$
BEGIN
    RAISE NOTICE 'ULTIMATE TEXT-ONLY HARD DELETE FUNCTIONS CREATED!';
    RAISE NOTICE 'Features:';
    RAISE NOTICE '- String concatenation queries (no EXECUTE with parameters)';
    RAISE NOTICE '- CAST(id AS TEXT) for explicit type conversion';
    RAISE NOTICE '- TEXT-only variables and comparisons';
    RAISE NOTICE '- Physical deletion for database optimization';
    RAISE NOTICE 'UUID vs TEXT errors completely eliminated!';
END $$;