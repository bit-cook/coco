const $ = (selector) => document.querySelector(selector);
let token = sessionStorage.getItem("coco-control-token") || "";
let pollFailures = 0;
let noticeTimer = null;

const api = async (path, options = {}) => {
  const response = await fetch(path, { ...options, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(options.headers || {}) } });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || `HTTP ${response.status}`);
  return response.json();
};

const escapeText = (node, value) => { const text = value ?? ""; if (node.textContent !== text) node.textContent = text; };

function notice(message) {
  const node = $("#notice");
  clearTimeout(noticeTimer);
  if (!message) { node.hidden = true; return; }
  node.textContent = message;
  node.hidden = false;
  noticeTimer = setTimeout(() => { node.hidden = true; }, 6000);
}

function markConnection(ok) {
  document.body.classList.toggle("connected", ok);
  escapeText($("#status"), ok ? "已安全连接" : "连接中断，正在重试…");
}

const byNewest = (left, right) => String(right.createdAt ?? "").localeCompare(String(left.createdAt ?? ""));

function applyTask(card, task) {
  card.dataset.taskId = task.id;
  card.dataset.status = task.status;
  const meta = `${task.cwd}${task.branch ? ` · ${task.branch}` : ""}`;
  for (const [selector, value] of [
    [".task-status", task.status], [".task-id", task.id], [".task-prompt", task.prompt], [".task-meta", meta],
  ]) escapeText(card.querySelector(selector), value);
  const resultNode = card.querySelector(".task-result");
  if (!task.result && task.lastError) {
    resultNode.dataset.kind = "error";
    escapeText(resultNode, task.lastError);
  } else {
    resultNode.dataset.kind = task.result ? "result" : "";
    escapeText(resultNode, task.result || "");
  }
  const cancel = card.querySelector(".cancel");
  cancel.hidden = ["completed", "failed", "cancelled"].includes(task.status);
  cancel.disabled = false;
  const approve = card.querySelector(".approve");
  approve.hidden = task.status !== "blocked" || task.trigger !== "manual";
  approve.disabled = false;
}

async function runAction(button, path, failureLabel) {
  button.disabled = true;
  try {
    await api(path, { method: "POST" });
    notice("");
    await render();
  } catch (error) {
    notice(`${failureLabel}：${error.message}`);
    button.disabled = false;
  }
}

function wireCard(card, taskId) {
  card.querySelector(".approve").addEventListener("click", (event) => runAction(event.currentTarget, `/v1/tasks/${taskId}/approve`, "批准失败"));
  card.querySelector(".cancel").addEventListener("click", (event) => runAction(event.currentTarget, `/v1/tasks/${taskId}/cancel`, "取消失败"));
}

async function render() {
  const [{ tasks }, { agents }] = await Promise.all([api("/v1/tasks"), api("/v1/agents")]);
  escapeText($("#agent-count"), `${agents.filter((agent) => agent.alive).length} 个正在运行`);
  const detailed = await Promise.all(tasks.map(async (summary) => {
    try { return (await api(`/v1/tasks/${summary.id}`)).task; } catch { return summary; }
  }));
  const ordered = detailed.sort(byNewest);
  const root = $("#tasks");
  const existing = new Map([...root.children].map((node) => [node.dataset.taskId, node]));
  const nextOrder = [];
  const created = [];
  for (const task of ordered) {
    let card = existing.get(task.id);
    if (!card) {
      card = $("#task-template").content.firstElementChild.cloneNode(true);
      wireCard(card, task.id);
      created.push([card, task]);
    }
    applyTask(card, task);
    nextOrder.push(card);
  }
  for (const [card] of created) root.append(card);
  const currentOrder = [...root.children];
  if (currentOrder.some((node, index) => node !== nextOrder[index])) for (const card of nextOrder) root.append(card);
  for (const [id, node] of existing) if (!nextOrder.includes(node)) node.remove();
}

async function connect() {
  await api("/v1/health");
  markConnection(true);
  pollFailures = 0;
  $("#connect-panel").classList.add("hidden");
  $("#composer").classList.remove("hidden");
  $("#tasks-section").classList.remove("hidden");
  await render();
}

$("#connect-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  token = $("#token").value;
  try {
    await connect();
    sessionStorage.setItem("coco-control-token", token);
  } catch (error) {
    markConnection(false);
    escapeText($("#status"), error.message);
  }
});

$("#task-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = $("#task-form").querySelector("button");
  submit.disabled = true;
  try {
    await api("/v1/tasks", { method: "POST", body: JSON.stringify({ approved: !$("#approval").checked, cwd: $("#cwd").value, prompt: $("#prompt").value, worktree: $("#worktree").checked }) });
    $("#prompt").value = "";
    notice("");
    await render();
  } catch (error) {
    notice(`创建任务失败：${error.message}`);
  } finally {
    submit.disabled = false;
  }
});

$("#refresh").addEventListener("click", () => render().catch((error) => notice(`刷新失败：${error.message}`)));

$("#stop-all").addEventListener("click", async () => {
  if (!confirm("完全终止所有正在运行的 CoCo 任务和 Agent？")) return;
  try {
    const outcome = await api("/v1/tasks/stop-all", { method: "POST" });
    notice(outcome.error ? `停止失败：${outcome.error}` : "已终止全部运行中的任务与 Agent。");
  } catch (error) {
    notice(`全部终止失败：${error.message}`);
  }
  await render().catch(() => {});
});

setInterval(() => {
  if (!document.body.classList.contains("connected")) return;
  render().then(() => { pollFailures = 0; markConnection(true); }).catch(() => {
    pollFailures += 1;
    if (pollFailures >= 2) markConnection(false);
  });
}, 3000);

if (token) connect().catch(() => sessionStorage.removeItem("coco-control-token"));
