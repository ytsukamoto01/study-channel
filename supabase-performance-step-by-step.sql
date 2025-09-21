-- ===================================================================
-- Supabase Performance Optimization - Step by Step
-- ===================================================================
--
-- 段階的実行版: 一つずつ実行してエラーを回避
-- 各ステップを個別に実行できます
--

-- ===== STEP 1: THREADS TABLE =====
-- スレッド一覧表示の高速化（最も効果的）

-- 1-1. 作成日時降順インデックス（スレッド一覧のソート高速化）
CREATE INDEX IF NOT EXISTS idx_threads_created_at_desc 
ON threads (created_at DESC);

-- 1-2. ユーザー別スレッド検索（マイページ高速化）
CREATE INDEX IF NOT EXISTS idx_threads_user_fingerprint 
ON threads (user_fingerprint);

-- 1-3. カテゴリ別フィルタ高速化
CREATE INDEX IF NOT EXISTS idx_threads_category 
ON threads (category);

-- 確認: ステップ1の結果
SELECT 'STEP 1 完了: THREADS' as status, count(*) as index_count
FROM pg_indexes 
WHERE schemaname = 'public' 
    AND tablename = 'threads' 
    AND indexname LIKE 'idx_threads_%';

-- ===== STEP 2: LIKES TABLE =====
-- いいね数計算の超高速化（非常に効果的）

-- 2-1. いいね数カウント用複合インデックス（最重要）
CREATE INDEX IF NOT EXISTS idx_likes_target_type_target_id 
ON likes (target_type, target_id);

-- 2-2. ユーザーいいね状態確認用
CREATE INDEX IF NOT EXISTS idx_likes_user_fingerprint_target 
ON likes (user_fingerprint, target_type, target_id);

-- 確認: ステップ2の結果
SELECT 'STEP 2 完了: LIKES' as status, count(*) as index_count
FROM pg_indexes 
WHERE schemaname = 'public' 
    AND tablename = 'likes' 
    AND indexname LIKE 'idx_likes_%';

-- ===== STEP 3: COMMENTS TABLE =====
-- コメント表示の高速化

-- 3-1. スレッド内コメント取得（重要）
CREATE INDEX IF NOT EXISTS idx_comments_thread_id 
ON comments (thread_id);

-- 3-2. コメント表示順序（スレッド別＋日時順）
CREATE INDEX IF NOT EXISTS idx_comments_thread_id_created_at 
ON comments (thread_id, created_at ASC);

-- 確認: ステップ3の結果  
SELECT 'STEP 3 完了: COMMENTS' as status, count(*) as index_count
FROM pg_indexes 
WHERE schemaname = 'public' 
    AND tablename = 'comments' 
    AND indexname LIKE 'idx_comments_%';

-- ===== STEP 4: FAVORITES TABLE =====
-- お気に入り機能の高速化

-- 4-1. ユーザー別お気に入り一覧
CREATE INDEX IF NOT EXISTS idx_favorites_user_fingerprint 
ON favorites (user_fingerprint);

-- 4-2. スレッド別お気に入り数カウント
CREATE INDEX IF NOT EXISTS idx_favorites_thread_id 
ON favorites (thread_id);

-- 4-3. お気に入りトグル用複合インデックス（重複チェック高速化）
CREATE INDEX IF NOT EXISTS idx_favorites_user_thread_unique 
ON favorites (user_fingerprint, thread_id);

-- 確認: ステップ4の結果
SELECT 'STEP 4 完了: FAVORITES' as status, count(*) as index_count
FROM pg_indexes 
WHERE schemaname = 'public' 
    AND tablename = 'favorites' 
    AND indexname LIKE 'idx_favorites_%';

-- ===== STEP 5: 複合インデックス =====
-- より高度な最適化

-- 5-1. カテゴリ＋作成日時の複合インデックス
CREATE INDEX IF NOT EXISTS idx_threads_category_created_at 
ON threads (category, created_at DESC);

-- 確認: ステップ5の結果
SELECT 'STEP 5 完了: 複合インデックス' as status;

-- ===== STEP 6: 統計情報更新 =====

ANALYZE threads;
ANALYZE comments;
ANALYZE likes;
ANALYZE favorites;

-- 最終確認: 全インデックス一覧
SELECT 
    tablename, 
    indexname,
    indexdef
FROM pg_indexes 
WHERE schemaname = 'public' 
    AND tablename IN ('threads', 'comments', 'likes', 'favorites')
    AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

-- ===== 実行方法 =====
/*

段階的実行手順:

1. STEP 1だけを実行 → アプリで速度確認
2. STEP 2だけを実行 → いいね機能の速度確認  
3. STEP 3だけを実行 → コメント表示の速度確認
4. STEP 4だけを実行 → お気に入り機能の速度確認
5. STEP 5とSTEP 6を実行 → 最終最適化

各ステップで体感速度の改善を確認できます！

*/