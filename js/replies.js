let currentThreadId = null;
let parentCommentId = null;
let userFingerprint = null;
let commentsById = new Map();
let childrenByParentId = new Map();
let activeReplyTargetId = null;
let activeReplyTargetElement = null;

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

  activeReplyTargetId = parentCommentId;

  await refreshRepliesView();

  // 返信する（上部ボタン）
  document.getElementById('scrollToReplyFormBtn')?.addEventListener('click', () => {
    setReplyTarget(parentCommentId, { scrollToForm: true });
  });

  document.getElementById('replyTargetReset')?.addEventListener('click', () => {
    setReplyTarget(parentCommentId, { scrollToForm: false });
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

async function refreshRepliesView() {
  try {
    const json = await apiCall(`/api/tables/comments?thread_id=${currentThreadId}&sort=created_at&order=asc&limit=1000`);
    const all = (json?.data || []).filter(c => !c?.is_deleted);

    buildCommentMaps(all);

    const parent = commentsById.get(parentCommentId);
    if (!parent) {
      showPageError('親コメントが見つかりません');
      return;
    }

    renderParent(parent);

    const directReplies = childrenByParentId.get(parentCommentId) || [];
    document.getElementById('repliesCount').textContent = String(directReplies.length);
    renderReplies(directReplies);

    if (!activeReplyTargetId || !commentsById.has(activeReplyTargetId)) {
      activeReplyTargetId = parentCommentId;
    }
    setReplyTarget(activeReplyTargetId);
  } catch (e) {
    console.error('返信取得エラー:', e);
    document.getElementById('repliesCount').textContent = '0';
    renderReplies([]);
    setReplyTarget(parentCommentId);
  }
}

function buildCommentMaps(comments) {
  commentsById = new Map();
  childrenByParentId = new Map();

  for (const comment of comments) {
    commentsById.set(comment.id, comment);
  }

  for (const comment of comments) {
    const parentId = comment.parent_comment_id;
    if (!parentId) continue;
    if (!childrenByParentId.has(parentId)) {
      childrenByParentId.set(parentId, []);
    }
    childrenByParentId.get(parentId).push(comment);
  }

  for (const childList of childrenByParentId.values()) {
    childList.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }

  for (const comment of comments) {
    comment.reply_count_local = (childrenByParentId.get(comment.id) || []).length;
  }
}

function renderParent(c) {
  const box = document.getElementById('parentCommentBox');
  if (!box) return;
  box.setAttribute('data-comment-id', c.id);

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
      <button type="button" class="comment-like-btn" data-role="parent-like">
        <i class="fas fa-heart"></i> <span class="comment-like-count">${c.like_count || 0}</span>
      </button>
      <button type="button" class="comment-reply-btn" data-role="parent-reply">
        <i class="fas fa-reply"></i> 返信する
      </button>
    </div>
  `;

  box.querySelector('[data-role="parent-like"]')?.addEventListener('click', () => likeThisComment(c.id));
  box.querySelector('[data-role="parent-reply"]')?.addEventListener('click', () => setReplyTarget(c.id, { scrollToForm: true }));
}

function renderReplies(list) {
  const wrap = document.getElementById('repliesList');
  if (!wrap) return;

  wrap.innerHTML = '';

  const replies = Array.isArray(list) ? list : [];
  if (replies.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><p>まだ返信はありません</p></div>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const reply of replies) {
    fragment.appendChild(createReplyItem(reply, 0));
  }
  wrap.appendChild(fragment);
}

function createReplyItem(comment, depth = 0) {
  const replyItem = document.createElement('div');
  replyItem.className = 'reply-item';
  replyItem.dataset.commentId = comment.id;
  replyItem.dataset.depth = String(depth);

  const header = document.createElement('div');
  header.className = 'comment-header';

  const headerLeft = document.createElement('div');
  headerLeft.className = 'comment-header-left';

  const authorSpan = document.createElement('span');
  authorSpan.className = 'comment-author';
  authorSpan.textContent = comment.author_name || '匿名';
  headerLeft.appendChild(authorSpan);

  const dateSpan = document.createElement('span');
  dateSpan.className = 'date';
  dateSpan.textContent = getRelativeTime(new Date(comment.created_at).getTime());
  headerLeft.appendChild(dateSpan);

  header.appendChild(headerLeft);

  const moderation = document.createElement('div');
  moderation.className = 'comment-moderation-links';

  if (isMyComment(comment)) {
    const deleteLink = document.createElement('a');
    deleteLink.href = '#';
    deleteLink.className = 'delete-request-link';
    deleteLink.title = '削除依頼';
    deleteLink.textContent = '[削除依頼]';
    deleteLink.addEventListener('click', (event) => {
      event.preventDefault();
      requestDeleteReply(comment.id);
    });
    moderation.appendChild(deleteLink);
  } else {
    const reportLink = document.createElement('a');
    reportLink.href = '#';
    reportLink.className = 'report-link';
    reportLink.title = '通報';
    reportLink.textContent = '[通報]';
    reportLink.addEventListener('click', (event) => {
      event.preventDefault();
      reportContent('reply', comment.id);
    });
    moderation.appendChild(reportLink);
  }

  header.appendChild(moderation);
  replyItem.appendChild(header);

  const contentDiv = document.createElement('div');
  contentDiv.className = 'comment-content';
  contentDiv.textContent = comment.content || '';
  replyItem.appendChild(contentDiv);

  if (Array.isArray(comment.images) && comment.images.length > 0) {
    const imagesWrapper = document.createElement('div');
    imagesWrapper.className = 'comment-images';
    const gallery = document.createElement('div');
    gallery.className = 'image-gallery';

    comment.images.forEach((imageUrl, index) => {
      const img = document.createElement('img');
      img.src = imageUrl;
      img.alt = `返信画像${index + 1}`;
      img.className = 'gallery-image';
      img.addEventListener('click', () => openImageModal(imageUrl));
      gallery.appendChild(img);
    });

    imagesWrapper.appendChild(gallery);
    replyItem.appendChild(imagesWrapper);
  }

  const actions = document.createElement('div');
  actions.className = 'comment-actions';

  const likeButton = document.createElement('button');
  likeButton.type = 'button';
  likeButton.className = 'comment-like-btn';
  likeButton.innerHTML = `<i class="fas fa-heart"></i> <span class="comment-like-count">${comment.like_count || 0}</span>`;
  likeButton.addEventListener('click', () => likeThisComment(comment.id));
  actions.appendChild(likeButton);

  const replyButton = document.createElement('button');
  replyButton.type = 'button';
  replyButton.className = 'comment-reply-btn';
  replyButton.innerHTML = '<i class="fas fa-reply"></i> 返信する';
  replyButton.addEventListener('click', () => setReplyTarget(comment.id, { scrollToForm: true }));
  actions.appendChild(replyButton);

  replyItem.appendChild(actions);

  const children = childrenByParentId.get(comment.id) || [];
  if (children.length > 0) {
    const repliesLinkWrap = document.createElement('div');
    repliesLinkWrap.className = 'replies-link nested-replies-link';

    const toggleButton = document.createElement('button');
    toggleButton.type = 'button';
    toggleButton.className = 'reply-children-toggle';
    toggleButton.innerHTML = `<i class="fas fa-comments"></i> ${children.length}件の返信を隠す`;
    repliesLinkWrap.appendChild(toggleButton);
    replyItem.appendChild(repliesLinkWrap);

    const childContainer = document.createElement('div');
    childContainer.className = 'reply-children';
    children.forEach(child => childContainer.appendChild(createReplyItem(child, depth + 1)));
    replyItem.appendChild(childContainer);

    let expanded = true;
    toggleButton.addEventListener('click', () => {
      expanded = !expanded;
      childContainer.style.display = expanded ? '' : 'none';
      toggleButton.innerHTML = `<i class="fas fa-comments"></i> ${children.length}件の返信${expanded ? 'を隠す' : 'を表示'}`;
    });
  }

  return replyItem;
}

function setReplyTarget(commentId, options = {}) {
  if (!commentsById.has(commentId)) {
    commentId = parentCommentId;
  }

  activeReplyTargetId = commentId;

  updateReplyTargetBanner(commentId);

  if (activeReplyTargetElement) {
    activeReplyTargetElement.classList.remove('is-reply-target');
  }

  let targetElement = null;
  if (commentId === parentCommentId) {
    targetElement = document.getElementById('parentCommentBox');
  } else {
    targetElement = document.querySelector(`.reply-item[data-comment-id="${commentId}"]`);
  }

  if (targetElement) {
    targetElement.classList.add('is-reply-target');
    activeReplyTargetElement = targetElement;
  } else {
    activeReplyTargetElement = null;
  }

  if (options.scrollToForm) {
    scrollToReplyForm();
  }
}

function updateReplyTargetBanner(commentId) {
  const banner = document.getElementById('replyTargetBanner');
  if (!banner) return;

  const labelEl = document.getElementById('replyTargetLabel');
  const snippetEl = document.getElementById('replyTargetSnippet');
  const resetBtn = document.getElementById('replyTargetReset');

  const target = commentsById.get(commentId) || commentsById.get(parentCommentId);
  const author = target?.author_name || '匿名';

  if (labelEl) {
    labelEl.textContent = commentId === parentCommentId
      ? `返信先: 親コメント（${author}）`
      : `返信先: ${author}さんのコメント`;
  }

  if (snippetEl) {
    snippetEl.textContent = formatReplySnippet(target?.content);
  }

  if (resetBtn) {
    resetBtn.style.display = commentId === parentCommentId ? 'none' : 'inline-flex';
  }

  banner.hidden = false;
}

function formatReplySnippet(content) {
  if (typeof content !== 'string') return '（本文なし）';
  const trimmed = content.trim();
  if (!trimmed) return '（本文なし）';
  return trimmed.length > 70 ? `${trimmed.slice(0, 70)}…` : trimmed;
}

function scrollToReplyForm() {
  const section = document.getElementById('replyFormSection');
  if (!section) return;
  section.scrollIntoView({ behavior: 'smooth' });
  setTimeout(() => document.getElementById('replyContent')?.focus(), 250);
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

  const authorName = getCommentAuthorName();

  const targetId = commentsById.has(activeReplyTargetId) ? activeReplyTargetId : parentCommentId;

  try {
    await apiCall('/api/tables/comments', {
      method: 'POST',
      body: JSON.stringify({
        thread_id: currentThreadId,
        parent_comment_id: targetId,
        content,
        images: images,
        author_name: authorName,
        user_fingerprint: userFingerprint
      })
    });

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
    await refreshRepliesView();
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
