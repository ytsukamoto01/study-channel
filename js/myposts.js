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

    // data-* に編集用データを入れて安全に渡す（JSON埋め込みのエスケープを気にしなくてよい）
    return `
      <div class="thread-item category-${t.category} fade-in my-post-item"
           data-thread-id="${t.id}"
           data-title="${escapeHtml(t.title)}"
           data-category="${escapeHtml(t.category)}"
           data-subcategory="${escapeHtml(t.subcategory || '')}"
           data-content="${escapeHtml(t.content)}"
           data-hashtags="${escapeHtml((t.hashtags || []).join(','))}"
           data-images="${escapeHtml((Array.isArray(t.images) ? t.images : []).join(','))}"
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
          ${formatAuthorName(t.author_name)}
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

        <div class="thread-actions-row">
          <button class="edit-btn" onclick="event.stopPropagation(); openEditModalFromCard(this.closest('.thread-item'))">
            <i class="fas fa-pen"></i> 編集
          </button>
          <button class="delete-btn" onclick="event.stopPropagation(); confirmDeleteThread('${t.id}')">
            <i class="fas fa-trash"></i> 削除
          </button>
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

/* ---------- 編集/削除 ---------- */

// カードDOMから編集モーダルを開く
function openEditModalFromCard(cardEl){
  const id  = cardEl.getAttribute('data-thread-id');
  document.getElementById('editThreadId').value = id;
  document.getElementById('editTitle').value = cardEl.getAttribute('data-title') || '';
  document.getElementById('editCategory').value = cardEl.getAttribute('data-category') || '';
  document.getElementById('editSubcategory').value = cardEl.getAttribute('data-subcategory') || '';
  document.getElementById('editContent').value = cardEl.getAttribute('data-content') || '';
  document.getElementById('editHashtags').value = cardEl.getAttribute('data-hashtags') || '';
  document.getElementById('editImages').value = cardEl.getAttribute('data-images') || '';
  document.getElementById('editModal').style.display = 'flex';
  document.getElementById('editModal').classList.add('active');
}

function closeEditModal(){
  document.getElementById('editModal').style.display = 'none';
  document.getElementById('editModal').classList.remove('active');
}

// 送信（PATCH）
document.getElementById('editForm')?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const id = document.getElementById('editThreadId').value;
  const body = {
    user_fingerprint: FP, // 所有確認
    title: document.getElementById('editTitle').value.trim(),
    category: document.getElementById('editCategory').value.trim(),
    subcategory: document.getElementById('editSubcategory').value.trim() || null,
    content: document.getElementById('editContent').value.trim(),
    hashtags: (document.getElementById('editHashtags').value || '').split(',').map(s=>s.trim()).filter(Boolean),
    images: (document.getElementById('editImages').value || '').split(',').map(s=>s.trim()).filter(Boolean)
  };
  const res = await fetch(`/api/tables/threads/${id}`, {
    method: 'PATCH',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const t = await res.text();
    alert('更新に失敗しました: ' + t);
    return;
  }
  closeEditModal();
  await loadMyPosts();
});

// 削除ボタン
async function confirmDeleteThread(threadId) {
  if (!confirm('このスレッドを削除しますか？')) return;
  try {
    await apiCall(`/api/tables/threads/${threadId}`, {
      method: 'DELETE',
      body: JSON.stringify({ user_fingerprint: FP })
    });
    showMessage('削除しました', 'success');
    loadMyPosts();
  } catch (e) {
    handleApiError(e, '削除に失敗しました');
  }
}

// 編集ボタン
async function saveThreadEdits(id, data) {
  try {
    await apiCall(`/api/tables/threads/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...data, user_fingerprint: FP })
    });
    showMessage('更新しました', 'success');
    loadMyPosts();
  } catch (e) {
    handleApiError(e, '更新に失敗しました');
  }
}


/* ---------- ローディング表示/非表示 ---------- */
function showLoading(){ const el = document.getElementById('loading'); if (el) el.style.display='block'; }
function hideLoading(){ const el = document.getElementById('loading'); if (el) el.style.display='none'; }

function onEditSubmit(e){
  e.preventDefault();
  const id = document.getElementById('editThreadId').value;
  const body = {
    user_fingerprint: FP,
    title: document.getElementById('editTitle').value.trim(),
    category: document.getElementById('editCategory').value.trim(),
    subcategory: document.getElementById('editSubcategory').value.trim() || null,
    content: document.getElementById('editContent').value.trim(),
    hashtags: (document.getElementById('editHashtags').value || '')
                .split(',').map(s=>s.trim()).filter(Boolean),
    images: (document.getElementById('editImages').value || '')
                .split(',').map(s=>s.trim()).filter(Boolean)
  };
  fetch(`/api/tables/threads/${id}`, {
    method: 'PATCH',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(body)
  }).then(async res=>{
    if(!res.ok){ alert('更新に失敗しました: ' + await res.text()); return; }
    closeEditModal();
    await loadMyPosts();
  });
}

// ★ DOM構築後に確実にバインド
document.addEventListener('DOMContentLoaded', ()=>{
  const form = document.getElementById('editForm');
  if(form && !form.dataset.bound){
    form.addEventListener('submit', onEditSubmit);
    form.dataset.bound = '1';
  }
});


