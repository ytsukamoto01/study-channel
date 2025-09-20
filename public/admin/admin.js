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

async function createThread() {
  const payload = {
    title: document.getElementById("new-title").value,
    content: document.getElementById("new-content").value,
    category: document.getElementById("new-category").value || "未分類",
    subcategory: document.getElementById("new-subcategory").value || null,
    hashtags: parseTags(document.getElementById("new-hashtags").value),
    images: parseImages(document.getElementById("new-images").value),
  };
  const res = await callAdmin("thread_create", { payload });
  if (!res.ok) return alert("作成失敗: " + (await res.text()));
  clearNewForm();
  await loadThreads();
}

function clearNewForm() {
  ["new-title","new-content","new-category","new-subcategory","new-hashtags","new-images"]
    .forEach(id => (document.getElementById(id).value = ""));
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
  const title = prompt("タイトル", th.title);
  if (title === null) return;
  const category = prompt("カテゴリ", th.category);
  if (category === null) return;
  const subcategory = prompt("サブカテゴリ(空可)", th.subcategory || "");
  if (subcategory === null) return;
  const hashtags = prompt("タグ（カンマ区切り）", (th.hashtags||[]).join(", "));
  if (hashtags === null) return;
  const content = prompt("本文（改行は \\n ）", th.content || "");
  if (content === null) return;

  const payload = {
    title,
    category,
    subcategory: subcategory || null,
    hashtags: parseTags(hashtags || ""),
    content: content.replaceAll("\\n", "\n"),
    images: th.images || [],
  };
  saveEdit(th.id, payload);
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

