// お気に入り一覧ページのJavaScript

let userFingerprint = null;

// ページ読み込み時の初期化
document.addEventListener('DOMContentLoaded', function() {
    userFingerprint = generateUserFingerprint();
    loadFavorites();
});

// お気に入りを読み込み
async function loadFavorites() {
    try {
        showLoading();
        
        // お気に入りリストを取得
        const favResponse = await fetch('/api/tables/favorites');
        if (!favResponse.ok) {
            throw new Error('お気に入りの読み込みに失敗しました');
        }
        
        const favResult = await favResponse.json();
        const allFavorites = favResult.data || [];
        
        // 自分のお気に入りのみを取得
        const myFavorites = allFavorites.filter(fav => 
            fav.user_fingerprint === userFingerprint
        );
        
        if (myFavorites.length === 0) {
            displayEmptyFavorites();
            return;
        }
        
        // スレッド情報を取得
        const threadResponse = await fetch('/api/tables/threads?limit=1000');
        if (!threadResponse.ok) {
            throw new Error('スレッドの読み込みに失敗しました');
        }
        
        const threadResult = await threadResponse.json();
        const allThreads = threadResult.data || [];
        
        // お気に入りのスレッドのみを抽出
        const favoriteThreadIds = myFavorites.map(fav => fav.thread_id);
        const favoriteThreads = allThreads.filter(thread => 
            favoriteThreadIds.includes(thread.id)
        );
        
        // お気に入りに追加した順序で並べる
        favoriteThreads.sort((a, b) => {
            const favA = myFavorites.find(fav => fav.thread_id === a.id);
            const favB = myFavorites.find(fav => fav.thread_id === b.id);
            return new Date(favB.created_at) - new Date(favA.created_at);
        });
        
        displayFavorites(favoriteThreads, myFavorites);
        
    } catch (error) {
        handleApiError(error, 'お気に入りの読み込みに失敗しました');
    } finally {
        hideLoading();
    }
}

// お気に入りを表示
function displayFavorites(threads, favorites) {
    const favoritesList = document.getElementById('favoritesList');
    if (!favoritesList) return;
    
    // ハッシュタグを配列に正規化
    threads = threads.map(thread => ({
        ...thread,
        hashtags: normalizeHashtags(thread.hashtags)
    }));
    
    favoritesList.innerHTML = threads.map(thread => {
        const favorite = favorites.find(fav => fav.thread_id === thread.id);
        const favoriteDate = favorite ? new Date(favorite.created_at) : null;
        
        const subcategoryHtml = thread.subcategory ? 
            `<span class="thread-subcategory">${escapeHtml(thread.subcategory)}</span>` : '';
        
        const hashtagsHtml = Array.isArray(thread.hashtags) && thread.hashtags.length > 0 ? 
            `<div class="thread-hashtags">
                ${thread.hashtags.map(tag => 
                    `<span class="thread-hashtag">#${escapeHtml(tag)}</span>`
                ).join('')}
            </div>` : '';
        
        return `
            <div class="thread-item category-${thread.category} fade-in favorite-item" 
                 onclick="window.location.href='thread.html?id=${thread.id}'">
                <div class="favorite-badge">
                    <i class="fas fa-star"></i> お気に入り
                    ${favoriteDate ? `<span class="favorite-date">${getRelativeTime(favoriteDate.getTime())}に追加</span>` : ''}
                </div>
                <h3 class="thread-title">${escapeHtml(thread.title)}</h3>
                <div class="thread-meta">
                    <span class="category">${escapeHtml(thread.category)}</span>
                    ${subcategoryHtml}
                    ${formatAuthorName(thread.author_name)}
                    <span class="date">${getRelativeTime(new Date(thread.created_at).getTime())}</span>
                </div>
                <div class="thread-preview">
                    ${escapeHtml(createPreview(thread.content, 120))}
                </div>
                ${Array.isArray(thread.images) && thread.images.length > 0 ? `
                <div class="thread-images">
                    <div class="image-gallery">
                        ${thread.images.slice(0, 3).map((imageUrl, index) => `
                            <img src="${imageUrl}" alt="画像${index + 1}" class="gallery-image" 
                                 onclick="event.stopPropagation(); openImageModal('${imageUrl}')">
                        `).join('')}
                        ${thread.images.length > 3 ? `<div class="more-images">+${thread.images.length - 3}</div>` : ''}
                    </div>
                </div>
                ` : ''}
                ${hashtagsHtml}
                <div class="thread-stats">
                    <span><i class="fas fa-comments"></i> ${thread.reply_count || 0}</span>
                    <span><i class="fas fa-heart"></i> ${thread.like_count || 0}</span>
                    <button class="remove-favorite-btn" onclick="removeFavorite(event, '${thread.id}')">
                        <i class="fas fa-star"></i> お気に入り解除
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// 空のお気に入りを表示
function displayEmptyFavorites() {
    const favoritesList = document.getElementById('favoritesList');
    if (!favoritesList) return;
    
    favoritesList.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-star"></i>
            <h3>お気に入りがありません</h3>
            <p>気になるスレッドをお気に入りに追加してみませんか？</p>
            <button class="browse-threads-btn" onclick="window.location.href='index.html'">
                <i class="fas fa-search"></i> スレッドを探す
            </button>
        </div>
    `;
}

// ローディング表示
function showLoading() {
    const loading = document.getElementById('loading');
    if (loading) {
        loading.style.display = 'block';
    }
}

// ローディング非表示
function hideLoading() {
    const loading = document.getElementById('loading');
    if (loading) {
        loading.style.display = 'none';
    }
}

// 成功メッセージを表示
function showSuccessMessage(message) {
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

// CSSアニメーションを追加（thread.jsと同じ）
const style = document.createElement('style');
style.textContent = `
@keyframes fadeInOut {
    0% { opacity: 0; transform: translateX(100px); }
    15% { opacity: 1; transform: translateX(0); }
    85% { opacity: 1; transform: translateX(0); }
    100% { opacity: 0; transform: translateX(100px); }
}

.favorite-badge, .my-post-badge {
    background-color: #ffc107;
    color: #212529;
    padding: 4px 12px;
    border-radius: 15px;
    font-size: 12px;
    margin-bottom: 10px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
}

.my-post-badge {
    background-color: #17a2b8;
    color: white;
}

.favorite-date {
    opacity: 0.8;
    margin-left: 8px;
}

.remove-favorite-btn {
    background-color: #ffc107;
    color: #212529;
    border: none;
    padding: 4px 12px;
    border-radius: 15px;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.3s ease;
}

.remove-favorite-btn:hover {
    background-color: #e0a800;
}

.create-thread-btn, .browse-threads-btn {
    background-color: #667eea;
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 25px;
    cursor: pointer;
    font-size: 14px;
    margin-top: 20px;
    transition: all 0.3s ease;
}

.create-thread-btn:hover, .browse-threads-btn:hover {
    background-color: #5a6fd8;
    transform: translateY(-2px);
}
`;
document.head.appendChild(style);

async function toggleFavoriteFromList(threadId) {
  try {
    await apiCall('/api/tables/favorites', {
      method: 'POST',
      body: JSON.stringify({
        thread_id: threadId,
        user_fingerprint: userFingerprint
      })
    });
    showMessage('お気に入りに追加しました', 'success');
  } catch (e) {
    handleApiError(e, 'お気に入り登録に失敗しました');
  }
}

async function removeFavorite(event, threadId) {
  event.stopPropagation();
  try {
    // まず自分のfavorites一覧を取得して対象IDを特定
    const res = await apiCall('/api/tables/favorites?limit=1000');
    const mine = (res.data || []).filter(f => f.user_fingerprint === userFingerprint);
    const target = mine.find(f => f.thread_id === threadId);
    if (!target) return;
    await apiCall(`/api/tables/favorites/${target.id}`, {
      method: 'DELETE',
      body: JSON.stringify({ user_fingerprint: userFingerprint })
    });
    showMessage('お気に入りを解除しました', 'success');
    loadFavorites();
  } catch (e) {
    handleApiError(e, 'お気に入り解除に失敗しました');
  }
}

