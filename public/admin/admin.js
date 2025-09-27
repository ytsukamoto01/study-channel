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

async function uploadImages(files) {
  const urls = [];
  for (const file of files) {
    const fd = new FormData();
    fd.append("file", file);
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
    images: imageUrls,
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
  const createdAt = new Date(th.created_at).toLocaleString('ja-JP');

  wrap.innerHTML = `
    <div class="row" style="justify-content:space-between">
      <div style="flex:1;">
        <h4 style="margin: 0 0 8px 0; color: #333;">${escapeHtml(th.title)}</h4>
        <div class="row" style="gap: 8px; margin-bottom: 8px;">
          ${th.admin_mark ? `<span class="badge">🛡️ 管理人</span>` : ""}
          <span class="muted">📁 ${escapeHtml(th.category)}</span>
          ${th.subcategory ? `<span class="muted">/ ${escapeHtml(th.subcategory)}</span>` : ""}
          <span class="muted">📅 ${createdAt}</span>
        </div>
      </div>
      <div class="actions">
        <button class="primary" data-act="toggle-comments">💬 コメント管理</button>
        <button class="warning" data-act="edit">✏️ 編集</button>
        <button class="danger" data-act="del">🗑️ 削除</button>
      </div>
    </div>
    <div style="margin-top:12px; white-space:pre-wrap; line-height:1.6;">${escapeHtml(th.content || "")}</div>
    ${(th.hashtags && th.hashtags.length) ? `<div class="muted" style="margin-top:12px;">${th.hashtags.map(tag => `<span style="background: rgba(102, 126, 234, 0.1); padding: 2px 8px; border-radius: 12px; margin-right: 4px; font-size: 12px;">#${tag}</span>`).join('')}</div>` : ""}

    <div id="cmt-${th.id}" style="display:none; margin-top:12px;">
      <div class="row" style="justify-content:space-between;">
        <div class="muted">💬 コメントツリー</div>
        <div class="row">
          <label class="row" style="gap:6px;">
            <input type="checkbox" id="cmt-incdel-${th.id}" checked> 削除済みも表示
          </label>
          <button data-act="reload-comments" class="primary">🔄 更新</button>
          <button data-act="add-root-comment" class="success">✍️ コメント投稿</button>
        </div>
      </div>
      <div id="root-comment-form-${th.id}" class="reply-form" style="display:none; margin-top:12px;">
        <h4 style="margin: 0 0 12px 0; color: #333;">✍️ 管理人としてコメントを投稿</h4>
        <textarea id="root-comment-content-${th.id}" rows="4" placeholder="コメント内容を入力してください..." style="width:100%; margin-bottom:12px;"></textarea>
        <div class="row" style="justify-content:flex-end; gap:8px;">
          <button data-act="root-comment-cancel">キャンセル</button>
          <button class="success" data-act="root-comment-submit">📤 コメント投稿</button>
        </div>
      </div>
      <div id="cmt-list-${th.id}" style="margin-top:8px;"></div>
    </div>
  `;

  wrap.querySelector("[data-act='edit']").onclick = () => openEditModal(th);
  wrap.querySelector("[data-act='del']").onclick = async () => {
    const confirmMessage = `このスレッドを完全削除しますか？\n\n🔥 以下のデータが永久に削除されます：\n• 全てのコメント・返信\n• いいね・お気に入り\n• 関連する通報データ\n\n⚠️ データベースから完全に消去されます\n⚠️ この操作は取り消せません`;
    if (!confirm(confirmMessage)) return;

    const deleteBtn = wrap.querySelector("[data-act='del']");
    const originalText = deleteBtn.textContent;
    try {
      deleteBtn.textContent = '削除中...';
      deleteBtn.disabled = true;
      const res = await callAdmin("thread_delete", { id: th.id });
      if (!res.ok) {
        const errorText = await res.text();
        alert("削除失敗: " + errorText);
        return;
      }
      alert("スレッドと関連データを完全削除しました");
      await loadThreads();
    } catch (error) {
      alert("削除中にエラーが発生しました: " + error.message);
    } finally {
      deleteBtn.textContent = originalText;
      deleteBtn.disabled = false;
    }
  };

  wrap.querySelector("[data-act='toggle-comments']").onclick = async () => {
    const box = document.getElementById(`cmt-${th.id}`);
    const now = box.style.display !== "none";
    box.style.display = now ? "none" : "block";
    if (!now) await loadCommentsForThread(th.id);
  };
  wrap.querySelector("[data-act='reload-comments']").onclick = async () => {
    await loadCommentsForThread(th.id);
  };

  wrap.querySelector("[data-act='add-root-comment']").onclick = () => {
    const form = document.getElementById(`root-comment-form-${th.id}`);
    const isVisible = form.style.display !== "none";
    form.style.display = isVisible ? "none" : "block";
    if (!isVisible) document.getElementById(`root-comment-content-${th.id}`).focus();
  };

  const rootCancelBtn = wrap.querySelector("[data-act='root-comment-cancel']");
  if (rootCancelBtn) rootCancelBtn.onclick = () => {
    document.getElementById(`root-comment-form-${th.id}`).style.display = "none";
  };

  const rootSubmitBtn = wrap.querySelector("[data-act='root-comment-submit']");
  if (rootSubmitBtn) rootSubmitBtn.onclick = async () => {
    const content = document.getElementById(`root-comment-content-${th.id}`).value.trim();
    if (!content) return alert("コメント内容を入力してください。");
    try {
      const r = await callAdmin("comment_create", {
        payload: { thread_id: th.id, parent_id: null, content, images: [] }
      });
      if (!r.ok) throw new Error(await r.text());
      document.getElementById(`root-comment-content-${th.id}`).value = "";
      document.getElementById(`root-comment-form-${th.id}`).style.display = "none";
      await loadCommentsForThread(th.id);
    } catch (e) {
      alert("コメントの投稿に失敗しました: " + (e?.message || e));
    }
  };

  return wrap;
}

function openEditModal(th) {
  const old = document.getElementById("edit-modal");
  if (old) old.remove();

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

      const existingStr = document.getElementById("edit-existing-images").value || "";
      const existing = existingStr.split(",").map(s => s.trim()).filter(Boolean);

      const fileInput = document.getElementById("edit-new-images");
      let uploaded = [];
      if (fileInput?.files?.length) {
        uploaded = await uploadImages(fileInput.files);
      }

      const mode = [...wrap.querySelectorAll('input[name="editImageMode"]')].find(r => r.checked)?.value || "append";
      const images = mode === "replace" ? uploaded : [...existing, ...uploaded];

      const payload = {
        title,
        category: category || "未分類",
        subcategory: subcategory || null,
        hashtags: (hashtags || "").split(",").map(s => s.trim()).filter(Boolean),
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

// ---------------------------
// 通報・削除依頼管理
// ---------------------------
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
        <button class="success" data-report='${JSON.stringify(r)}' onclick="handleApproval('${r.id}')">承認・削除</button>
        <button class="warning" onclick="updateReport('${r.id}', 'rejected')">拒否</button>
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

async function updateReport(id, status, report = null) {
  try {
    let deleteContent = false;
    if (status === 'approved' && report) {
      const typeText = report.target_type === 'thread' ? 'スレッド' :
                       report.target_type === 'comment' ? 'コメント' : '返信';

      let confirmMessage;
      if (report.target_type === 'thread') {
        confirmMessage = `この通報・削除依頼を承認し、該当の${typeText}を削除しますか？\n\n⚠️ スレッド削除時は以下も同時に削除されます：\n• 全てのコメント・返信\n• いいね・お気に入り\n• 関連する通報データ\n\nこの操作は取り消せません。`;
      } else {
        confirmMessage = `この通報・削除依頼を承認し、該当の${typeText}を削除しますか？\n\n⚠️ ${typeText}削除時は以下も同時に削除されます：\n• いいね\n• 関連する通報データ\n\nこの操作は取り消せません。`;
      }
      deleteContent = confirm(confirmMessage);
      if (!deleteContent) {
        if (!confirm('コンテンツは削除せずに承認のみを行いますか？')) return;
      }
    }

    const adminNotes = prompt("管理者メモ (任意):");
    const payload = { status, delete_content: deleteContent };
    if (adminNotes) payload.admin_notes = adminNotes;

    const res = await callAdmin("report_update", { id, payload });
    if (!res.ok) throw new Error(await res.text());

    const result = await res.json();
    if (result.content_deleted) alert(`通報を承認し、コンテンツを削除しました。`);

    await loadReports();
  } catch (e) {
    alert("更新に失敗しました: " + (e?.message || e));
  }
}

async function handleApproval(id) {
  const button = event.target;
  const reportData = JSON.parse(button.getAttribute('data-report'));
  await updateReport(id, 'approved', reportData);
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

  let confirmMessage;
  if (targetType === 'thread') {
    confirmMessage = `この${typeText}を削除しますか？\n\n⚠️ スレッド削除時は以下も同時に削除されます：\n• 全てのコメント・返信\n• いいね・お気に入り\n• 関連する通報データ\n\nこの操作は取り消せません。`;
  } else {
    confirmMessage = `この${typeText}を削除しますか？\n\n⚠️ ${typeText}削除時は以下も同時に削除されます：\n• いいね\n• 関連する通報データ\n\nこの操作は取り消せません。`;
  }
  if (!confirm(confirmMessage)) return;

  try {
    const res = await callAdmin("delete_reported_content", {
      id: reportId,
      payload: { target_type: targetType, target_id: targetId }
    });
    if (!res.ok) throw new Error(await res.text());
    alert(`${typeText}と関連データを削除しました`);
    await loadReports();
  } catch (e) {
    alert("削除に失敗しました: " + (e?.message || e));
  }
}

// ---------------------------
// コメント（番号順で安定ソート）
// ---------------------------
async function loadCommentsForThread(threadId) {
  const includeDeleted = document.getElementById(`cmt-incdel-${threadId}`)?.checked ?? true;

  const res = await callAdmin("thread_full", { payload: { thread_id: threadId, include_deleted: includeDeleted } });
  if (!res.ok) {
    const t = await res.text();
    return alert("コメント取得失敗: " + t);
  }
  const json = await res.json();
  const data = json?.data || {};
  const cmts = Array.isArray(data.comments) ? data.comments : [];

  // ★ comment_number 昇順で安定ソート（次キー: depth → created_at）
  const sorted = cmts.slice().sort((a, b) => {
    const an = (a.comment_number ?? Number.MAX_SAFE_INTEGER);
    const bn = (b.comment_number ?? Number.MAX_SAFE_INTEGER);
    if (an !== bn) return an - bn;
    const ad = a.depth ?? 0;
    const bd = b.depth ?? 0;
    if (ad !== bd) return ad - bd;
    const at = new Date(a.created_at || 0).getTime();
    const bt = new Date(b.created_at || 0).getTime();
    return at - bt;
  });

  const listEl = document.getElementById(`cmt-list-${threadId}`);
  if (!listEl) return;

  if (!sorted.length) {
    listEl.innerHTML = `<div class="muted">コメントはありません</div>`;
    return;
  }
  listEl.innerHTML = "";
  for (const c of sorted) listEl.appendChild(renderCommentLine(c, threadId));
}

function renderCommentLine(c, threadId) {
  const line = document.createElement("div");
  line.className = "cmt-line";
  line.style.marginLeft = `${Math.min(c.depth ?? 0, 10) * 16}px`;

  const content = (c.content && c.content.trim().length) ? escapeHtml(c.content) : "(本文なし)";
  const imgInfo = (Array.isArray(c.images) && c.images.length) ? `<div class="muted mono">${c.images.length}枚の画像URL</div>` : "";
  const numBadge = (c.comment_number != null) ? `#${String(c.comment_number)}` : `#?`;

  line.innerHTML = `
    <div>
      <div class="row" style="justify-content:space-between;">
        <div>
          <strong>${escapeHtml(c.author_name || "匿名")}</strong>
          <span class="badge">${numBadge}</span>
          <span class="muted mono">id:${c.id.slice(0,8)} depth:${c.depth ?? 0} replies:${c.reply_count ?? 0}</span>
        </div>
        <div class="actions">
          <button class="reply-toggle" data-act="c-reply">💬 返信</button>
          <button data-act="c-edit">✏️ 編集</button>
          <button class="danger" data-act="c-harddel">💀 ハード削除</button>
        </div>
      </div>
      <div style="white-space:pre-wrap; margin-top:8px;">${content}</div>
      ${imgInfo}
      <div class="row" style="gap:8px; margin-top:8px;">
        <input class="mono" id="reparent-${c.id}" placeholder="新しい親コメントID（空でルート）" style="flex:1; min-width:260px;">
        <button data-act="c-reparent">🔄 親を付け替え</button>
      </div>
      <div id="reply-form-${c.id}" class="reply-form" style="display:none; margin-top:12px;">
        <h4 style="margin: 0 0 12px 0; color: #333;">💬 ${escapeHtml(c.author_name || "匿名")}さんに返信</h4>
        <textarea id="reply-content-${c.id}" rows="4" placeholder="返信内容を入力してください..." style="width:100%; margin-bottom:12px;"></textarea>
        <div class="row" style="justify-content:flex-end; gap:8px;">
          <button data-act="reply-cancel">キャンセル</button>
          <button class="success" data-act="reply-submit">📤 返信送信</button>
        </div>
      </div>
    </div>
  `;

  // 返信フォーム開閉
  line.querySelector("[data-act='c-reply']").onclick = () => {
    const form = document.getElementById(`reply-form-${c.id}`);
    const isVisible = form.style.display !== "none";
    form.style.display = isVisible ? "none" : "block";
    if (!isVisible) document.getElementById(`reply-content-${c.id}`).focus();
  };

  // 編集
  line.querySelector("[data-act='c-edit']").onclick = () => openCommentEditModal(c, threadId);

  // ハード削除のみ
  line.querySelector("[data-act='c-harddel']").onclick = async () => {
    if (!confirm("このコメントを完全削除します。よろしいですか？")) return;
    const r = await callAdmin("comment_hard_delete", { payload: { id: c.id } });
    if (!r.ok) return alert("失敗: " + (await r.text()));
    await loadCommentsForThread(threadId);
  };

  // 親付け替え
  line.querySelector("[data-act='c-reparent']").onclick = async () => {
    const newParent = (document.getElementById(`reparent-${c.id}`)?.value || "").trim() || null;
    if (newParent === c.id) return alert("自分自身は親にできません。");
    const r = await callAdmin("comment_reparent", { payload: { id: c.id, new_parent_id: newParent } });
    if (!r.ok) return alert("付け替え失敗: " + (await r.text()));
    await loadCommentsForThread(threadId);
  };

  // 返信送信
  const replyCancelBtn = line.querySelector("[data-act='reply-cancel']");
  if (replyCancelBtn) replyCancelBtn.onclick = () => {
    document.getElementById(`reply-form-${c.id}`).style.display = "none";
  };
  const replySubmitBtn = line.querySelector("[data-act='reply-submit']");
  if (replySubmitBtn) replySubmitBtn.onclick = async () => {
    const content = document.getElementById(`reply-content-${c.id}`).value.trim();
    if (!content) return alert("返信内容を入力してください。");
    try {
      const r = await callAdmin("comment_create", {
        payload: { thread_id: threadId, parent_id: c.id, content, images: [] }
      });
      if (!r.ok) throw new Error(await r.text());
      document.getElementById(`reply-content-${c.id}`).value = "";
      document.getElementById(`reply-form-${c.id}`).style.display = "none";
      await loadCommentsForThread(threadId);
    } catch (e) {
      alert("返信の投稿に失敗しました: " + (e?.message || e));
    }
  };

  return line;
}

// コメント編集モーダル
function openCommentEditModal(c, threadId) {
  const old = document.getElementById("cmt-edit-modal");
  if (old) old.remove();

  const wrap = document.createElement("div");
  wrap.id = "cmt-edit-modal";
  wrap.style.position = "fixed";
  wrap.style.inset = "0";
  wrap.style.background = "rgba(0,0,0,0.4)";
  wrap.style.zIndex = "9999";
  wrap.style.display = "flex";
  wrap.style.alignItems = "center";
  wrap.style.justifyContent = "center";

  wrap.innerHTML = `
    <div style="background:#fff; width:min(720px,92vw); max-height:90vh; overflow:auto; border-radius:12px; padding:16px; box-shadow:0 8px 32px rgba(0,0,0,.25)">
      <div class="row" style="justify-content:space-between;">
        <h3 style="margin:0;">コメント編集</h3>
        <button id="cmt-edit-close" style="border:none;background:#eee;padding:6px 10px;border-radius:8px;cursor:pointer;">閉じる</button>
      </div>
      <div style="display:grid; gap:10px; margin-top:12px;">
        <label>本文
          <textarea id="cmt-edit-content" rows="8" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:8px;">${escapeHtml(c.content || "")}</textarea>
        </label>
        <label>画像URL（カンマ区切り）
          <textarea id="cmt-edit-images" rows="3" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:8px;">${escapeHtml((c.images||[]).join(", "))}</textarea>
        </label>
      </div>
      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:16px;">
        <button id="cmt-edit-cancel" style="border:1px solid #ccc; background:#fff; padding:8px 12px; border-radius:8px; cursor:pointer;">キャンセル</button>
        <button id="cmt-edit-save" class="primary" style="border:none; background:#222; color:#fff; padding:8px 12px; border-radius:8px; cursor:pointer;">保存</button>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);

  const close = () => wrap.remove();
  wrap.querySelector("#cmt-edit-close").onclick = close;
  wrap.querySelector("#cmt-edit-cancel").onclick = close;

  wrap.querySelector("#cmt-edit-save").onclick = async () => {
    try {
      const content = document.getElementById("cmt-edit-content").value;
      const imagesStr = document.getElementById("cmt-edit-images").value || "";
      const images = imagesStr.split(",").map(s => s.trim()).filter(Boolean);

      const r = await callAdmin("comment_update", { payload: { id: c.id, content, images } });
      if (!r.ok) throw new Error(await r.text());
      close();
      await loadCommentsForThread(threadId);
    } catch (e) {
      alert("更新失敗: " + (e?.message || e));
    }
  };
}

// フィルター変更時に自動更新
document.getElementById("reports-type-filter").onchange = loadReports;
document.getElementById("reports-status-filter").onchange = loadReports;


