-- ===================================================================
-- 構文エラー修正版：RAISE文を完全修正
-- ===================================================================

-- 【ステップ1】既存関数の強制削除（修正版）
DROP FUNCTION IF EXISTS admin_soft_delete_thread_text(text) CASCADE;
DROP FUNCTION IF EXISTS admin_soft_delete_comment_text(text) CASCADE;
DROP FUNCTION IF EXISTS admin_soft_delete_thread_bulletproof(text) CASCADE;
DROP FUNCTION IF EXISTS admin_soft_delete_comment_bulletproof(text) CASCADE;
DROP FUNCTION IF EXISTS admin_soft_delete_thread(uuid) CASCADE;
DROP FUNCTION IF EXISTS admin_soft_delete_comment(uuid) CASCADE;
DROP FUNCTION IF EXISTS admin_soft_delete_comments(text[]) CASCADE;
DROP FUNCTION IF EXISTS test_cascade_delete_functions() CASCADE;

-- 追加の関数削除（修正版）
DO $$
DECLARE
    func_record RECORD;
    drop_cmd TEXT;
BEGIN
    FOR func_record IN 
        SELECT proname, oid::regprocedure::text as proc_signature
        FROM pg_proc 
        WHERE proname LIKE 'admin_soft_delete_%'
        AND pronamespace = 'public'::regnamespace
    LOOP
        drop_cmd := 'DROP FUNCTION IF EXISTS ' || func_record.proc_signature || ' CASCADE';
        EXECUTE drop_cmd;
        RAISE NOTICE 'Force dropped function: %', func_record.proc_signature;
    END LOOP;
    
    RAISE NOTICE 'Cleanup completed - all admin_soft_delete functions removed';
END $$;

-- 【ステップ2】クリーン状態確認
SELECT 
    routine_name, 
    routine_type,
    specific_name
FROM information_schema.routines 
WHERE routine_schema = 'public' 
    AND routine_name LIKE 'admin_soft_delete_%';

-- 【ステップ3】新しい関数作成（構文修正版）

-- スレッド削除関数
CREATE FUNCTION admin_soft_delete_thread_text(p_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    thread_uuid UUID;
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
    
    RAISE NOTICE 'BULLETPROOF: Starting deletion for thread ID: %', p_id;
    
    -- 2. UUID変換
    BEGIN
        thread_uuid := p_id::UUID;
        RAISE NOTICE 'BULLETPROOF: UUID conversion successful: %', thread_uuid;
    EXCEPTION
        WHEN invalid_text_representation THEN
            RAISE EXCEPTION 'BULLETPROOF: Invalid UUID format: %', p_id;
    END;
    
    -- 3. スレッドの存在確認
    SELECT EXISTS(
        SELECT 1 FROM threads 
        WHERE id = thread_uuid 
        AND (is_deleted IS NULL OR is_deleted = FALSE)
    ) INTO thread_exists;
    
    IF NOT thread_exists THEN
        RAISE NOTICE 'BULLETPROOF: Thread % not found or already deleted', p_id;
        RETURN FALSE;
    END IF;
    
    RAISE NOTICE 'BULLETPROOF: Thread exists, proceeding with cascade deletion';
    
    -- 4. コメント・返信のソフト削除
    UPDATE comments 
    SET is_deleted = TRUE, deleted_at = NOW()
    WHERE thread_id = thread_uuid 
    AND (is_deleted IS NULL OR is_deleted = FALSE);
    
    GET DIAGNOSTICS updated_comments = ROW_COUNT;
    RAISE NOTICE 'BULLETPROOF: Soft deleted % comments', updated_comments;
    
    -- 5. スレッドのいいねを削除（TEXT同士で比較）
    DELETE FROM likes 
    WHERE target_type = 'thread' 
    AND target_id = p_id;
    
    GET DIAGNOSTICS deleted_thread_likes = ROW_COUNT;
    RAISE NOTICE 'BULLETPROOF: Deleted % thread likes', deleted_thread_likes;
    
    -- 6. コメントのいいねを削除（1件ずつ処理）
    FOR comment_record IN 
        SELECT id FROM comments WHERE thread_id = thread_uuid
    LOOP
        DELETE FROM likes 
        WHERE target_type = 'comment' 
        AND target_id = comment_record.id::TEXT;
        
        GET DIAGNOSTICS like_count = ROW_COUNT;
        deleted_comment_likes := deleted_comment_likes + like_count;
    END LOOP;
    
    RAISE NOTICE 'BULLETPROOF: Deleted % comment likes', deleted_comment_likes;
    
    -- 7. お気に入りを削除
    DELETE FROM favorites 
    WHERE thread_id = thread_uuid;
    
    GET DIAGNOSTICS deleted_favorites = ROW_COUNT;
    RAISE NOTICE 'BULLETPROOF: Deleted % favorites', deleted_favorites;
    
    -- 8. スレッド通報の更新（TEXT同士で比較）
    UPDATE reports 
    SET status = 'resolved', 
        resolved_at = NOW(), 
        resolved_reason = 'Thread deleted by admin'
    WHERE target_type = 'thread' 
    AND target_id = p_id
    AND status = 'pending';
    
    GET DIAGNOSTICS updated_thread_reports = ROW_COUNT;
    RAISE NOTICE 'BULLETPROOF: Updated % thread reports', updated_thread_reports;
    
    -- 9. コメント通報の更新（1件ずつ処理）
    FOR comment_record IN 
        SELECT id FROM comments WHERE thread_id = thread_uuid
    LOOP
        UPDATE reports 
        SET status = 'resolved', 
            resolved_at = NOW(), 
            resolved_reason = 'Parent thread deleted by admin'
        WHERE (target_type = 'comment' OR target_type = 'reply')
        AND target_id = comment_record.id::TEXT
        AND status = 'pending';
        
        GET DIAGNOSTICS report_count = ROW_COUNT;
        updated_comment_reports := updated_comment_reports + report_count;
    END LOOP;
    
    RAISE NOTICE 'BULLETPROOF: Updated % comment reports', updated_comment_reports;
    
    -- 10. スレッド本体をソフト削除
    UPDATE threads 
    SET is_deleted = TRUE, deleted_at = NOW()
    WHERE id = thread_uuid;
    
    -- 11. 最終サマリー
    RAISE NOTICE 'BULLETPROOF: CASCADE DELETE COMPLETED for thread %', p_id;
    RAISE NOTICE 'BULLETPROOF: Comments deleted: %, Thread likes: %, Comment likes: %, Favorites: %, Thread reports: %, Comment reports: %', 
                 updated_comments, deleted_thread_likes, deleted_comment_likes, deleted_favorites, updated_thread_reports, updated_comment_reports;
    
    RETURN TRUE;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'BULLETPROOF ERROR in thread deletion: %', SQLERRM;
        RETURN FALSE;
END;
$$;

-- コメント削除関数
CREATE FUNCTION admin_soft_delete_comment_text(p_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    comment_uuid UUID;
    deleted_likes INTEGER := 0;
    updated_reports INTEGER := 0;
    comment_exists BOOLEAN := FALSE;
BEGIN
    -- 1. 入力バリデーション
    IF p_id IS NULL OR trim(p_id) = '' THEN
        RAISE EXCEPTION 'Comment ID cannot be null or empty';
    END IF;
    
    RAISE NOTICE 'BULLETPROOF: Starting deletion for comment ID: %', p_id;
    
    -- 2. UUID変換
    BEGIN
        comment_uuid := p_id::UUID;
        RAISE NOTICE 'BULLETPROOF: UUID conversion successful: %', comment_uuid;
    EXCEPTION
        WHEN invalid_text_representation THEN
            RAISE EXCEPTION 'BULLETPROOF: Invalid UUID format: %', p_id;
    END;
    
    -- 3. コメントの存在確認
    SELECT EXISTS(
        SELECT 1 FROM comments 
        WHERE id = comment_uuid 
        AND (is_deleted IS NULL OR is_deleted = FALSE)
    ) INTO comment_exists;
    
    IF NOT comment_exists THEN
        RAISE NOTICE 'BULLETPROOF: Comment % not found or already deleted', p_id;
        RETURN FALSE;
    END IF;
    
    RAISE NOTICE 'BULLETPROOF: Comment exists, proceeding with cascade deletion';
    
    -- 4. いいねを削除（TEXT同士で比較）
    DELETE FROM likes 
    WHERE target_type = 'comment' 
    AND target_id = p_id;
    
    GET DIAGNOSTICS deleted_likes = ROW_COUNT;
    RAISE NOTICE 'BULLETPROOF: Deleted % comment likes', deleted_likes;
    
    -- 5. 通報を更新（TEXT同士で比較）
    UPDATE reports 
    SET status = 'resolved', 
        resolved_at = NOW(), 
        resolved_reason = 'Comment deleted by admin'
    WHERE (target_type = 'comment' OR target_type = 'reply') 
    AND target_id = p_id
    AND status = 'pending';
    
    GET DIAGNOSTICS updated_reports = ROW_COUNT;
    RAISE NOTICE 'BULLETPROOF: Updated % comment reports', updated_reports;
    
    -- 6. コメント本体をソフト削除
    UPDATE comments 
    SET is_deleted = TRUE, deleted_at = NOW()
    WHERE id = comment_uuid;
    
    -- 7. 最終サマリー
    RAISE NOTICE 'BULLETPROOF: CASCADE DELETE COMPLETED for comment %', p_id;
    RAISE NOTICE 'BULLETPROOF: Likes deleted: %, Reports updated: %', deleted_likes, updated_reports;
    
    RETURN TRUE;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'BULLETPROOF ERROR in comment deletion: %', SQLERRM;
        RETURN FALSE;
END;
$$;

-- 【ステップ4】作成確認
SELECT 
    routine_name, 
    routine_type,
    specific_name
FROM information_schema.routines 
WHERE routine_schema = 'public' 
    AND routine_name LIKE 'admin_soft_delete_%'
ORDER BY routine_name;

-- 【ステップ5】成功メッセージ（修正版）
DO $$
BEGIN
    RAISE NOTICE 'BULLETPROOF FUNCTIONS SUCCESSFULLY CREATED!';
    RAISE NOTICE 'Functions available:';
    RAISE NOTICE '- admin_soft_delete_thread_text(p_id TEXT)';
    RAISE NOTICE '- admin_soft_delete_comment_text(p_id TEXT)';
    RAISE NOTICE 'Ready for production use with detailed logging!';
END $$;