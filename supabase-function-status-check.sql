-- ===================================================================
-- Supabase 関数の現在状況確認
-- ===================================================================

-- 1. 現在存在する admin 関連関数をすべて確認
SELECT 
    routine_name, 
    routine_type,
    specific_name,
    data_type as return_type,
    routine_definition
FROM information_schema.routines 
WHERE routine_schema = 'public' 
    AND (routine_name LIKE 'admin_%' OR routine_name LIKE '%delete%')
ORDER BY routine_name;

-- 2. パラメータ情報も含めた詳細確認
SELECT 
    r.routine_name,
    r.specific_name,
    p.parameter_name,
    p.data_type as parameter_type,
    p.parameter_mode
FROM information_schema.routines r
LEFT JOIN information_schema.parameters p 
    ON r.specific_name = p.specific_name
WHERE r.routine_schema = 'public' 
    AND (r.routine_name LIKE 'admin_%' OR r.routine_name LIKE '%delete%')
ORDER BY r.routine_name, p.ordinal_position;

-- 3. テーブル構造確認（ID列の型チェック）
SELECT 
    table_name,
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
    AND table_name IN ('threads', 'comments', 'likes', 'favorites', 'reports')
    AND column_name LIKE '%id%'
ORDER BY table_name, column_name;

-- 4. 競合している可能性のある関数のシグネチャ確認
SELECT 
    routine_name,
    string_agg(
        COALESCE(parameter_name, 'RETURN') || ' ' || data_type, 
        ', ' ORDER BY ordinal_position
    ) as signature
FROM information_schema.routines r
LEFT JOIN information_schema.parameters p ON r.specific_name = p.specific_name
WHERE r.routine_schema = 'public' 
    AND r.routine_name IN ('admin_soft_delete_thread', 'admin_soft_delete_comment')
GROUP BY routine_name, r.specific_name
ORDER BY routine_name;