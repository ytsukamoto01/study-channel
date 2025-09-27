-- ===================================================================
-- テーブル構造の完全確認（デバッグ用）
-- ===================================================================

-- 1. 全テーブルのID関連カラムの詳細情報
SELECT 
    t.table_name,
    c.column_name,
    c.data_type,
    c.udt_name,
    c.is_nullable,
    c.column_default
FROM information_schema.tables t
JOIN information_schema.columns c ON t.table_name = c.table_name
WHERE t.table_schema = 'public' 
    AND t.table_name IN ('threads', 'comments', 'likes', 'favorites', 'reports')
    AND (c.column_name LIKE '%id%' OR c.column_name = 'id')
ORDER BY t.table_name, c.column_name;

-- 2. 各テーブルの実際のデータ例（ID部分のみ）
SELECT 'threads' as table_name, id, pg_typeof(id) as id_type FROM threads LIMIT 3;
SELECT 'comments' as table_name, id, pg_typeof(id) as id_type FROM comments LIMIT 3;
SELECT 'likes' as table_name, target_id, pg_typeof(target_id) as target_id_type FROM likes LIMIT 3;
SELECT 'favorites' as table_name, thread_id, pg_typeof(thread_id) as thread_id_type FROM favorites LIMIT 3;
SELECT 'reports' as table_name, target_id, pg_typeof(target_id) as target_id_type FROM reports LIMIT 3;

-- 3. 現在存在する関数の確認
SELECT 
    routine_name, 
    routine_type,
    specific_name,
    data_type as return_type
FROM information_schema.routines 
WHERE routine_schema = 'public' 
    AND routine_name LIKE 'admin_soft_delete_%'
ORDER BY routine_name;

-- 4. 関数パラメータの詳細
SELECT 
    r.routine_name,
    p.parameter_name,
    p.data_type,
    p.parameter_mode,
    p.ordinal_position
FROM information_schema.routines r
LEFT JOIN information_schema.parameters p ON r.specific_name = p.specific_name
WHERE r.routine_schema = 'public' 
    AND r.routine_name LIKE 'admin_soft_delete_%'
ORDER BY r.routine_name, p.ordinal_position;