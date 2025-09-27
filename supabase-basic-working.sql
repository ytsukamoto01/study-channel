-- ===================================================================
-- 基本動作版：最もシンプルなハードデリート関数
-- ===================================================================

-- 【ステップ1】既存関数の完全削除
DROP FUNCTION IF EXISTS admin_soft_delete_thread_text(text) CASCADE;
DROP FUNCTION IF EXISTS admin_soft_delete_comment_text(text) CASCADE;

-- 【ステップ2】最もシンプルな動作版を作成

-- スレッドハードデリート（基本版）
CREATE OR REPLACE FUNCTION admin_soft_delete_thread_text(p_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- 入力検証
    IF p_id IS NULL OR trim(p_id) = '' THEN
        RAISE EXCEPTION 'Thread ID cannot be null or empty';
    END IF;

    RAISE NOTICE 'BASIC: Starting hard delete for thread: %', p_id;

    -- 1. likes テーブルから削除（target_id は TEXT型）
    DELETE FROM likes WHERE target_type = 'thread' AND target_id = p_id;
    RAISE NOTICE 'BASIC: Deleted thread likes';

    -- 2. コメントのlikesも削除
    DELETE FROM likes 
    WHERE target_type = 'comment' 
    AND target_id IN (
        SELECT id::TEXT FROM comments WHERE thread_id::TEXT = p_id
    );
    RAISE NOTICE 'BASIC: Deleted comment likes';

    -- 3. favorites テーブルから削除（thread_id をTEXT比較）
    DELETE FROM favorites WHERE thread_id::TEXT = p_id;
    RAISE NOTICE 'BASIC: Deleted favorites';

    -- 4. reports テーブルから削除（target_id は TEXT型）
    DELETE FROM reports WHERE target_type = 'thread' AND target_id = p_id;
    RAISE NOTICE 'BASIC: Deleted thread reports';

    -- 5. コメントのreportsも削除
    DELETE FROM reports 
    WHERE (target_type = 'comment' OR target_type = 'reply')
    AND target_id IN (
        SELECT id::TEXT FROM comments WHERE thread_id::TEXT = p_id
    );
    RAISE NOTICE 'BASIC: Deleted comment reports';

    -- 6. comments テーブルから削除（thread_id をTEXT比較）
    DELETE FROM comments WHERE thread_id::TEXT = p_id;
    RAISE NOTICE 'BASIC: Deleted comments';

    -- 7. threads テーブルから削除（id をTEXT比較）
    DELETE FROM threads WHERE id::TEXT = p_id;
    RAISE NOTICE 'BASIC: Deleted thread';

    RAISE NOTICE 'BASIC: Hard delete completed for thread %', p_id;
    RETURN TRUE;

EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'BASIC ERROR: %', SQLERRM;
        RETURN FALSE;
END;
$$;

-- コメントハードデリート（基本版）
CREATE OR REPLACE FUNCTION admin_soft_delete_comment_text(p_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- 入力検証
    IF p_id IS NULL OR trim(p_id) = '' THEN
        RAISE EXCEPTION 'Comment ID cannot be null or empty';
    END IF;

    RAISE NOTICE 'BASIC: Starting hard delete for comment: %', p_id;

    -- 1. likes テーブルから削除（target_id は TEXT型）
    DELETE FROM likes WHERE target_type = 'comment' AND target_id = p_id;
    RAISE NOTICE 'BASIC: Deleted comment likes';

    -- 2. reports テーブルから削除（target_id は TEXT型）
    DELETE FROM reports 
    WHERE (target_type = 'comment' OR target_type = 'reply') 
    AND target_id = p_id;
    RAISE NOTICE 'BASIC: Deleted comment reports';

    -- 3. comments テーブルから削除（id をTEXT比較）
    DELETE FROM comments WHERE id::TEXT = p_id;
    RAISE NOTICE 'BASIC: Deleted comment';

    RAISE NOTICE 'BASIC: Hard delete completed for comment %', p_id;
    RETURN TRUE;

EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'BASIC ERROR: %', SQLERRM;
        RETURN FALSE;
END;
$$;

-- 【ステップ3】作成確認
SELECT 
    routine_name, 
    routine_type
FROM information_schema.routines 
WHERE routine_schema = 'public' 
    AND routine_name LIKE 'admin_%delete_%'
ORDER BY routine_name;

-- 【ステップ4】成功メッセージ
DO $$
BEGIN
    RAISE NOTICE 'BASIC HARD DELETE FUNCTIONS CREATED SUCCESSFULLY!';
    RAISE NOTICE 'Simple approach with direct SQL operations';
    RAISE NOTICE 'Ready for testing!';
END $$;