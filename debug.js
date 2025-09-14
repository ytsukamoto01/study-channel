// デバッグ用の基本テスト関数

// API接続テスト
async function testApiConnection() {
    console.log('=== API接続テスト開始 ===');
    
    try {
        // 基本的な fetch テスト
        console.log('1. 基本fetchテスト...');
        const response = await fetch('tables/threads');
        console.log('レスポンス:', response);
        console.log('ステータス:', response.status);
        console.log('OK:', response.ok);
        
        if (response.ok) {
            const data = await response.json();
            console.log('データ:', data);
            console.log('スレッド数:', data.data ? data.data.length : 0);
            return data;
        } else {
            const errorText = await response.text();
            console.error('APIエラー:', errorText);
            return null;
        }
    } catch (error) {
        console.error('接続エラー:', error);
        return null;
    }
}

// DOM要素テスト
function testDomElements() {
    console.log('=== DOM要素テスト ===');
    
    const elements = {
        threadsList: document.getElementById('threadsList'),
        loading: document.getElementById('loading'),
        newThreadModal: document.getElementById('newThreadModal')
    };
    
    Object.entries(elements).forEach(([name, element]) => {
        console.log(`${name}:`, element ? '存在' : '見つからない');
    });
    
    return elements;
}

// 基本関数テスト
function testUtilFunctions() {
    console.log('=== ユーティリティ関数テスト ===');
    
    const functions = {
        escapeHtml: typeof escapeHtml,
        getRelativeTime: typeof getRelativeTime,
        generateUserFingerprint: typeof generateUserFingerprint,
        normalizeHashtags: typeof normalizeHashtags,
        showLoading: typeof showLoading,
        hideLoading: typeof hideLoading
    };
    
    Object.entries(functions).forEach(([name, type]) => {
        console.log(`${name}: ${type}`);
    });
    
    return functions;
}

// 完全デバッグテスト
async function runFullDebugTest() {
    console.log('🔧 === フルデバッグテスト開始 ===');
    
    // 1. 関数テスト
    const functions = testUtilFunctions();
    
    // 2. DOM要素テスト  
    const elements = testDomElements();
    
    // 3. API接続テスト
    const apiResult = await testApiConnection();
    
    // 4. 結果まとめ
    console.log('📋 === テスト結果まとめ ===');
    console.log('関数:', Object.values(functions).every(type => type === 'function') ? '✅正常' : '❌問題あり');
    console.log('DOM:', Object.values(elements).every(el => el !== null) ? '✅正常' : '❌問題あり');
    console.log('API:', apiResult ? '✅正常' : '❌問題あり');
    
    if (apiResult && apiResult.data) {
        console.log(`📊 データ: ${apiResult.data.length}件のスレッド`);
        
        // 簡単な表示テスト
        if (elements.threadsList) {
            elements.threadsList.innerHTML = `
                <div style="padding: 20px; background: #e7f3ff; border-radius: 8px;">
                    <h3>✅ デバッグテスト成功</h3>
                    <p>API接続OK - ${apiResult.data.length}件のスレッドを取得</p>
                    <button onclick="location.reload()">通常表示に戻る</button>
                </div>
            `;
        }
    } else {
        if (elements.threadsList) {
            elements.threadsList.innerHTML = `
                <div style="padding: 20px; background: #ffe6e6; border-radius: 8px;">
                    <h3>❌ デバッグテスト: 問題検出</h3>
                    <p>API接続に問題があります</p>
                    <button onclick="runFullDebugTest()">再テスト</button>
                </div>
            `;
        }
    }
    
    return { functions, elements, apiResult };
}

// ページ読み込み時に自動実行
if (typeof window !== 'undefined') {
    window.testApiConnection = testApiConnection;
    window.testDomElements = testDomElements;
    window.testUtilFunctions = testUtilFunctions;
    window.runFullDebugTest = runFullDebugTest;
}