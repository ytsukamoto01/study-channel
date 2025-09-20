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

// 削除依頼機能
async function requestDeletion(targetType, targetId, targetTitle = '') {
  if (!confirm(`この${targetType === 'thread' ? 'スレッド' : 'コメント'}の削除を依頼しますか？`)) {
    return;
  }

  try {
    // 削除理由を選択させる
    const reason = await showReasonDialog('delete_request');
    if (!reason) return;

    const requestData = {
      type: 'delete_request',
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
      throw new Error(error.error || '削除依頼の送信に失敗しました');
    }

    const result = await response.json();
    showMessage(result.message || '削除依頼を送信しました', 'success');

    // UI更新
    await updateReportStatusUI();

  } catch (error) {
    console.error('削除依頼エラー:', error);
    showMessage(error.message || '削除依頼の送信に失敗しました', 'error');
  }
}

// ユーザーの通報ステータスを取得
async function getUserReportStatus() {
  try {
    const fingerprint = generateUserFingerprint();
    const response = await fetch(`/api/reports?user_fingerprint=${encodeURIComponent(fingerprint)}`);
    
    if (!response.ok) {
      throw new Error('ステータス取得に失敗しました');
    }

    const result = await response.json();
    return result.data || [];
  } catch (error) {
    console.error('通報ステータス取得エラー:', error);
    return [];
  }
}

// UIにステータスを反映
async function updateReportStatusUI() {
  try {
    const reports = await getUserReportStatus();
    
    // 各スレッド・コメントの通報/削除依頼ボタンを更新
    reports.forEach(report => {
      const { target_type, target_id, type, status, admin_notes } = report;
      
      // 対応するボタンを見つける
      const reportBtn = document.querySelector(`[onclick*="reportContent('${target_type}', '${target_id}')"]`);
      const deleteBtn = document.querySelector(`[onclick*="requestDeletion('${target_type}', '${target_id}')"]`);
      
      const btn = type === 'report' ? reportBtn : deleteBtn;
      if (btn) {
        updateButtonStatus(btn, type, status, admin_notes);
      }
    });
    
  } catch (error) {
    console.error('ステータスUI更新エラー:', error);
  }
}

// ボタンのステータス表示を更新
function updateButtonStatus(button, type, status, admin_notes) {
  const typeText = type === 'report' ? '通報' : '削除依頼';
  let statusText = '';
  let className = '';
  
  switch (status) {
    case 'pending':
      statusText = `${typeText}処理中...`;
      className = 'report-status-pending';
      button.disabled = true;
      break;
    case 'approved':
      statusText = `${typeText}承認済み`;
      className = 'report-status-approved';
      button.disabled = true;
      break;
    case 'rejected':
      statusText = `${typeText}却下`;
      if (admin_notes) {
        statusText += `：${admin_notes}`;
      }
      className = 'report-status-rejected';
      button.disabled = false; // 却下の場合は再通報可能
      break;
  }
  
  button.textContent = statusText;
  button.className = `${button.className.split(' ')[0]} ${className}`;
  
  // ツールチップで詳細情報を表示
  if (admin_notes && status === 'rejected') {
    button.title = `却下理由: ${admin_notes}`;
  }
}

// ページロード時にステータスを更新
document.addEventListener('DOMContentLoaded', function() {
  setTimeout(updateReportStatusUI, 1000); // スレッド/コメント読み込み後に実行
});

// グローバルに公開
window.showReasonDialog = showReasonDialog;
window.reportContent = reportContent;
window.requestDeletion = requestDeletion;
window.updateReportStatusUI = updateReportStatusUI;