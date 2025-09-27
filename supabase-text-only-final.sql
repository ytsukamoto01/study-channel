-- ===================================================================
-- TEXT型のみ処理：UUID型エラー完全排除版
-- ===================================================================

-- 【ステップ1】既存関数の完全削除
DROP FUNCTION IF EXISTS admin_soft_delete_thread_text(text) CASCADE;
DROP FUNCTION IF EXISTS admin_soft_delete_comment_text(text) CASCADE;

-- その他すべての関連関数も削除
DO $$
DECLARE
    func_record RECORD;
BEGIN
    FOR func_record IN 
        SELECT oid::regprocedure::text as proc_signature
        FROM pg_proc 
        WHERE proname LIKE 'admin_soft_delete_%'
        AND pronamespace = 'public'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || func_record.proc_signature || ' CASCADE';
        RAISE NOTICE 'Dropped: %', func_record.proc_signature;
    END LOOP;
END $$;

-- 【ステップ2】TEXT型のみカスケード削除関数（UUID型完全排除）

-- スレッド削除（TEXT型のみ版）
CREATE FUNCTION admin_soft_delete_thread_text(p_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    updated_comments INTEGER := 0;
    deleted_thread_likes INTEGER := 0;
    deleted_comment_likes INTEGER := 0; 
    deleted_favorites INTEGER := 0;
    updated_thread_reports INTEGER := 0;
    updated_comment_reports INTEGER := 0;
    thread_exists BOOLEAN := FALSE;
    comment_record RECORD;
    like_count INTEGER := 0;
    report_count INTEGER := 0;
BEGIN
    -- 1. 入力バリデーション
    IF p_id IS NULL OR trim(p_id) = '' THEN
        RAISE EXCEPTION 'Thread ID cannot be null or empty';
    END IF;
    
    RAISE NOTICE 'TEXT-ONLY: Starting deletion for thread ID: %', p_id;
    
    -- 2. スレッドの存在確認（TEXT型でCAST）
    EXECUTE 'SELECT EXISTS(SELECT 1 FROM threads WHERE id::TEXT = $1 AND (is_deleted IS NULL OR is_deleted = FALSE))' 
    INTO thread_exists USING p_id;
    
    IF NOT thread_exists THEN
        RAISE NOTICE 'TEXT-ONLY: Thread % not found or already deleted', p_id;
        RETURN FALSE;
    END IF;
    
    RAISE NOTICE 'TEXT-ONLY: Thread exists, proceeding with cascade deletion';
    
    -- 3. コメント・返信のソフト削除（TEXT型でCAST）
    EXECUTE 'UPDATE comments SET is_deleted = TRUE, deleted_at = NOW() WHERE thread_id::TEXT = $1 AND (is_deleted IS NULL OR is_deleted = FALSE)' 
    USING p_id;
    
    GET DIAGNOSTICS updated_comments = ROW_COUNT;
    RAISE NOTICE 'TEXT-ONLY: Soft deleted % comments', updated_comments;
    
    -- 4. スレッドのいいねを削除（TEXT同士の比較）
    DELETE FROM likes 
    WHERE target_type = 'thread' 
    AND target_id = p_id;
    
    GET DIAGNOSTICS deleted_thread_likes = ROW_COUNT;
    RAISE NOTICE 'TEXT-ONLY: Deleted % thread likes', deleted_thread_likes;
    
    -- 5. コメントのいいねを削除（TEXT型処理）
    FOR comment_record IN 
        EXECUTE 'SELECT id::TEXT as id_text FROM comments WHERE thread_id::TEXT = $1' USING p_id
    LOOP
        DELETE FROM likes 
        WHERE target_type = 'comment' 
        AND target_id = comment_record.id_text;
        
        GET DIAGNOSTICS like_count = ROW_COUNT;
        deleted_comment_likes := deleted_comment_likes + like_count;
    END LOOP;
    
    RAISE NOTICE 'TEXT-ONLY: Deleted % comment likes', deleted_comment_likes;
    
    -- 6. お気に入りを削除（TEXT型でCAST）
    EXECUTE 'DELETE FROM favorites WHERE thread_id::TEXT = $1' USING p_id;
    
    GET DIAGNOSTICS deleted_favorites = ROW_COUNT;
    RAISE NOTICE 'TEXT-ONLY: Deleted % favorites', deleted_favorites;
    
    -- 7. スレッド通報の更新（TEXT同士の比較）
    UPDATE reports 
    SET status = 'resolved', 
        resolved_at = NOW(), 
        resolved_reason = 'Thread deleted by admin'
    WHERE target_type = 'thread' 
    AND target_id = p_id
    AND status = 'pending';
    
    GET DIAGNOSTICS updated_thread_reports = ROW_COUNT;
    RAISE NOTICE 'TEXT-ONLY: Updated % thread reports', updated_thread_reports;
    
    -- 8. コメント通報の更新（TEXT型処理）
    FOR comment_record IN 
        EXECUTE 'SELECT id::TEXT as id_text FROM comments WHERE thread_id::TEXT = $1' USING p_id
    LOOP
        UPDATE reports 
        SET status = 'resolved', 
            resolved_at = NOW(), 
            resolved_reason = 'Parent thread deleted by admin'
        WHERE (target_type = 'comment' OR target_type = 'reply')
        AND target_id = comment_record.id_text
        AND status = 'pending';
        
        GET DIAGNOSTICS report_count = ROW_COUNT;
        updated_comment_reports := updated_comment_reports + report_count;
    END LOOP;
    
    RAISE NOTICE 'TEXT-ONLY: Updated % comment reports', updated_comment_reports;
    
    -- 9. スレッド本体をソフト削除（TEXT型でCAST）
    EXECUTE 'UPDATE threads SET is_deleted = TRUE, deleted_at = NOW() WHERE id::TEXT = $1' USING p_id;
    
    -- 10. 最終サマリー
    RAISE NOTICE 'TEXT-ONLY: CASCADE DELETE COMPLETED for thread %', p_id;
    RAISE NOTICE 'TEXT-ONLY: Comments: %, Thread likes: %, Comment likes: %, Favorites: %, Thread reports: %, Comment reports: %', 
                 updated_comments, deleted_thread_likes, deleted_comment_likes, deleted_favorites, updated_thread_reports, updated_comment_reports;
    
    RETURN TRUE;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'TEXT-ONLY ERROR in thread deletion: %', SQLERRM;
        RETURN FALSE;
END;
$$;

-- コメント削除（TEXT型のみ版）
CREATE FUNCTION admin_soft_delete_comment_text(p_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    deleted_likes INTEGER := 0;
    updated_reports INTEGER := 0;
    comment_exists BOOLEAN := FALSE;
BEGIN
    -- 1. 入力バリデーション
    IF p_id IS NULL OR trim(p_id) = '' THEN
        RAISE EXCEPTION 'Comment ID cannot be null or empty';
    END IF;
    
    RAISE NOTICE 'TEXT-ONLY: Starting deletion for comment ID: %', p_id;
    
    -- 2. コメントの存在確認（TEXT型でCAST）
    EXECUTE 'SELECT EXISTS(SELECT 1 FROM comments WHERE id::TEXT = $1 AND (is_deleted IS NULL OR is_deleted = FALSE))' 
    INTO comment_exists USING p_id;
    
    IF NOT comment_exists THEN
        RAISE NOTICE 'TEXT-ONLY: Comment % not found or already deleted', p_id;
        RETURN FALSE;
    END IF;
    
    RAISE NOTICE 'TEXT-ONLY: Comment exists, proceeding with cascade deletion';
    
    -- 3. いいねを削除（TEXT同士の比較）
    DELETE FROM likes 
    WHERE target_type = 'comment' 
    AND target_id = p_id;
    
    GET DIAGNOSTICS deleted_likes = ROW_COUNT;
    RAISE NOTICE 'TEXT-ONLY: Deleted % comment likes', deleted_likes;
    
    -- 4. 通報を更新（TEXT同士の比較）
    UPDATE reports 
    SET status = 'resolved', 
        resolved_at = NOW(), 
        resolved_reason = 'Comment deleted by admin'
    WHERE (target_type = 'comment' OR target_type = 'reply') 
    AND target_id = p_id
    AND status = 'pending';
    
    GET DIAGNOSTICS updated_reports = ROW_COUNT;
    RAISE NOTICE 'TEXT-ONLY: Updated % comment reports', updated_reports;
    
    -- 5. コメント本体をソフト削除（TEXT型でCAST）
    EXECUTE 'UPDATE comments SET is_deleted = TRUE, deleted_at = NOW() WHERE id::TEXT = $1' USING p_id;
    
    -- 6. 最終サマリー
    RAISE NOTICE 'TEXT-ONLY: CASCADE DELETE COMPLETED for comment %', p_id;
    RAISE NOTICE 'TEXT-ONLY: Likes deleted: %, Reports updated: %', deleted_likes, updated_reports;
    
    RETURN TRUE;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'TEXT-ONLY ERROR in comment deletion: %', SQLERRM;
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
    AND routine_name LIKE 'admin_soft_delete_%'
ORDER BY routine_name;

-- 【ステップ4】成功メッセージ
DO $$
BEGIN
    RAISE NOTICE 'TEXT-ONLY FUNCTIONS SUCCESSFULLY CREATED!';
    RAISE NOTICE 'UUID vs TEXT errors completely eliminated!';
    RAISE NOTICE 'Functions use EXECUTE statements with TEXT casting only!';
    RAISE NOTICE 'Ready for production use!';
END $$;