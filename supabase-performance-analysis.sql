-- ===================================================================
-- Supabase パフォーマンス分析・測定用SQL
-- ===================================================================
--
-- インデックス作成前後のパフォーマンスを測定するためのSQL
-- Supabase SQL Editorで実行してください
--

-- ===== 現在のデータベース状況確認 =====

-- 1. テーブルサイズとレコード数
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
    pg_size_pretty(pg_indexes_size(schemaname||'.'||tablename)) as indexes_size,
    (SELECT count(*) FROM threads) as thread_count,
    (SELECT count(*) FROM comments) as comment_count,
    (SELECT count(*) FROM likes) as like_count,
    (SELECT count(*) FROM favorites) as favorite_count,
    (SELECT count(*) FROM reports) as report_count
FROM pg_tables 
WHERE schemaname = 'public' 
    AND tablename = 'threads'
LIMIT 1;

-- 2. 現在のインデックス一覧
SELECT 
    schemaname,
    tablename, 
    indexname,
    indexdef
FROM pg_indexes 
WHERE schemaname = 'public' 
    AND tablename IN ('threads', 'comments', 'likes', 'favorites', 'reports')
ORDER BY tablename, indexname;

-- ===== パフォーマンステスト用クエリ =====

-- 🔥 最も重要なクエリのパフォーマンス測定

-- 1. スレッド一覧取得（メインページ）
EXPLAIN (ANALYZE, BUFFERS) 
SELECT * FROM threads 
ORDER BY created_at DESC 
LIMIT 50;

-- 2. 特定スレッドのコメント取得（スレッド詳細ページ）
EXPLAIN (ANALYZE, BUFFERS) 
SELECT * FROM comments 
WHERE thread_id = (SELECT id FROM threads LIMIT 1)
ORDER BY created_at ASC;

-- 3. いいね数カウント（頻繁に実行される）
EXPLAIN (ANALYZE, BUFFERS) 
SELECT count(*) FROM likes 
WHERE target_type = 'thread' 
AND target_id = (SELECT id FROM threads LIMIT 1);

-- 4. ユーザーのお気に入り一覧
EXPLAIN (ANALYZE, BUFFERS) 
SELECT f.*, t.title, t.category 
FROM favorites f 
JOIN threads t ON f.thread_id = t.id 
WHERE f.user_fingerprint = 'test-user-fp' 
ORDER BY f.created_at DESC;

-- 5. 通報一覧（管理画面）
EXPLAIN (ANALYZE, BUFFERS) 
SELECT * FROM reports 
WHERE status = 'pending' 
ORDER BY created_at DESC 
LIMIT 20;

-- ===== インデックス効果の確認 =====

-- インデックス使用状況の統計
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan,  -- インデックススキャン回数
    idx_tup_read,  -- インデックス経由で読まれた行数
    idx_tup_fetch  -- インデックス経由でフェッチされた行数
FROM pg_stat_user_indexes 
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;

-- テーブルスキャン統計
SELECT 
    schemaname,
    tablename,
    seq_scan,  -- シーケンシャルスキャン回数
    seq_tup_read,  -- シーケンシャルスキャンで読まれた行数
    idx_scan,  -- インデックススキャン回数
    idx_tup_fetch,  -- インデックススキャンでフェッチされた行数
    n_tup_ins,  -- 挿入された行数
    n_tup_upd,  -- 更新された行数
    n_tup_del   -- 削除された行数
FROM pg_stat_user_tables 
WHERE schemaname = 'public'
ORDER BY seq_scan DESC;

-- ===== 最適化が必要な遅いクエリの特定 =====

-- 実行時間が長いクエリの確認（PostgreSQL 13以降）
SELECT 
    query,
    calls,
    total_time,
    mean_time,
    min_time,
    max_time,
    rows
FROM pg_stat_statements 
WHERE query LIKE '%threads%' OR query LIKE '%comments%' OR query LIKE '%likes%'
ORDER BY mean_time DESC
LIMIT 10;

-- ===== アプリケーション固有のパフォーマンステスト =====

-- よく使われるクエリパターンのテスト

-- カテゴリ別スレッド一覧（フィルタ機能）
EXPLAIN (ANALYZE, BUFFERS) 
SELECT * FROM threads 
WHERE category = 'テスト' 
ORDER BY created_at DESC 
LIMIT 20;

-- ユーザー投稿一覧（マイページ）
EXPLAIN (ANALYZE, BUFFERS) 
SELECT * FROM threads 
WHERE user_fingerprint = 'test-user-fp' 
ORDER BY created_at DESC;

-- コメント数計算
EXPLAIN (ANALYZE, BUFFERS) 
SELECT thread_id, count(*) as comment_count 
FROM comments 
GROUP BY thread_id;

-- 人気スレッド（いいね数順）
EXPLAIN (ANALYZE, BUFFERS) 
SELECT t.*, count(l.id) as like_count 
FROM threads t 
LEFT JOIN likes l ON l.target_type = 'thread' AND l.target_id = t.id 
GROUP BY t.id 
ORDER BY like_count DESC 
LIMIT 10;

-- ===== パフォーマンス改善の測定 =====

-- 実行前後の比較用（実行時間を記録）
SELECT 
    'インデックス作成前' as status,
    now() as measured_at,
    (SELECT count(*) FROM threads) as thread_count,
    (SELECT count(*) FROM comments) as comment_count,
    (SELECT count(*) FROM likes) as like_count;

-- ===== 統計情報の更新（インデックス作成後に実行） =====

ANALYZE threads;
ANALYZE comments; 
ANALYZE likes;
ANALYZE favorites;
ANALYZE reports;

-- ===== 結果の解釈ガイド =====

/*
🔍 EXPLAIN ANALYZE の見方：

- Execution time: クエリ実行時間（低いほど良い）
- Planning time: プラン作成時間（通常は実行時間より小さい）
- Buffers: バッファ使用量（shared hit が多いほど良い）

📊 Index Scan vs Seq Scan:

- Index Scan: インデックスを使った高速検索
- Seq Scan: テーブル全体をスキャン（遅い）
- Bitmap Index Scan: 複数インデックスを組み合わせ

⚡ 改善指標:

インデックス作成前:
- Execution time: 100-500ms
- Seq Scan が多用されている

インデックス作成後:
- Execution time: 10-50ms (50-90%改善)
- Index Scan が使われている

💡 期待される改善:

1. スレッド一覧: 200ms → 20ms (90%改善)
2. コメント取得: 150ms → 30ms (80%改善)  
3. いいね数計算: 100ms → 10ms (90%改善)
4. お気に入り: 80ms → 5ms (95%改善)

*/