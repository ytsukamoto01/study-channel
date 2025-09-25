-- ===================================================================
-- スレッド関連データのカスケード削除機能
-- ===================================================================
--
-- スレッド削除時に関連データも一括削除する機能
-- - コメント・返信の削除
-- - いいねの削除  
-- - お気に入りの削除
-- - 通報データの削除
--

-- 1. スレッドとその関連データを完全削除する関数
CREATE OR REPLACE FUNCTION admin_cascade_delete_thread(p_thread_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    deleted_comments INTEGER := 0;
    deleted_likes INTEGER := 0;
    deleted_favorites INTEGER := 0;
    deleted_reports INTEGER := 0;
    thread_exists BOOLEAN := FALSE;
BEGIN
    -- スレッドの存在確認
    SELECT EXISTS(
        SELECT 1 FROM threads WHERE id = p_thread_id
    ) INTO thread_exists;
    
    IF NOT thread_exists THEN
        RAISE NOTICE 'Thread % not found', p_thread_id;
        RETURN FALSE;
    END IF;
    
    RAISE NOTICE 'Starting cascade deletion for thread: %', p_thread_id;
    
    -- 1. このスレッドに関連するコメント・返信を削除
    DELETE FROM comments 
    WHERE thread_id = p_thread_id;
    
    GET DIAGNOSTICS deleted_comments = ROW_COUNT;
    RAISE NOTICE 'Deleted % comments/replies', deleted_comments;
    
    -- 2. このスレッドに関連するいいねを削除
    DELETE FROM likes 
    WHERE target_type = 'thread' AND target_id = p_thread_id;
    
    GET DIAGNOSTICS deleted_likes = ROW_COUNT;
    RAISE NOTICE 'Deleted % thread likes', deleted_likes;
    
    -- 3. コメントのいいねも削除（コメントIDを取得してから削除）
    WITH comment_ids AS (
        SELECT id FROM comments WHERE thread_id = p_thread_id
    )
    DELETE FROM likes 
    WHERE target_type = 'comment' 
    AND target_id IN (SELECT id FROM comment_ids);
    
    -- 4. このスレッドのお気に入りを削除
    DELETE FROM favorites 
    WHERE thread_id = p_thread_id;
    
    GET DIAGNOSTICS deleted_favorites = ROW_COUNT;
    RAISE NOTICE 'Deleted % favorites', deleted_favorites;
    
    -- 5. このスレッドに関する通報を削除
    DELETE FROM reports 
    WHERE target_type = 'thread' AND target_id = p_thread_id;
    
    -- 6. このスレッドのコメントに関する通報も削除
    WITH comment_ids AS (
        SELECT id FROM comments WHERE thread_id = p_thread_id
    )
    DELETE FROM reports 
    WHERE (target_type = 'comment' OR target_type = 'reply')
    AND target_id IN (SELECT id FROM comment_ids);
    
    GET DIAGNOSTICS deleted_reports = ROW_COUNT;
    RAISE NOTICE 'Deleted % reports', deleted_reports;
    
    -- 7. 最後にスレッド本体を削除
    DELETE FROM threads WHERE id = p_thread_id;
    
    RAISE NOTICE 'Thread % and all related data deleted successfully', p_thread_id;
    RAISE NOTICE 'Summary - Comments: %, Likes: %, Favorites: %, Reports: %', 
                 deleted_comments, deleted_likes, deleted_favorites, deleted_reports;
    
    RETURN TRUE;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Error during cascade deletion: %', SQLERRM;
        RETURN FALSE;
END;
$$;

-- 2. ソフト削除版（is_deletedフラグを使用）
CREATE OR REPLACE FUNCTION admin_soft_delete_thread_cascade(p_thread_id TEXT)
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
        SELECT 1 FROM threads WHERE id = p_thread_id AND (is_deleted IS NULL OR is_deleted = FALSE)
    ) INTO thread_exists;
    
    IF NOT thread_exists THEN
        RAISE NOTICE 'Thread % not found or already deleted', p_thread_id;
        RETURN FALSE;
    END IF;
    
    RAISE NOTICE 'Starting soft cascade deletion for thread: %', p_thread_id;
    
    -- 1. このスレッドに関連するコメント・返信をソフト削除
    UPDATE comments 
    SET is_deleted = TRUE, deleted_at = NOW()
    WHERE thread_id = p_thread_id 
    AND (is_deleted IS NULL OR is_deleted = FALSE);
    
    GET DIAGNOSTICS updated_comments = ROW_COUNT;
    RAISE NOTICE 'Soft deleted % comments/replies', updated_comments;
    
    -- 2. いいねとお気に入りは物理削除（復元不要なため）
    DELETE FROM likes 
    WHERE target_type = 'thread' AND target_id = p_thread_id;
    
    GET DIAGNOSTICS deleted_likes = ROW_COUNT;
    
    -- コメントのいいねも削除
    WITH comment_ids AS (
        SELECT id FROM comments WHERE thread_id = p_thread_id
    )
    DELETE FROM likes 
    WHERE target_type = 'comment' 
    AND target_id IN (SELECT id FROM comment_ids);
    
    DELETE FROM favorites 
    WHERE thread_id = p_thread_id;
    
    GET DIAGNOSTICS deleted_favorites = ROW_COUNT;
    
    -- 3. 通報はステータス更新（履歴保持のため）
    UPDATE reports 
    SET status = 'resolved', resolved_at = NOW(), resolved_reason = 'Thread deleted by admin'
    WHERE target_type = 'thread' AND target_id = p_thread_id 
    AND status = 'pending';
    
    -- コメント関連の通報も更新
    WITH comment_ids AS (
        SELECT id FROM comments WHERE thread_id = p_thread_id
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
    WHERE id = p_thread_id;
    
    RAISE NOTICE 'Thread % soft deleted with cascade', p_thread_id;
    RAISE NOTICE 'Summary - Comments: %, Likes: %, Favorites: %, Reports: %', 
                 updated_comments, deleted_likes, deleted_favorites, updated_reports;
    
    RETURN TRUE;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Error during soft cascade deletion: %', SQLERRM;
        RETURN FALSE;
END;
$$;

-- 3. 既存の関数を置き換え（後方互換性のため）
CREATE OR REPLACE FUNCTION admin_soft_delete_thread(p_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 新しいカスケード削除関数を呼び出し
    RETURN admin_soft_delete_thread_cascade(p_id);
END;
$$;

-- 4. コメント削除時も関連データを削除
CREATE OR REPLACE FUNCTION admin_soft_delete_comment_cascade(p_comment_id TEXT)
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
        SELECT 1 FROM comments WHERE id = p_comment_id AND (is_deleted IS NULL OR is_deleted = FALSE)
    ) INTO comment_exists;
    
    IF NOT comment_exists THEN
        RAISE NOTICE 'Comment % not found or already deleted', p_comment_id;
        RETURN FALSE;
    END IF;
    
    -- 1. このコメントのいいねを削除
    DELETE FROM likes 
    WHERE target_type = 'comment' AND target_id = p_comment_id;
    
    GET DIAGNOSTICS deleted_likes = ROW_COUNT;
    
    -- 2. このコメントに関する通報をクローズ
    UPDATE reports 
    SET status = 'resolved', resolved_at = NOW(), resolved_reason = 'Comment deleted by admin'
    WHERE (target_type = 'comment' OR target_type = 'reply') 
    AND target_id = p_comment_id 
    AND status = 'pending';
    
    GET DIAGNOSTICS updated_reports = ROW_COUNT;
    
    -- 3. コメント本体をソフト削除
    UPDATE comments 
    SET is_deleted = TRUE, deleted_at = NOW()
    WHERE id = p_comment_id;
    
    RAISE NOTICE 'Comment % soft deleted with cascade - Likes: %, Reports: %', 
                 p_comment_id, deleted_likes, updated_reports;
    
    RETURN TRUE;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Error during comment cascade deletion: %', SQLERRM;
        RETURN FALSE;
END;
$$;

-- 5. 既存のコメント削除関数を置き換え
CREATE OR REPLACE FUNCTION admin_soft_delete_comment(p_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 新しいカスケード削除関数を呼び出し
    RETURN admin_soft_delete_comment_cascade(p_id);
END;
$$;

-- ===================================================================
-- 使用方法と実行例
-- ===================================================================

-- スレッドとその関連データを完全削除:
-- SELECT admin_cascade_delete_thread('thread-id-here');

-- スレッドとその関連データをソフト削除（推奨）:  
-- SELECT admin_soft_delete_thread('thread-id-here');

-- コメントとその関連データをソフト削除:
-- SELECT admin_soft_delete_comment('comment-id-here');

-- ===================================================================
-- 削除される関連データの詳細
-- ===================================================================
--
-- スレッド削除時:
-- ✓ 全てのコメント・返信 (comments)
-- ✓ スレッドへのいいね (likes: target_type='thread')  
-- ✓ コメントへのいいね (likes: target_type='comment')
-- ✓ スレッドのお気に入り (favorites)
-- ✓ スレッド関連の通報 (reports: target_type='thread')
-- ✓ コメント関連の通報 (reports: target_type='comment')
-- ✓ スレッド本体 (threads)
--
-- コメント削除時:
-- ✓ コメントへのいいね (likes: target_type='comment')
-- ✓ コメント関連の通報 (reports: target_type='comment')  
-- ✓ コメント本体 (comments)
--