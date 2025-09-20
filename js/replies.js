let currentThreadId = null;
let parentCommentId = null;
let userFingerprint = null;

// 自分のコメントかどうかを判定する関数
function isMyComment(comment) {
    if (!userFingerprint || !comment.user_fingerprint) {
        return false;
    }
    return comment.user_fingerprint === userFingerprint;
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

// 返信の削除依頼
async function requestDeleteReply(replyId) {
  if (!confirm('この返信の削除依頼を送信しますか？\n\n削除依頼は管理者が確認し、適切と判断された場合に削除されます。')) {
    return;
  }

  try {
    // 削除理由を選択させる
    const reason = await showReasonDialog('delete_request');
    if (!reason) return;

    const requestData = {
      type: 'delete_request',
      target_type: 'reply',
      target_id: replyId,
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

document.addEventListener('DOMContentLoaded', init);

// 表示名取得（匿名/記名）
function getCommentAuthorName() {
  const selected = document.querySelector('input[name="commentAuthorType"]:checked');
  if (!selected || selected.value === 'anonymous') return '匿名';
  const input = document.getElementById('commentCustomAuthorName');
  return (input?.value || '').trim() || '匿名';
}

// 匿名/記名のトグル
function setupAuthorNameToggle() {
  const grp = document.getElementById('commentCustomNameGroup');
  const radios = document.querySelectorAll('input[name="commentAuthorType"]');
  const apply = () => {
    const isCustom = document.querySelector('input[name="commentAuthorType"][value="custom"]')?.checked;
    if (!grp) return;
    grp.style.display = isCustom ? 'inline-block' : 'none';
    if (isCustom) document.getElementById('commentCustomAuthorName')?.focus();
  };
  radios.forEach(r => r.addEventListener('change', apply));
  apply();
}


async function init() {
  try {
    userFingerprint = generateUserFingerprint();
  } catch (_) {}

  const p = new URLSearchParams(location.search);
  currentThreadId = p.get('thread');
  parentCommentId = p.get('parent');

  if (!currentThreadId || !parentCommentId) {
    return showPageError('パラメータが不正です（thread / parent）');
  }

  await loadParentComment();
  await loadReplies();

  // 返信する（上部ボタン）
  document.getElementById('scrollToReplyFormBtn')?.addEventListener('click', () => {
    document.getElementById('replyFormSection')?.scrollIntoView({ behavior: 'smooth' });
    setTimeout(() => document.getElementById('replyContent')?.focus(), 250);
  });

    // 返信投稿
  document.getElementById('replyForm')?.addEventListener('submit', handleReplySubmit);

  // ★ 追加：表示名トグルの初期化
  setupAuthorNameToggle();
}

function showPageError(msg) {
  const c = document.querySelector('.container');
  if (!c) return;
  c.innerHTML = `
    <div class="error-state">
      <i class="fas fa-exclamation-triangle"></i>
      <h3>読み込みエラー</h3>
      <p>${escapeHtml(msg)}</p>
      <button onclick="history.back()" class="retry-btn"><i class="fas fa-arrow-left"></i> 戻る</button>
    </div>`;
}

// 親コメント1件
async function loadParentComment() {
  try {
    // 全コメントから該当の親コメントを検索
    const json = await apiCall(`/api/tables/comments?thread_id=${currentThreadId}&limit=1000`);
    const allComments = json?.data || [];
    const parent = allComments.find(c => c.id === parentCommentId);
    
    if (!parent) {
      return showPageError('親コメントが見つかりません');
    }
    
    renderParent(parent);
  } catch (e) {
    console.error('親コメント取得エラー:', e);
    showPageError('親コメントの読み込みに失敗しました');
  }
}

function renderParent(c) {
  const box = document.getElementById('parentCommentBox');
  if (!box) return;
  box.setAttribute('data-comment-id', c.id);
  
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
  
  box.innerHTML = `
    <div class="comment-header">
      <div class="comment-header-left">
        <span class="comment-number">${c.comment_number != null ? `${c.comment_number}.` : ''}</span>
        <span class="comment-author">${escapeHtml(c.author_name || '匿名')}</span>
        <span class="date">${getRelativeTime(new Date(c.created_at).getTime())}</span>
      </div>
      <div class="comment-moderation-links">
        ${isMyComment(c) ? `
        <a href="#" onclick="requestDeleteComment('${c.id}'); return false;" class="delete-request-link" title="削除依頼">[削除依頼]</a>
        ` : `
        <a href="#" onclick="reportContent('comment', '${c.id}'); return false;" class="report-link" title="通報">[通報]</a>
        `}
      </div>
    </div>
    <div class="comment-content">${escapeHtml(c.content || '')}</div>
    ${imagesHtml}
    <div class="comment-actions">
      <button class="comment-like-btn" onclick="likeThisComment('${c.id}')">
        <i class="fas fa-heart"></i> <span class="comment-like-count">${c.like_count || 0}</span>
      </button>
      <button class="comment-reply-btn" onclick="document.getElementById('replyFormSection').scrollIntoView({behavior:'smooth'})">
        <i class="fas fa-reply"></i> 返信する
      </button>
    </div>
  `;
}

// 子（返信）一覧
async function loadReplies() {
  try {
    // 該当スレッドの全コメントを取得
    const json = await apiCall(`/api/tables/comments?thread_id=${currentThreadId}&sort=created_at&order=asc&limit=1000`);
    const all = (json?.data || []).filter(c => !c?.is_deleted);

    // 親コメントごとの返信数を集計（直下の件数）
    const repliesByParent = {};
    for (const comment of all) {
      const parentId = comment.parent_comment_id;
      if (!parentId) continue;
      repliesByParent[parentId] = (repliesByParent[parentId] || 0) + 1;
    }

    for (const comment of all) {
      comment.reply_count_local = repliesByParent[comment.id] || 0;
    }

    const replies = all.filter(c => c.parent_comment_id === parentCommentId);

    document.getElementById('repliesCount').textContent = String(replies.length);
    renderReplies(replies);
  } catch (e) {
    console.error('返信取得エラー:', e);
    document.getElementById('repliesCount').textContent = '0';
    renderReplies([]);
  }
}

function renderReplies(list) {
  const wrap = document.getElementById('repliesList');
  if (!wrap) return;

  list.sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
  if (list.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><p>まだ返信はありません</p></div>`;
    return;
  }

  wrap.innerHTML = list.map(c => {
    // 画像表示
    const imagesHtml = (Array.isArray(c.images) && c.images.length > 0) 
      ? `<div class="comment-images">
           <div class="image-gallery">
             ${c.images.map((imageUrl, index) => `
               <img src="${imageUrl}" alt="返信画像${index + 1}" class="gallery-image" 
                    onclick="openImageModal('${imageUrl}')">
             `).join('')}
           </div>
         </div>`
      : '';

    const replyLink = `replies.html?thread=${encodeURIComponent(currentThreadId)}&parent=${encodeURIComponent(c.id)}#replyFormSection`;
    const repliesCount = typeof c.reply_count_local === 'number'
      ? c.reply_count_local
      : typeof c.reply_count === 'number'
        ? c.reply_count
        : 0;

    const repliesBlock = repliesCount > 0
      ? `<div class="replies-link">
           <a href="replies.html?thread=${encodeURIComponent(currentThreadId)}&parent=${encodeURIComponent(c.id)}">
             ${repliesCount}件の返信
           </a>
         </div>`
      : '';

    return `
      <div class="reply-item" data-comment-id="${c.id}">
        <div class="comment-header">
          <div class="comment-header-left">
            <span class="comment-author">${escapeHtml(c.author_name || '匿名')}</span>
            <span class="date">${getRelativeTime(new Date(c.created_at).getTime())}</span>
          </div>
          <div class="comment-moderation-links">
            ${isMyComment(c) ? `
            <a href="#" onclick="requestDeleteReply('${c.id}'); return false;" class="delete-request-link" title="削除依頼">[削除依頼]</a>
            ` : `
            <a href="#" onclick="reportContent('reply', '${c.id}'); return false;" class="report-link" title="通報">[通報]</a>
            `}
          </div>
        </div>
        <div class="comment-content">${escapeHtml(c.content || '')}</div>
        ${imagesHtml}
        <div class="comment-actions">
          <button class="comment-reply-btn" onclick="location.href='${replyLink}'">
            <i class="fas fa-reply"></i> 返信
          </button>
          <button class="comment-like-btn" onclick="likeThisComment('${c.id}')">
            <i class="fas fa-heart"></i> <span class="comment-like-count">${c.like_count || 0}</span>
          </button>
        </div>
        ${repliesBlock}
      </div>
    `;
  }).join('');
}

// 返信投稿
async function handleReplySubmit(e) {
  e.preventDefault();
  const content = document.getElementById('replyContent').value.trim();
  
  // 画像データを取得してバリデーション
  const images = (typeof uploadedImages !== 'undefined' && Array.isArray(uploadedImages.reply)) 
    ? uploadedImages.reply 
    : [];
  
  if (!content && images.length === 0) {
    return showMessage('返信内容または画像を入力してください', 'error');
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
        parent_comment_id: parentCommentId,
        content,
        images: images,
        author_name: authorName,
        user_fingerprint: userFingerprint
      })
    });
    
    // 即座に返信数を更新
    const repliesCountElement = document.getElementById('repliesCount');
    if (repliesCountElement) {
      const currentCount = parseInt(repliesCountElement.textContent || '0');
      repliesCountElement.textContent = currentCount + 1;
    }
    
    document.getElementById('replyContent').value = '';
    
    // 画像データをクリア（reply用）
    if (typeof uploadedImages !== 'undefined') {
      uploadedImages.reply = [];
      if (typeof updateImagePreview === 'function') {
        updateImagePreview('reply');
      }
    }
    
    showMessage('返信を投稿しました！', 'success');
    
    // 返信一覧を再読み込み
    await loadReplies();
  } catch (e) {
    handleApiError(e, '返信投稿に失敗しました');
  }
}


// コメントにいいね（親/返信どちらも）
async function likeThisComment(commentId) {
  try {
    if (!userFingerprint) userFingerprint = generateUserFingerprint();

    const likes = await apiCall('/api/tables/likes');
    const exists = (likes.data || []).some(l =>
      l.target_type === 'comment' && l.target_id === commentId && l.user_fingerprint === userFingerprint
    );
    if (exists) {
      showMessage('このコメントには既にいいねしています', 'error');
      return;
    }

    await apiCall('/api/tables/likes', {
      method: 'POST',
      body: JSON.stringify({
        target_type: 'comment',
        target_id: commentId,
        user_fingerprint: userFingerprint
      })
    });

    // 即座にUIを更新してフィードバック強化
    const commentElement = document.querySelector(`[data-comment-id="${commentId}"]`);
    if (commentElement) {
      const likeButton = commentElement.querySelector('.comment-like-btn');
      const likeCountSpan = commentElement.querySelector('.comment-like-count');
      
      if (likeCountSpan) {
        const currentCount = parseInt(likeCountSpan.textContent || '0', 10);
        likeCountSpan.textContent = String(currentCount + 1);
      }
      
      // ボタンアニメーションでフィードバック
      if (likeButton) {
        likeButton.style.transform = 'scale(1.2)';
        likeButton.style.transition = 'transform 0.2s ease';
        setTimeout(() => {
          likeButton.style.transform = 'scale(1)';
        }, 200);
      }
    }
    
    showMessage('いいねしました！', 'success');
  } catch (e) {
    console.error(e);
    showMessage('いいねに失敗しました', 'error');
  }
}
