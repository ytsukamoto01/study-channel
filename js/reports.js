// 通報・削除依頼モーダル機能

// 理由のマッピング
const REASON_OPTIONS = {
  'spam': 'スパム・宣伝',
  'harassment': '誹謗中傷・嫌がらせ',
  'inappropriate': '不適切な内容',
  'false_info': '虚偽情報',
  'other': 'その他'
};

// モーダルHTMLを動的に生成
function createReportModal() {
  const modal = document.createElement('div');
  modal.id = 'report-modal';
  modal.className = 'report-modal';
  
  modal.innerHTML = `
    <div class="report-modal-content">
      <h3 id="report-modal-title">通報する</h3>
      <form id="report-form">
        <div class="report-form-group">
          <label for="report-reason">理由を選択してください</label>
          <select id="report-reason" required>
            <option value="">選択してください</option>
            ${Object.entries(REASON_OPTIONS).map(([key, value]) => 
              `<option value="${key}">${value}</option>`
            ).join('')}
          </select>
        </div>
        <div class="report-form-group">
          <label for="report-description">詳細説明（任意）</label>
          <textarea 
            id="report-description" 
            placeholder="具体的な問題について説明してください（任意）"
            rows="3"
          ></textarea>
        </div>
        <div class="report-modal-actions">
          <button type="button" class="report-cancel-btn" id="report-cancel">キャンセル</button>
          <button type="submit" class="report-submit-btn" id="report-submit">送信</button>
        </div>
      </form>
    </div>
  `;
  
  document.body.appendChild(modal);
  return modal;
}

// モーダルを表示する関数
function showReasonDialog(type = 'report') {
  return new Promise((resolve) => {
    // 既存のモーダルを削除
    const existingModal = document.getElementById('report-modal');
    if (existingModal) {
      existingModal.remove();
    }
    
    const modal = createReportModal();
    const titleElement = document.getElementById('report-modal-title');
    
    // タイトルを設定
    titleElement.textContent = type === 'delete_request' ? '削除依頼' : '通報する';
    
    // モーダルを表示
    modal.classList.add('show');
    
    // フォーム送信処理
    const form = document.getElementById('report-form');
    form.onsubmit = (e) => {
      e.preventDefault();
      
      const reason = document.getElementById('report-reason').value;
      const description = document.getElementById('report-description').value;
      
      if (!reason) {
        alert('理由を選択してください');
        return;
      }
      
      modal.classList.remove('show');
      setTimeout(() => modal.remove(), 300);
      
      resolve({
        reason,
        description: description.trim() || null
      });
    };
    
    // キャンセル処理
    const cancelBtn = document.getElementById('report-cancel');
    cancelBtn.onclick = () => {
      modal.classList.remove('show');
      setTimeout(() => modal.remove(), 300);
      resolve(null);
    };
    
    // モーダル外クリックで閉じる
    modal.onclick = (e) => {
      if (e.target === modal) {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 300);
        resolve(null);
      }
    };
  });
}

// 通報機能
async function reportContent(targetType, targetId, targetTitle = '') {
  if (!confirm(`この${targetType === 'thread' ? 'スレッド' : 'コメント'}を通報しますか？`)) {
    return;
  }

  try {
    // 通報理由を選択させる
    const reason = await showReasonDialog('report');
    if (!reason) return;

    const requestData = {
      type: 'report',
      target_type: targetType,
      target_id: targetId,
      reporter_fingerprint: generateUserFingerprint(),
      reporter_name: '匿名',
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
      throw new Error(error.error || '通報の送信に失敗しました');
    }

    const result = await response.json();
    showMessage(result.message || '通報を送信しました', 'success');

  } catch (error) {
    console.error('通報エラー:', error);
    showMessage(error.message || '通報の送信に失敗しました', 'error');
  }
}

// グローバルに公開
window.showReasonDialog = showReasonDialog;
window.reportContent = reportContent;