-- Reports and Delete Requests Migration
-- 通報・削除依頼テーブルの作成とRLSポリシー設定

-- 1. reportsテーブル作成
CREATE TABLE IF NOT EXISTS reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('report', 'delete_request')),
  target_type TEXT NOT NULL CHECK(target_type IN ('thread', 'comment', 'reply')),
  target_id UUID NOT NULL,
  reporter_fingerprint TEXT, -- 通報者のフィンガープリント（匿名の場合null）
  reporter_name TEXT DEFAULT '匿名', -- 通報者の表示名
  reason TEXT NOT NULL CHECK(reason IN ('spam', 'harassment', 'inappropriate', 'false_info', 'other')),
  description TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
  admin_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. インデックス作成
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(type);
CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC);

-- 3. RLSポリシー設定
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- 誰でも通報・削除依頼を作成できる
CREATE POLICY "Anyone can insert reports" ON reports
    FOR INSERT 
    TO public 
    WITH CHECK (true);

-- 誰でも通報・削除依頼を読み取りできる（管理者機能で使用）
CREATE POLICY "Anyone can read reports" ON reports
    FOR SELECT 
    TO public 
    USING (true);

-- 誰でも通報・削除依頼を更新できる（管理者機能で使用）
CREATE POLICY "Anyone can update reports" ON reports
    FOR UPDATE 
    TO public 
    USING (true);

-- 誰でも通報・削除依頼を削除できる（管理者機能で使用）
CREATE POLICY "Anyone can delete reports" ON reports
    FOR DELETE 
    TO public 
    USING (true);

-- 4. 更新日時の自動更新トリガー
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_reports_updated_at BEFORE UPDATE ON reports
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- 5. 通報・削除依頼の統計を取得するRPC関数
CREATE OR REPLACE FUNCTION get_reports_stats()
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'total', COUNT(*),
        'pending', COUNT(*) FILTER (WHERE status = 'pending'),
        'approved', COUNT(*) FILTER (WHERE status = 'approved'),
        'rejected', COUNT(*) FILTER (WHERE status = 'rejected'),
        'by_type', json_build_object(
            'reports', COUNT(*) FILTER (WHERE type = 'report'),
            'delete_requests', COUNT(*) FILTER (WHERE type = 'delete_request')
        )
    ) INTO result
    FROM reports;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. 権限設定
GRANT EXECUTE ON FUNCTION get_reports_stats() TO anon;
GRANT EXECUTE ON FUNCTION get_reports_stats() TO authenticated;