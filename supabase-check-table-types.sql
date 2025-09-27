-- ===================================================================
-- テーブル構造とID型の確認
-- ===================================================================

-- 1. threads テーブルの構造確認
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
    AND table_name = 'threads' 
    AND column_name = 'id';

-- 2. comments テーブルの構造確認  
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
    AND table_name = 'comments' 
    AND column_name = 'id';

-- 3. likes テーブルの構造確認
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
    AND table_name = 'likes' 
    AND column_name = 'target_id';

-- 4. favorites テーブルの構造確認
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
    AND table_name = 'favorites' 
    AND column_name = 'thread_id';

-- 5. reports テーブルの構造確認
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
    AND table_name = 'reports' 
    AND column_name = 'target_id';

-- 6. 全テーブルのID関連カラム一覧
SELECT 
    table_name,
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
    AND table_name IN ('threads', 'comments', 'likes', 'favorites', 'reports')
    AND (column_name LIKE '%id%' OR column_name = 'id')
ORDER BY table_name, column_name;