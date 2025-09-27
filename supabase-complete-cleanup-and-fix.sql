-- ===================================================================
-- 完全なクリーンアップとUUID対応関数の作成
-- ===================================================================

-- 【ステップ1】既存関数の完全削除
-- すべての可能性のある関数名とパラメータ型の組み合わせを削除

-- admin_soft_delete_thread 関連
DROP FUNCTION IF EXISTS admin_soft_delete_thread() CASCADE;
DROP FUNCTION IF EXISTS admin_soft_delete_thread(text) CASCADE;
DROP FUNCTION IF EXISTS admin_soft_delete_thread(uuid) CASCADE;
DROP FUNCTION IF EXISTS admin_soft_delete_thread(p_id text) CASCADE;
DROP FUNCTION IF EXISTS admin_soft_delete_thread(p_id uuid) CASCADE;
DROP FUNCTION IF EXISTS admin_soft_delete_thread_cascade() CASCADE;
DROP FUNCTION IF EXISTS admin_soft_delete_thread_cascade(text) CASCADE;
DROP FUNCTION IF EXISTS admin_soft_delete_thread_cascade(uuid) CASCADE;
DROP FUNCTION IF EXISTS admin_soft_delete_thread_text() CASCADE;
DROP FUNCTION IF EXISTS admin_soft_delete_thread_text(text) CASCADE;
DROP FUNCTION IF EXISTS admin_soft_delete_thread_text(p_id text) CASCADE;

-- admin_soft_delete_comment 関連
DROP FUNCTION IF EXISTS admin_soft_delete_comment() CASCADE;
DROP FUNCTION IF EXISTS admin_soft_delete_comment(text) CASCADE;
DROP FUNCTION IF EXISTS admin_soft_delete_comment(uuid) CASCADE;
DROP FUNCTION IF EXISTS admin_soft_delete_comment(p_id text) CASCADE;
DROP FUNCTION IF EXISTS admin_soft_delete_comment(p_id uuid) CASCADE;
DROP FUNCTION IF EXISTS admin_soft_delete_comment_cascade() CASCADE;
DROP FUNCTION IF EXISTS admin_soft_delete_comment_cascade(text) CASCADE;
DROP FUNCTION IF EXISTS admin_soft_delete_comment_cascade(uuid) CASCADE;
DROP FUNCTION IF EXISTS admin_soft_delete_comment_text() CASCADE;
DROP FUNCTION IF EXISTS admin_soft_delete_comment_text(text) CASCADE;
DROP FUNCTION IF EXISTS admin_soft_delete_comment_text(p_id text) CASCADE;

-- その他の関連関数
DROP FUNCTION IF EXISTS simple_delete_thread() CASCADE;
DROP FUNCTION IF EXISTS simple_delete_thread(text) CASCADE;
DROP FUNCTION IF EXISTS simple_delete_thread(p_id text) CASCADE;

-- 【ステップ2】UUID型ネイティブ関数の作成

-- スレッド削除（UUID型パラメータ）
CREATE OR REPLACE FUNCTION admin_soft_delete_thread(p_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    
    -- 2. いいねを削除（UUIDからTEXTへの変換）
    DELETE FROM likes 
    WHERE target_type = 'thread' AND target_id = p_id::text;
    
    GET DIAGNOSTICS deleted_likes = ROW_COUNT;
    
    -- コメントのいいねも削除
    DELETE FROM likes 
    WHERE target_type = 'comment' 
    AND target_id IN (
        SELECT id::text FROM comments WHERE thread_id = p_id
    );
    
    -- 3. お気に入りを削除
    DELETE FROM favorites 
    WHERE thread_id = p_id;
    
    GET DIAGNOSTICS deleted_favorites = ROW_COUNT;
    
    -- 4. 通報はステータス更新（履歴保持のため）
    UPDATE reports 
    SET status = 'resolved', resolved_at = NOW(), resolved_reason = 'Thread deleted by admin'
    WHERE target_type = 'thread' AND target_id = p_id::text
    AND status = 'pending';
    
    -- コメント関連の通報も更新
    UPDATE reports 
    SET status = 'resolved', resolved_at = NOW(), resolved_reason = 'Parent thread deleted by admin'
    WHERE (target_type = 'comment' OR target_type = 'reply')
    AND target_id IN (
        SELECT id::text FROM comments WHERE thread_id = p_id
    )
    AND status = 'pending';
    
    GET DIAGNOSTICS updated_reports = ROW_COUNT;
    
    -- 5. スレッド本体をソフト削除
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

-- コメント削除（UUID型パラメータ）
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

-- 【ステップ3】TEXT型ラッパー関数の作成（API互換性のため）

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
SELECT 
    routine_name, 
    routine_type,
    specific_name
FROM information_schema.routines 
WHERE routine_schema = 'public' 
    AND routine_name LIKE 'admin_soft_delete_%'
ORDER BY routine_name;

-- 【ステップ5】テスト用の関数呼び出し例
-- ※実際のUUIDに置き換えてテスト
-- SELECT admin_soft_delete_thread_text('550e8400-e29b-41d4-a716-446655440000');

RAISE NOTICE '✅ All cascade delete functions created successfully!';
RAISE NOTICE '🎯 Use admin_soft_delete_thread_text(p_id TEXT) for API calls';
RAISE NOTICE '🎯 Use admin_soft_delete_comment_text(p_id TEXT) for API calls';