# 🚀 Study Channel デプロイメントガイド

## 📋 前提条件

1. **Supabaseプロジェクト**が作成済み
2. **データベーステーブル**が作成済み（`threads`, `comments`, `favorites`, `likes`）
3. **環境変数**を設定可能なホスティングサービス

## 🔧 Supabase設定

### 1. RLSポリシーの適用

Supabase Dashboard → SQL Editor で以下を実行：

```sql
-- supabase-rls-policies.sql の内容をコピー&実行
-- このファイルはプロジェクトルートにあります
```

### 2. 環境変数の設定

以下の環境変数が**必須**です：

```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
```

**⚠️ 重要**: `SUPABASE_SERVICE_ROLE_KEY`は削除操作に必須です！

## 🌐 デプロイメント手順

### Vercel へのデプロイ

1. **GitHubリポジトリ連携**
   ```bash
   # Vercel CLI インストール
   npm i -g vercel
   
   # デプロイ
   vercel --prod
   ```

2. **環境変数設定**
   - Vercel Dashboard → Settings → Environment Variables
   - 上記3つの環境変数を追加

3. **関数設定** (vercel.json)
   ```json
   {
     "functions": {
       "api/**/*.js": {
         "runtime": "nodejs18.x"
       }
     }
   }
   ```

### Cloudflare Pages へのデプロイ

1. **ビルド設定**
   ```bash
   # Build Command (空欄でOK - 静的サイト)
   # 
   # Output Directory
   ./
   ```

2. **環境変数設定**
   - Cloudflare Dashboard → Pages → Settings → Environment variables
   - 上記3つの環境変数を追加

3. **Functions設定**
   - `functions/api/` ディレクトリに API ファイルを配置
   - 自動的に Cloudflare Workers として実行

### Netlify へのデプロイ

1. **ビルド設定**
   ```toml
   # netlify.toml
   [build]
   publish = "./"
   
   [[redirects]]
   from = "/api/*"
   to = "/.netlify/functions/:splat"
   status = 200
   ```

2. **環境変数設定**
   - Netlify Dashboard → Site settings → Environment variables
   - 上記3つの環境変数を追加

## 🔍 デプロイ後の確認

### 1. API動作確認

```bash
# お気に入り API テスト
curl https://your-domain.com/api/tables/favorites

# レスポンス例
{"data":[]}
```

### 2. 削除操作テスト

1. **お気に入り追加**
   - ブラウザでスレッドの星マークをクリック
   - 「お気に入りに追加しました」メッセージ確認

2. **お気に入り削除**
   - 同じ星マークを再クリック
   - 「お気に入りから削除しました」メッセージ確認
   - お気に入り一覧からも削除されることを確認

### 3. ログ確認

デプロイ後に削除操作が失敗する場合：

1. **サーバーログ確認**
   - Vercel: Function Logs
   - Cloudflare: Real-time Logs
   - Netlify: Function Logs

2. **よくあるエラー**
   ```
   Missing Supabase environment variables
   → 環境変数が設定されていない
   
   Row Level Security policy violation
   → RLS ポリシーが適用されていない
   
   Insufficient privileges
   → SERVICE_ROLE_KEY が設定されていない
   ```

## 🛠️ トラブルシューティング

### 削除が効かない場合

1. **SERVICE_ROLE_KEY確認**
   ```javascript
   // supabase(true) でサービスロールキーを使用
   const serviceDb = supabase(true);
   ```

2. **RLSポリシー確認**
   ```sql
   -- Supabase で実行
   SELECT * FROM pg_policies WHERE tablename = 'favorites';
   ```

3. **環境変数確認**
   ```bash
   # デプロイ先で環境変数が正しく設定されているか確認
   ```

### パフォーマンス最適化

1. **インデックス追加**
   ```sql
   CREATE INDEX idx_favorites_user_fingerprint ON favorites(user_fingerprint);
   CREATE INDEX idx_favorites_thread_id ON favorites(thread_id);
   CREATE INDEX idx_likes_target ON likes(target_type, target_id);
   ```

2. **接続プーリング**
   - Supabaseの接続プーリングを有効化
   - `{ auth: { persistSession: false } }` を使用

## 🔒 セキュリティ

1. **環境変数保護**
   - SERVICE_ROLE_KEYは絶対にフロントエンドに露出させない
   - サーバーサイドAPIでのみ使用

2. **RLS有効化**
   - すべてのテーブルでRLSを有効化
   - 適切なポリシーを設定

3. **CORS設定**
   - 必要に応じてCORSポリシーを設定
   - 本番ドメインのみ許可

---

## 📞 サポート

問題が発生した場合：
1. ログを確認
2. 環境変数を確認  
3. RLSポリシーを確認
4. GitHubのIssuesで報告