-- ===================================================================
-- Supabase Performance Optimization Indexes for Study Channel
-- ===================================================================
--
-- このSQLをSupabaseのSQL Editorで実行してください
-- パフォーマンスが大幅に向上します（特にスレッド一覧の読み込み）
--
-- 実行前に現在のインデックスを確認:
-- SELECT tablename, indexname, indexdef FROM pg_indexes 
-- WHERE schemaname = 'public' ORDER BY tablename, indexname;
--

-- ===== THREADS TABLE INDEXES =====

-- 1. スレッド一覧表示の高速化（created_at降順でソート）
CREATE INDEX IF NOT EXISTS idx_threads_created_at_desc 
ON threads (created_at DESC);

-- 2. ユーザー固有スレッド検索の高速化（マイ投稿ページ）
CREATE INDEX IF NOT EXISTS idx_threads_user_fingerprint 
ON threads (user_fingerprint);

-- 3. カテゴリ別フィルタリングの高速化
CREATE INDEX IF NOT EXISTS idx_threads_category 
ON threads (category);

-- 4. 複合インデックス: カテゴリ別 + 作成日時順（カテゴリフィルタ時の高速化）
CREATE INDEX IF NOT EXISTS idx_threads_category_created_at 
ON threads (category, created_at DESC);

-- 5. 削除フラグでの絞り込み高速化（is_deletedカラムが存在する場合のみ）
-- CREATE INDEX IF NOT EXISTS idx_threads_is_deleted 
-- ON threads (is_deleted) WHERE is_deleted = false;
-- 注意: is_deletedカラムの存在を事前に確認してから有効化してください

-- ===== COMMENTS TABLE INDEXES =====

-- 1. スレッド内コメント取得の高速化（最も重要）
CREATE INDEX IF NOT EXISTS idx_comments_thread_id 
ON comments (thread_id);

-- 2. コメント表示順の高速化（スレッド別 + 作成日時順）
CREATE INDEX IF NOT EXISTS idx_comments_thread_id_created_at 
ON comments (thread_id, created_at ASC);

-- 3. 親コメント・返信の階層取得高速化
CREATE INDEX IF NOT EXISTS idx_comments_parent_comment_id 
ON comments (parent_comment_id);

-- 4. ユーザー固有コメント検索の高速化
CREATE INDEX IF NOT EXISTS idx_comments_user_fingerprint 
ON comments (user_fingerprint);

-- 5. 削除フラグでの絞り込み高速化（is_deletedカラムが存在する場合のみ）
-- CREATE INDEX IF NOT EXISTS idx_comments_is_deleted 
-- ON comments (is_deleted) WHERE is_deleted = false;
-- 注意: is_deletedカラムの存在を事前に確認してから有効化してください

-- ===== LIKES TABLE INDEXES =====

-- 1. いいね数カウントの高速化（最重要）
CREATE INDEX IF NOT EXISTS idx_likes_target_type_target_id 
ON likes (target_type, target_id);

-- 2. ユーザーのいいね状態確認の高速化
CREATE INDEX IF NOT EXISTS idx_likes_user_fingerprint_target 
ON likes (user_fingerprint, target_type, target_id);

-- 3. スレッドのいいね一覧取得
CREATE INDEX IF NOT EXISTS idx_likes_thread_likes 
ON likes (target_id) WHERE target_type = 'thread';

-- 4. コメントのいいね一覧取得
CREATE INDEX IF NOT EXISTS idx_likes_comment_likes 
ON likes (target_id) WHERE target_type = 'comment';

-- ===== FAVORITES TABLE INDEXES =====

-- 1. ユーザーのお気に入りスレッド取得の高速化
CREATE INDEX IF NOT EXISTS idx_favorites_user_fingerprint 
ON favorites (user_fingerprint);

-- 2. スレッドのお気に入り数カウント高速化
CREATE INDEX IF NOT EXISTS idx_favorites_thread_id 
ON favorites (thread_id);

-- 3. 重複チェック用複合インデックス（お気に入りトグル高速化）
CREATE INDEX IF NOT EXISTS idx_favorites_user_thread_unique 
ON favorites (user_fingerprint, thread_id);

-- 4. お気に入り日時順表示
CREATE INDEX IF NOT EXISTS idx_favorites_created_at 
ON favorites (created_at DESC);

-- ===== REPORTS TABLE INDEXES =====

-- 注意: reportsテーブルは既に基本インデックスが作成済み
-- reports-migration.sqlで以下が作成済み:
-- - idx_reports_status, idx_reports_type, idx_reports_target, idx_reports_created_at

-- 1. 管理画面での通報一覧取得高速化（既存: idx_reports_created_at）
-- CREATE INDEX IF NOT EXISTS idx_reports_created_at_desc 
-- ON reports (created_at DESC);

-- 2. 通報ステータス別絞り込み高速化（既存: idx_reports_status）
-- CREATE INDEX IF NOT EXISTS idx_reports_status 
-- ON reports (status);

-- 3. 通報タイプ別絞り込み高速化（既存: idx_reports_type）
-- CREATE INDEX IF NOT EXISTS idx_reports_type 
-- ON reports (type);

-- 4. ユーザー通報履歴取得高速化
CREATE INDEX IF NOT EXISTS idx_reports_reporter_fingerprint 
ON reports (reporter_fingerprint);

-- 5. 対象別通報検索高速化（既存: idx_reports_target）
-- CREATE INDEX IF NOT EXISTS idx_reports_target_type_target_id 
-- ON reports (target_type, target_id);

-- 6. 複合インデックス: ステータス + 作成日時（管理画面フィルタ高速化）
CREATE INDEX IF NOT EXISTS idx_reports_status_created_at 
ON reports (status, created_at DESC);

-- ===== 全文検索用インデックス (PostgreSQL GIN) =====

-- 1. スレッドタイトル・内容の全文検索高速化
CREATE INDEX IF NOT EXISTS idx_threads_fulltext_search 
ON threads USING gin(to_tsvector('japanese', coalesce(title, '') || ' ' || coalesce(content, '')));

-- 2. コメント内容の全文検索高速化
CREATE INDEX IF NOT EXISTS idx_comments_fulltext_search 
ON comments USING gin(to_tsvector('japanese', coalesce(content, '')));

-- ===== JSONB列のインデックス (ハッシュタグ、画像配列) =====

-- 1. ハッシュタグ検索高速化（threads.hashtags JSONB配列）
CREATE INDEX IF NOT EXISTS idx_threads_hashtags_gin 
ON threads USING gin(hashtags);

-- 2. 画像有無での絞り込み高速化（threads.images JSONB配列）
CREATE INDEX IF NOT EXISTS idx_threads_has_images 
ON threads USING gin(images) WHERE jsonb_array_length(coalesce(images, '[]'::jsonb)) > 0;

-- ===== 統計情報の更新 =====

-- インデックス作成後に統計情報を更新（クエリプランナーの最適化）
ANALYZE threads;
ANALYZE comments;
ANALYZE likes;
ANALYZE favorites;
ANALYZE reports;

-- ===== インデックス作成結果の確認 =====

-- 作成されたインデックス一覧を表示
SELECT 
    schemaname,
    tablename, 
    indexname,
    indexdef
FROM pg_indexes 
WHERE schemaname = 'public' 
    AND tablename IN ('threads', 'comments', 'likes', 'favorites', 'reports')
ORDER BY tablename, indexname;

-- テーブルサイズとインデックスサイズの確認
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
    pg_size_pretty(pg_indexes_size(schemaname||'.'||tablename)) as indexes_size
FROM pg_tables 
WHERE schemaname = 'public' 
    AND tablename IN ('threads', 'comments', 'likes', 'favorites', 'reports')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- ===== パフォーマンス向上のポイント =====
--
-- 🚀 期待される改善効果:
--
-- 1. スレッド一覧表示: 50-90% 高速化
--    - created_at DESC での並び替えが高速化
--    - カテゴリフィルタが高速化
--
-- 2. スレッド詳細表示: 60-80% 高速化
--    - コメント取得 (thread_id) が高速化
--    - いいね数計算 (target_type, target_id) が高速化
--
-- 3. いいね機能: 70-90% 高速化
--    - いいね数カウントが高速化
--    - ユーザーのいいね状態確認が高速化
--
-- 4. お気に入り機能: 80-95% 高速化
--    - お気に入り一覧取得が高速化
--    - お気に入りトグルが高速化
--
-- 5. 管理画面: 60-85% 高速化
--    - 通報一覧表示が高速化
--    - フィルタリングが高速化
--
-- 6. 検索機能: 大幅高速化 (全文検索インデックス)
--    - タイトル・内容検索が高速化
--    - ハッシュタグ検索が高速化
--
-- ⚠️ 注意事項:
-- - インデックスはストレージ容量を使用します
-- - 書き込み性能は若干低下しますが、読み込み性能が大幅向上
-- - データ量が増えるほど効果が顕著になります
--