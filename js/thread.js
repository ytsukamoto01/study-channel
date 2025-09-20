// ================================
// thread.js（完成版：親のみ表示＋返信は別ページ）
// ================================

// グローバル
let currentThreadId = null;
let currentThread = null;
let userFingerprint = null;

// 自分のコメントかどうかを判定する関数
function isMyComment(comment) {
    if (!userFingerprint || !comment.user_fingerprint) {
        return false;
    }
    return comment.user_fingerprint === userFingerprint;
}

// エラーページ表示関数
function showErrorPage(message) {
  const container = document.querySelector('main .container');
  if (container) {
    container.innerHTML = `
      <div class="error-page">
        <div class="error-content">
          <i class="fas fa-exclamation-triangle error-icon"></i>
          <h2>エラーが発生しました</h2>
          <p class="error-message">${escapeHtml(message)}</p>
          <div class="error-actions">
            <button onclick="location.reload()" class="retry-btn">
              <i class="fas fa-refresh"></i> 再試行
            </button>
            <button onclick="location.href='/'" class="home-btn">
              <i class="fas fa-home"></i> ホームに戻る
            </button>
          </div>
        </div>
      </div>
      <style>
        .error-page {
          text-align: center;
          padding: 60px 20px;
        }
        .error-content {
          max-width: 500px;
          margin: 0 auto;
        }
        .error-icon {
          font-size: 4rem;
          color: #f44336;
          margin-bottom: 20px;
        }
        .error-message {
          margin: 20px 0;
          color: #666;
          line-height: 1.6;
          white-space: pre-line;
        }
        .error-actions {
          margin-top: 30px;
        }
        .retry-btn, .home-btn {
          margin: 0 10px;
          padding: 12px 24px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 16px;
        }
        .retry-btn {
          background: #2196f3;
          color: white;
        }
        .home-btn {
          background: #666;
          color: white;
        }
        .retry-btn:hover, .home-btn:hover {
          opacity: 0.9;
        }
      </style>
    `;
  }
}

// 初期化
document.addEventListener('DOMContentLoaded', function () {
  try {
    userFingerprint = generateUserFingerprint();
  } catch (_) {}

  const params = new URLSearchParams(location.search);
  const threadId = params.get('id');

  if (!threadId) {
    showErrorPage('スレッドIDが指定されていません');
    return;
  }

  currentThreadId = threadId;
  setupEventListeners();
  loadThreadDetail(threadId);

(function initAuthorToggle() {
  const radios = document.querySelectorAll('input[name="commentAuthorType"]');
  const apply = () => {
    const anon = document.querySelector('input[name="commentAuthorType"][value="anonymous"]');
    const group = document.getElementById('commentCustomNameGroup');
    if (!group) return;
    if (anon && anon.checked) {
      group.style.display = 'none';
    } else {
      group.style.display = 'inline-block';
      document.getElementById('commentCustomAuthorName')?.focus();
    }
  };
  radios.forEach(r => r.addEventListener('change', apply));
  apply();
})();
  
});

// イベント
function setupEventListeners() {
  const scrollBtn = document.getElementById('scrollToCommentBtn');
  if (scrollBtn) scrollBtn.addEventListener('click', scrollToCommentForm);

  const commentForm = document.getElementById('commentForm');
  if (commentForm) commentForm.addEventListener('submit', handleCommentSubmit);
}

// 上部「コメントする」→ 最下部フォームへ
function scrollToCommentForm() {
  const target = document.getElementById('commentFormSection');
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  setTimeout(() => document.getElementById('commentContent')?.focus(), 250);
}

// スレッド詳細読み込み
async function loadThreadDetail(threadId) {
  try {
    console.log('=== FRONTEND: Loading thread detail ===');
    console.log('Thread ID:', threadId);
    console.log('API URL:', `/api/tables/threads/${threadId}`);
    
    const response = await apiCall(`/api/tables/threads/${threadId}`);
    console.log('=== FRONTEND: API Response received ===');
    console.log('Full API Response:', response);
    console.log('Response status:', response.status);
    console.log('Thread data received:', response.data);
    console.log('Thread like_count from API:', response.data?.like_count);
    console.log('Thread object keys:', Object.keys(response.data || {}));
    
    currentThread = response.data;
    if (!currentThread || !currentThread.id) {
      console.error('Invalid thread data received:', currentThread);
      throw new Error('スレッドが見つかりません');
    }

    console.log('Thread loaded successfully:', currentThread.title);

    // 正規化
    currentThread.hashtags = normalizeHashtags(currentThread.hashtags);
    currentThread.images = Array.isArray(currentThread.images) ? currentThread.images : [];

    // 表示
    displayThreadDetail(currentThread);

    // コメント（親＋返信件数の集計）
    await loadComments(threadId);

    // お気に入り状態
    await checkFavoriteStatus(threadId);
  } catch (e) {
    console.error('Error loading thread detail:', e);
    console.error('Error stack:', e.stack);
    
    let errorMessage = 'スレッドの読み込みに失敗しました';
    if (e.message) {
      errorMessage += ': ' + e.message;
    }
    
    // APIエラーの詳細を表示
    if (e.message.includes('API')) {
      errorMessage += '\n\nAPI接続に問題があります。しばらく待ってから再試行してください。';
    }
    
    showErrorPage(errorMessage);
  }
}

// スレッド表示
function displayThreadDetail(thread) {
  console.log('displayThreadDetail called with thread:', thread);
  console.log('Thread like_count value:', thread.like_count);
  
  document.getElementById('threadTitle').textContent = thread.title;
  document.getElementById('threadAuthor').innerHTML = formatAuthorName(thread.author_name);
  document.getElementById('threadDate').textContent = getRelativeTime(new Date(thread.created_at).getTime());
  document.getElementById('threadContent').textContent = thread.content;
  
  // いいね数の設定を強化
  const likeCountElement = document.getElementById('threadLikeCount');
  const likeCount = thread.like_count || 0;
  console.log('Setting thread like count to:', likeCount);
  
  if (likeCountElement) {
    likeCountElement.textContent = likeCount;
    console.log('Thread like count element updated. Current text:', likeCountElement.textContent);
  } else {
    console.error('threadLikeCount element not found!');
  }

  const categoryBadge = document.getElementById('threadCategoryBadge');
  if (categoryBadge) {
    categoryBadge.textContent = thread.category;
    categoryBadge.className = `thread-category category-${thread.category}`;
  }

  const subBadge = document.getElementById('threadSubcategoryBadge');
  if (subBadge) {
    if (thread.subcategory) {
      subBadge.textContent = thread.subcategory;
      subBadge.style.display = 'inline-block';
    } else {
      subBadge.style.display = 'none';
    }
  }

  const hashtagsDisplay = document.getElementById('threadHashtagsDisplay');
  if (hashtagsDisplay && Array.isArray(thread.hashtags) && thread.hashtags.length > 0) {
    hashtagsDisplay.innerHTML = thread.hashtags.map(t => `<span class="thread-hashtag">#${escapeHtml(t)}</span>`).join('');
  }

  const imagesDisplay = document.getElementById('threadImagesDisplay');
  if (imagesDisplay) {
    if (Array.isArray(thread.images) && thread.images.length > 0) {
      imagesDisplay.innerHTML = `
        <div class="image-gallery">
          ${thread.images.map((url, i) => `
            <img src="${url}" alt="スレッド画像${i + 1}" class="gallery-image" onclick="openImageModal('${url}')">
          `).join('')}
        </div>`;
      imagesDisplay.style.display = 'block';
    } else {
      imagesDisplay.style.display = 'none';
    }
  }

  // 通報リンクを追加（自分のスレッドでない場合）
  const opPost = document.querySelector('.op-post');
  if (opPost && !isMyThread(thread)) {
    // 既存の通報リンクを削除（重複を避ける）
    const existingReportLink = opPost.querySelector('.thread-report-link');
    if (existingReportLink) {
      existingReportLink.remove();
    }
    
    // 通報リンクを作成
    const reportLink = document.createElement('a');
    reportLink.className = 'thread-report-link';
    reportLink.href = '#';
    reportLink.textContent = '[通報]';
    reportLink.title = '通報';
    reportLink.onclick = (e) => {
      e.preventDefault();
      reportContent('thread', thread.id, thread.title);
      return false;
    };
    
    // OP投稿の右上に追加
    opPost.appendChild(reportLink);
  }

  document.title = `${thread.title} - すたでぃちゃんねる`;
}

// 自分のスレッドかどうかを判定する関数
function isMyThread(thread) {
    if (!userFingerprint || !thread.user_fingerprint) {
        return false;
    }
    return thread.user_fingerprint === userFingerprint;
}

// コメントの削除依頼
async function requestDeleteComment(commentId) {
  if (!confirm('このコメントの削除依頼を送信しますか？\n\n削除依頼は管理者が確認し、適切と判断された場合に削除されます。')) {
    return;
  }

  try {
    // 削除理由を選択させる
    const reason = await showReasonDialog('delete_request');
    if (!reason) return;

    const requestData = {
      type: 'delete_request',
      target_type: 'comment',
      target_id: commentId,
      reporter_fingerprint: userFingerprint,
      reporter_name: '投稿者本人',
      reason: reason.reason,
      description: reason.description
    };

    const response = await fetch('/api/reports', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || '削除依頼の送信に失敗しました');
    }

    const result = await response.json();
    showMessage(result.message || '削除依頼を送信しました', 'success');

  } catch (error) {
    console.error('削除依頼エラー:', error);
    showMessage(error.message || '削除依頼の送信に失敗しました', 'error');
  }
}

// コメント読み込み（親のみ表示・古い順、件数は親＋返信の合計）
async function loadComments(threadId) {
  try {
    console.log('Loading comments for thread:', threadId);
    
    // APIパスを正規化（/api/プレフィックスを追加）
    const json = await apiCall(`/api/tables/comments?thread_id=${threadId}&sort=created_at&order=asc&limit=1000`);
    console.log('Comments API response:', json);
    
    const all = json?.data || [];
    console.log('Total comments loaded:', all.length);

    const parents = all.filter(c => !c.parent_comment_id);
    const children = all.filter(c => c.parent_comment_id);
    
    console.log('Parent comments:', parents.length);
    console.log('Reply comments:', children.length);

    // 親に返信件数を紐付け（表示上は件数のみ。本文は別ページ）
    const repliesByParent = {};
    for (const r of children) {
      repliesByParent[r.parent_comment_id] = (repliesByParent[r.parent_comment_id] || 0) + 1;
    }
    parents.forEach(p => { p.reply_count_local = repliesByParent[p.id] || 0; });

    // コメント総数（親＋返信）
    const totalCount = all.length;
    const countEl = document.getElementById('commentCount');
    if (countEl) countEl.textContent = String(totalCount);

    // 親のみ表示（古い順）
    parents.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    displayComments(parents);
    
    console.log('Comments display completed');
  } catch (e) {
    console.error('コメントの読み込みエラー:', e);
    // エラー時は空のコメントリストを表示
    displayComments([]);
  }
}

// 親コメント一覧（返信は別ページリンク）
function displayComments(parents) {
  const list = document.getElementById('commentsList');
  if (!list) return;

  const fragments = [];
  parents.forEach((parentComment, index) => {
    fragments.push(renderParentItem(parentComment));

    if ((index + 1) % 5 === 0) {
      fragments.push(renderMobileInlineAd(index + 1));
    }
  });

  list.innerHTML = fragments.join('');
  document.dispatchEvent(new Event('ads:refresh'));
}

function renderParentItem(c) {
  const numberHtml = c.comment_number != null ? `${c.comment_number}.` : '';
  const authorHtml = escapeHtml(c.author_name || '匿名');
  const dateHtml = getRelativeTime(new Date(c.created_at).getTime());
  const contentHtml = escapeHtml(c.content || '');
  const likeCount = c.like_count || 0;
  const repliesCount = c.reply_count_local || 0;

  // 画像表示
  const imagesHtml = (Array.isArray(c.images) && c.images.length > 0) 
    ? `<div class="comment-images">
         <div class="image-gallery">
           ${c.images.map((imageUrl, index) => `
             <img src="${imageUrl}" alt="コメント画像${index + 1}" class="gallery-image" 
                  onclick="openImageModal('${imageUrl}')">
           `).join('')}
         </div>
       </div>`
    : '';

  // 「返信する」→ replies.html へ遷移＆フォームへスクロール
  const replyLink = `replies.html?thread=${encodeURIComponent(currentThreadId)}&parent=${encodeURIComponent(c.id)}#replyFormSection`;

  // 「x件の返信」リンク（返信がある場合のみ）
  const repliesBlock = repliesCount > 0
    ? `<div class="replies-link">
         <a href="replies.html?thread=${encodeURIComponent(currentThreadId)}&parent=${encodeURIComponent(c.id)}">
           ${repliesCount}件の返信
         </a>
       </div>`
    : '';

  return `
    <div class="comment-item" data-comment-id="${c.id}">
      <div class="comment-header">
        <div class="comment-header-left">
          <span class="comment-number">${numberHtml}</span>
          <span class="comment-author">${authorHtml}</span>
          <span class="date">${dateHtml}</span>
        </div>
        <div class="comment-moderation-links">
          ${isMyComment(c) ? `
          <a href="#" onclick="requestDeleteComment('${c.id}'); return false;" class="delete-request-link" title="削除依頼">[削除依頼]</a>
          ` : `
          <a href="#" onclick="reportContent('comment', '${c.id}'); return false;" class="report-link" title="通報">[通報]</a>
          `}
        </div>
      </div>
      <div class="comment-content">${contentHtml}</div>
      ${imagesHtml}
      <div class="comment-actions">
        <button class="comment-reply-btn" onclick="location.href='${replyLink}'">
          <i class="fas fa-reply"></i> 返信
        </button>
        <button class="comment-like-btn" onclick="likeThisComment('${c.id}')">
          <i class="fas fa-heart"></i> <span class="comment-like-count">${likeCount}</span>
        </button>
      </div>
      ${repliesBlock}
    </div>
  `;
}

function renderMobileInlineAd(index) {
  return `
    <div class="mobile-inline-ad" data-inline-ad-index="${index}">
      <ins class="adsbygoogle"
           style="display:block"
           data-ad-client="ca-pub-5122489446866147"
           data-ad-slot="0"
           data-ad-format="auto"
           data-full-width-responsive="true"></ins>
    </div>
  `;
}

// 親コメントに対する「いいね」
async function likeThisComment(commentId) {
  try {
    if (!userFingerprint) userFingerprint = generateUserFingerprint();

    // 既に「いいね」しているか
    const likes = await apiCall('/api/tables/likes');
    const exists = (likes.data || []).some(l =>
      l.target_type === 'comment' && l.target_id === commentId && l.user_fingerprint === userFingerprint
    );
    if (exists) {
      showErrorMessage('このコメントには既に「いいね」しています');
      return;
    }

    // 追加
    await apiCall('/api/tables/likes', {
      method: 'POST',
      body: JSON.stringify({
        target_type: 'comment',
        target_id: commentId,
        user_fingerprint: userFingerprint
      })
    });

    // 即時反映 - より確実にUI更新
    const commentElement = document.querySelector(`[data-comment-id="${commentId}"]`);
    if (commentElement) {
      const likeButton = commentElement.querySelector('.comment-like-btn');
      const likeCountSpan = commentElement.querySelector('.comment-like-count');
      
      if (likeCountSpan) {
        const currentCount = parseInt(likeCountSpan.textContent || '0', 10);
        likeCountSpan.textContent = String(currentCount + 1);
      }
      
      // ボタンのスタイルも変更してフィードバックを強化
      if (likeButton) {
        likeButton.style.transform = 'scale(1.1)';
        setTimeout(() => {
          likeButton.style.transform = 'scale(1)';
        }, 150);
      }
    }
    
    showSuccessMessage('いいねしました！');
  } catch (e) {
    console.error(e);
    showErrorMessage('いいねに失敗しました');
  }
}

// ====== 下部の「スレッドにコメントを投稿」 ======
// コメント投稿
async function handleCommentSubmit(e) {
  e.preventDefault();
  const content = document.getElementById('commentContent').value.trim();
  
  // 画像データを取得してバリデーション
  const images = (typeof uploadedImages !== 'undefined' && Array.isArray(uploadedImages.comment)) 
    ? uploadedImages.comment 
    : [];
  
  if (!content && images.length === 0) {
    return showMessage('コメント内容または画像を入力してください', 'error');
  }

  const authorRadio = document.querySelector('input[name="commentAuthorType"]:checked');
  const authorName = authorRadio?.value === 'custom'
    ? document.getElementById('commentCustomAuthorName').value || '匿名'
    : '匿名';

  try {
    await apiCall('/api/tables/comments', {
      method: 'POST',
      body: JSON.stringify({
        thread_id: currentThreadId,
        content,
        images: images,
        author_name: authorName,
        user_fingerprint: userFingerprint
      })
    });
    
    // 即座にコメント数を更新
    const commentCountElement = document.getElementById('commentCount');
    if (commentCountElement) {
      const currentCount = parseInt(commentCountElement.textContent || '0');
      commentCountElement.textContent = currentCount + 1;
    }
    
    document.getElementById('commentContent').value = '';
    
    // 画像データをクリア
    if (typeof uploadedImages !== 'undefined') {
      uploadedImages.comment = [];
      if (typeof updateImagePreview === 'function') {
        updateImagePreview('comment');
      }
    }
    
    showSuccessMessage('コメントを投稿しました！');
    
    // コメント一覧を再読み込み
    await loadComments(currentThreadId);
  } catch (e) {
    handleApiError(e, 'コメント投稿に失敗しました');
  }
}

// いいね（スレッド）
async function likeThread() {
  try {
    if (!userFingerprint) userFingerprint = generateUserFingerprint();

    // 既にいいねしているかチェック
    const likes = await apiCall('/api/tables/likes');
    const existingLike = (likes.data || []).find(like => 
        like.target_id === currentThreadId && 
        like.target_type === 'thread' && 
        like.user_fingerprint === userFingerprint
    );
    
    if (existingLike) {
        showErrorMessage('既にいいねしています');
        return;
    }

    await apiCall('/api/tables/likes', {
      method: 'POST',
      body: JSON.stringify({
        target_type: 'thread',
        target_id: currentThreadId,
        user_fingerprint: userFingerprint
      })
    });
    
    // 即座にUIを更新
    const threadLikeCountElement = document.getElementById('threadLikeCount');
    if (threadLikeCountElement) {
      const currentCount = parseInt(threadLikeCountElement.textContent || '0');
      const newCount = currentCount + 1;
      threadLikeCountElement.textContent = newCount;
      console.log('Thread like count updated from', currentCount, 'to', newCount);
      
      // ボタンにアニメーション効果も追加
      const likeButton = threadLikeCountElement.closest('.like-btn');
      if (likeButton) {
        likeButton.style.transform = 'scale(1.1)';
        setTimeout(() => {
          likeButton.style.transform = 'scale(1)';
        }, 150);
      }
    } else {
      console.error('threadLikeCount element not found during like update!');
    }
    
    showSuccessMessage('いいねしました！');
  } catch (e) {
    handleApiError(e, 'いいねに失敗しました');
  }
}


// 投稿者名の取得（下部フォーム）
function getCommentAuthorName() {
  const selectedType = document.querySelector('input[name="commentAuthorType"]:checked');
  if (!selectedType || selectedType.value === 'anonymous') return '匿名';
  const el = document.getElementById('commentCustomAuthorName');
  const v = el ? el.value.trim() : '';
  return v || '匿名';
}

// フォームリセット
function resetCommentForm() {
  const ta = document.getElementById('commentContent');
  if (ta) ta.value = '';

  if (typeof uploadedImages !== 'undefined') {
    uploadedImages.comment = [];
    if (typeof updateImagePreview === 'function') updateImagePreview('comment');
  }

  const anonymousRadio = document.querySelector('input[name="commentAuthorType"][value="anonymous"]');
  if (anonymousRadio) anonymousRadio.checked = true;
  toggleCommentAuthorNameInput();
  const customNameInput = document.getElementById('commentCustomAuthorName');
  if (customNameInput) customNameInput.value = '';
}

// 記名/匿名トグル
function toggleCommentAuthorNameInput() {
  const anonymousRadio = document.querySelector('input[name="commentAuthorType"][value="anonymous"]');
  const customNameGroup = document.getElementById('commentCustomNameGroup');
  if (!anonymousRadio || !customNameGroup) return;
  if (anonymousRadio.checked) {
    customNameGroup.style.display = 'none';
  } else {
    customNameGroup.style.display = 'inline-block';
    document.getElementById('commentCustomAuthorName')?.focus();
  }
}

// 返信数を更新（統計更新は無効化されました）
async function updateThreadReplyCount(threadId, replyCount) {
  // この機能は無効化されました - 統計情報は手動更新されません
  console.log('統計更新は無効化されました:', { threadId, replyCount });
}

// ====== お気に入り ======
async function checkFavoriteStatus(threadId) {
  try {
    const fp = generateUserFingerprint();
    const res = await fetch('/api/tables/favorites');
    if (!res.ok) return updateFavoriteButton(false);
    const json = await res.json();
    const favorites = json.data || [];
    const isFav = favorites.some(f => f.thread_id === threadId && f.user_fingerprint === fp);
    updateFavoriteButton(isFav);
  } catch (e) {
    console.warn('お気に入り状態の確認エラー:', e);
    updateFavoriteButton(false);
  }
}
function updateFavoriteButton(isFavorite) {
  const btn = document.getElementById('favoriteBtn');
  if (!btn) return;
  if (isFavorite) {
    btn.innerHTML = '<i class="fas fa-star"></i> お気に入り済み';
    btn.classList.add('favorited');
  } else {
    btn.innerHTML = '<i class="far fa-star"></i> お気に入り';
    btn.classList.remove('favorited');
  }
}
async function toggleFavorite() {
  if (!currentThreadId) return;
  try {
    const fp = generateUserFingerprint();
    
    // 新しいtoggle APIを使用
    const toggleResponse = await fetch('/api/favorites/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        threadId: currentThreadId, 
        userFingerprint: fp 
      })
    });
    
    if (!toggleResponse.ok) {
      const errorData = await toggleResponse.json().catch(() => ({}));
      throw new Error(errorData.error || 'お気に入り操作に失敗しました');
    }
    
    const result = await toggleResponse.json();
    console.log('トグル結果:', result);
    
    if (result.action === 'favorited') {
      updateFavoriteButton(true);
      showSuccessMessage('お気に入りに追加しました');
    } else if (result.action === 'unfavorited') {
      updateFavoriteButton(false);
      showSuccessMessage('お気に入りから削除しました');
    }
  } catch (e) {
    console.error('お気に入り操作エラー:', e);
    handleApiError(e, 'お気に入りの更新に失敗しました');
  }
}

// ====== 簡易メッセージ（既存UIに合わせて） ======
function showSuccessMessage(message) {
  const d = document.createElement('div');
  d.className = 'success-message';
  d.textContent = message;
  d.style.cssText = `
    position: fixed; top: 20px; right: 20px;
    background-color: #28a745; color: #fff;
    padding: 10px 20px; border-radius: 6px; z-index: 1000;
    animation: fadeInOut 3s ease forwards;
  `;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 3000);
}
function showErrorMessage(message) {
  const d = document.createElement('div');
  d.className = 'error-message';
  d.textContent = message;
  d.style.cssText = `
    position: fixed; top: 20px; right: 20px;
    background-color: #dc3545; color: #fff;
    padding: 10px 20px; border-radius: 6px; z-index: 1000;
    animation: fadeInOut 3s ease forwards;
  `;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 3000);
}
// アニメーション（重複定義ガード）
(() => {
  if (document.getElementById('fadeInOutKeyframes')) return;
  const style = document.createElement('style');
  style.id = 'fadeInOutKeyframes';
  style.textContent = `
  @keyframes fadeInOut {
    0%{opacity:0; transform: translateX(100px)}
    15%{opacity:1; transform: translateX(0)}
    85%{opacity:1; transform: translateX(0)}
    100%{opacity:0; transform: translateX(100px)}
  }`;
  document.head.appendChild(style);
})();


