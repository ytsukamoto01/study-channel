-- ===================================================================
-- UUID型対応のカスケード削除関数（修正版）
-- ===================================================================
--
-- エラー: operator does not exist: uuid = text
-- 解決策: パラメータをUUID型に変更し、適切な型変換を行う
--

-- 1. 既存の関数を削除
DROP FUNCTION IF EXISTS admin_soft_delete_thread(text);
DROP FUNCTION IF EXISTS admin_soft_delete_comment(text);
DROP FUNCTION IF EXISTS admin_soft_delete_thread(uuid);
DROP FUNCTION IF EXISTS admin_soft_delete_comment(uuid);

-- ===================================================================
-- 2. UUID型対応のスレッド削除関数
-- ===================================================================

CREATE OR REPLACE FUNCTION admin_soft_delete_thread(p_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    updated_comments INTEGER := 0;
    deleted_likes INTEGER := 0;
    deleted_favorites INTEGER := 0;
    updated_reports INTEGER := 0;
    thread_exists BOOLEAN := FALSE;
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
    
    -- 1. このスレッドに関連するコメント・返信をソフト削除
    UPDATE comments 
    SET is_deleted = TRUE, deleted_at = NOW()
    WHERE thread_id = p_id 
    AND (is_deleted IS NULL OR is_deleted = FALSE);
    
    GET DIAGNOSTICS updated_comments = ROW_COUNT;
    RAISE NOTICE 'Soft deleted % comments/replies', updated_comments;
    
    -- 2. いいねとお気に入りは物理削除（復元不要なため）
    DELETE FROM likes 
    WHERE target_type = 'thread' AND target_id = p_id::text;
    
    GET DIAGNOSTICS deleted_likes = ROW_COUNT;
    
    -- コメントのいいねも削除
    WITH comment_ids AS (
        SELECT id::text as id_text FROM comments WHERE thread_id = p_id
    )
    DELETE FROM likes 
    WHERE target_type = 'comment' 
    AND target_id IN (SELECT id_text FROM comment_ids);
    
    DELETE FROM favorites 
    WHERE thread_id = p_id;
    
    GET DIAGNOSTICS deleted_favorites = ROW_COUNT;
    
    -- 3. 通報はステータス更新（履歴保持のため）
    UPDATE reports 
    SET status = 'resolved', resolved_at = NOW(), resolved_reason = 'Thread deleted by admin'
    WHERE target_type = 'thread' AND target_id = p_id::text
    AND status = 'pending';
    
    -- コメント関連の通報も更新
    WITH comment_ids AS (
        SELECT id::text as id_text FROM comments WHERE thread_id = p_id
    )
    UPDATE reports 
    SET status = 'resolved', resolved_at = NOW(), resolved_reason = 'Parent thread deleted by admin'
    WHERE (target_type = 'comment' OR target_type = 'reply')
    AND target_id IN (SELECT id_text FROM comment_ids)
    AND status = 'pending';
    
    GET DIAGNOSTICS updated_reports = ROW_COUNT;
    
    -- 4. スレッド本体をソフト削除
    UPDATE threads 
    SET is_deleted = TRUE, deleted_at = NOW()
    WHERE id = p_id;
    
    RAISE NOTICE 'Thread % soft deleted with cascade', p_id;
    RAISE NOTICE 'Summary - Comments: %, Likes: %, Favorites: %, Reports: %', 
                 updated_comments, deleted_likes, deleted_favorites, updated_reports;
    
    RETURN TRUE;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Error during cascade deletion: %', SQLERRM;
        RETURN FALSE;
END;
$$;

-- ===================================================================
-- 3. UUID型対応のコメント削除関数
-- ===================================================================

CREATE OR REPLACE FUNCTION admin_soft_delete_comment(p_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
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
    
    -- 1. このコメントのいいねを削除
    DELETE FROM likes 
    WHERE target_type = 'comment' AND target_id = p_id::text;
    
    GET DIAGNOSTICS deleted_likes = ROW_COUNT;
    
    -- 2. このコメントに関する通報をクローズ
    UPDATE reports 
    SET status = 'resolved', resolved_at = NOW(), resolved_reason = 'Comment deleted by admin'
    WHERE (target_type = 'comment' OR target_type = 'reply') 
    AND target_id = p_id::text
    AND status = 'pending';
    
    GET DIAGNOSTICS updated_reports = ROW_COUNT;
    
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

-- ===================================================================
-- 4. TEXT型パラメータ対応のラッパー関数（後方互換性のため）
-- ===================================================================

-- TEXTからUUIDに変換するラッパー関数
CREATE OR REPLACE FUNCTION admin_soft_delete_thread_text(p_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- TEXT をUUIDに変換して呼び出し
    RETURN admin_soft_delete_thread(p_id::UUID);
EXCEPTION
    WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'Invalid UUID format: %', p_id;
        RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION admin_soft_delete_comment_text(p_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- TEXT をUUIDに変換して呼び出し
    RETURN admin_soft_delete_comment(p_id::UUID);
EXCEPTION
    WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'Invalid UUID format: %', p_id;
        RETURN FALSE;
END;
$$;

-- ===================================================================
-- 5. 関数の確認
-- ===================================================================

SELECT 
    routine_name, 
    routine_type,
    specific_name,
    routine_definition
FROM information_schema.routines 
WHERE routine_schema = 'public' 
    AND routine_name LIKE 'admin_soft_delete_%'
ORDER BY routine_name;

-- ===================================================================
-- 使用方法
-- ===================================================================

-- UUID型で呼び出し:
-- SELECT admin_soft_delete_thread('550e8400-e29b-41d4-a716-446655440000'::UUID);

-- TEXT型で呼び出し（ラッパー関数経由）:
-- SELECT admin_soft_delete_thread_text('550e8400-e29b-41d4-a716-446655440000');