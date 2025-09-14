// 投稿一覧ページのJavaScript

let userFingerprint = null;

// ページ読み込み時の初期化
document.addEventListener('DOMContentLoaded', function() {
    userFingerprint = generateUserFingerprint();
    loadMyPosts();
});

// 自分の投稿を読み込み
async function loadMyPosts() {
    try {
        showLoading();
        
        const response = await fetch('tables/threads?limit=1000');
        if (!response.ok) {
            throw new Error('投稿の読み込みに失敗しました');
        }
        
        const result = await response.json();
        const allThreads = result.data || [];
        
        // 投稿者名で特定するのは困難なので、ローカルストレージを使用
        const myThreadIds = getUserPreference('myThreadIds', []);
        const myThreads = allThreads.filter(thread => myThreadIds.includes(thread.id));
        
        displayMyPosts(myThreads);
        
    } catch (error) {
        handleApiError(error, '投稿の読み込みに失敗しました');
    } finally {
        hideLoading();
    }
}

// 自分の投稿を表示
function displayMyPosts(threads) {
    const myPostsList = document.getElementById('myPostsList');
    if (!myPostsList) return;
    
    if (threads.length === 0) {
        myPostsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-edit"></i>
                <h3>投稿したスレッドがありません</h3>
                <p>最初のスレッドを作成してみませんか？</p>
                <button class="create-thread-btn" onclick="window.location.href='index.html'">
                    <i class="fas fa-plus"></i> 新規スレッド作成
                </button>
            </div>
        `;
        return;
    }
    
    // ハッシュタグを配列に正規化
    threads = threads.map(thread => ({
        ...thread,
        hashtags: normalizeHashtags(thread.hashtags)
    }));
    
    // 最新順でソート
    threads.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    myPostsList.innerHTML = threads.map(thread => {
        const subcategoryHtml = thread.subcategory ? 
            `<span class="thread-subcategory">${escapeHtml(thread.subcategory)}</span>` : '';
        
        const hashtagsHtml = Array.isArray(thread.hashtags) && thread.hashtags.length > 0 ? 
            `<div class="thread-hashtags">
                ${thread.hashtags.map(tag => 
                    `<span class="thread-hashtag">#${escapeHtml(tag)}</span>`
                ).join('')}
            </div>` : '';
        
        return `
            <div class="thread-item category-${thread.category} fade-in my-post-item" 
                 onclick="window.location.href='thread.html?id=${thread.id}'">
                <button class="favorite-btn favorite-btn-top" data-thread-id="${thread.id}" onclick="event.stopPropagation(); toggleFavoriteFromList('${thread.id}', this)">
                    <i class="far fa-star"></i>
                </button>
                <div class="my-post-badge">
                    <i class="fas fa-user"></i> あなたの投稿
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
                    <span class="post-status">
                        <i class="fas fa-eye"></i> 
                        ${(thread.reply_count || 0) > 0 ? 'コメントあり' : 'コメント待ち'}
                    </span>
                </div>
            </div>
        `;
    }).join('');
    
    // お気に入り状態を更新
    updateFavoriteStatus();
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

// スレッド一覧からお気に入りをトグル
async function toggleFavoriteFromList(threadId, button) {
    try {
        const userFingerprint = generateUserFingerprint();
        
        // 既存のお気に入りをチェック
        const favoritesResponse = await fetch(`tables/favorites?search=${encodeURIComponent(userFingerprint)}`);
        const favoritesData = await favoritesResponse.json();
        const existingFavorite = favoritesData.data.find(fav => 
            fav.thread_id === threadId && fav.user_fingerprint === userFingerprint
        );
        
        if (existingFavorite) {
            // お気に入りから削除
            await fetch(`tables/favorites/${existingFavorite.id}`, {
                method: 'DELETE'
            });
            
            button.classList.remove('favorited');
            button.querySelector('i').classList.remove('fas');
            button.querySelector('i').classList.add('far');
            showMessage('お気に入りから削除しました', 'success');
        } else {
            // お気に入りに追加
            await fetch('tables/favorites', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    thread_id: threadId,
                    user_fingerprint: userFingerprint,
                    favorited_at: new Date().toISOString()
                })
            });
            
            button.classList.add('favorited');
            button.querySelector('i').classList.remove('far');
            button.querySelector('i').classList.add('fas');
            showMessage('お気に入りに追加しました', 'success');
        }
        
    } catch (error) {
        console.error('お気に入り操作エラー:', error);
        showMessage('お気に入り操作に失敗しました', 'error');
    }
}

// お気に入り状態を更新
async function updateFavoriteStatus() {
    try {
        const userFingerprint = generateUserFingerprint();
        const favoritesResponse = await fetch(`tables/favorites?search=${encodeURIComponent(userFingerprint)}`);
        const favoritesData = await favoritesResponse.json();
        const favoriteThreadIds = favoritesData.data.map(fav => fav.thread_id);
        
        // 全てのお気に入りボタンの状態を更新
        document.querySelectorAll('.favorite-btn').forEach(button => {
            const threadId = button.getAttribute('data-thread-id');
            const isFavorited = favoriteThreadIds.includes(threadId);
            
            if (isFavorited) {
                button.classList.add('favorited');
                button.querySelector('i').classList.remove('far');
                button.querySelector('i').classList.add('fas');
            } else {
                button.classList.remove('favorited');
                button.querySelector('i').classList.remove('fas');
                button.querySelector('i').classList.add('far');
            }
        });
    } catch (error) {
        console.error('お気に入り状態の更新エラー:', error);
    }
}