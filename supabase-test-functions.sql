-- ===================================================================
-- Supabase関数動作テスト
-- ===================================================================
--
-- 管理画面で削除機能をテストするための簡易関数
--

-- 1. テスト用: 関数が正常に呼び出されるかチェック
CREATE OR REPLACE FUNCTION test_admin_function()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN 'Admin function is working correctly!';
END;
$$;

-- 2. スレッド存在確認関数
CREATE OR REPLACE FUNCTION check_thread_exists(p_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    thread_exists BOOLEAN := FALSE;
BEGIN
    SELECT EXISTS(
        SELECT 1 FROM threads WHERE id = p_id
    ) INTO thread_exists;
    
    RETURN thread_exists;
END;
$$;

-- 3. 簡易削除関数（テスト用）
CREATE OR REPLACE FUNCTION simple_delete_thread(p_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
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
    
    -- スレッド本体のみソフト削除（テスト用）
    UPDATE threads 
    SET is_deleted = TRUE, deleted_at = NOW()
    WHERE id = p_id;
    
    RAISE NOTICE 'Thread % deleted successfully', p_id;
    RETURN TRUE;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Error during deletion: %', SQLERRM;
        RETURN FALSE;
END;
$$;

-- ===================================================================
-- テスト実行
-- ===================================================================

-- 1. テスト関数の確認
SELECT test_admin_function();

-- 2. 作成された関数の一覧確認
SELECT 
    routine_name, 
    routine_type,
    specific_name
FROM information_schema.routines 
WHERE routine_schema = 'public' 
    AND (routine_name LIKE 'admin_%' OR routine_name LIKE 'test_%' OR routine_name LIKE '%delete%')
ORDER BY routine_name;

-- 3. threads テーブル構造確認
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
    AND table_name = 'threads' 
    AND column_name IN ('id', 'is_deleted', 'deleted_at')
ORDER BY ordinal_position;