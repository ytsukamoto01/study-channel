-- ===================================================================
-- ハードデリート版：データベース軽量化対応
-- ===================================================================
-- 
-- テーブル関係性の理解:
-- - comments.thread_id → threads.id への参照
-- - favorites.thread_id → threads.id への参照  
-- - likes.target_id → threads.id または comments.id への参照（TEXT型）
-- - reports.target_id → threads.id または comments.id への参照（TEXT型）
--
-- 管理画面からの削除は全てハードデリート（物理削除）
--

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
        WHERE proname LIKE 'admin_%delete_%'
        AND pronamespace = 'public'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || func_record.proc_signature || ' CASCADE';
        RAISE NOTICE 'Dropped: %', func_record.proc_signature;
    END LOOP;
END $$;

-- 【ステップ2】ハードデリート関数の作成

-- スレッドハードデリート（カスケード物理削除）
CREATE FUNCTION admin_hard_delete_thread(p_id TEXT)
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
    comment_record RECORD;
    like_count INTEGER := 0;
    report_count INTEGER := 0;
BEGIN
    -- 1. 入力バリデーション
    IF p_id IS NULL OR trim(p_id) = '' THEN
        RAISE EXCEPTION 'Thread ID cannot be null or empty';
    END IF;
    
    RAISE NOTICE 'HARD DELETE: Starting deletion for thread ID: %', p_id;
    
    -- 2. スレッドの存在確認（TEXT型でキャスト）
    EXECUTE 'SELECT EXISTS(SELECT 1 FROM threads WHERE id::TEXT = $1)' 
    INTO thread_exists USING p_id;
    
    IF NOT thread_exists THEN
        RAISE NOTICE 'HARD DELETE: Thread % not found', p_id;
        RETURN FALSE;
    END IF;
    
    RAISE NOTICE 'HARD DELETE: Thread exists, proceeding with cascade hard deletion';
    
    -- 3. スレッドのいいねを物理削除（target_id = thread_id）
    DELETE FROM likes 
    WHERE target_type = 'thread' 
    AND target_id = p_id;
    
    GET DIAGNOSTICS deleted_thread_likes = ROW_COUNT;
    RAISE NOTICE 'HARD DELETE: Deleted % thread likes', deleted_thread_likes;
    
    -- 4. コメントのいいねを物理削除（target_id = comment_id）
    FOR comment_record IN 
        EXECUTE 'SELECT id::TEXT as comment_id FROM comments WHERE thread_id::TEXT = $1' USING p_id
    LOOP
        DELETE FROM likes 
        WHERE target_type = 'comment' 
        AND target_id = comment_record.comment_id;
        
        GET DIAGNOSTICS like_count = ROW_COUNT;
        deleted_comment_likes := deleted_comment_likes + like_count;
    END LOOP;
    
    RAISE NOTICE 'HARD DELETE: Deleted % comment likes', deleted_comment_likes;
    
    -- 5. お気に入りを物理削除（favorites.thread_id）
    EXECUTE 'DELETE FROM favorites WHERE thread_id::TEXT = $1' USING p_id;
    
    GET DIAGNOSTICS deleted_favorites = ROW_COUNT;
    RAISE NOTICE 'HARD DELETE: Deleted % favorites', deleted_favorites;
    
    -- 6. スレッド通報を物理削除（target_id = thread_id）
    DELETE FROM reports 
    WHERE target_type = 'thread' 
    AND target_id = p_id;
    
    GET DIAGNOSTICS deleted_thread_reports = ROW_COUNT;
    RAISE NOTICE 'HARD DELETE: Deleted % thread reports', deleted_thread_reports;
    
    -- 7. コメント通報を物理削除（target_id = comment_id）
    FOR comment_record IN 
        EXECUTE 'SELECT id::TEXT as comment_id FROM comments WHERE thread_id::TEXT = $1' USING p_id
    LOOP
        DELETE FROM reports 
        WHERE (target_type = 'comment' OR target_type = 'reply')
        AND target_id = comment_record.comment_id;
        
        GET DIAGNOSTICS report_count = ROW_COUNT;
        deleted_comment_reports := deleted_comment_reports + report_count;
    END LOOP;
    
    RAISE NOTICE 'HARD DELETE: Deleted % comment reports', deleted_comment_reports;
    
    -- 8. コメント・返信を物理削除（comments.thread_id）
    EXECUTE 'DELETE FROM comments WHERE thread_id::TEXT = $1' USING p_id;
    
    GET DIAGNOSTICS deleted_comments = ROW_COUNT;
    RAISE NOTICE 'HARD DELETE: Deleted % comments', deleted_comments;
    
    -- 9. スレッド本体を物理削除
    EXECUTE 'DELETE FROM threads WHERE id::TEXT = $1' USING p_id;
    
    -- 10. 最終サマリー
    RAISE NOTICE 'HARD DELETE: CASCADE DELETION COMPLETED for thread %', p_id;
    RAISE NOTICE 'HARD DELETE: Comments: %, Thread likes: %, Comment likes: %, Favorites: %, Thread reports: %, Comment reports: %', 
                 deleted_comments, deleted_thread_likes, deleted_comment_likes, deleted_favorites, deleted_thread_reports, deleted_comment_reports;
    
    RETURN TRUE;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'HARD DELETE ERROR in thread deletion: %', SQLERRM;
        RETURN FALSE;
END;
$$;

-- コメントハードデリート（カスケード物理削除）
CREATE FUNCTION admin_hard_delete_comment(p_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    deleted_likes INTEGER := 0;
    deleted_reports INTEGER := 0;
    comment_exists BOOLEAN := FALSE;
BEGIN
    -- 1. 入力バリデーション
    IF p_id IS NULL OR trim(p_id) = '' THEN
        RAISE EXCEPTION 'Comment ID cannot be null or empty';
    END IF;
    
    RAISE NOTICE 'HARD DELETE: Starting deletion for comment ID: %', p_id;
    
    -- 2. コメントの存在確認（TEXT型でキャスト）
    EXECUTE 'SELECT EXISTS(SELECT 1 FROM comments WHERE id::TEXT = $1)' 
    INTO comment_exists USING p_id;
    
    IF NOT comment_exists THEN
        RAISE NOTICE 'HARD DELETE: Comment % not found', p_id;
        RETURN FALSE;
    END IF;
    
    RAISE NOTICE 'HARD DELETE: Comment exists, proceeding with cascade hard deletion';
    
    -- 3. いいねを物理削除（target_id = comment_id）
    DELETE FROM likes 
    WHERE target_type = 'comment' 
    AND target_id = p_id;
    
    GET DIAGNOSTICS deleted_likes = ROW_COUNT;
    RAISE NOTICE 'HARD DELETE: Deleted % comment likes', deleted_likes;
    
    -- 4. 通報を物理削除（target_id = comment_id）
    DELETE FROM reports 
    WHERE (target_type = 'comment' OR target_type = 'reply') 
    AND target_id = p_id;
    
    GET DIAGNOSTICS deleted_reports = ROW_COUNT;
    RAISE NOTICE 'HARD DELETE: Deleted % comment reports', deleted_reports;
    
    -- 5. コメント本体を物理削除
    EXECUTE 'DELETE FROM comments WHERE id::TEXT = $1' USING p_id;
    
    -- 6. 最終サマリー
    RAISE NOTICE 'HARD DELETE: CASCADE DELETION COMPLETED for comment %', p_id;
    RAISE NOTICE 'HARD DELETE: Likes deleted: %, Reports deleted: %', deleted_likes, deleted_reports;
    
    RETURN TRUE;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'HARD DELETE ERROR in comment deletion: %', SQLERRM;
        RETURN FALSE;
END;
$$;

-- 【ステップ3】API互換性のため、既存関数名でエイリアス作成
CREATE FUNCTION admin_soft_delete_thread_text(p_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 管理画面からの削除は全てハードデリートに変更
    RETURN admin_hard_delete_thread(p_id);
END;
$$;

CREATE FUNCTION admin_soft_delete_comment_text(p_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 管理画面からの削除は全てハードデリートに変更
    RETURN admin_hard_delete_comment(p_id);
END;
$$;

-- 【ステップ4】作成確認
SELECT 
    routine_name, 
    routine_type,
    specific_name
FROM information_schema.routines 
WHERE routine_schema = 'public' 
    AND routine_name LIKE 'admin_%delete_%'
ORDER BY routine_name;

-- 【ステップ5】成功メッセージ
DO $$
BEGIN
    RAISE NOTICE 'HARD DELETE FUNCTIONS SUCCESSFULLY CREATED!';
    RAISE NOTICE 'Database optimization: All deletions are now physical deletions';
    RAISE NOTICE 'Table relationships respected: comments.thread_id, favorites.thread_id, likes.target_id, reports.target_id';
    RAISE NOTICE 'API compatibility maintained: existing function names redirect to hard delete';
    RAISE NOTICE 'Ready for production use with database optimization!';
END $$;