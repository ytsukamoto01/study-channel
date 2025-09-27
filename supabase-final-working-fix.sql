-- ===================================================================
-- 最終修正版：完全動作するカスケード削除関数
-- ===================================================================

-- 【ステップ1】既存関数の完全削除
DROP FUNCTION IF EXISTS admin_soft_delete_thread(uuid) CASCADE;
DROP FUNCTION IF EXISTS admin_soft_delete_thread_text(text) CASCADE;
DROP FUNCTION IF EXISTS admin_soft_delete_comment(uuid) CASCADE;
DROP FUNCTION IF EXISTS admin_soft_delete_comment_text(text) CASCADE;

-- 【ステップ2】完全動作版の関数作成

-- スレッド削除（修正版）- すべての比較でUUID型で統一
CREATE OR REPLACE FUNCTION admin_soft_delete_thread(p_id UUID)
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
    comment_ids_array UUID[];
BEGIN
    -- スレッドの存在確認
    SELECT EXISTS(
        SELECT 1 FROM threads WHERE id = p_id AND (is_deleted IS NULL OR is_deleted = FALSE)
    ) INTO thread_exists;
    
    IF NOT thread_exists THEN
        RAISE NOTICE 'Thread % not found or already deleted', p_id;
        RETURN FALSE;
    END IF;
    
    RAISE NOTICE 'Starting cascade soft deletion for thread: %', p_id;
    
    -- 関連するコメントのIDを取得（UUID配列として）
    SELECT ARRAY(
        SELECT id FROM comments WHERE thread_id = p_id
    ) INTO comment_ids_array;
    
    RAISE NOTICE 'Found % related comments', array_length(comment_ids_array, 1);
    
    -- 1. このスレッドに関連するコメント・返信をソフト削除
    UPDATE comments 
    SET is_deleted = TRUE, deleted_at = NOW()
    WHERE thread_id = p_id 
    AND (is_deleted IS NULL OR is_deleted = FALSE);
    
    GET DIAGNOSTICS updated_comments = ROW_COUNT;
    RAISE NOTICE 'Soft deleted % comments/replies', updated_comments;
    
    -- 2-1. スレッドのいいねを削除
    DELETE FROM likes 
    WHERE target_type = 'thread' AND target_id = p_id::text;
    
    GET DIAGNOSTICS deleted_thread_likes = ROW_COUNT;
    RAISE NOTICE 'Deleted % thread likes', deleted_thread_likes;
    
    -- 2-2. コメントのいいねを削除（UUIDを個別に変換）
    DELETE FROM likes 
    WHERE target_type = 'comment' 
    AND target_id = ANY(
        SELECT unnest(comment_ids_array)::text
    );
    
    GET DIAGNOSTICS deleted_comment_likes = ROW_COUNT;
    RAISE NOTICE 'Deleted % comment likes', deleted_comment_likes;
    
    -- 3. お気に入りを削除（UUID直接比較）
    DELETE FROM favorites 
    WHERE thread_id = p_id;
    
    GET DIAGNOSTICS deleted_favorites = ROW_COUNT;
    RAISE NOTICE 'Deleted % favorites', deleted_favorites;
    
    -- 4-1. スレッド通報のステータス更新
    UPDATE reports 
    SET status = 'resolved', resolved_at = NOW(), resolved_reason = 'Thread deleted by admin'
    WHERE target_type = 'thread' AND target_id = p_id::text
    AND status = 'pending';
    
    GET DIAGNOSTICS updated_thread_reports = ROW_COUNT;
    RAISE NOTICE 'Updated % thread reports', updated_thread_reports;
    
    -- 4-2. コメント関連の通報も更新
    UPDATE reports 
    SET status = 'resolved', resolved_at = NOW(), resolved_reason = 'Parent thread deleted by admin'
    WHERE (target_type = 'comment' OR target_type = 'reply')
    AND target_id = ANY(
        SELECT unnest(comment_ids_array)::text
    )
    AND status = 'pending';
    
    GET DIAGNOSTICS updated_comment_reports = ROW_COUNT;
    RAISE NOTICE 'Updated % comment reports', updated_comment_reports;
    
    -- 5. スレッド本体をソフト削除
    UPDATE threads 
    SET is_deleted = TRUE, deleted_at = NOW()
    WHERE id = p_id;
    
    RAISE NOTICE 'Thread % soft deleted with cascade', p_id;
    RAISE NOTICE 'Summary - Comments: %, Thread Likes: %, Comment Likes: %, Favorites: %, Thread Reports: %, Comment Reports: %', 
                 updated_comments, deleted_thread_likes, deleted_comment_likes, deleted_favorites, updated_thread_reports, updated_comment_reports;
    
    RETURN TRUE;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Error during cascade deletion: %', SQLERRM;
        RETURN FALSE;
END;
$$;

-- コメント削除（修正版）
CREATE OR REPLACE FUNCTION admin_soft_delete_comment(p_id UUID)
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
    -- コメントの存在確認
    SELECT EXISTS(
        SELECT 1 FROM comments WHERE id = p_id AND (is_deleted IS NULL OR is_deleted = FALSE)
    ) INTO comment_exists;
    
    IF NOT comment_exists THEN
        RAISE NOTICE 'Comment % not found or already deleted', p_id;
        RETURN FALSE;
    END IF;
    
    RAISE NOTICE 'Starting cascade soft deletion for comment: %', p_id;
    
    -- 1. このコメントのいいねを削除
    DELETE FROM likes 
    WHERE target_type = 'comment' AND target_id = p_id::text;
    
    GET DIAGNOSTICS deleted_likes = ROW_COUNT;
    RAISE NOTICE 'Deleted % comment likes', deleted_likes;
    
    -- 2. このコメントに関する通報をクローズ
    UPDATE reports 
    SET status = 'resolved', resolved_at = NOW(), resolved_reason = 'Comment deleted by admin'
    WHERE (target_type = 'comment' OR target_type = 'reply') 
    AND target_id = p_id::text
    AND status = 'pending';
    
    GET DIAGNOSTICS updated_reports = ROW_COUNT;
    RAISE NOTICE 'Updated % comment reports', updated_reports;
    
    -- 3. コメント本体をソフト削除
    UPDATE comments 
    SET is_deleted = TRUE, deleted_at = NOW()
    WHERE id = p_id;
    
    RAISE NOTICE 'Comment % soft deleted with cascade - Likes: %, Reports: %', 
                 p_id, deleted_likes, updated_reports;
    
    RETURN TRUE;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Error during comment cascade deletion: %', SQLERRM;
        RETURN FALSE;
END;
$$;

-- 【ステップ3】TEXTラッパー関数（エラーハンドリング強化）

-- TEXTラッパー：スレッド削除
CREATE OR REPLACE FUNCTION admin_soft_delete_thread_text(p_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    uuid_param UUID;
BEGIN
    -- 入力値のバリデーション
    IF p_id IS NULL OR length(trim(p_id)) = 0 THEN
        RAISE EXCEPTION 'Thread ID cannot be null or empty';
    END IF;
    
    -- TEXTをUUIDに変換
    BEGIN
        uuid_param := p_id::UUID;
    EXCEPTION
        WHEN invalid_text_representation THEN
            RAISE EXCEPTION 'Invalid UUID format: %. Expected format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', p_id;
    END;
    
    -- UUIDネイティブ関数を呼び出し
    RETURN admin_soft_delete_thread(uuid_param);
END;
$$;

-- TEXTラッパー：コメント削除
CREATE OR REPLACE FUNCTION admin_soft_delete_comment_text(p_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    uuid_param UUID;
BEGIN
    -- 入力値のバリデーション
    IF p_id IS NULL OR length(trim(p_id)) = 0 THEN
        RAISE EXCEPTION 'Comment ID cannot be null or empty';
    END IF;
    
    -- TEXTをUUIDに変換
    BEGIN
        uuid_param := p_id::UUID;
    EXCEPTION
        WHEN invalid_text_representation THEN
            RAISE EXCEPTION 'Invalid UUID format: %. Expected format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', p_id;
    END;
    
    -- UUIDネイティブ関数を呼び出し
    RETURN admin_soft_delete_comment(uuid_param);
END;
$$;

-- 【ステップ4】関数の確認
DO $$
DECLARE
    func_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO func_count
    FROM information_schema.routines 
    WHERE routine_schema = 'public' 
        AND routine_name LIKE 'admin_soft_delete_%';
    
    RAISE NOTICE '✅ Created % cascade delete functions successfully!', func_count;
    RAISE NOTICE '🎯 Use admin_soft_delete_thread_text(p_id TEXT) for thread deletion';
    RAISE NOTICE '🎯 Use admin_soft_delete_comment_text(p_id TEXT) for comment deletion';
    RAISE NOTICE '📋 Functions handle UUID conversion and type casting automatically';
END $$;

-- 関数一覧表示
SELECT 
    routine_name, 
    routine_type,
    specific_name
FROM information_schema.routines 
WHERE routine_schema = 'public' 
    AND routine_name LIKE 'admin_soft_delete_%'
ORDER BY routine_name;