let currentThreadId = null;
let parentCommentId = null;
let userFingerprint = null;

document.addEventListener('DOMContentLoaded', init);

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
  const parent = await apiCall(`tables/comments/${parentCommentId}`);
  if (!parent || !parent.id) return showPageError('親コメントが見つかりません');
  renderParent(parent);
}

function renderParent(c) {
  const box = document.getElementById('parentCommentBox');
  if (!box) return;
  box.setAttribute('data-comment-id', c.id);
  box.innerHTML = `
    <div class="comment-header">
      <span class="comment-number">${c.comment_number != null ? `${c.comment_number}.` : ''}</span>
      <span class="comment-author">${escapeHtml(c.author_name || '匿名')}</span>
      <span class="date">${getRelativeTime(new Date(c.created_at).getTime())}</span>
    </div>
    <div class="comment-content">${escapeHtml(c.content || '')}</div>
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
  // APIにフィルタがない前提で全件→絞り込み（必要ならAPI側に parent_id フィルタを追加して最適化可）
  const json = await apiCall(`tables/comments?sort=created_at&order=asc&limit=1000`);
  const all = json?.data || [];
  const replies = all.filter(c => c.parent_comment_id === parentCommentId);

  document.getElementById('repliesCount').textContent = String(replies.length);
  renderReplies(replies);
}

function renderReplies(list) {
  const wrap = document.getElementById('repliesList');
  if (!wrap) return;

  list.sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
  if (list.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><p>まだ返信はありません</p></div>`;
    return;
  }

  wrap.innerHTML = list.map(c => `
    <div class="reply-item" data-comment-id="${c.id}">
      <div class="comment-header">
        <span class="comment-author">${escapeHtml(c.author_name || '匿名')}</span>
        <span class="date">${getRelativeTime(new Date(c.created_at).getTime())}</span>
      </div>
      <div class="comment-content">${escapeHtml(c.content || '')}</div>
      <div class="comment-actions">
        <button class="comment-like-btn" onclick="likeThisComment('${c.id}')">
          <i class="fas fa-heart"></i> <span class="comment-like-count">${c.like_count || 0}</span>
        </button>
      </div>
    </div>
  `).join('');
}

// 返信投稿
async function handleReplySubmit(e) {
  e.preventDefault();
  const content = (document.getElementById('replyContent')?.value || '').trim();
  if (!content) return;

  const body = {
    thread_id: currentThreadId,
    content,
    author_name: getCommentAuthorName(), // utils.jsの関数（thread.htmlと同じラジオを利用）
    like_count: 0,
    comment_number: 0,
    parent_comment_id: parentCommentId
  };

  await apiCall('tables/comments', {
    method: 'POST',
    body: JSON.stringify(body)
  });

  // クリア＆再読込
  document.getElementById('replyContent').value = '';
  await loadReplies();
}

// コメントにいいね（親/返信どちらも）
async function likeThisComment(commentId) {
  try {
    if (!userFingerprint) userFingerprint = generateUserFingerprint();

    const likes = await apiCall('tables/likes');
    const exists = (likes.data || []).some(l =>
      l.target_type === 'comment' && l.target_id === commentId && l.user_fingerprint === userFingerprint
    );
    if (exists) {
      alert('このコメントには既に「いいね」しています');
      return;
    }

    await apiCall('tables/likes', {
      method: 'POST',
      body: JSON.stringify({
        target_type: 'comment',
        target_id: commentId,
        user_fingerprint: userFingerprint
      })
    });

    // 表示だけ即時 +1
    const box = document.querySelector(`[data-comment-id="${commentId}"] .comment-like-count`);
    if (box) box.textContent = String((parseInt(box.textContent || '0', 10) + 1));
  } catch (e) {
    console.error(e);
    alert('いいねに失敗しました');
  }
}
