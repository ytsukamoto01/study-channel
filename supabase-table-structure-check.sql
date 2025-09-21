-- ===================================================================
-- Supabase テーブル構造確認SQL
-- ===================================================================
--
-- エラー解決のため、現在のテーブル構造を確認します
-- Supabase SQL Editorで実行してください
--

-- ===== テーブル一覧の確認 =====

SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- ===== 各テーブルのカラム構造確認 =====

-- 1. threads テーブル
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
    AND table_name = 'threads'
ORDER BY ordinal_position;

-- 2. comments テーブル
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
    AND table_name = 'comments'
ORDER BY ordinal_position;

-- 3. likes テーブル
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
    AND table_name = 'likes'
ORDER BY ordinal_position;

-- 4. favorites テーブル
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
    AND table_name = 'favorites'
ORDER BY ordinal_position;

-- 5. reports テーブル
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
    AND table_name = 'reports'
ORDER BY ordinal_position;

-- ===== 既存のインデックス確認 =====

SELECT 
    schemaname,
    tablename, 
    indexname,
    indexdef
FROM pg_indexes 
WHERE schemaname = 'public' 
    AND tablename IN ('threads', 'comments', 'likes', 'favorites', 'reports')
ORDER BY tablename, indexname;

-- ===== 外部キー制約の確認 =====

SELECT
    tc.table_name, 
    tc.constraint_name, 
    tc.constraint_type, 
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
    AND tc.table_schema='public'
    AND tc.table_name IN ('threads', 'comments', 'likes', 'favorites', 'reports');

-- ===== テーブルサイズとレコード数 =====

SELECT 
    'threads' as table_name,
    count(*) as record_count,
    pg_size_pretty(pg_total_relation_size('threads')) as total_size
FROM threads

UNION ALL

SELECT 
    'comments' as table_name,
    count(*) as record_count,
    pg_size_pretty(pg_total_relation_size('comments')) as total_size
FROM comments

UNION ALL

SELECT 
    'likes' as table_name,
    count(*) as record_count,
    pg_size_pretty(pg_total_relation_size('likes')) as total_size
FROM likes

UNION ALL

SELECT 
    'favorites' as table_name,
    count(*) as record_count,
    pg_size_pretty(pg_total_relation_size('favorites')) as total_size
FROM favorites

UNION ALL

SELECT 
    'reports' as table_name,
    count(*) as record_count,
    pg_size_pretty(pg_total_relation_size('reports')) as total_size
FROM reports

ORDER BY table_name;