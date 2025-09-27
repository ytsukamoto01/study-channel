-- ===================================================================
-- Supabase関数競合の解決
-- ===================================================================
--
-- エラー: Could not choose the best candidate function between:
-- public.admin_soft_delete_thread(p_id => text), 
-- public.admin_soft_delete_thread(p_id => uuid)
--
-- 解決策: 既存の競合する関数を削除し、新しい統一された関数を作成
--

-- 1. 既存の競合する関数を全て削除
DROP FUNCTION IF EXISTS admin_soft_delete_thread(text);
DROP FUNCTION IF EXISTS admin_soft_delete_thread(uuid);
DROP FUNCTION IF EXISTS admin_soft_delete_thread(p_id text);
DROP FUNCTION IF EXISTS admin_soft_delete_thread(p_id uuid);

-- コメント関数も同様に削除
DROP FUNCTION IF EXISTS admin_soft_delete_comment(text);
DROP FUNCTION IF EXISTS admin_soft_delete_comment(uuid);
DROP FUNCTION IF EXISTS admin_soft_delete_comment(p_id text);
DROP FUNCTION IF EXISTS admin_soft_delete_comment(p_id uuid);

-- カスケード削除関数も一度削除して再作成
DROP FUNCTION IF EXISTS admin_soft_delete_thread_cascade(text);
DROP FUNCTION IF EXISTS admin_soft_delete_comment_cascade(text);
DROP FUNCTION IF EXISTS admin_cascade_delete_thread(text);

-- ===================================================================
-- 2. 新しい統一されたカスケード削除関数を作成
-- ===================================================================

-- スレッド関連データの包括的ソフト削除（推奨）
CREATE OR REPLACE FUNCTION admin_soft_delete_thread(p_id TEXT)
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
    WHERE target_type = 'thread' AND target_id = p_id;
    
    GET DIAGNOSTICS deleted_likes = ROW_COUNT;
    
    -- コメントのいいねも削除
    WITH comment_ids AS (
        SELECT id FROM comments WHERE thread_id = p_id
    )
    DELETE FROM likes 
    WHERE target_type = 'comment' 
    AND target_id IN (SELECT id FROM comment_ids);
    
    DELETE FROM favorites 
    WHERE thread_id = p_id;
    
    GET DIAGNOSTICS deleted_favorites = ROW_COUNT;
    
    -- 3. 通報はステータス更新（履歴保持のため）
    UPDATE reports 
    SET status = 'resolved', resolved_at = NOW(), resolved_reason = 'Thread deleted by admin'
    WHERE target_type = 'thread' AND target_id = p_id 
    AND status = 'pending';
    
    -- コメント関連の通報も更新
    WITH comment_ids AS (
        SELECT id FROM comments WHERE thread_id = p_id
    )
    UPDATE reports 
    SET status = 'resolved', resolved_at = NOW(), resolved_reason = 'Parent thread deleted by admin'
    WHERE (target_type = 'comment' OR target_type = 'reply')
    AND target_id IN (SELECT id FROM comment_ids)
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

-- コメント関連データの削除
CREATE OR REPLACE FUNCTION admin_soft_delete_comment(p_id TEXT)
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
    WHERE target_type = 'comment' AND target_id = p_id;
    
    GET DIAGNOSTICS deleted_likes = ROW_COUNT;
    
    -- 2. このコメントに関する通報をクローズ
    UPDATE reports 
    SET status = 'resolved', resolved_at = NOW(), resolved_reason = 'Comment deleted by admin'
    WHERE (target_type = 'comment' OR target_type = 'reply') 
    AND target_id = p_id 
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
-- 3. 関数の確認
-- ===================================================================

-- 作成された関数を確認
SELECT 
    routine_name, 
    routine_type,
    data_type,
    routine_definition
FROM information_schema.routines 
WHERE routine_schema = 'public' 
    AND routine_name IN ('admin_soft_delete_thread', 'admin_soft_delete_comment')
ORDER BY routine_name;

-- ===================================================================
-- 使用方法
-- ===================================================================

-- スレッドとその関連データをソフト削除:
-- SELECT admin_soft_delete_thread('thread-id-here');

-- コメントとその関連データをソフト削除:
-- SELECT admin_soft_delete_comment('comment-id-here');

-- ===================================================================
-- 実行確認
-- ===================================================================

-- テスト（実際のIDに置き換えて確認）
-- SELECT admin_soft_delete_thread('test-thread-id');