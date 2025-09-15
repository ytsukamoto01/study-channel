// グローバル変数
let currentThreads = [];
let currentThreadId = null;
let currentFilter = 'all';
let userFingerprint = null;
let currentSearchTerm = '';
let currentSearchType = 'all';
let filteredThreads = [];

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

// スレッド一覧を読み込み
async function loadThreads(category = 'all', retryCount = 0) {
    try {
        showLoading();
        
        console.log('スレッド読み込み開始...', retryCount > 0 ? `(リトライ ${retryCount})` : '');
        console.log('現在のURL:', window.location.href);
        console.log('ベースURL確認:', window.location.origin);
        
        // API接続テスト
        const testUrl = '/api/tables/threads';
        console.log('API URL:', testUrl);
        
        let result;
        try {
            result = await apiCall('/api/tables/threads');
        } catch (error) {
            // 500エラーの場合はリトライ
            if (error.message.includes('500') && retryCount < 2) {
                console.log('500エラーのためリトライします...');
                await new Promise(resolve => setTimeout(resolve, 1000)); // 1秒待機
                return loadThreads(category, retryCount + 1);
            }
            throw error;
        }
        console.log('取得データ:', result);
        
        if (!result || !result.data) {
            throw new Error('無効なデータ形式です');
        }
        
        currentThreads = result.data.map(thread => ({
            ...thread,
            hashtags: normalizeHashtags(thread.hashtags),
            images: Array.isArray(thread.images) ? thread.images : []
        }));
        
        console.log('正規化後のスレッド:', currentThreads);
        displayThreads(category);
        
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
                <span class="author">${escapeHtml(thread.author_name)}</span>
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
        </div>
            `;
        }).join('');
        
        console.log('スレッド表示完了');
        
        // お気に入り状態を更新
        updateFavoriteStatus();
        
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
        
        // モーダルを閉じて一覧を更新
        hideNewThreadModal();
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
        const response = await fetch('tables/comments', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(commentData)
        });
        
        if (!response.ok) {
            throw new Error('返信の投稿に失敗しました');
        }
        
        // スレッドの返信数を更新
        await updateThreadReplyCount(currentThreadId, threadComments.length + 1);
        
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
        
        // スレッド一覧も更新
        await loadThreads(currentFilter);
        
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
        const likesResponse = await fetch(`tables/likes`);
        const likesResult = await likesResponse.json();
        const existingLike = (likesResult.data || []).find(like => 
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
        
        const likeResponse = await fetch('tables/likes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(likeData)
        });
        
        if (!likeResponse.ok) {
            throw new Error('いいねに失敗しました');
        }
        
        // スレッドのいいね数を更新（統計更新は無効化されました）
        // const threadResponse = await fetch(`tables/threads/${currentThreadId}`);
        // const thread = await threadResponse.json();
        // const newLikeCount = (thread.like_count || 0) + 1;
        
        // 統計更新は無効化されました
        console.log('統計更新は無効化されました - いいね数は手動更新されません');
        
        // 表示を更新（固定値）
        const currentCount = parseInt(document.getElementById('threadLikeCount').textContent || '0');
        document.getElementById('threadLikeCount').textContent = currentCount + 1;
        await loadThreads(currentFilter);
        
    } catch (error) {
        handleApiError(error, 'いいねに失敗しました');
    }
}

// コメントにいいね
async function likeComment(commentId) {
    if (!userFingerprint) return;
    
    try {
        // 既にいいねしているかチェック
        const likesResponse = await fetch(`tables/likes`);
        const likesResult = await likesResponse.json();
        const existingLike = (likesResult.data || []).find(like => 
            like.target_id === commentId && 
            like.target_type === 'comment' && 
            like.user_fingerprint === userFingerprint
        );
        
        if (existingLike) {
            alert('既にいいねしています');
            return;
        }
        
        // いいねを作成
        const likeData = {
            target_id: commentId,
            target_type: 'comment',
            user_fingerprint: userFingerprint
        };
        
        const likeResponse = await fetch('tables/likes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(likeData)
        });
        
        if (!likeResponse.ok) {
            throw new Error('いいねに失敗しました');
        }
        
        // コメントのいいね数を更新（統計更新は無効化されました）
        // const commentResponse = await fetch(`tables/comments/${commentId}`);
        // const comment = await commentResponse.json();
        // const newLikeCount = (comment.like_count || 0) + 1;
        
        // 統計更新は無効化されました
        console.log('統計更新は無効化されました - コメントいいね数は手動更新されません');
        
        // コメント一覧を再読み込み
        await loadComments(currentThreadId);
        
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
    
    displayThreads(currentFilter);
}

// 検索をクリア
function clearSearch() {
    const searchInput = document.getElementById('searchInput');
    const searchClearBtn = document.getElementById('searchClearBtn');
    const searchResultsInfo = document.getElementById('searchResultsInfo');
    
    if (searchInput) {
        searchInput.value = '';
    }
    
    if (searchClearBtn) {
        searchClearBtn.classList.remove('visible');
    }
    
    if (searchResultsInfo) {
        searchResultsInfo.style.display = 'none';
    }
    
    currentSearchTerm = '';
    displayThreads(currentFilter);
}

// 詳細検索パネルの切り替え
function toggleAdvancedSearch() {
    const panel = document.getElementById('advancedSearchPanel');
    const button = document.querySelector('.advanced-search-btn');
    
    if (panel && button) {
        panel.classList.toggle('active');
        button.classList.toggle('active');
        
        if (panel.classList.contains('active')) {
            button.innerHTML = '<i class="fas fa-filter"></i> 詳細検索を閉じる';
        } else {
            button.innerHTML = '<i class="fas fa-filter"></i> 詳細検索';
        }
    }
}

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

// 検索結果情報の更新
function updateSearchResultsInfo() {
    const searchResultsInfo = document.getElementById('searchResultsInfo');
    const resultsCount = searchResultsInfo ? searchResultsInfo.querySelector('.results-count') : null;
    
    if (!searchResultsInfo || !resultsCount) return;
    
    if (currentSearchTerm) {
        const count = filteredThreads.length;
        resultsCount.textContent = `「${currentSearchTerm}」の検索結果: ${count}件`;
        searchResultsInfo.style.display = 'flex';
    } else {
        searchResultsInfo.style.display = 'none';
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
    
    // お気に入り状態を更新
    updateFavoriteStatus();
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
        
        // 既存のお気に入りをチェック
        const favoritesData = await apiCall('/api/tables/favorites');
        console.log('お気に入りデータ取得:', favoritesData);
        
        // データ構造を確認
        if (!favoritesData) {
            console.warn('お気に入りデータがnull:', favoritesData);
            showMessage('お気に入り機能が一時的に利用できません', 'error');
            return;
        }
        
        // dataプロパティが存在するか確認
        const favorites = Array.isArray(favoritesData.data) ? favoritesData.data : [];
        console.log('お気に入りリスト:', favorites.length, '件');
        
        const existingFavorite = favorites.find(fav => 
            fav && fav.thread_id === threadId && fav.user_fingerprint === userFingerprint
        );
        
        if (existingFavorite) {
            console.log('既存のお気に入りを削除:', existingFavorite.id);
            // お気に入りから削除（新しい方式でthread_idとuser_fingerprintを使用）
            const deleteResponse = await fetch('/api/tables/favorites', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    thread_id: threadId,
                    user_fingerprint: userFingerprint
                })
            });
            
            if (!deleteResponse.ok) {
                throw new Error('お気に入りの削除に失敗しました');
            }
            
            button.classList.remove('favorited');
            const icon = button.querySelector('i');
            if (icon) {
                icon.classList.remove('fas');
                icon.classList.add('far');
            }
            showMessage('お気に入りから削除しました', 'success');
        } else {
            console.log('新しいお気に入りを追加');
            // お気に入りに追加
            const addResponse = await fetch('/api/tables/favorites', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    thread_id: threadId,
                    user_fingerprint: userFingerprint
                })
            });
            
            if (!addResponse.ok) {
                throw new Error('お気に入りの追加に失敗しました');
            }
            
            button.classList.add('favorited');
            const icon = button.querySelector('i');
            if (icon) {
                icon.classList.remove('far');
                icon.classList.add('fas');
            }
            showMessage('お気に入りに追加しました', 'success');
        }
        
    } catch (error) {
        console.error('お気に入り操作エラー:', error);
        showMessage('お気に入り操作に失敗しました: ' + error.message, 'error');
    } finally {
        // ボタンを再び有効化
        button.disabled = false;
    }
}



// お気に入り状態を更新
async function updateFavoriteStatus() {
    try {
        const userFingerprint = generateUserFingerprint();
        const favoritesResponse = await fetch('/api/tables/favorites');
        
        if (!favoritesResponse.ok) {
            console.warn('お気に入りデータの取得に失敗:', favoritesResponse.status);
            return; // エラー時は静かに終了
        }
        
        const favoritesData = await favoritesResponse.json();
        
        // データ構造を確認
        if (!favoritesData || !Array.isArray(favoritesData.data)) {
            console.warn('お気に入りデータが無効な形式:', favoritesData);
            return;
        }
        
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
