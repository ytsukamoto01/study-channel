// /public/admin/admin.js
async function callAdmin(action, extra = {}) {
  const res = await fetch("/api/admin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ action, ...extra }),
  });
  return res;
}

async function login() {
  const pw = document.getElementById("password").value;
  const res = await callAdmin("login", { password: pw });
  const msg = document.getElementById("login-msg");
  if (res.ok) {
    msg.textContent = "ログイン成功";
    document.getElementById("login-section").style.display = "none";
    document.getElementById("dash-section").style.display = "block";
    await loadThreads();
    await loadReports();
  } else {
    msg.textContent = "パスワードが違います";
  }
}

async function logout() {
  await callAdmin("logout");
  document.getElementById("dash-section").style.display = "none";
  document.getElementById("login-section").style.display = "block";
}

function parseTags(s) { return s.split(",").map(t=>t.trim()).filter(Boolean); }
function parseImages(s){ return s.split(",").map(u=>u.trim()).filter(Boolean); }

async function uploadImages(files) {
  const urls = [];
  for (const file of files) {
    const fd = new FormData();
    fd.append("file", file);
    // multipart は body だけでは action を渡しにくいのでクエリで指定
    const res = await fetch("/api/admin?action=upload_image", {
      method: "POST",
      body: fd,
      credentials: "include",
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error("画像アップロード失敗: " + t);
    }
    const json = await res.json();
    // files: [{path, url}] で複数返るが、1件ずつ送ってるので先頭を採用
    if (json?.files?.[0]?.url) urls.push(json.files[0].url);
  }
  return urls;
}

async function createThread() {
  const fileInput = document.getElementById("new-images-file");
  let imageUrls = [];
  if (fileInput?.files?.length) {
    imageUrls = await uploadImages(fileInput.files);
  }

  const payload = {
    title: document.getElementById("new-title").value,
    content: document.getElementById("new-content").value,
    category: document.getElementById("new-category").value || "未分類",
    subcategory: document.getElementById("new-subcategory").value || null,
    hashtags: parseTags(document.getElementById("new-hashtags").value),
    images: imageUrls, // ← アップロードしたURLを保存
  };
  const res = await callAdmin("thread_create", { payload });
  if (!res.ok) return alert("作成失敗: " + (await res.text()));
  clearNewForm();
  await loadThreads();
}

function clearNewForm() {
  ["new-title","new-content","new-category","new-subcategory","new-hashtags"].forEach(id => (document.getElementById(id).value = ""));
  const fi = document.getElementById("new-images-file");
  if (fi) fi.value = "";
}


async function loadThreads() {
  const res = await callAdmin("threads_list");
  const list = document.getElementById("list");
  if (!res.ok) {
    list.innerHTML = "<div class='muted'>読み込み失敗。ログインを確認してください。</div>";
    return;
  }
  const json = await res.json();
  const items = json.data ?? [];
  list.innerHTML = "";
  for (const th of items) list.appendChild(renderThreadCard(th));
}

function renderThreadCard(th) {
  const wrap = document.createElement("div");
  wrap.className = "card";
  wrap.innerHTML = `
    <div class="row" style="justify-content:space-between">
      <div>
        <strong>${escapeHtml(th.title)}</strong>
        ${th.admin_mark ? `<span class="badge">🛡️ 管理人</span>` : ""}
        <div class="muted">${escapeHtml(th.category)} / ${escapeHtml(th.subcategory || "")}</div>
      </div>
      <div class="actions">
        <button data-act="edit">編集</button>
        <button class="danger" data-act="del">削除</button>
      </div>
    </div>
    <div style="margin-top:8px; white-space:pre-wrap">${escapeHtml(th.content || "")}</div>
    <div class="muted" style="margin-top:6px">#${(th.hashtags||[]).join(" #")}</div>
  `;
  wrap.querySelector("[data-act='edit']").onclick = () => openEditModal(th);
  wrap.querySelector("[data-act='del']").onclick = async () => {
    if (!confirm("削除しますか？")) return;
    const res = await callAdmin("thread_delete", { id: th.id });
    if (!res.ok) return alert("削除失敗: " + (await res.text()));
    await loadThreads();
  };
  return wrap;
}

function openEditModal(th) {
  // 既存モーダルがあれば消す
  const old = document.getElementById("edit-modal");
  if (old) old.remove();

  // モーダルDOM
  const wrap = document.createElement("div");
  wrap.id = "edit-modal";
  wrap.style.position = "fixed";
  wrap.style.inset = "0";
  wrap.style.background = "rgba(0,0,0,0.4)";
  wrap.style.zIndex = "9999";
  wrap.style.display = "flex";
  wrap.style.alignItems = "center";
  wrap.style.justifyContent = "center";

  wrap.innerHTML = `
    <div style="background:#fff; width:min(760px,92vw); max-height:90vh; overflow:auto; border-radius:12px; padding:16px; box-shadow:0 8px 32px rgba(0,0,0,.25)">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:12px;">
        <h3 style="margin:0;">スレッドを編集</h3>
        <button id="edit-close" style="border:none;background:#eee;padding:6px 10px;border-radius:8px;cursor:pointer;">閉じる</button>
      </div>

      <div style="display:grid; gap:10px; margin-top:12px;">
        <label>タイトル
          <input id="edit-title" value="${escapeHtml(th.title)}" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:8px;" />
        </label>

        <label>カテゴリ
          <input id="edit-category" value="${escapeHtml(th.category || "")}" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:8px;" />
        </label>

        <label>サブカテゴリ（任意）
          <input id="edit-subcategory" value="${escapeHtml(th.subcategory || "")}" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:8px;" />
        </label>

        <label>タグ（カンマ区切り）
          <input id="edit-hashtags" value="${escapeHtml((th.hashtags||[]).join(", "))}" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:8px;" />
        </label>

        <label>本文
          <textarea id="edit-content" rows="8" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:8px;">${escapeHtml(th.content || "")}</textarea>
        </label>

        <div style="display:grid; gap:6px;">
          <label>既存画像URL（カンマ区切りで編集可）
            <textarea id="edit-existing-images" rows="3" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:8px;">${escapeHtml((th.images||[]).join(", "))}</textarea>
          </label>

          <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
            <label style="display:flex; align-items:center; gap:8px;">
              <input type="radio" name="editImageMode" value="append" checked> アップロードは既存に追加
            </label>
            <label style="display:flex; align-items:center; gap:8px;">
              <input type="radio" name="editImageMode" value="replace"> 既存を置き換える
            </label>
          </div>

          <label>画像をアップロード（複数可）
            <input id="edit-new-images" type="file" accept="image/*" multiple />
          </label>
        </div>
      </div>

      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:16px;">
        <button id="edit-cancel" style="border:1px solid #ccc; background:#fff; padding:8px 12px; border-radius:8px; cursor:pointer;">キャンセル</button>
        <button id="edit-save" class="primary" style="border:none; background:#222; color:#fff; padding:8px 12px; border-radius:8px; cursor:pointer;">保存</button>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);

  // イベント
  const close = () => wrap.remove();
  wrap.querySelector("#edit-close").onclick = close;
  wrap.querySelector("#edit-cancel").onclick = close;

  wrap.querySelector("#edit-save").onclick = async () => {
    try {
      const title = document.getElementById("edit-title").value;
      const category = document.getElementById("edit-category").value;
      const subcategory = document.getElementById("edit-subcategory").value;
      const hashtags = document.getElementById("edit-hashtags").value;
      const content = document.getElementById("edit-content").value;

      // 既存URLの扱い
      const existingStr = document.getElementById("edit-existing-images").value || "";
      const existing = existingStr.split(",").map(s => s.trim()).filter(Boolean);

      // 新規アップロード
      const fileInput = document.getElementById("edit-new-images");
      let uploaded = [];
      if (fileInput?.files?.length) {
        uploaded = await uploadImages(fileInput.files); // 既存のuploadImagesを再利用
      }

      // 追加 or 置き換え
      const mode = [...wrap.querySelectorAll('input[name="editImageMode"]')]
        .find(r => r.checked)?.value || "append";
      const images = mode === "replace" ? uploaded : [...existing, ...uploaded];

      const payload = {
        title,
        category: category || "未分類",
        subcategory: subcategory || null,
        hashtags: parseTags(hashtags || ""),
        content,
        images,
      };

      const res = await callAdmin("thread_update", { id: th.id, payload });
      if (!res.ok) throw new Error(await res.text());

      close();
      await loadThreads();
    } catch (e) {
      alert("更新失敗: " + (e?.message || e));
    }
  };
}


async function saveEdit(id, payload) {
  const res = await callAdmin("thread_update", { id, payload });
  if (!res.ok) return alert("更新失敗: " + (await res.text()));
  await loadThreads();
}

function escapeHtml(s) {
  return (s ?? "").toString()
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#39;");
}

document.getElementById("loginBtn").onclick = login;
document.getElementById("logoutBtn").onclick = logout;
document.getElementById("createBtn").onclick = createThread;
document.getElementById("refreshReportsBtn").onclick = loadReports;

// 通報・削除依頼管理機能
async function loadReports() {
  try {
    const typeFilter = document.getElementById("reports-type-filter").value;
    const statusFilter = document.getElementById("reports-status-filter").value;
    
    const payload = {};
    if (typeFilter) payload.type = typeFilter;
    if (statusFilter) payload.status = statusFilter;
    
    const res = await callAdmin("reports_list", { payload });
    if (!res.ok) throw new Error(await res.text());
    
    const json = await res.json();
    displayReports(json.data || []);
    displayReportsStats(json.stats || {});
    
  } catch (e) {
    alert("通報一覧の読み込みに失敗しました: " + (e?.message || e));
  }
}

function displayReportsStats(stats) {
  const statsEl = document.getElementById("reports-stats");
  if (!stats || typeof stats !== 'object') {
    statsEl.textContent = "統計情報なし";
    return;
  }
  
  const { total = 0, pending = 0, approved = 0, rejected = 0, by_type = {} } = stats;
  const { reports = 0, delete_requests = 0 } = by_type;
  
  statsEl.innerHTML = `
    総件数: ${total} | 
    未処理: ${pending} | 
    承認済み: ${approved} | 
    拒否済み: ${rejected} | 
    通報: ${reports} | 
    削除依頼: ${delete_requests}
  `;
}

function displayReports(reports) {
  const wrap = document.getElementById("reports-list");
  if (!reports || reports.length === 0) {
    wrap.innerHTML = '<div class="muted">通報・削除依頼はありません</div>';
    return;
  }
  
  wrap.innerHTML = reports.map(r => {
    const typeText = r.type === 'report' ? '通報' : '削除依頼';
    const statusText = r.status === 'pending' ? '未処理' : 
                      r.status === 'approved' ? '承認済み' : '拒否済み';
    const reasonText = getReasonText(r.reason);
    
    const targetInfo = getTargetInfo(r);
    const createdAt = new Date(r.created_at).toLocaleString('ja-JP');
    
    const actions = r.status === 'pending' ? `
      <div class="actions">
        <button onclick="updateReport('${r.id}', 'approved')">承認</button>
        <button onclick="updateReport('${r.id}', 'rejected')">拒否</button>
        <button class="danger" onclick="deleteReportedContent('${r.id}', '${r.target_type}', '${r.target_id}')">
          コンテンツ削除
        </button>
        <button class="danger" onclick="deleteReport('${r.id}')">削除</button>
      </div>
    ` : `
      <div class="actions">
        <button class="danger" onclick="deleteReport('${r.id}')">削除</button>
      </div>
    `;
    
    return `
      <div class="card">
        <div class="row">
          <span class="badge">${typeText}</span>
          <span class="badge">${statusText}</span>
          <span class="muted">${createdAt}</span>
        </div>
        <div><strong>理由:</strong> ${reasonText}</div>
        ${r.description ? `<div><strong>詳細:</strong> ${escapeHtml(r.description)}</div>` : ''}
        <div><strong>通報者:</strong> ${escapeHtml(r.reporter_name)} (${r.reporter_fingerprint || 'N/A'})</div>
        <div><strong>対象:</strong> ${targetInfo}</div>
        ${r.admin_notes ? `<div><strong>管理者メモ:</strong> ${escapeHtml(r.admin_notes)}</div>` : ''}
        ${actions}
      </div>
    `;
  }).join('');
}

function getReasonText(reason) {
  const reasonMap = {
    'spam': 'スパム・宣伝',
    'harassment': '誹謗中傷・嫌がらせ', 
    'inappropriate': '不適切な内容',
    'false_info': '虚偽情報',
    'other': 'その他'
  };
  return reasonMap[reason] || reason;
}

function getTargetInfo(report) {
  const typeText = report.target_type === 'thread' ? 'スレッド' : 
                   report.target_type === 'comment' ? 'コメント' : '返信';
  
  if (report.target_thread) {
    const thread = report.target_thread;
    const preview = thread.content ? thread.content.substring(0, 100) + '...' : '';
    return `${typeText}: "${escapeHtml(thread.title)}" - ${escapeHtml(preview)}`;
  } else if (report.target_comment) {
    const comment = report.target_comment;
    const preview = comment.content ? comment.content.substring(0, 100) + '...' : '';
    return `${typeText}: ${escapeHtml(preview)}`;
  } else {
    return `${typeText} (ID: ${report.target_id})`;
  }
}

async function updateReport(id, status) {
  try {
    const adminNotes = prompt("管理者メモ (任意):");
    const payload = { status };
    if (adminNotes) payload.admin_notes = adminNotes;
    
    const res = await callAdmin("report_update", { id, payload });
    if (!res.ok) throw new Error(await res.text());
    
    await loadReports();
  } catch (e) {
    alert("更新に失敗しました: " + (e?.message || e));
  }
}

async function deleteReport(id) {
  if (!confirm("この通報・削除依頼を削除しますか？")) return;
  
  try {
    const res = await callAdmin("report_delete", { id });
    if (!res.ok) throw new Error(await res.text());
    
    await loadReports();
  } catch (e) {
    alert("削除に失敗しました: " + (e?.message || e));
  }
}

async function deleteReportedContent(reportId, targetType, targetId) {
  const typeText = targetType === 'thread' ? 'スレッド' : 
                   targetType === 'comment' ? 'コメント' : '返信';
  
  if (!confirm(`この${typeText}を削除しますか？この操作は取り消せません。`)) return;
  
  try {
    const res = await callAdmin("delete_reported_content", { 
      id: reportId, 
      payload: { target_type: targetType, target_id: targetId }
    });
    if (!res.ok) throw new Error(await res.text());
    
    await loadReports();
  } catch (e) {
    alert("削除に失敗しました: " + (e?.message || e));
  }
}

// フィルター変更時に自動更新
document.getElementById("reports-type-filter").onchange = loadReports;
document.getElementById("reports-status-filter").onchange = loadReports;

