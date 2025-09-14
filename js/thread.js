// スレッド詳細ページのJavaScript

let currentThreadId = null;
let userFingerprint = null;
let currentThread = null;
let currentReplyParentId = null;

function showReplyPopup(commentId) {
  // 既存ポップアップがあれば削除
  document.querySelector('.reply-popup')?.remove();
  currentReplyParentId = commentId;

  const target = document.querySelector(`[data-comment-id="${commentId}"]`);
  if (!target) return;

  const popup = document.createElement('div');
  popup.className = 'reply-popup';
  popup.innerHTML = `
    <textarea id="replyContent" rows="3" placeholder="返信を入力..."></textarea>
    <div class="reply-popup-actions">
      <button id="cancelReplyBtn">キャンセル</button>
      <button id="sendReplyBtn"><i class="fas fa-paper-plane"></i> 送信</button>
    </div>
  `;
  target.insertAdjacentElement('afterend', popup);

  document.getElementById('cancelReplyBtn').onclick = () => popup.remove();
  document.getElementById('sendReplyBtn').onclick = sendReply;
}

async function sendReply() {
  const ta = document.getElementById('replyContent');
  const content = (ta?.value || '').trim();
  if (!content || !currentReplyParentId) return;

  const body = {
    thread_id: currentThreadId,
    content,
    author_name: getCommentAuthorName(),
    like_count: 0,
    comment_number: 0,           // サーバ側で採番してもOK
    parent_comment_id: currentReplyParentId
  };

  const res = await fetch('tables/comments', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    alert('返信の投稿に失敗しました');
    return;
  }

  document.querySelector('.reply-popup')?.remove();
  currentReplyParentId = null;
  await loadComments(currentThreadId);
}

// ページ読み込み時の初期化
document.addEventListener('DOMContentLoaded', function() {
  try {
    userFingerprint = generateUserFingerprint();
  } catch (_) {}

  // URLからスレッドIDを取得
  const urlParams = new URLSearchParams(window.location.search);
  const threadId = urlParams.get('id');
  if (threadId) {
    currentThreadId = threadId;
    loadThreadDetail(threadId);
    setupEventListeners();
  } else {
    console.error('スレッドIDが見つかりません');
    showErrorPage('スレッドIDが指定されていません');
  }
});

// イベントリスナーの設定
function setupEventListeners() {
    // コメントフォーム
    const commentForm = document.getElementById('commentForm');
    const scrollBtn = document.getElementById('scrollToCommentBtn');
    if (scrollBtn) scrollBtn.addEventListener('click', scrollToCommentForm);
    if (commentForm) {
        commentForm.addEventListener('submit', handleCommentSubmit);
    }
}

// 追加：上部ボタン→最下部フォームへ
function scrollToCommentForm() {
  const target = document.getElementById('commentFormSection');
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // 少し待ってからテキストエリアにフォーカス
    setTimeout(() => {
      const ta = document.getElementById('commentContent');
      if (ta) ta.focus();
    }, 300);
  }
}


// スレッド詳細を読み込み
async function loadThreadDetail(threadId) {
    try {
        console.log('スレッド詳細読み込み開始 - ID:', threadId);
        
        if (!threadId) {
            throw new Error('スレッドIDが指定されていません');
        }
        
        // スレッド詳細を取得
        console.log('スレッド詳細取得開始:', threadId);
        currentThread = await apiCall(`tables/threads/${threadId}`);
        console.log('取得したスレッド:', currentThread);
        
        // ハッシュタグを配列に正規化
        currentThread.hashtags = normalizeHashtags(currentThread.hashtags);
        currentThread.images = Array.isArray(currentThread.images) ? currentThread.images : [];
        
        // スレッド情報を表示
        displayThreadDetail(currentThread);
        
        // コメントを読み込み
        await loadComments(threadId);
        
        // お気に入り状態をチェック
        await checkFavoriteStatus(threadId);
        
        console.log('スレッド詳細読み込み完了');
        
    } catch (error) {
        console.error('スレッド詳細の読み込みエラー:', error);
        showErrorPage(error.message);
    }
}

// エラーページを表示
function showErrorPage(message) {
    const container = document.querySelector('.container');
    if (container) {
        container.innerHTML = `
            <div class="error-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>スレッドの読み込みエラー</h3>
                <p>${escapeHtml(message)}</p>
                <button onclick="location.href='index.html'" class="retry-btn">
                    <i class="fas fa-home"></i> ホームに戻る
                </button>
                <button onclick="location.reload()" class="retry-btn">
                    <i class="fas fa-redo"></i> 再読み込み
                </button>
            </div>
        `;
    }
}

// スレッド詳細を表示
function displayThreadDetail(thread) {
    document.getElementById('threadTitle').textContent = thread.title;
    document.getElementById('threadAuthor').innerHTML = formatAuthorName(thread.author_name);
    document.getElementById('threadDate').textContent = getRelativeTime(new Date(thread.created_at).getTime());
    document.getElementById('threadContent').textContent = thread.content;
    document.getElementById('threadLikeCount').textContent = thread.like_count || 0;
    
    // カテゴリバッジ
    const categoryBadge = document.getElementById('threadCategoryBadge');
    if (categoryBadge) {
        categoryBadge.textContent = thread.category;
        categoryBadge.className = `thread-category category-${thread.category}`;
    }
    
    // サブカテゴリバッジ
    const subcategoryBadge = document.getElementById('threadSubcategoryBadge');
    if (subcategoryBadge && thread.subcategory) {
        subcategoryBadge.textContent = thread.subcategory;
        subcategoryBadge.style.display = 'inline-block';
    } else if (subcategoryBadge) {
        subcategoryBadge.style.display = 'none';
    }
    
    // ハッシュタグ表示
    const hashtagsDisplay = document.getElementById('threadHashtagsDisplay');
    if (hashtagsDisplay && Array.isArray(thread.hashtags) && thread.hashtags.length > 0) {
        hashtagsDisplay.innerHTML = thread.hashtags.map(tag => 
            `<span class="thread-hashtag">#${escapeHtml(tag)}</span>`
        ).join('');
    }
    
    // 画像表示
    const imagesDisplay = document.getElementById('threadImagesDisplay');
    if (imagesDisplay) {
        if (Array.isArray(thread.images) && thread.images.length > 0) {
            imagesDisplay.innerHTML = `
                <div class="image-gallery">
                    ${thread.images.map((imageUrl, index) => `
                        <img src="${imageUrl}" alt="スレッド画像${index + 1}" class="gallery-image" 
                             onclick="openImageModal('${imageUrl}')">
                    `).join('')}
                </div>
            `;
            imagesDisplay.style.display = 'block';
        } else {
            imagesDisplay.style.display = 'none';
        }
    }
    
    // ページタイトルを更新
    document.title = `${thread.title} - すたでぃちゃんねる`;
}

// コメントを読み込み
async function loadComments(threadId) {
  try {
    // 古い順（昇順）で取得
    const res = await fetch(`tables/comments?sort=created_at&order=asc&limit=1000`);
    if (!res.ok) throw new Error('コメントの読み込みに失敗しました');
    const json = await res.json();
    const all = (json.data || []).filter(c => c.thread_id === threadId);

    // 親・子に分割
    const parents = all.filter(c => !c.parent_comment_id);
    const children = all.filter(c => c.parent_comment_id);

    // 親ごとに紐付け
    parents.forEach(p => {
      p.replies = children.filter(c => c.parent_comment_id === p.id);
    });

    // 合計件数を表示（親 + 返信）
    const totalCount = all.length;
    const countEl = document.getElementById('commentCount');
    if (countEl) countEl.textContent = totalCount.toString();

    // 表示
    displayComments(parents);
  } catch (e) {
    console.error('コメントの読み込みエラー:', e);
  }
}

function displayComments(parents) {
  const list = document.getElementById('commentsList');
  if (!list) return;

  // 親も返信も「古い順」で表示されるように明示（念のため）
  const toAsc = (a, b) => new Date(a.created_at) - new Date(b.created_at);
  parents.sort(toAsc);
  parents.forEach(p => (p.replies || []).sort(toAsc));

  list.innerHTML = parents.map(p => renderCommentItem(p, false)).join('');
}

function renderCommentItem(c, isReply) {
  const numberHtml = c.comment_number != null ? `${c.comment_number}.` : '';
  const authorHtml = escapeHtml(c.author_name || '匿名');
  const dateHtml = getRelativeTime(new Date(c.created_at).getTime());
  const contentHtml = escapeHtml(c.content || '');
  const likeCount = c.like_count || 0;

  // 自身の下に返信フォームを出すトグル
  const containerAttrs = isReply ? `class="reply-item" data-comment-id="${c.id}"` 
                                 : `class="comment-item" data-comment-id="${c.id}"`;

  // 「x件の返信」トグルと返信リスト
  const repliesBlock = !isReply && c.replies?.length
    ? `
      <div class="replies-toggle" onclick="toggleReplies('${c.id}')">
        ${c.replies.length}件の返信
      </div>
      <div class="replies" id="replies-${c.id}" style="display:none;">
        ${c.replies.map(r => renderCommentItem(r, true)).join('')}
      </div>
    `
    : '';

  return `
    <div ${containerAttrs}>
      <div class="comment-header">
        <span class="comment-number">${numberHtml}</span>
        <span class="comment-author">${authorHtml}</span>
        <span class="date">${dateHtml}</span>
      </div>
      <div class="comment-content">${contentHtml}</div>
      <div class="comment-actions">
        <button class="comment-reply-btn" onclick="showReplyPopup('${c.id}')">
          <i class="fas fa-reply"></i> 返信
        </button>
        <button class="comment-like-btn" data-like-target="${c.id}" onclick="likeThisComment('${c.id}')">
          <i class="fas fa-heart"></i> <span class="comment-like-count">${likeCount}</span>
        </button>
      </div>
      ${repliesBlock}
    </div>
  `;
}

function toggleReplies(parentId) {
  const box = document.getElementById(`replies-${parentId}`);
  if (box) box.style.display = box.style.display === 'none' ? 'block' : 'none';
}

async function likeThisComment(commentId) {
  try {
    if (!userFingerprint) userFingerprint = generateUserFingerprint();

    // すでに自分が「いいね」したかチェック
    const likesRes = await fetch('tables/likes');
    const likesJson = await likesRes.json();
    const liked = (likesJson.data || []).some(l =>
      l.target_type === 'comment' &&
      l.target_id === commentId &&
      l.user_fingerprint === userFingerprint
    );
    if (liked) {
      alert('このコメントには既に「いいね」しています');
      return;
    }

    // いいね追加
    const addRes = await fetch('tables/likes', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        target_type: 'comment',
        target_id: commentId,
        user_fingerprint: userFingerprint
      })
    });
    if (!addRes.ok) throw new Error('いいねに失敗しました');

    // 表示中の該当コメントのカウントだけ +1 で即時反映
    const container = document.querySelector(`[data-comment-id="${commentId}"]`);
    const countEl = container?.querySelector('.comment-like-count');
    if (countEl) countEl.textContent = String((parseInt(countEl.textContent || '0', 10) + 1));

  } catch (e) {
    console.error('コメントいいねエラー:', e);
    alert('いいねに失敗しました');
  }
}

// コメント投稿の処理
async function handleCommentSubmit(event) {
    event.preventDefault();
    
    if (!currentThreadId) return;
    
    const content = document.getElementById('commentContent').value.trim();
    
    if (!content) {
        alert('コメント内容を入力してください');
        return;
    }
    
    const commentData = {
        thread_id: currentThreadId,
        content: content,
        images: uploadedImages.comment || [],
        author_name: getCommentAuthorName(),
        like_count: 0,
        comment_number: 0 // サーバー側で設定
    };
    
    // バリデーション
    const errors = validateCommentData(commentData);
    if (errors.length > 0) {
        alert(errors.join('\\n'));
        return;
    }
    
    try {
        // 現在のコメント数を取得してコメント番号を決定
        const commentsResult = await apiCall('tables/comments');
        const threadComments = (commentsResult.data || []).filter(comment => comment.thread_id === currentThreadId);
        commentData.comment_number = threadComments.length + 1;
        
        // コメントを作成
        await apiCall('tables/comments', {
            method: 'POST',
            body: JSON.stringify(commentData)
        });
        
        // スレッドの返信数を更新
        await updateThreadReplyCount(currentThreadId, threadComments.length + 1);
        
        // フォームをリセット
        resetCommentForm();
        
        // コメント一覧を再読み込み
        await loadComments(currentThreadId);
        
        // 成功メッセージ
        showSuccessMessage('コメントを投稿しました！');
        
    } catch (error) {
        handleApiError(error, 'コメントの投稿に失敗しました');
    }
}

// コメント投稿者名を取得
function getCommentAuthorName() {
    const selectedType = document.querySelector('input[name="commentAuthorType"]:checked');
    
    if (!selectedType || selectedType.value === 'anonymous') {
        return '匿名';
    } else {
        const customInput = document.getElementById('commentCustomAuthorName');
        const customName = customInput ? customInput.value.trim() : '';
        return customName || '匿名';
    }
}

// コメントフォームをリセット
function resetCommentForm() {
    document.getElementById('commentContent').value = '';
    
    // 画像データをクリア
    uploadedImages.comment = [];
    updateImagePreview('comment');
    
    // 匿名選択をリセット
    const anonymousRadio = document.querySelector('input[name="commentAuthorType"][value="anonymous"]');
    if (anonymousRadio) {
        anonymousRadio.checked = true;
        toggleCommentAuthorNameInput();
    }
    
    const customNameInput = document.getElementById('commentCustomAuthorName');
    if (customNameInput) {
        customNameInput.value = '';
    }
}

// 匿名/記名選択の切り替え（コメント）
function toggleCommentAuthorNameInput() {
    const anonymousRadio = document.querySelector('input[name="commentAuthorType"][value="anonymous"]');
    const customNameGroup = document.getElementById('commentCustomNameGroup');
    
    if (!anonymousRadio || !customNameGroup) return;
    
    if (anonymousRadio.checked) {
        customNameGroup.style.display = 'none';
    } else {
        customNameGroup.style.display = 'inline-block';
        const customInput = document.getElementById('commentCustomAuthorName');
        if (customInput) {
            customInput.focus();
        }
    }
}

// スレッドの返信数を更新
async function updateThreadReplyCount(threadId, replyCount) {
    try {
        await apiCall(`tables/threads/${threadId}`, {
            method: 'PATCH',
            body: JSON.stringify({
                reply_count: replyCount
            })
        });
    } catch (error) {
        console.error('返信数の更新に失敗:', error);
    }
}

// スレッドにいいね
async function likeThread() {
    if (!currentThreadId || !userFingerprint) return;
    
    try {
        // 既にいいねしているかチェック
        const likesResult = await apiCall('tables/likes');
        const existingLike = (likesResult.data || []).find(like => 
            like.target_id === currentThreadId && 
            like.target_type === 'thread' && 
            like.user_fingerprint === userFingerprint
        );
        
        if (existingLike) {
            showErrorMessage('既にいいねしています');
            return;
        }
        
        // いいねを作成
        const likeData = {
            target_id: currentThreadId,
            target_type: 'thread',
            user_fingerprint: userFingerprint
        };
        
        await apiCall('tables/likes', {
            method: 'POST',
            body: JSON.stringify(likeData)
        });
        
        // スレッドのいいね数を更新
        const newLikeCount = (currentThread.like_count || 0) + 1;
        currentThread.like_count = newLikeCount;
        
        await apiCall(`tables/threads/${currentThreadId}`, {
            method: 'PATCH',
            body: JSON.stringify({
                like_count: newLikeCount
            })
        });
        
        // 表示を更新
        document.getElementById('threadLikeCount').textContent = newLikeCount;
        showSuccessMessage('いいねしました！');
        
    } catch (error) {
        handleApiError(error, 'いいねに失敗しました');
    }
}

// お気に入り状態をチェック
async function checkFavoriteStatus(threadId) {
    try {
        console.log('お気に入り状態確認開始');
        const userFingerprint = generateUserFingerprint();
        const response = await fetch('tables/favorites');
        
        if (!response.ok) {
            console.warn('お気に入りテーブルにアクセスできません');
            return;
        }
        
        const result = await response.json();
        const favorites = result.data || [];
        console.log('お気に入りデータ:', favorites.length, '件');
        
        const isFavorite = favorites.some(fav => 
            fav.thread_id === threadId && fav.user_fingerprint === userFingerprint
        );
        
        console.log('お気に入り状態:', isFavorite);
        updateFavoriteButton(isFavorite);
        
    } catch (error) {
        console.error('お気に入り状態の確認エラー:', error);
        // エラーでもデフォルト状態で表示
        updateFavoriteButton(false);
    }
}

// お気に入りボタンの表示を更新
function updateFavoriteButton(isFavorite) {
    const favoriteBtn = document.getElementById('favoriteBtn');
    if (!favoriteBtn) return;
    
    if (isFavorite) {
        favoriteBtn.innerHTML = '<i class="fas fa-star"></i> お気に入り済み';
        favoriteBtn.classList.add('favorited');
    } else {
        favoriteBtn.innerHTML = '<i class="far fa-star"></i> お気に入り';
        favoriteBtn.classList.remove('favorited');
    }
}

// お気に入りの切り替え
async function toggleFavorite() {
    if (!currentThreadId || !userFingerprint) return;
    
    try {
        const response = await fetch('tables/favorites');
        if (!response.ok) {
            throw new Error('お気に入り状態の取得に失敗しました');
        }
        
        const result = await response.json();
        const favorites = result.data || [];
        
        const existingFavorite = favorites.find(fav => 
            fav.thread_id === currentThreadId && fav.user_fingerprint === userFingerprint
        );
        
        if (existingFavorite) {
            // お気に入りから削除
            await fetch(`tables/favorites/${existingFavorite.id}`, {
                method: 'DELETE'
            });
            updateFavoriteButton(false);
            showSuccessMessage('お気に入りから削除しました');
        } else {
            // お気に入りに追加
            const favoriteData = {
                thread_id: currentThreadId,
                user_fingerprint: userFingerprint
            };
            
            await fetch('tables/favorites', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(favoriteData)
            });
            updateFavoriteButton(true);
            showSuccessMessage('お気に入りに追加しました');
        }
        
    } catch (error) {
        handleApiError(error, 'お気に入りの更新に失敗しました');
    }
}

// 返信フォームを表示（将来の機能）
function showReplyForm(commentNumber) {
    // 将来的にコメントへの返信機能を実装
    console.log(`コメント${commentNumber}への返信フォームを表示`);
}

// 成功メッセージを表示
function showSuccessMessage(message) {
    // 簡易的なメッセージ表示
    const messageDiv = document.createElement('div');
    messageDiv.className = 'success-message';
    messageDiv.textContent = message;
    messageDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background-color: #28a745;
        color: white;
        padding: 10px 20px;
        border-radius: 6px;
        z-index: 1000;
        animation: fadeInOut 3s ease forwards;
    `;
    
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
        messageDiv.remove();
    }, 3000);
}

// エラーメッセージを表示
function showErrorMessage(message) {
    // 簡易的なメッセージ表示
    const messageDiv = document.createElement('div');
    messageDiv.className = 'error-message';
    messageDiv.textContent = message;
    messageDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background-color: #dc3545;
        color: white;
        padding: 10px 20px;
        border-radius: 6px;
        z-index: 1000;
        animation: fadeInOut 3s ease forwards;
    `;
    
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
        messageDiv.remove();
    }, 3000);
}

// CSSアニメーションを追加
const style = document.createElement('style');
style.textContent = `
@keyframes fadeInOut {
    0% { opacity: 0; transform: translateX(100px); }
    15% { opacity: 1; transform: translateX(0); }
    85% { opacity: 1; transform: translateX(0); }
    100% { opacity: 0; transform: translateX(100px); }
}
`;
document.head.appendChild(style);

