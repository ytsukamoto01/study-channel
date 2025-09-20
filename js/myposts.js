// 投稿一覧ページのJavaScript（修正版）

let FP = null; // 自分のフィンガープリント（統一）

document.addEventListener('DOMContentLoaded', () => {
  console.log('=== MyPosts Page Initialization ===');
  
  try { 
    FP = generateUserFingerprint(); 
    console.log('Generated user fingerprint:', FP);
  } catch(error) {
    console.error('Failed to generate fingerprint:', error);
    FP = 'fallback-fp-' + Date.now(); // フォールバック値
    console.log('Using fallback fingerprint:', FP);
  }
  
  if (!FP) {
    console.warn('Fingerprint is null/undefined, using fallback');
    FP = 'emergency-fp-' + Math.random().toString(36).substring(7);
  }
  
  console.log('Final fingerprint for API calls:', FP);
  loadMyPosts();
});

// 自分の投稿を読み込み（サーバー側でフィルタリング）
async function loadMyPosts() {
  try {
    console.log('=== Loading My Posts ===');
    console.log('Using fingerprint:', FP);
    showLoading();

    // user_fingerprintを送信してサーバー側でフィルタリング
    const apiUrl = `/api/tables/threads?user_fingerprint=${encodeURIComponent(FP || 'default-user-fp')}&limit=1000&sort=created_at&order=desc`;
    console.log('API URL:', apiUrl);
    
    const res = await fetch(apiUrl);
    console.log('API Response status:', res.status, res.statusText);
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error('API Error response:', errorText);
      throw new Error(`投稿の読み込みに失敗しました (${res.status}): ${errorText}`);
    }
    
    const json = await res.json();
    console.log('API Response data:', json);
    
    const myThreads = Array.isArray(json.data) ? json.data : [];
    console.log('My threads count:', myThreads.length);

    try {
      console.log('Calling displayMyPosts...');
      displayMyPosts(myThreads);
      console.log('displayMyPosts completed successfully');
    } catch (displayError) {
      console.error('Error in displayMyPosts:', displayError);
      console.error('Error stack:', displayError.stack);
      throw displayError;
    }
  } catch (e) {
    console.error('Error in loadMyPosts:', e);
    handleApiError(e, '投稿の読み込みに失敗しました');
  } finally {
    hideLoading();
  }
}

// 自分の投稿を表示
function displayMyPosts(threads) {
  console.log('=== Displaying My Posts ===');
  console.log('Threads to display:', threads);
  
  const wrap = document.getElementById('myPostsList');
  console.log('Container element:', wrap);
  
  if (!wrap) {
    console.error('myPostsList element not found!');
    return;
  }

  if (!threads || threads.length === 0) {
    console.log('No threads to display, showing empty state');
    wrap.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-edit"></i>
        <h3>投稿したスレッドがありません</h3>
        <p>最初のスレッドを作成してみませんか？</p>
        <button class="create-thread-btn" onclick="window.location.href='/'">
          <i class="fas fa-plus"></i> 新規スレッド作成
        </button>
      </div>
    `;
    return;
  }

  // 正規化 + 新しい順（APIで降順にしているが念のため）
  const list = threads.map(t => ({
    ...t,
    hashtags: normalizeHashtags(t.hashtags),
  })).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  console.log('Processed thread list:', list);
  console.log('Generating HTML for', list.length, 'threads');

  wrap.innerHTML = list.map(t => {
    const sub = t.subcategory ? `<span class="thread-subcategory">${escapeHtml(t.subcategory)}</span>` : '';
    const hts = (Array.isArray(t.hashtags) && t.hashtags.length > 0)
      ? `<div class="thread-hashtags">
           ${t.hashtags.map(tag => `<span class="thread-hashtag">#${escapeHtml(tag)}</span>`).join('')}
         </div>`
      : '';

    return `
      <div class="thread-item category-${t.category} fade-in my-post-item"
           data-thread-id="${t.id}"
           onclick="openThread('${t.id}')">
        <button class="favorite-btn favorite-btn-top" data-thread-id="${t.id}" onclick="event.stopPropagation(); toggleFavoriteFromList('${t.id}', this)">
          <i class="far fa-star"></i>
        </button>
        <div class="my-post-badge">
          <i class="fas fa-user"></i> あなたの投稿
        </div>
        <h3 class="thread-title">${escapeHtml(t.title)}</h3>
        <div class="thread-meta">
          <span class="category">${escapeHtml(t.category)}</span>
          ${sub}
          ${formatAuthorName(t.author_name, !!t.admin_mark)}
          <span class="date">${getRelativeTime(new Date(t.created_at).getTime())}</span>
        </div>
        <div class="thread-preview">
          ${escapeHtml(createPreview(t.content, 120))}
        </div>
        ${Array.isArray(t.images) && t.images.length > 0 ? `
        <div class="thread-images">
          <div class="image-gallery">
            ${t.images.slice(0,3).map((u,i)=>`
              <img src="${u}" alt="画像${i+1}" class="gallery-image" onclick="event.stopPropagation(); openImageModal('${u}')">
            `).join('')}
            ${t.images.length > 3 ? `<div class="more-images">+${t.images.length - 3}</div>` : ''}
          </div>
        </div>` : ''}
        ${hts}
        <div class="thread-stats">
          <span><i class="fas fa-comments"></i> ${t.reply_count || 0}</span>
          <span><i class="fas fa-heart"></i> ${t.like_count || 0}</span>
          <span class="post-status">
            <i class="fas fa-eye"></i> ${(t.reply_count || 0) > 0 ? 'コメントあり' : 'コメント待ち'}
          </span>
        </div>
        
        <!-- 削除依頼リンク -->
        <div class="my-post-actions">
          <a href="#" class="delete-request-link" onclick="event.stopPropagation(); requestDeleteThread('${t.id}', '${escapeHtml(t.title)}'); return false;" title="削除依頼">[削除依頼]</a>
        </div>
      </div>
    `;
  }).join('');

  console.log('HTML content length:', wrap.innerHTML.length);
  console.log('DOM updated successfully');
  
  updateFavoriteStatus();
}

function openThread(id){
  // きれいURL対応
  window.location.href = `/thread?id=${id}`;
}

/* ---------- お気に入り ---------- */

async function toggleFavoriteFromList(threadId, button) {
  try {
    const res = await fetch(`/api/tables/favorites?limit=1000`);
    const json = await res.json();
    const all = Array.isArray(json.data) ? json.data : [];
    const mine = all.filter(f => f.user_fingerprint === FP);

    const existing = mine.find(f => f.thread_id === threadId);
    if (existing) {
      await fetch(`/api/tables/favorites/${existing.id}`, { method: 'DELETE' });
      button.classList.remove('favorited');
      button.querySelector('i').classList.remove('fas');
      button.querySelector('i').classList.add('far');
      showMessage('お気に入りから削除しました', 'success');
    } else {
      await fetch('/api/tables/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: threadId, user_fingerprint: FP })
      });
      button.classList.add('favorited');
      button.querySelector('i').classList.remove('far');
      button.querySelector('i').classList.add('fas');
      showMessage('お気に入りに追加しました', 'success');
    }
  } catch (e) {
    console.error('お気に入り操作エラー:', e);
    showMessage('お気に入り操作に失敗しました', 'error');
  }
}

async function updateFavoriteStatus() {
  try {
    const res = await fetch(`/api/tables/favorites?limit=1000`);
    if (!res.ok) return;
    const json = await res.json();
    const all = Array.isArray(json.data) ? json.data : [];
    const mine = all.filter(f => f.user_fingerprint === FP);
    const favIds = new Set(mine.map(f => f.thread_id));

    document.querySelectorAll('.favorite-btn').forEach(btn => {
      const id = btn.getAttribute('data-thread-id');
      const on = favIds.has(id);
      btn.classList.toggle('favorited', on);
      const icon = btn.querySelector('i');
      if (icon) {
        icon.classList.toggle('fas', on);
        icon.classList.toggle('far', !on);
      }
    });
  } catch (e) {
    console.error('お気に入り状態の更新エラー:', e);
  }
}

/* ---------- 削除依頼機能 ---------- */

async function requestDeleteThread(threadId, threadTitle) {
  if (!confirm(`「${threadTitle}」の削除依頼を送信しますか？\n\n削除依頼は管理者が確認し、適切と判断された場合に削除されます。`)) {
    return;
  }

  try {
    // 削除理由を選択させる
    const reason = await showReasonDialog('delete_request');
    if (!reason) return;

    const requestData = {
      type: 'delete_request',
      target_type: 'thread',
      target_id: threadId,
      reporter_fingerprint: FP,
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

/* ---------- ローディング表示/非表示 ---------- */
function showLoading(){ const el = document.getElementById('loading'); if (el) el.style.display='block'; }
function hideLoading(){ const el = document.getElementById('loading'); if (el) el.style.display='none'; }

// 編集・削除機能は廃止されました


