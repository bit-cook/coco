const $ = (selector) => document.querySelector(selector);
let token = sessionStorage.getItem("coco-control-token") || "";
const api = async (path, options = {}) => {
  const response = await fetch(path, { ...options, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(options.headers || {}) } });
  if (!response.ok) {
    const body = await response.json();
    const msg = body?.error || `HTTP ${response.status}`;
    throw new Error(msg === "UNAUTHORIZED" ? "连接失败：令牌无效或已过期。请运行 coco control token 获取最新令牌。" : msg);
  }
  return response.json();
};
const escapeText = (node, value) => { node.textContent = value ?? ""; };
async function render() {
  const [{ tasks }, { agents }] = await Promise.all([api("/v1/tasks"), api("/v1/agents")]);
  $("#agent-count").textContent = `${agents.filter((agent) => agent.alive).length} 个正在运行`;
  const root = $("#tasks"); root.replaceChildren();
  for (const summary of tasks.toReversed()) {
    const { task } = await api(`/v1/tasks/${summary.id}`);
    const card = $("#task-template").content.cloneNode(true);
    escapeText(card.querySelector(".task-status"), task.status); escapeText(card.querySelector(".task-id"), task.id);
    escapeText(card.querySelector(".task-prompt"), task.prompt); escapeText(card.querySelector(".task-meta"), `${task.cwd}${task.branch ? ` · ${task.branch}` : ""}`);
    escapeText(card.querySelector(".task-result"), task.result || task.lastError || "");
    const cancel = card.querySelector(".cancel"); cancel.hidden = ["completed", "failed", "cancelled"].includes(task.status);
    cancel.addEventListener("click", async () => { await api(`/v1/tasks/${task.id}/cancel`, { method: "POST" }); await render(); });
    const approve = card.querySelector(".approve"); approve.hidden = task.status !== "blocked" || task.trigger !== "manual";
    approve.addEventListener("click", async () => { await api(`/v1/tasks/${task.id}/approve`, { method: "POST" }); await render(); });
    root.append(card);
  }
}
async function connect() {
  try {
    await api("/v1/health");
    document.body.classList.add("connected");
    $("#status").textContent = "已安全连接";
    $("#connect-panel").classList.add("hidden");
    $("#composer").classList.remove("hidden");
    $("#tasks-section").classList.remove("hidden");
    await render();
  } catch (error) {
    document.body.classList.remove("connected");
    $("#status").textContent = "连接失败：" + error.message;
    $("#connect-panel").classList.remove("hidden");
    throw error;
  }
}
$("#connect-form").addEventListener("submit", async (event) => { event.preventDefault(); token = $("#token").value; try { await connect(); sessionStorage.setItem("coco-control-token", token); } catch (error) { $("#status").textContent = error.message; } });
$("#task-form").addEventListener("submit", async (event) => { event.preventDefault(); await api("/v1/tasks", { method: "POST", body: JSON.stringify({ approved: !$("#approval").checked, cwd: $("#cwd").value, prompt: $("#prompt").value, worktree: $("#worktree").checked }) }); $("#prompt").value = ""; await render(); });
$("#refresh").addEventListener("click", render);
$("#stop-all").addEventListener("click", async () => { if (confirm("完全终止所有正在运行的 CoCo 任务和 Agent？")) { await api("/v1/tasks/stop-all", { method: "POST" }); await render(); } });
  if (!token) { document.body.classList.remove("connected"); $("#status").textContent = "未连接：请输入控制令牌"; $("#connect-panel").classList.remove("hidden"); $("#composer").classList.add("hidden"); $("#tasks-section").classList.add("hidden"); }
  else { try { await connect(); sessionStorage.setItem("coco-control-token", token); } catch (error) { $("#status").textContent = error.message; $("#connect-panel").classList.remove("hidden"); document.body.classList.remove("connected"); sessionStorage.removeItem("coco-control-token"); } }
setInterval(() => { if (document.body.classList.contains("connected")) render().catch(() => {}); }, 3000);
