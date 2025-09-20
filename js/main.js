// グローバル変数
let currentThreads = [];
let currentThreadId = null;
let currentFilter = 'all';
let userFingerprint = null;
let currentSearchTerm = '';
let currentSearchType = 'all';
let filteredThreads = [];

// 自分のスレッドかどうかを判定する関数
function isMyThread(thread) {
    if (!userFingerprint || !thread.user_fingerprint) {
        return false;
    }
    return thread.user_fingerprint === userFingerprint;
}

// ページ読み込み時の初期化
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    
    // 必要な関数が存在するかチェック
    console.log('関数チェック:');
    console.log('- showLoading:', typeof showLoading);
    console.log('- hideLoading:', typeof hideLoading);
    console.log('- normalizeHashtags:', typeof normalizeHashtags);
    console.log('- escapeHtml:', typeof escapeHtml);
    console.log('- getRelativeTime:', typeof getRelativeTime);
    console.log('- generateUserFingerprint:', typeof generateUserFingerprint);
    
    // DOM要素チェック
    console.log('DOM要素チェック:');
    console.log('- threadsList:', document.getElementById('threadsList') ? 'あり' : '見つからない');
    console.log('- loading:', document.getElementById('loading') ? 'あり' : '見つからない');
    
    try {
        // デバッグテスト実行（本番環境では無効化）
        if (false && typeof runFullDebugTest === 'function') {
            console.log('🔧 デバッグモードで実行します');
            setTimeout(runFullDebugTest, 100);
            return; // デバッグモードでは通常の初期化をスキップ
        }
        
        userFingerprint = generateUserFingerprint();
        console.log('ユーザーフィンガープリント生成完了:', userFingerprint);
        
        loadThreads();
        setupEventListeners();
        setupSearchFeatures();
        setupSubcategoryNavigation();
        
    } catch (error) {
        console.error('初期化エラー:', error);
        alert('ページの初期化に失敗しました: ' + error.message);
    }
});

// イベントリスナーの設定
function setupEventListeners() {
    // 新規スレッド作成フォーム
    const newThreadForm = document.getElementById('newThreadForm');
    if (newThreadForm) {
        newThreadForm.addEventListener('submit', handleNewThreadSubmit);
    }
    
    // 返信フォーム
    const replyForm = document.getElementById('replyForm');
    if (replyForm) {
        replyForm.addEventListener('submit', handleReplySubmit);
    }
    
    // モーダル外クリックで閉じる
    const modals = document.querySelectorAll('.modal-overlay');
    modals.forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                hideAllModals();
            }
        });
    });
    
    // ESCキーでモーダルを閉じる
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            hideAllModals();
        }
    });
}

// パフォーマンス最適化：キャッシュ
let threadsCache = null;
let favoritesCache = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 30000; // 30秒キャッシュ

// スレッド一覧を読み込み（最適化版）
async function loadThreads(category = 'all', retryCount = 0, useCache = true) {
    try {
        showLoading();
        
        console.log('スレッド読み込み開始...', retryCount > 0 ? `(リトライ ${retryCount})` : '');
        
        const now = Date.now();
        const cacheValid = useCache && threadsCache && favoritesCache && (now - cacheTimestamp < CACHE_DURATION);
        
        if (cacheValid) {
            console.log('キャッシュからデータを読み込み');
            currentThreads = threadsCache;
            displayThreads(category);
            updateFavoriteStatusFromCache(favoritesCache);
            hideLoading(); // キャッシュ使用時も必ずローディングを非表示
            return;
        }
        
        // 並列でスレッドとお気に入りデータを取得（パフォーマンス改善）
        console.log('API並列呼び出し開始...');
        const startTime = performance.now();
        
        const [threadsResult, favoritesResult] = await Promise.all([
            apiCall('/api/tables/threads').catch(error => {
                if (error.message.includes('500') && retryCount < 2) {
                    console.log('500エラーのためリトライします...');
                    return new Promise(resolve => {
                        setTimeout(async () => {
                            resolve(await apiCall('/api/tables/threads'));
                        }, 1000);
                    });
                }
                throw error;
            }),
            apiCall('/api/tables/favorites').catch(error => {
                console.warn('お気に入りデータ取得エラー (続行):', error);
                return { data: [] }; // エラー時は空配列で続行
            })
        ]);
        
        const endTime = performance.now();
        console.log(`並列API呼び出し完了: ${(endTime - startTime).toFixed(2)}ms`);
        
        if (!threadsResult || !threadsResult.data) {
            throw new Error('無効なデータ形式です');
        }
        
        // データを正規化してキャッシュ
        currentThreads = threadsResult.data.map(thread => ({
            ...thread,
            hashtags: normalizeHashtags(thread.hashtags),
            images: Array.isArray(thread.images) ? thread.images : []
        }));
        
        // キャッシュに保存
        threadsCache = currentThreads;
        favoritesCache = favoritesResult.data || [];
        cacheTimestamp = now;
        
        console.log('正規化後のスレッド:', currentThreads.length, '件');
        displayThreads(category);
        updateFavoriteStatusFromCache(favoritesCache);
        
    } catch (error) {
        console.error('スレッド読み込みエラー:', error);
        showMessage(`エラー: ${error.message}`, 'error');
        
        // エラー時は空の一覧を表示
        currentThreads = [];
        displayThreads(category);
        
    } finally {
        hideLoading();
    }
}

// スレッド一覧を表示
function displayThreads(category = 'all') {
    const threadsList = document.getElementById('threadsList');
    if (!threadsList) {
        console.error('threadsListエレメントが見つかりません');
        return;
    }
    
    console.log('表示開始 - カテゴリ:', category, 'スレッド数:', currentThreads.length);
    
    // フィルタリング
    let filteredThreads = currentThreads;
    if (category && category !== 'all') {
        filteredThreads = currentThreads.filter(thread => thread.category === category);
    }
    
    // ソート（新しい順）
    filteredThreads.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    if (filteredThreads.length === 0) {
        console.log('スレッドが0件のため空状態を表示');
        threadsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-comments"></i>
                <h3>スレッドがありません</h3>
                <p>最初のスレッドを作成してみませんか？</p>
                <button class="create-thread-btn" onclick="showNewThreadModal()">
                    <i class="fas fa-plus"></i> 新規スレッド作成
                </button>
            </div>
        `;
        
        // 空状態では広告をクリア
        if (window.adsenseHelpers && window.adsenseHelpers.clearThreadAds) {
            window.adsenseHelpers.clearThreadAds();
        }
        return;
    }
    
    console.log('スレッド表示開始:', filteredThreads.length, '件');
    
    try {
        threadsList.innerHTML = filteredThreads.map(thread => {
            console.log('スレッド表示中:', thread.id, thread.title);
            return `
        <div class="thread-item category-${thread.category} fade-in" 
             onclick="openThreadPage('${thread.id}')">
            <button class="favorite-btn favorite-btn-top" data-thread-id="${thread.id}" onclick="event.stopPropagation(); toggleFavoriteFromList('${thread.id}', this)">
                <i class="far fa-star"></i>
            </button>
            <h3 class="thread-title">${escapeHtml(thread.title)}</h3>
            <div class="thread-meta"> 
              <span class="category">${escapeHtml(thread.category)}</span>
              <span class="author">${
                thread.author_name === '管理人'
                  ? '<span class="badge-admin">🛡️ 管理人</span>'
                  : escapeHtml(thread.author_name || '匿名')
              }</span>
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
            ${Array.isArray(thread.hashtags) && thread.hashtags.length > 0 ? `
            <div class="thread-hashtags">
                ${thread.hashtags.map(tag => `<span class="thread-hashtag" onclick="event.stopPropagation(); searchByHashtag('${escapeHtml(tag)}')">#${escapeHtml(tag)}</span>`).join('')}
            </div>
            ` : ''}
            <div class="thread-stats">
                <span><i class="fas fa-comments"></i> ${thread.reply_count || 0}</span>
                <span><i class="fas fa-heart"></i> ${thread.like_count || 0}</span>
            </div>
            ${!isMyThread(thread) ? `
            <a href="#" class="thread-item-report" onclick="event.stopPropagation(); reportContent('thread', '${thread.id}', '${escapeHtml(thread.title)}'); return false;" title="通報">[通報]</a>
            ` : ''}
        </div>
            `;
        }).join('');
        
        console.log('スレッド表示完了');
        
        // お気に入り状態を更新（キャッシュから）
        if (favoritesCache) {
            updateFavoriteStatusFromCache(favoritesCache);
        }
        
        // スレッド間広告を挿入
        if (window.adsenseHelpers && window.adsenseHelpers.insertThreadAds) {
            setTimeout(() => {
                window.adsenseHelpers.clearThreadAds(); // 既存広告をクリア
                window.adsenseHelpers.insertThreadAds(); // 新しい広告を挿入
            }, 100);
        }
        
    } catch (error) {
        console.error('スレッド表示エラー:', error);
        threadsList.innerHTML = `
            <div class="error-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>表示エラーが発生しました</h3>
                <p>${error.message}</p>
                <button onclick="location.reload()" class="retry-btn">再読み込み</button>
            </div>
        `;
        
        // エラー状態では広告をクリア
        if (window.adsenseHelpers && window.adsenseHelpers.clearThreadAds) {
            window.adsenseHelpers.clearThreadAds();
        }
    }
}

// カテゴリフィルタリング
function filterByCategory(category) {
    currentFilter = category;
    
    // アクティブなボタンを更新
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    event.target.classList.add('active');
    
    displayThreads(category);
}

// 新規スレッド作成モーダルを表示
function showNewThreadModal() {
    const modal = document.getElementById('newThreadModal');
    if (modal) {
        modal.classList.add('active');
        
        // フォームをリセット
        const form = document.getElementById('newThreadForm');
        if (form) {
            form.reset();
            
            // 匿名選択をデフォルトにリセット
            const anonymousRadio = document.querySelector('input[name="authorType"][value="anonymous"]');
            if (anonymousRadio) {
                anonymousRadio.checked = true;
                toggleAuthorNameInput();
            }
            
            // サブカテゴリグループを非表示
            const subcategoryGroup = document.getElementById('subcategoryGroup');
            if (subcategoryGroup) {
                subcategoryGroup.style.display = 'none';
            }
            
            // ハッシュタグプレビューをクリア
            const hashtagPreview = document.getElementById('hashtagPreview');
            if (hashtagPreview) {
                hashtagPreview.innerHTML = '';
            }
        }
    }
}

// 新規スレッド作成モーダルを非表示
function hideNewThreadModal() {
    const modal = document.getElementById('newThreadModal');
    if (modal) {
        modal.classList.remove('active');
    }
    
    // フォームをリセット
    const form = document.getElementById('newThreadForm');
    if (form) {
        form.reset();
    }
    
    // 画像データをクリア
    uploadedImages.thread = [];
    updateImagePreview('thread');
    
    // ハッシュタグプレビューをクリア
    const hashtagPreview = document.getElementById('hashtagPreview');
    if (hashtagPreview) {
        hashtagPreview.innerHTML = '';
    }
}

// スレッド詳細ページに遷移
function openThreadPage(threadId) {
    window.location.href = `thread.html?id=${threadId}`;
}

// スレッド詳細モーダルを表示（旧関数・互換性のため残す）
async function openThreadDetail(threadId) {
    try {
        currentThreadId = threadId;
        
        // スレッド詳細を取得
        const threadResponse = await fetch(`tables/threads/${threadId}`);
        if (!threadResponse.ok) {
            throw new Error('スレッドの詳細取得に失敗しました');
        }
        
        const thread = await threadResponse.json();
        
        // スレッド詳細を表示
        document.getElementById('threadDetailTitle').textContent = thread.title;
        document.getElementById('threadDetailCategory').textContent = thread.category;
        document.getElementById('threadDetailAuthor').innerHTML = formatAuthorName(thread.author_name);
        document.getElementById('threadDetailDate').textContent = getRelativeTime(new Date(thread.created_at).getTime());
        document.getElementById('threadDetailContent').textContent = thread.content;
        document.getElementById('threadLikeCount').textContent = thread.like_count || 0;
        
        // コメントを読み込み
        await loadComments(threadId);
        
        // モーダルを表示
        const modal = document.getElementById('threadDetailModal');
        if (modal) {
            modal.classList.add('active');
        }
        
    } catch (error) {
        handleApiError(error, 'スレッドの詳細取得に失敗しました');
    }
}

// スレッド詳細モーダルを非表示
function hideThreadDetailModal() {
    const modal = document.getElementById('threadDetailModal');
    if (modal) {
        modal.classList.remove('active');
        currentThreadId = null;
    }
}

// コメントを読み込み
async function loadComments(threadId) {
    try {
        const response = await fetch(`tables/comments?sort=created_at&limit=100`);
        if (!response.ok) {
            throw new Error('コメントの読み込みに失敗しました');
        }
        
        const result = await response.json();
        const comments = (result.data || []).filter(comment => comment.thread_id === threadId);
        
        // コメント番号でソート
        comments.sort((a, b) => a.comment_number - b.comment_number);
        
        displayComments(comments);
        
    } catch (error) {
        console.error('コメントの読み込みエラー:', error);
    }
}

// コメントを表示
function displayComments(comments) {
    const commentsList = document.getElementById('commentsList');
    const commentCount = document.getElementById('commentCount');
    
    if (!commentsList || !commentCount) return;
    
    commentCount.textContent = comments.length;
    
    if (comments.length === 0) {
        commentsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-comment"></i>
                <p>まだ返信がありません</p>
            </div>
        `;
        return;
    }
    
    commentsList.innerHTML = comments.map(comment => `
        <div class="comment-item fade-in">
            <div class="comment-header">
                <span class="comment-number">${comment.comment_number}.</span>
                ${formatAuthorName(comment.author_name)}
                <span class="date">${getRelativeTime(new Date(comment.created_at).getTime())}</span>
            </div>
            <div class="comment-content">
                ${escapeHtml(comment.content)}
            </div>
            <div class="comment-actions">
                <button class="comment-like-btn" onclick="likeComment('${comment.id}')">
                    <i class="fas fa-heart"></i> ${comment.like_count || 0}
                </button>
            </div>
        </div>
    `).join('');
}

// 新規スレッド作成の処理
async function handleNewThreadSubmit(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const hashtagsInput = document.getElementById('threadHashtags').value;
    const hashtags = parseHashtags(hashtagsInput);
    
    // サブカテゴリの取得
    const subcategorySelect = document.getElementById('threadSubcategory');
    const customSubcategory = document.getElementById('customSubcategory');
    const subcategory = customSubcategory.value.trim() || 
                       (subcategorySelect ? subcategorySelect.value : '');
    
    const threadData = {
        title: formData.get('threadTitle') || document.getElementById('threadTitle').value,
        category: formData.get('threadCategory') || document.getElementById('threadCategory').value,
        subcategory: subcategory,
        content: formData.get('threadContent') || document.getElementById('threadContent').value,
        hashtags: hashtags,
        images: uploadedImages.thread || [],
        author_name: getAuthorName(true),
        reply_count: 0,
        like_count: 0,
         user_fingerprint: userFingerprint
    };
    
    // バリデーション
    const errors = validateThreadData(threadData);
    const hashtagErrors = validateHashtags(hashtags);
    const allErrors = [...errors, ...hashtagErrors];
    
    if (allErrors.length > 0) {
        alert(allErrors.join('\\n'));
        return;
    }
    
    try {
        const response = await fetch('/api/tables/threads', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(threadData)
        });
        
        if (!response.ok) {
            throw new Error('スレッドの作成に失敗しました');
        }
        
        // 投稿したスレッドIDをローカルストレージに保存
        const created = await response.json();             // { data: {...} }
        const createdId = (created && created.data && created.data.id) || created.id;
        // 投稿したスレッドIDをローカルに保存（mypostsの旧ローカル方式を活かす場合）
        const myThreadIds = getUserPreference('myThreadIds', []);
        if (createdId && !myThreadIds.includes(createdId)) {
            myThreadIds.push(createdId);
        }
        setUserPreference('myThreadIds', myThreadIds);
        
        // 成功メッセージ
        showMessage('スレッドを作成しました！', 'success');
        
        // 画像データをクリア
        uploadedImages.thread = [];
        updateImagePreview('thread');
        
        // モーダルを閉じて一覧を更新（キャッシュクリア）
        hideNewThreadModal();
        clearCache(); // 新規投稿時はキャッシュクリア
        await loadThreads(currentFilter);
        
    } catch (error) {
        handleApiError(error, 'スレッドの作成に失敗しました');
    }
}

// 返信の処理
async function handleReplySubmit(event) {
    event.preventDefault();
    
    if (!currentThreadId) return;
    
    const content = document.getElementById('replyContent').value.trim();
    
    const commentData = {
        thread_id: currentThreadId,
        content: content,
        author_name: getAuthorName(false),
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
        const commentsResponse = await fetch(`tables/comments`);
        const commentsResult = await commentsResponse.json();
        const threadComments = (commentsResult.data || []).filter(comment => comment.thread_id === currentThreadId);
        commentData.comment_number = threadComments.length + 1;
        
        // コメントを作成
        const response = await fetch('/api/tables/comments', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(commentData)
        });
        
        if (!response.ok) {
            throw new Error('返信の投稿に失敗しました');
        }
        
        // スレッド統計を即座に更新
        updateThreadStatsInList(currentThreadId, 'comment', 1);
        
        // フォームをリセット
        document.getElementById('replyContent').value = '';
        
        // 匿名選択をリセット
        const anonymousRadio = document.querySelector('input[name="replyAuthorType"][value="anonymous"]');
        if (anonymousRadio) {
            anonymousRadio.checked = true;
            toggleReplyAuthorNameInput();
        }
        
        const customNameInput = document.getElementById('replyCustomAuthorName');
        if (customNameInput) {
            customNameInput.value = '';
        }
        
        // コメント一覧を再読み込み
        await loadComments(currentThreadId);
        
        showMessage('返信を投稿しました！', 'success');
        
    } catch (error) {
        handleApiError(error, '返信の投稿に失敗しました');
    }
}

// スレッドの返信数を更新（統計更新は無効化されました）
async function updateThreadReplyCount(threadId, replyCount) {
    // この機能は無効化されました - 統計情報は手動更新されません
    console.log('統計更新は無効化されました:', { threadId, replyCount });
}

// スレッドにいいね
async function likeThread() {
    if (!currentThreadId || !userFingerprint) return;
    
    try {
        // 既にいいねしているかチェック
        const likesResponse = await apiCall('/api/tables/likes');
        const existingLike = (likesResponse.data || []).find(like => 
            like.target_id === currentThreadId && 
            like.target_type === 'thread' && 
            like.user_fingerprint === userFingerprint
        );
        
        if (existingLike) {
            alert('既にいいねしています');
            return;
        }
        
        // いいねを作成
        const likeData = {
            target_id: currentThreadId,
            target_type: 'thread',
            user_fingerprint: userFingerprint
        };
        
        const likeResponse = await fetch('/api/tables/likes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(likeData)
        });
        
        if (!likeResponse.ok) {
            throw new Error('いいねに失敗しました');
        }
        
        // 即座にUIを更新
        const threadLikeCountElement = document.getElementById('threadLikeCount');
        if (threadLikeCountElement) {
            const currentCount = parseInt(threadLikeCountElement.textContent || '0');
            threadLikeCountElement.textContent = currentCount + 1;
        }
        
        // スレッド一覧のいいね数も更新
        updateThreadStatsInList(currentThreadId, 'like', 1);
        
        showMessage('いいねしました！', 'success');
        
    } catch (error) {
        handleApiError(error, 'いいねに失敗しました');
    }
}

// コメントにいいね
async function likeComment(commentId) {
    if (!userFingerprint) return;
    
    try {
        // 既にいいねしているかチェック
        const likesResponse = await apiCall('/api/tables/likes');
        const existingLike = (likesResponse.data || []).find(like => 
            like.target_id === commentId && 
            like.target_type === 'comment' && 
            like.user_fingerprint === userFingerprint
        );
        
        if (existingLike) {
            showMessage('既にいいねしています', 'error');
            return;
        }
        
        // いいねを作成
        const likeData = {
            target_id: commentId,
            target_type: 'comment',
            user_fingerprint: userFingerprint
        };
        
        const likeResponse = await fetch('/api/tables/likes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(likeData)
        });
        
        if (!likeResponse.ok) {
            throw new Error('いいねに失敗しました');
        }
        
        // 即座にUIを更新
        const commentLikeButton = document.querySelector(`[onclick="likeComment('${commentId}')"]`);
        if (commentLikeButton) {
            const heartIcon = commentLikeButton.querySelector('i');
            const likeCountSpan = commentLikeButton.textContent.match(/\d+/);
            const currentCount = likeCountSpan ? parseInt(likeCountSpan[0]) : 0;
            commentLikeButton.innerHTML = `<i class="fas fa-heart"></i> ${currentCount + 1}`;
        }
        
        showMessage('いいねしました！', 'success');
        
    } catch (error) {
        handleApiError(error, 'いいねに失敗しました');
    }
}

// 検索実行
function performSearch() {
    const searchInput = document.getElementById('searchInput');
    const searchTypeSelect = document.getElementById('searchType');
    
    currentSearchTerm = searchInput ? searchInput.value.trim() : '';
    currentSearchType = searchTypeSelect ? searchTypeSelect.value : 'all';
    
    // フィルタされたスレッドを検索で絞り込み
    let threadsToDisplay = currentThreads;
    
    // カテゴリフィルタ
    if (currentFilter && currentFilter !== 'all') {
        threadsToDisplay = threadsToDisplay.filter(thread => thread.category === currentFilter);
    }
    
    // 検索フィルタ
    if (currentSearchTerm) {
        threadsToDisplay = filterThreadsBySearch(threadsToDisplay, currentSearchTerm, currentSearchType);
    }
    
    // 日付フィルタ
    const dateFilter = document.getElementById('dateFilter');
    if (dateFilter && dateFilter.value !== 'all') {
        threadsToDisplay = filterThreadsByDate(threadsToDisplay, dateFilter.value);
    }
    
    // ソート
    const sortOrder = document.getElementById('sortOrder');
    if (sortOrder) {
        threadsToDisplay = sortThreads(threadsToDisplay, sortOrder.value);
    }
    
    // 検索結果を表示
    displaySearchResults(threadsToDisplay);
    
    // 検索結果情報を更新
    updateSearchResultsInfo(threadsToDisplay);
}

// 検索実行関数（ボタン用）
function executeSearch() {
    performSearch();
}

// Enterキー押下時の検索実行
function handleSearchKeyPress(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        executeSearch();
    }
}

// 検索をクリア
function clearSearch() {
    const searchInput = document.getElementById('searchInput');
    const searchClearBtn = document.getElementById('searchClearBtn');
    const searchTypeSelect = document.getElementById('searchType');
    const dateFilter = document.getElementById('dateFilter');
    const sortOrder = document.getElementById('sortOrder');
    
    // 検索入力をクリア
    if (searchInput) {
        searchInput.value = '';
    }
    
    // 検索クリアボタンを非表示
    if (searchClearBtn) {
        searchClearBtn.classList.remove('visible');
    }
    
    // 検索フィルターをリセット
    if (searchTypeSelect) {
        searchTypeSelect.value = 'all';
    }
    
    // 期間フィルターをリセット
    if (dateFilter) {
        dateFilter.value = 'all';
    }
    
    // ソート順をリセット
    if (sortOrder) {
        sortOrder.value = 'newest';
    }
    
    // グローバル変数をクリア
    currentSearchTerm = '';
    currentSearchType = 'all';
    
    // 通常のスレッド表示に戻す
    displayThreads(currentFilter);
    
    console.log('検索をクリアしました');
}

// 詳細検索パネルの切り替え関数は削除されました（フィルターが常時表示のため不要）

// ハッシュタグで検索
function searchByHashtag(hashtag) {
    const searchInput = document.getElementById('searchInput');
    const searchTypeSelect = document.getElementById('searchType');
    
    if (searchInput) {
        searchInput.value = '#' + hashtag;
    }
    
    if (searchTypeSelect) {
        searchTypeSelect.value = 'hashtag';
    }
    
    performSearch();
}

// 検索結果を表示
function displaySearchResults(threads) {
    const threadsList = document.getElementById('threadsList');
    if (!threadsList) {
        console.error('threadsListエレメントが見つかりません');
        return;
    }
    
    console.log('検索結果表示:', threads.length, '件');
    
    if (threads.length === 0) {
        threadsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search"></i>
                <h3>検索結果がありません</h3>
                <p>${currentSearchTerm ? `「${currentSearchTerm}」` : '条件'}に一致するスレッドが見つかりませんでした</p>
                <button class="clear-search-btn" onclick="clearSearch()">
                    <i class="fas fa-times"></i> 検索をクリア
                </button>
            </div>
        `;
        return;
    }
    
    // スレッド一覧を表示
    threadsList.innerHTML = threads.map(thread => {
        // 検索語をハイライト
        const titleHtml = currentSearchTerm ? 
            highlightSearchText(thread.title, currentSearchTerm) : 
            escapeHtml(thread.title);
        const contentHtml = currentSearchTerm ? 
            highlightSearchText(createPreview(thread.content, 120), currentSearchTerm) : 
            escapeHtml(createPreview(thread.content, 120));
        
        return `
        <div class="thread-item category-${thread.category} fade-in" 
             onclick="openThreadPage('${thread.id}')">
            <button class="favorite-btn favorite-btn-top" data-thread-id="${thread.id}" onclick="event.stopPropagation(); toggleFavoriteFromList('${thread.id}', this)">
                <i class="far fa-star"></i>
            </button>
            <h3 class="thread-title">${titleHtml}</h3>
            <div class="thread-meta">
                <span class="category">${escapeHtml(thread.category)}</span>
                <span class="author">${escapeHtml(thread.author_name)}</span>
                <span class="date">${getRelativeTime(new Date(thread.created_at).getTime())}</span>
            </div>
            <div class="thread-preview">
                ${contentHtml}
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
            ${Array.isArray(thread.hashtags) && thread.hashtags.length > 0 ? `
            <div class="thread-hashtags">
                ${thread.hashtags.map(tag => {
                    const tagHtml = currentSearchTerm && currentSearchType === 'hashtag' ? 
                        highlightSearchText(tag, currentSearchTerm.replace(/^#/, '')) : 
                        escapeHtml(tag);
                    return `<span class="thread-hashtag" onclick="event.stopPropagation(); searchByHashtag('${escapeHtml(tag)}')">#${tagHtml}</span>`;
                }).join('')}
            </div>
            ` : ''}
            <div class="thread-stats">
                <span><i class="fas fa-comments"></i> ${thread.reply_count || 0}</span>
                <span><i class="fas fa-heart"></i> ${thread.like_count || 0}</span>
            </div>
        </div>
        `;
    }).join('');
    
    // お気に入り状態を更新（キャッシュから）
    if (favoritesCache) {
        updateFavoriteStatusFromCache(favoritesCache);
    }
}

// 検索結果情報の更新
function updateSearchResultsInfo(threads) {
    // 検索結果の統計情報を表示したい場合は、ここに検索情報エリアの表示ロジックを追加
    console.log(`検索完了: ${threads.length}件の結果`);
    
    // 検索クリアボタンの表示状態を更新
    const searchClearBtn = document.getElementById('searchClearBtn');
    if (searchClearBtn) {
        const hasSearchTerm = currentSearchTerm && currentSearchTerm.length > 0;
        searchClearBtn.classList.toggle('visible', hasSearchTerm);
    }
}

// サブカテゴリナビゲーションの設定
function setupSubcategoryNavigation() {
    // カテゴリボタンにクリックイベントを追加して、サブカテゴリを表示
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const category = this.textContent.trim();
            if (category !== 'すべて') {
                showSubcategoriesForCategory(category);
            } else {
                hideSubcategorySection();
            }
        });
    });
}

// 特定カテゴリのサブカテゴリを表示
function showSubcategoriesForCategory(category) {
    const subcategorySection = document.getElementById('subcategorySection');
    const subcategoryList = document.getElementById('subcategoryList');
    
    if (!subcategorySection || !subcategoryList) return;
    
    const subcategories = getSubcategories()[category] || [];
    
    if (subcategories.length === 0) {
        hideSubcategorySection();
        return;
    }
    
    // 現在のスレッドから各サブカテゴリの投稿数を計算
    const subcategoryCounts = {};
    filteredThreads.forEach(thread => {
        if (thread.category === category && thread.subcategory) {
            subcategoryCounts[thread.subcategory] = (subcategoryCounts[thread.subcategory] || 0) + 1;
        }
    });
    
    subcategoryList.innerHTML = subcategories.map(subcat => {
        const count = subcategoryCounts[subcat] || 0;
        return `
            <span class="subcategory-item" onclick="filterBySubcategory('${category}', '${escapeHtml(subcat)}')">
                ${escapeHtml(subcat)}
                ${count > 0 ? `<span class="count">(${count})</span>` : ''}
            </span>
        `;
    }).join('');
    
    subcategorySection.style.display = 'block';
}

// サブカテゴリセクションを非表示
function hideSubcategorySection() {
    const subcategorySection = document.getElementById('subcategorySection');
    if (subcategorySection) {
        subcategorySection.style.display = 'none';
    }
}

// サブカテゴリでフィルタリング
function filterBySubcategory(category, subcategory) {
    currentFilter = category;
    
    // 該当するスレッドのみを表示
    const threadsFilteredBySubcategory = currentThreads.filter(thread => 
        thread.category === category && thread.subcategory === subcategory
    );
    
    const threadsList = document.getElementById('threadsList');
    if (!threadsList) return;
    
    if (threadsFilteredBySubcategory.length === 0) {
        threadsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-comments"></i>
                <h3>「${subcategory}」のスレッドがありません</h3>
                <p>最初のスレッドを作成してみませんか？</p>
            </div>
        `;
        return;
    }
    
    // サブカテゴリでフィルタしたスレッドを表示
    filteredThreads = threadsFilteredBySubcategory;
    displayFilteredThreads();
    
    // サブカテゴリアイテムのアクティブ状態を更新
    document.querySelectorAll('.subcategory-item').forEach(item => {
        item.classList.remove('active');
    });
    
    event.target.classList.add('active');
}

// スレッド統計をリストで更新
function updateThreadStatsInList(threadId, statType, increment) {
    currentThreads.forEach(thread => {
        if (thread.id === threadId) {
            if (statType === 'like') {
                thread.like_count = (thread.like_count || 0) + increment;
            } else if (statType === 'comment') {
                thread.reply_count = (thread.reply_count || 0) + increment;
            }
        }
    });
    
    // 表示も即座に更新
    const threadElement = document.querySelector(`[onclick="openThreadPage('${threadId}')"] .thread-stats`);
    if (threadElement) {
        const statsElements = threadElement.querySelectorAll('span');
        statsElements.forEach(stat => {
            if (statType === 'comment' && stat.innerHTML.includes('fa-comments')) {
                const currentCount = parseInt(stat.textContent.match(/\d+/)?.[0] || '0');
                stat.innerHTML = `<i class="fas fa-comments"></i> ${currentCount + increment}`;
            } else if (statType === 'like' && stat.innerHTML.includes('fa-heart')) {
                const currentCount = parseInt(stat.textContent.match(/\d+/)?.[0] || '0');
                stat.innerHTML = `<i class="fas fa-heart"></i> ${currentCount + increment}`;
            }
        });
    }
}

// フィルタされたスレッドを表示
function displayFilteredThreads() {
    const threadsList = document.getElementById('threadsList');
    if (!threadsList) return;
    
    // 検索フィルタを適用
    let displayThreads = filteredThreads;
    if (currentSearchTerm) {
        displayThreads = filterThreadsBySearch(displayThreads, currentSearchTerm, currentSearchType);
    }
    
    // 日付フィルタを適用
    const dateFilter = document.getElementById('dateFilter');
    if (dateFilter) {
        displayThreads = filterThreadsByDate(displayThreads, dateFilter.value);
    }
    
    // ソート
    const sortOrder = document.getElementById('sortOrder');
    const sortValue = sortOrder ? sortOrder.value : 'newest';
    displayThreads = sortThreads(displayThreads, sortValue);
    
    threadsList.innerHTML = displayThreads.map(thread => {
        const titleHtml = currentSearchTerm ? 
            highlightSearchText(thread.title, currentSearchTerm) : 
            escapeHtml(thread.title);
        const contentHtml = currentSearchTerm ? 
            highlightSearchText(createPreview(thread.content, 120), currentSearchTerm) : 
            escapeHtml(createPreview(thread.content, 120));
        
        const hashtagsHtml = Array.isArray(thread.hashtags) && thread.hashtags.length > 0 ? 
            `<div class="thread-hashtags">
                ${thread.hashtags.map(tag => 
                    `<span class="thread-hashtag" onclick="searchByHashtag('${escapeHtml(tag)}')\">#${escapeHtml(tag)}</span>`
                ).join('')}
            </div>` : '';
        
        const subcategoryHtml = thread.subcategory ? 
            `<span class="thread-subcategory">${escapeHtml(thread.subcategory)}</span>` : '';
        
        return `
            <div class="thread-item category-${thread.category} fade-in" 
                 onclick="openThreadPage('${thread.id}')">
                <button class="favorite-btn favorite-btn-top" data-thread-id="${thread.id}" onclick="event.stopPropagation(); toggleFavoriteFromList('${thread.id}', this)">
                    <i class="far fa-star"></i>
                </button>
                <h3 class="thread-title">${titleHtml}</h3>
                <div class="thread-meta">
                    <span class="category">${escapeHtml(thread.category)}</span>
                    ${subcategoryHtml}
                    ${formatAuthorName(thread.author_name)}
                    <span class="date">${getRelativeTime(new Date(thread.created_at).getTime())}</span>
                </div>
                <div class="thread-preview">
                    ${contentHtml}
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
                    </button>
                </div>
            </div>
        `;
    }).join('');
    
    // お気に入り状態を更新（キャッシュから）
    if (favoritesCache) {
        updateFavoriteStatusFromCache(favoritesCache);
    }
}

// 匿名/記名選択の切り替え（スレッド作成）
function toggleAuthorNameInput() {
    const anonymousRadio = document.querySelector('input[name="authorType"][value="anonymous"]');
    const customNameGroup = document.getElementById('customNameGroup');
    
    if (!anonymousRadio || !customNameGroup) return;
    
    if (anonymousRadio.checked) {
        customNameGroup.style.display = 'none';
    } else {
        customNameGroup.style.display = 'block';
        // フォーカスを移動
        const customInput = document.getElementById('customAuthorName');
        if (customInput) {
            customInput.focus();
        }
    }
}

// 匿名/記名選択の切り替え（返信）
function toggleReplyAuthorNameInput() {
    const anonymousRadio = document.querySelector('input[name="replyAuthorType"][value="anonymous"]');
    const customNameGroup = document.getElementById('replyCustomNameGroup');
    
    if (!anonymousRadio || !customNameGroup) return;
    
    if (anonymousRadio.checked) {
        customNameGroup.style.display = 'none';
    } else {
        customNameGroup.style.display = 'inline-block';
        // フォーカスを移動
        const customInput = document.getElementById('replyCustomAuthorName');
        if (customInput) {
            customInput.focus();
        }
    }
}

// 投稿者名を取得
function getAuthorName(isThread = true) {
    const radioName = isThread ? 'authorType' : 'replyAuthorType';
    const inputId = isThread ? 'customAuthorName' : 'replyCustomAuthorName';
    
    const selectedType = document.querySelector(`input[name="${radioName}"]:checked`);
    
    if (!selectedType) return '匿名';
    
    if (selectedType.value === 'anonymous') {
        return '匿名';
    } else {
        const customInput = document.getElementById(inputId);
        const customName = customInput ? customInput.value.trim() : '';
        return customName || '匿名';
    }
}



// スレッド作成時のサブカテゴリオプション更新
function updateSubcategoryOptions() {
    const categorySelect = document.getElementById('threadCategory');
    const subcategoryGroup = document.getElementById('subcategoryGroup');
    const subcategorySelect = document.getElementById('threadSubcategory');
    
    if (!categorySelect || !subcategoryGroup || !subcategorySelect) return;
    
    const selectedCategory = categorySelect.value;
    
    if (!selectedCategory) {
        subcategoryGroup.style.display = 'none';
        return;
    }
    
    const subcategories = getSubcategories()[selectedCategory] || [];
    
    if (subcategories.length === 0) {
        subcategoryGroup.style.display = 'none';
        return;
    }
    
    // サブカテゴリオプションを更新
    subcategorySelect.innerHTML = '<option value="">選択してください（任意）</option>' +
        subcategories.map(subcat => `<option value="${escapeHtml(subcat)}">${escapeHtml(subcat)}</option>`).join('');
    
    subcategoryGroup.style.display = 'block';
}

// 全てのモーダルを閉じる
function hideAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.classList.remove('active');
    });
    currentThreadId = null;
}

// スレッド一覧からお気に入りをトグル
async function toggleFavoriteFromList(threadId, button) {
    if (!threadId || !button) {
        console.error('無効なパラメータ:', { threadId, button });
        return;
    }
    
    try {
        const userFingerprint = generateUserFingerprint();
        console.log('お気に入りトグル開始:', threadId, userFingerprint);
        
        // ボタンを一時的に無効化
        button.disabled = true;
        
        // 新しいtoggle APIを使用
        const toggleResponse = await fetch('/api/favorites/toggle', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                threadId: threadId,
                userFingerprint: userFingerprint
            })
        });
        
        if (!toggleResponse.ok) {
            const errorData = await toggleResponse.json().catch(() => ({}));
            throw new Error(errorData.error || 'お気に入り操作に失敗しました');
        }
        
        const result = await toggleResponse.json();
        console.log('トグル結果:', result);
        
        if (result.action === 'favorited') {
            // お気に入りに追加された
            button.classList.add('favorited');
            const icon = button.querySelector('i');
            if (icon) {
                icon.classList.remove('far');
                icon.classList.add('fas');
            }
            showMessage('お気に入りに追加しました', 'success');
            
            // キャッシュを更新（API呼び出しを避ける）
            if (favoritesCache) {
                favoritesCache.push({ thread_id: threadId, user_fingerprint: userFingerprint });
            }
        } else if (result.action === 'unfavorited') {
            // お気に入りから削除された
            button.classList.remove('favorited');
            const icon = button.querySelector('i');
            if (icon) {
                icon.classList.remove('fas');
                icon.classList.add('far');
            }
            showMessage('お気に入りから削除しました', 'success');
            
            // キャッシュからも削除（API呼び出しを避ける）
            if (favoritesCache) {
                favoritesCache = favoritesCache.filter(fav => 
                    !(fav.thread_id === threadId && fav.user_fingerprint === userFingerprint)
                );
            }
        }
        
        // アニメーション効果
        button.style.transform = 'scale(0.9)';
        setTimeout(() => {
            button.style.transform = 'scale(1)';
        }, 150);
        
    } catch (error) {
        console.error('お気に入り操作エラー:', error);
        showMessage('お気に入り操作に失敗しました: ' + error.message, 'error');
    } finally {
        // ボタンを再び有効化
        button.disabled = false;
    }
}



// お気に入り状態を更新（最適化版 - 既存データから更新）
async function updateFavoriteStatus() {
    // この関数は非推奨 - loadThreadsで並列取得するため
    console.warn('updateFavoriteStatus()は非推奨です。loadThreads()で並列取得されます。');
    
    // キャッシュがある場合は使用
    if (favoritesCache) {
        updateFavoriteStatusFromCache(favoritesCache);
        return;
    }
    
    // キャッシュがない場合のみAPI呼び出し
    try {
        const favoritesResponse = await fetch('/api/tables/favorites');
        
        if (!favoritesResponse.ok) {
            console.warn('お気に入りデータの取得に失敗:', favoritesResponse.status);
            return;
        }
        
        const favoritesData = await favoritesResponse.json();
        updateFavoriteStatusFromCache(favoritesData.data || []);
    } catch (error) {
        console.error('お気に入り状態の更新エラー:', error);
    }
}

// キャッシュからお気に入り状態を更新（高速化）
function updateFavoriteStatusFromCache(favoritesData) {
    if (!Array.isArray(favoritesData)) {
        console.warn('お気に入りデータが無効な形式:', favoritesData);
        return;
    }
    
    const favoriteThreadIds = favoritesData.map(fav => fav.thread_id);
    
    // 全てのお気に入りボタンの状態を更新
    document.querySelectorAll('.favorite-btn').forEach(button => {
        const threadId = button.getAttribute('data-thread-id');
        const isFavorited = favoriteThreadIds.includes(threadId);
        
        if (isFavorited) {
            button.classList.add('favorited');
            button.querySelector('i')?.classList.remove('far');
            button.querySelector('i')?.classList.add('fas');
        } else {
            button.classList.remove('favorited');
            button.querySelector('i')?.classList.remove('fas');
            button.querySelector('i')?.classList.add('far');
        }
    });
}

// キャッシュクリア関数
function clearCache() {
    threadsCache = null;
    favoritesCache = null;
    cacheTimestamp = 0;
    console.log('キャッシュをクリアしました');
}

// 検索機能の設定
function setupSearchFeatures() {
    console.log('検索機能を設定中...');
    
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    const searchClearBtn = document.getElementById('searchClearBtn');
    
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            const hasText = this.value.trim().length > 0;
            if (searchClearBtn) {
                searchClearBtn.classList.toggle('visible', hasText);
            }
        });
        
        searchInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                performSearch();
            }
        });
    }
    
    if (searchBtn) {
        searchBtn.addEventListener('click', performSearch);
    }
    
    if (searchClearBtn) {
        searchClearBtn.addEventListener('click', clearSearch);
    }
    
    console.log('検索機能設定完了');
}

// 検索フィルタリング関数
function filterThreadsBySearch(threads, searchTerm, searchType) {
    if (!searchTerm) return threads;
    
    return threads.filter(thread => {
        switch (searchType) {
            case 'title':
                return searchInText(thread.title, searchTerm);
            case 'content':
                return searchInText(thread.content, searchTerm);
            case 'hashtag':
                return searchInHashtags(thread.hashtags, searchTerm);
            case 'all':
            default:
                return searchInText(thread.title, searchTerm) ||
                       searchInText(thread.content, searchTerm) ||
                       searchInHashtags(thread.hashtags, searchTerm);
        }
    });
}

// 日付フィルタリング関数
function filterThreadsByDate(threads, dateFilter) {
    if (!dateFilter || dateFilter === 'all') return threads;
    
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const oneWeek = 7 * oneDay;
    const oneMonth = 30 * oneDay;
    
    return threads.filter(thread => {
        const threadDate = new Date(thread.created_at).getTime();
        const diff = now - threadDate;
        
        switch (dateFilter) {
            case 'today':
                return diff <= oneDay;
            case 'week':
                return diff <= oneWeek;
            case 'month':
                return diff <= oneMonth;
            default:
                return true;
        }
    });
}

// スレッドソート関数
function sortThreads(threads, sortOrder) {
    return [...threads].sort((a, b) => {
        switch (sortOrder) {
            case 'oldest':
                return new Date(a.created_at) - new Date(b.created_at);
            case 'popular':
                return (b.like_count || 0) - (a.like_count || 0);
            case 'replies':
                return (b.reply_count || 0) - (a.reply_count || 0);
            case 'newest':
            default:
                return new Date(b.created_at) - new Date(a.created_at);
        }
    });
}

// 検索文字列のハイライト
function highlightSearchText(text, searchTerm) {
    if (!searchTerm || !text) return escapeHtml(text);
    
    const escapedText = escapeHtml(text);
    const escapedSearchTerm = escapeHtml(searchTerm);
    const regex = new RegExp(`(${escapedSearchTerm})`, 'gi');
    
    return escapedText.replace(regex, '<span class="search-highlight">$1</span>');
}

// テキスト内検索
function searchInText(text, searchTerm) {
    if (!searchTerm || !text) return false;
    return text.toLowerCase().includes(searchTerm.toLowerCase());
}

// ハッシュタグ内検索
function searchInHashtags(hashtags, searchTerm) {
    if (!searchTerm || !Array.isArray(hashtags)) return false;
    
    const cleanSearchTerm = searchTerm.replace(/^#/, '').toLowerCase();
    
    return hashtags.some(tag => 
        tag.toLowerCase().includes(cleanSearchTerm)
    );
}

// サブカテゴリ情報を取得
function getSubcategories() {
    return {
        '大学受験': [
            '東京大学', '京都大学', '大阪大学', '東京工業大学', '一橋大学',
            '北海道大学', '東北大学', '名古屋大学', '九州大学', 
            '早稲田大学', '慶應義塾大学', '上智大学', 'MARCH', '関関同立',
            '国公立大学', '私立大学', '医学部', '薬学部', '工学部',
            '共通テスト', 'センター試験', '二次試験', '推薦入試', 'AO入試'
        ],
        '高校受験': [
            '都立高校', '県立高校', '私立高校', '中高一貫校',
            '偏差値70以上', '偏差値60-69', '偏差値50-59',
            '内申点', '推薦入試', '一般入試', '特色検査'
        ],
        '中学受験': [
            '開成中学', '麻布中学', '桜蔭中学', '女子学院中学',
            'SAPIX', '日能研', '四谷大塚', '早稲田アカデミー',
            '算数', '国語', '理科', '社会', '適性検査'
        ],
        '資格試験': [
            '英検', 'TOEIC', 'TOEFL', 'IELTS',
            '簿記', '情報処理技術者試験', '宅建士', '行政書士'
        ],
        '公務員試験': [
            '国家公務員', '地方公務員', '警察官', '消防士', '教員採用試験'
        ],
        '就職試験': [
            'SPI', '玉手箱', 'GAB', 'CAB', '筆記試験', '面接対策'
        ],
        'その他': [
            '語学学習', '留学準備', '編入試験', 'スキルアップ'
        ]
    };
}
