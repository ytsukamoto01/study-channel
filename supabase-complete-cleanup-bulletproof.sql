-- ===================================================================
-- 完全クリーンアップ + Bulletproof版のみ残す
-- ===================================================================

-- 【ステップ1】既存の全ての admin_soft_delete 関数を完全削除
DO $$
DECLARE
    func_record RECORD;
BEGIN
    -- 既存の関数を全て検索して削除
    FOR func_record IN 
        SELECT routine_name, specific_name
        FROM information_schema.routines 
        WHERE routine_schema = 'public' 
        AND routine_name LIKE 'admin_soft_delete_%'
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || func_record.specific_name || ' CASCADE';
        RAISE NOTICE 'Dropped function: %', func_record.specific_name;
    END LOOP;
    
    RAISE NOTICE '✅ All existing admin_soft_delete functions removed';
END $$;

-- 【ステップ2】Bulletproof版のみ作成

-- スレッド削除（Bulletproof版）
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
    comment_id_record RECORD;
BEGIN
    -- 1. 入力バリデーション
    IF p_id IS NULL OR trim(p_id) = '' THEN
        RAISE EXCEPTION 'Thread ID cannot be null or empty';
    END IF;
    
    -- 2. UUID変換（エラーハンドリング付き）
    BEGIN
        thread_uuid := p_id::UUID;
    EXCEPTION
        WHEN invalid_text_representation THEN
            RAISE EXCEPTION 'Invalid UUID format: %', p_id;
    END;
    
    -- 3. スレッドの存在確認
    SELECT EXISTS(
        SELECT 1 FROM threads 
        WHERE id = thread_uuid 
        AND (is_deleted IS NULL OR is_deleted = FALSE)
    ) INTO thread_exists;
    
    IF NOT thread_exists THEN
        RAISE NOTICE 'Thread % not found or already deleted', p_id;
        RETURN FALSE;
    END IF;
    
    RAISE NOTICE 'Starting cascade deletion for thread: %', p_id;
    
    -- 4. コメント・返信のソフト削除
    UPDATE comments 
    SET is_deleted = TRUE, deleted_at = NOW()
    WHERE thread_id = thread_uuid 
    AND (is_deleted IS NULL OR is_deleted = FALSE);
    
    GET DIAGNOSTICS updated_comments = ROW_COUNT;
    RAISE NOTICE 'Soft deleted % comments', updated_comments;
    
    -- 5. スレッドのいいねを削除（TEXT同士で比較）
    DELETE FROM likes 
    WHERE target_type = 'thread' 
    AND target_id = p_id;  -- TEXT同士の比較
    
    GET DIAGNOSTICS deleted_thread_likes = ROW_COUNT;
    RAISE NOTICE 'Deleted % thread likes', deleted_thread_likes;
    
    -- 6. コメントのいいねを削除（ループで1件ずつ安全処理）
    deleted_comment_likes := 0;
    FOR comment_id_record IN 
        SELECT id FROM comments WHERE thread_id = thread_uuid
    LOOP
        DELETE FROM likes 
        WHERE target_type = 'comment' 
        AND target_id = comment_id_record.id::TEXT;
        
        deleted_comment_likes := deleted_comment_likes + 1;
    END LOOP;
    
    RAISE NOTICE 'Processed % comment likes', deleted_comment_likes;
    
    -- 7. お気に入りを削除
    DELETE FROM favorites 
    WHERE thread_id = thread_uuid;
    
    GET DIAGNOSTICS deleted_favorites = ROW_COUNT;
    RAISE NOTICE 'Deleted % favorites', deleted_favorites;
    
    -- 8. スレッド通報の更新（TEXT同士で比較）
    UPDATE reports 
    SET status = 'resolved', 
        resolved_at = NOW(), 
        resolved_reason = 'Thread deleted by admin'
    WHERE target_type = 'thread' 
    AND target_id = p_id  -- TEXT同士の比較
    AND status = 'pending';
    
    GET DIAGNOSTICS updated_thread_reports = ROW_COUNT;
    RAISE NOTICE 'Updated % thread reports', updated_thread_reports;
    
    -- 9. コメント通報の更新（ループで1件ずつ安全処理）
    updated_comment_reports := 0;
    FOR comment_id_record IN 
        SELECT id FROM comments WHERE thread_id = thread_uuid
    LOOP
        UPDATE reports 
        SET status = 'resolved', 
            resolved_at = NOW(), 
            resolved_reason = 'Parent thread deleted by admin'
        WHERE (target_type = 'comment' OR target_type = 'reply')
        AND target_id = comment_id_record.id::TEXT
        AND status = 'pending';
        
        updated_comment_reports := updated_comment_reports + 1;
    END LOOP;
    
    RAISE NOTICE 'Processed % comment reports', updated_comment_reports;
    
    -- 10. スレッド本体をソフト削除
    UPDATE threads 
    SET is_deleted = TRUE, deleted_at = NOW()
    WHERE id = thread_uuid;
    
    RAISE NOTICE 'CASCADE DELETE COMPLETED for thread %', p_id;
    RAISE NOTICE 'SUMMARY: Comments: %, Thread likes: %, Comment likes: %, Favorites: %, Thread reports: %, Comment reports: %', 
                 updated_comments, deleted_thread_likes, deleted_comment_likes, deleted_favorites, updated_thread_reports, updated_comment_reports;
    
    RETURN TRUE;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Bulletproof cascade deletion error: %', SQLERRM;
        RETURN FALSE;
END;
$$;

-- コメント削除（Bulletproof版）
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
    
    -- 2. UUID変換（エラーハンドリング付き）
    BEGIN
        comment_uuid := p_id::UUID;
    EXCEPTION
        WHEN invalid_text_representation THEN
            RAISE EXCEPTION 'Invalid UUID format: %', p_id;
    END;
    
    -- 3. コメントの存在確認
    SELECT EXISTS(
        SELECT 1 FROM comments 
        WHERE id = comment_uuid 
        AND (is_deleted IS NULL OR is_deleted = FALSE)
    ) INTO comment_exists;
    
    IF NOT comment_exists THEN
        RAISE NOTICE 'Comment % not found or already deleted', p_id;
        RETURN FALSE;
    END IF;
    
    RAISE NOTICE 'Starting cascade deletion for comment: %', p_id;
    
    -- 4. いいねを削除（TEXT同士で比較）
    DELETE FROM likes 
    WHERE target_type = 'comment' 
    AND target_id = p_id;  -- TEXT同士の比較
    
    GET DIAGNOSTICS deleted_likes = ROW_COUNT;
    RAISE NOTICE 'Deleted % comment likes', deleted_likes;
    
    -- 5. 通報を更新（TEXT同士で比較）
    UPDATE reports 
    SET status = 'resolved', 
        resolved_at = NOW(), 
        resolved_reason = 'Comment deleted by admin'
    WHERE (target_type = 'comment' OR target_type = 'reply') 
    AND target_id = p_id  -- TEXT同士の比較
    AND status = 'pending';
    
    GET DIAGNOSTICS updated_reports = ROW_COUNT;
    RAISE NOTICE 'Updated % comment reports', updated_reports;
    
    -- 6. コメント本体をソフト削除
    UPDATE comments 
    SET is_deleted = TRUE, deleted_at = NOW()
    WHERE id = comment_uuid;
    
    RAISE NOTICE 'CASCADE DELETE COMPLETED for comment %', p_id;
    RAISE NOTICE 'SUMMARY: Likes: %, Reports: %', deleted_likes, updated_reports;
    
    RETURN TRUE;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Bulletproof comment cascade deletion error: %', SQLERRM;
        RETURN FALSE;
END;
$$;

-- 【ステップ3】確認
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
    RAISE NOTICE '';
    RAISE NOTICE '🎯🎯🎯 BULLETPROOF CASCADE DELETE SETUP COMPLETE! 🎯🎯🎯';
    RAISE NOTICE '';
    RAISE NOTICE '✅ Only bulletproof functions remain:';
    RAISE NOTICE '   - admin_soft_delete_thread_text(p_id TEXT)';
    RAISE NOTICE '   - admin_soft_delete_comment_text(p_id TEXT)';
    RAISE NOTICE '';
    RAISE NOTICE '🛡️  Features:';
    RAISE NOTICE '   - TEXT parameter input (no UUID conversion issues)';
    RAISE NOTICE '   - TEXT-to-TEXT comparison for likes/reports';  
    RAISE NOTICE '   - Loop-based safe processing';
    RAISE NOTICE '   - Detailed logging for each step';
    RAISE NOTICE '';
    RAISE NOTICE '🚀 Ready for admin panel testing!';
    RAISE NOTICE '';
END $$;