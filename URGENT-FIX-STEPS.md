# 🚨 URGENT: 削除機能修正手順

## 🎯 現在のエラー
1. `Could not find the function public.admin_soft_delete_thread_text` - 関数が存在しない
2. `operator does not exist: uuid = text` - 型不一致エラー

## ⚡ 緊急修正手順（5分で完了）

### ステップ1: 関数状況確認（オプション）
**Supabase SQL Editor で実行:**
```sql
-- supabase-function-status-check.sql の内容をコピー&ペースト
-- 現在の関数の状況を確認できます
```

### ステップ2: 完全修正（必須）
**Supabase SQL Editor で実行:**
```sql
-- supabase-complete-cleanup-and-fix.sql の内容を全てコピー&ペースト
-- これで完全に修正されます！
```

### ステップ3: 動作確認
1. ✅ 管理画面でスレッド削除を試行
2. ✅ エラーが解消されることを確認
3. ✅ カスケード削除が動作することを確認

## 🔧 修正内容

### 作成される関数:
1. **`admin_soft_delete_thread(UUID)`** - ネイティブUUID関数
2. **`admin_soft_delete_thread_text(TEXT)`** - API用ラッパー関数
3. **`admin_soft_delete_comment(UUID)`** - ネイティブUUID関数
4. **`admin_soft_delete_comment_text(TEXT)`** - API用ラッパー関数

### 型変換の処理:
- ✅ `TEXT → UUID` 変換（入力時）
- ✅ `UUID → TEXT` 変換（比較時）
- ✅ エラーハンドリング付き

### カスケード削除対象:
- ✅ 関連コメント・返信 (ソフト削除)
- ✅ いいね・お気に入り (物理削除)  
- ✅ 通報 (ステータス更新)

## 🎊 実行後の期待結果
- ❌ エラー解消
- ✅ 削除機能正常動作
- ✅ カスケード削除実装完了

**所要時間: 約2-3分で完全修正！**