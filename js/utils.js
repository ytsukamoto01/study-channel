// ユーティリティ関数

// 匿名ユーザー名の候補
const ANONYMOUS_NAMES = [
    '勉強中の学生さん', 'がんばる受験生', '深夜の努力家', 'コツコツ派', 
    '集中モード中', '参考書マニア', 'ノート整理好き', '過去問研究家',
    '早朝学習者', 'カフェ勉強派', '図書館の常連', '赤ペン愛用者',
    '単語帳持参', 'ハイライト職人', '付箋マスター', '計画立案者',
    '復習重視派', 'アウトプット重視', '基礎固め中', '応用問題挑戦者',
    '時間管理上手', 'やる気チャージ中', 'スキマ時間活用', '継続は力なり',
    '合格目指して', '夢に向かって', '未来への投資', 'チャレンジャー',
    'ステップアップ中', '成長過程', '努力の人', '頑張り屋さん',
    '知識探求者', '学びの達人', '向上心旺盛', '成果重視派',
    'インプット中', '理解深める人', '記憶術研究中', '効率追求者'
];

const STUDY_SUBJECTS = [
    '数学好き', '英語学習者', '国語研究中', '理科実験中', '社会科マニア',
    '古典愛好家', '現代文派', '物理選択', '化学専攻', '生物好き',
    '世界史派', '日本史選択', '地理研究者', '政経学習中', '倫理考察中'
];

// 匿名ユーザー名を生成する関数
function generateAnonymousName() {
    const names = Math.random() > 0.7 ? STUDY_SUBJECTS : ANONYMOUS_NAMES;
    const randomIndex = Math.floor(Math.random() * names.length);
    return names[randomIndex];
}

// ユーザーのフィンガープリントを生成（重複いいね防止用）
function generateUserFingerprint() {
    // ブラウザの特徴を組み合わせて簡易的なフィンガープリントを作成
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillText('Study Channel Fingerprint', 2, 2);
    
    const fingerprint = [
        navigator.userAgent,
        navigator.language,
        screen.width + 'x' + screen.height,
        new Date().getTimezoneOffset(),
        canvas.toDataURL()
    ].join('|');
    
    return btoa(fingerprint).slice(0, 32);
}

// 日時を相対的な表現に変換
function getRelativeTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    const week = 7 * day;
    const month = 30 * day;
    
    if (diff < minute) {
        return 'たった今';
    } else if (diff < hour) {
        return Math.floor(diff / minute) + '分前';
    } else if (diff < day) {
        return Math.floor(diff / hour) + '時間前';
    } else if (diff < week) {
        return Math.floor(diff / day) + '日前';
    } else if (diff < month) {
        return Math.floor(diff / week) + '週間前';
    } else {
        return Math.floor(diff / month) + 'ヶ月前';
    }
}

// テキストを安全にHTMLエスケープ
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// テキストのプレビューを作成（指定文字数で切り取り）
function createPreview(text, maxLength = 100) {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...';
}

// UUIDv4を生成
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// APIエラーハンドリング
function handleApiError(error, defaultMessage = 'エラーが発生しました') {
    console.error('API Error:', error);
    
    if (error.message) {
        alert(error.message);
    } else if (error.status) {
        alert(`エラー ${error.status}: ${defaultMessage}`);
    } else {
        alert(defaultMessage);
    }
}

// ローディング表示の管理
function showLoading(elementId = 'loading') {
    const loading = document.getElementById(elementId);
    if (loading) {
        loading.style.display = 'block';
    }
}

function hideLoading(elementId = 'loading') {
    const loading = document.getElementById(elementId);
    if (loading) {
        loading.style.display = 'none';
    }
}

// バリデーション関数
function validateThreadData(data) {
    const errors = [];
    
    if (!data.title || data.title.trim().length === 0) {
        errors.push('タイトルを入力してください');
    }
    
    if (data.title && data.title.length > 100) {
        errors.push('タイトルは100文字以内で入力してください');
    }
    
    if (!data.content || data.content.trim().length === 0) {
        errors.push('内容を入力してください');
    }
    
    if (data.content && data.content.length > 1000) {
        errors.push('内容は1000文字以内で入力してください');
    }
    
    if (!data.category) {
        errors.push('カテゴリを選択してください');
    }
    
    return errors;
}

function validateCommentData(data) {
    const errors = [];
    
    // コメント内容または画像のどちらかが必要
    const hasContent = data.content && data.content.trim().length > 0;
    const hasImages = Array.isArray(data.images) && data.images.length > 0;
    
    if (!hasContent && !hasImages) {
        errors.push('コメント内容または画像を入力してください');
    }
    
    if (data.content && data.content.length > 1000) {
        errors.push('コメントは1000文字以内で入力してください');
    }
    
    if (data.images && data.images.length > 5) {
        errors.push('画像は最大5枚までです');
    }
    
    return errors;
}

// ローカルストレージの管理
function setUserPreference(key, value) {
    try {
        localStorage.setItem(`studyChannel_${key}`, JSON.stringify(value));
    } catch (e) {
        console.warn('ローカルストレージに保存できませんでした:', e);
    }
}

function getUserPreference(key, defaultValue = null) {
    try {
        const item = localStorage.getItem(`studyChannel_${key}`);
        return item ? JSON.parse(item) : defaultValue;
    } catch (e) {
        console.warn('ローカルストレージから読み込めませんでした:', e);
        return defaultValue;
    }
}

// カテゴリごとの色を取得
function getCategoryColor(category) {
    const colors = {
        '大学受験': '#ff6b6b',
        '高校受験': '#4ecdc4',
        '中学受験': '#45b7d1',
        '資格試験': '#96ceb4',
        '公務員試験': '#ffeaa7',
        '就職試験': '#dda0dd',
        'その他': '#a8a8a8'
    };
    return colors[category] || '#a8a8a8';
}

// メッセージ表示
function showMessage(message, type = 'info') {
    // 既存のメッセージを削除
    const existingMessage = document.querySelector('.message-toast');
    if (existingMessage) {
        existingMessage.remove();
    }
    
    // メッセージ要素を作成
    const messageEl = document.createElement('div');
    messageEl.className = `message-toast ${type}`;
    messageEl.textContent = message;
    
    // スタイルを設定
    messageEl.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
        color: white;
        padding: 12px 20px;
        border-radius: 6px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        z-index: 10000;
        font-size: 14px;
        max-width: 300px;
        transform: translateX(100%);
        transition: transform 0.3s ease;
    `;
    
    document.body.appendChild(messageEl);
    
    // アニメーションで表示
    setTimeout(() => {
        messageEl.style.transform = 'translateX(0)';
    }, 10);
    
    // 3秒後に削除
    setTimeout(() => {
        messageEl.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (messageEl.parentNode) {
                messageEl.parentNode.removeChild(messageEl);
            }
        }, 300);
    }, 3000);
}

// 画像アップロード管理
let uploadedImages = {
    thread: [],
    comment: [],
    reply: []
};

// 画像アップロード処理
async function handleImageUpload(event, type) {
    const files = Array.from(event.target.files);
    const maxImages = 5;
    const maxSize = 10 * 1024 * 1024; // 10MB
    
    if (uploadedImages[type].length + files.length > maxImages) {
        showMessage(`画像は最大${maxImages}枚までです`, 'error');
        return;
    }
    
    for (const file of files) {
        if (file.size > maxSize) {
            showMessage(`${file.name}は10MBを超えています`, 'error');
            continue;
        }
        
        if (!file.type.startsWith('image/')) {
            showMessage(`${file.name}は画像ファイルではありません`, 'error');
            continue;
        }
        
        try {
            const imageUrl = await uploadImageToService(file);
            uploadedImages[type].push(imageUrl);
            updateImagePreview(type);
        } catch (error) {
            console.error('画像アップロードエラー:', error);
            showMessage(`${file.name}のアップロードに失敗しました`, 'error');
        }
    }
    
    // inputをリセット
    event.target.value = '';
}

// 画像アップロードサービス（仮実装）
async function uploadImageToService(file) {
    // ここでは一時的にBase64エンコードを使用
    // 実際のプロダクションでは外部の画像ホスティングサービスを使用
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e);
        reader.readAsDataURL(file);
    });
}

// 画像プレビューを更新
function updateImagePreview(type) {
    const previewContainer = document.getElementById(`${type}ImagePreview`);
    if (!previewContainer) return;
    
    previewContainer.innerHTML = uploadedImages[type].map((imageUrl, index) => `
        <div class="image-preview-item">
            <img src="${imageUrl}" alt="プレビュー${index + 1}">
            <button class="image-preview-remove" onclick="removeImage('${type}', ${index})">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');
}

// 画像を削除
function removeImage(type, index) {
    uploadedImages[type].splice(index, 1);
    updateImagePreview(type);
}

// 画像ギャラリーを表示
function displayImageGallery(images, containerId) {
    const container = document.getElementById(containerId);
    if (!container || !images || images.length === 0) return;
    
    container.innerHTML = `
        <div class="image-gallery">
            ${images.map((imageUrl, index) => `
                <img src="${imageUrl}" alt="画像${index + 1}" class="gallery-image" 
                     onclick="openImageModal('${imageUrl}')">
            `).join('')}
        </div>
    `;
}

// 画像モーダルを開く
function openImageModal(imageUrl) {
    const modal = document.getElementById('imageModal');
    const modalImage = document.getElementById('modalImage');
    
    if (modal && modalImage) {
        modalImage.src = imageUrl;
        modal.classList.add('active');
        
        // ESCキーで閉じる
        document.addEventListener('keydown', handleEscapeKey);
        
        // モーダル外クリックで閉じる
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeImageModal();
            }
        });
    }
}

// 画像モーダルを閉じる
function closeImageModal() {
    const modal = document.getElementById('imageModal');
    if (modal) {
        modal.classList.remove('active');
        document.removeEventListener('keydown', handleEscapeKey);
    }
}

// ESCキーハンドラー
function handleEscapeKey(e) {
    if (e.key === 'Escape') {
        closeImageModal();
    }
}

// ドラッグ&ドロップ機能を初期化
function initializeDragAndDrop() {
    const uploadAreas = document.querySelectorAll('.image-upload-area, .image-upload-area-small');
    
    uploadAreas.forEach(area => {
        const type = area.classList.contains('image-upload-area-small') ? 'comment' : 'thread';
        
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            area.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });
        
        ['dragenter', 'dragover'].forEach(eventName => {
            area.addEventListener(eventName, () => {
                area.classList.add('drag-active');
            });
        });
        
        ['dragleave', 'drop'].forEach(eventName => {
            area.addEventListener(eventName, () => {
                area.classList.remove('drag-active');
            });
        });
        
        area.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                // FileListをEventとして偽装
                const fakeEvent = {
                    target: { files: files, value: '' }
                };
                handleImageUpload(fakeEvent, type);
            }
        });
    });
}

// ページナビゲーション関数
function showPage(page) {
    switch(page) {
        case 'home':
            window.location.href = 'index.html';
            break;
        case 'myPosts':
        case 'myposts':
            window.location.href = 'myposts.html';
            break;
        case 'favorites':
            window.location.href = 'favorites.html';
            break;
        default:
            window.location.href = 'index.html';
    }
}

// 安全なページ遷移
function navigateToPage(url) {
    try {
        window.location.href = url;
    } catch (error) {
        console.error('ページ遷移エラー:', error);
        // フォールバック: リロードで対応
        window.location.reload();
    }
}

// ページ読み込み時にドラッグ&ドロップを初期化
document.addEventListener('DOMContentLoaded', () => {
    // 少し遅延させて要素が確実に存在するようにする
    setTimeout(initializeDragAndDrop, 100);
});

// デバウンス関数（検索などで使用）
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// 文字数カウンター
function setupCharacterCounter(textareaId, counterId, maxLength) {
    const textarea = document.getElementById(textareaId);
    const counter = document.getElementById(counterId);
    
    if (!textarea || !counter) return;
    
    function updateCounter() {
        const currentLength = textarea.value.length;
        counter.textContent = `${currentLength}/${maxLength}`;
        
        if (currentLength > maxLength * 0.9) {
            counter.style.color = '#ff6b6b';
        } else if (currentLength > maxLength * 0.7) {
            counter.style.color = '#ffa500';
        } else {
            counter.style.color = '#666';
        }
    }
    
    textarea.addEventListener('input', updateCounter);
    updateCounter();
}

// ハッシュタグ関連の関数
function parseHashtags(text) {
    if (!text) return [];
    
    // #で始まる単語を抽出
    const hashtagRegex = /#([^\s#]+)/g;
    const matches = [];
    let match;
    
    while ((match = hashtagRegex.exec(text)) !== null) {
        const hashtag = match[1];
        if (hashtag.length > 0 && hashtag.length <= 20) {
            matches.push(hashtag);
        }
    }
    
    return matches.slice(0, 5); // 最大5個まで
}

// ハッシュタグデータを配列に正規化
function normalizeHashtags(hashtags) {
    if (!hashtags) return [];
    if (Array.isArray(hashtags)) return hashtags;
    if (typeof hashtags === 'string') {
        try {
            // JSON文字列の場合をパース
            const parsed = JSON.parse(hashtags);
            return Array.isArray(parsed) ? parsed : [parsed];
        } catch (e) {
            // JSON文字列でない場合はそのまま配列に
            return hashtags.split(',').map(tag => tag.trim()).filter(tag => tag);
        }
    }
    return [hashtags].flat();
}

function formatHashtagsForDisplay(hashtags) {
    if (!Array.isArray(hashtags) || hashtags.length === 0) return '';
    
    return hashtags.map(tag => `#${tag}`).join(' ');
}

function validateHashtags(hashtags) {
    const errors = [];
    
    if (!Array.isArray(hashtags)) {
        return ['ハッシュタグの形式が正しくありません'];
    }
    
    if (hashtags.length > 5) {
        errors.push('ハッシュタグは最大5個までです');
    }
    
    hashtags.forEach(tag => {
        if (tag.length > 20) {
            errors.push(`ハッシュタグ「${tag}」は20文字以内にしてください`);
        }
        if (tag.length === 0) {
            errors.push('空のハッシュタグは使用できません');
        }
    });
    
    return errors;
}

// 検索関連の関数
function highlightSearchText(text, searchTerm) {
    if (!searchTerm || !text) return escapeHtml(text);
    
    const escapedText = escapeHtml(text);
    const escapedSearchTerm = escapeHtml(searchTerm);
    const regex = new RegExp(`(${escapedSearchTerm})`, 'gi');
    
    return escapedText.replace(regex, '<span class="search-highlight">$1</span>');
}

function searchInText(text, searchTerm) {
    if (!searchTerm || !text) return false;
    
    return text.toLowerCase().includes(searchTerm.toLowerCase());
}

function searchInHashtags(hashtags, searchTerm) {
    if (!searchTerm || !Array.isArray(hashtags)) return false;
    
    const cleanSearchTerm = searchTerm.replace(/^#/, '').toLowerCase();
    
    return hashtags.some(tag => 
        tag.toLowerCase().includes(cleanSearchTerm)
    );
}

function filterThreadsBySearch(threads, searchTerm, searchType = 'all') {
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

function sortThreads(threads, sortOrder = 'newest') {
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

// サブカテゴリの定義
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
            '内申点', '推薦入試', '一般入試', '特色検査',
            '定期テスト', '模試', '過去問'
        ],
        '中学受験': [
            '開成中学', '麻布中学', '桜蔭中学', '女子学院中学',
            'SAPIX', '日能研', '四谷大塚', '早稲田アカデミー',
            '算数', '国語', '理科', '社会', '適性検査',
            '中高一貫校', '私立中学', '公立中高一貫'
        ],
        '資格試験': [
            '英検1級', '英検準1級', '英検2級', '英検準2級', '英検3級',
            'TOEIC', 'TOEFL', 'IELTS',
            '簿記1級', '簿記2級', '簿記3級',
            '情報処理技術者試験', '基本情報技術者', '応用情報技術者',
            '宅建士', '行政書士', '社労士', 'FP技能士',
            '医師国家試験', '看護師国家試験', '薬剤師国家試験'
        ],
        '公務員試験': [
            '国家公務員総合職', '国家公務員一般職', '地方公務員上級',
            '警察官', '消防士', '自衛隊', '教員採用試験',
            '市役所', '県庁', '区役所', '町村役場',
            '裁判所職員', '国税専門官', '労働基準監督官'
        ],
        '就職試験': [
            'SPI', '玉手箱', 'GAB', 'CAB', 'TG-WEB',
            '筆記試験', '適性検査', 'エントリーシート',
            '面接対策', 'グループディスカッション',
            '業界研究', '企業研究', 'インターンシップ'
        ],
        'その他': [
            '語学学習', '留学準備', '社会人入試',
            '編入試験', '転職', 'スキルアップ',
            '通信教育', 'オンライン学習', '独学'
        ]
    };
}

// ハッシュタグの候補を生成
function getHashtagSuggestions() {
    return [
        '数学', '英語', '国語', '理科', '社会',
        '勉強法', '暗記', '復習', '予習', '問題集',
        '過去問', '模試', 'テスト', '試験対策',
        '時間管理', 'やる気', 'モチベーション',
        '集中力', 'ノート術', '単語帳',
        '赤シート', '蛍光ペン', '付箋',
        '早朝勉強', '夜型', '朝型', 'カフェ勉強',
        '図書館', '自宅学習', 'オンライン学習',
        'センター試験', '共通テスト', '二次試験',
        '私立', '国公立', '推薦', 'AO入試',
        '偏差値', '志望校', '合格', '不合格',
        '浪人', '宅浪', '予備校', '塾'
    ];
}

// アニメーション用ヘルパー
function fadeInElement(element) {
    element.style.opacity = '0';
    element.style.display = 'block';
    
    let opacity = 0;
    const fadeIn = () => {
        opacity += 0.05;
        element.style.opacity = opacity;
        
        if (opacity >= 1) {
            element.style.opacity = '1';
            return;
        }
        
        requestAnimationFrame(fadeIn);
    };
    
    requestAnimationFrame(fadeIn);
}

// 投稿者名を表示用にHTML化
function formatAuthorName(authorName) {
    if (authorName === '管理人') {
        // 管理人専用の黒カプセルバッジを表示
        return `<span class="badge-admin">🛡️ 管理人</span>`;
    } else if (authorName === '匿名' || !authorName) {
        return `<span class="anonymous-author">匿名</span>`;
    } else {
        return `<span class="named-author">${escapeHtml(authorName)}</span>`;
    }
}


// API呼び出し用のヘルパー関数
// utils.js に追加 or 置換
async function apiCall(url, options = {}) {
  console.log('=== API CALL ===');
  console.log('URL:', url);
  console.log('Options:', options);
  
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  
  console.log('=== API RESPONSE ===');
  console.log('Status:', res.status);
  console.log('Headers:', Object.fromEntries(res.headers.entries()));
  
  if (!res.ok) {
    let errorMessage = `API ${url} failed: ${res.status}`;
    try {
      const errorData = await res.json();
      errorMessage = errorData.message || errorData.error || errorMessage;
    } catch (e) {
      // JSONパースに失敗した場合はテキストを取得
      try {
        const text = await res.text();
        errorMessage = text || errorMessage;
      } catch (e2) {
        // テキスト取得も失敗した場合はデフォルトメッセージを使用
      }
    }
    throw new Error(errorMessage);
  }
  
  // DELETEメソッドで204 No Contentの場合は空オブジェクトを返す
  if (res.status === 204) {
    return {};
  }
  
  return await res.json();
}

