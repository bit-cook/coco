const vscode = require("vscode");
const TOKEN_KEY = "coco.controlToken";
function controlUrl() { return vscode.workspace.getConfiguration("coco").get("controlUrl").replace(/\/$/, ""); }
async function token(context) {
  let value = await context.secrets.get(TOKEN_KEY);
  if (!value) { value = await vscode.window.showInputBox({ password: true, prompt: "CoCo control token (coco control token)" }); if (value) await context.secrets.store(TOKEN_KEY, value); }
  return value;
}
async function api(context, path, options = {}) {
  const credential = await token(context); if (!credential) throw new Error("CoCo control token is required");
  const response = await fetch(`${controlUrl()}${path}`, { ...options, headers: { authorization: `Bearer ${credential}`, "content-type": "application/json" } });
  if (response.status === 401) await context.secrets.delete(TOKEN_KEY);
  if (!response.ok) throw new Error((await response.json()).error || `HTTP ${response.status}`); return response.json();
}
function editorContext() {
  const editor = vscode.window.activeTextEditor;
  const tabs = vscode.window.tabGroups.all.flatMap((group) => group.tabs.map((tab) => tab.label)).slice(0, 20);
  if (!editor) return { tabs };
  const selection = editor.document.getText(editor.selection).slice(0, 20000);
  return { activeFile: editor.document.uri.fsPath, language: editor.document.languageId, selection, tabs };
}
async function createTask(context) {
  const folder = vscode.workspace.workspaceFolders?.[0]; if (!folder) return vscode.window.showErrorMessage("Open a workspace first.");
  const prompt = await vscode.window.showInputBox({ prompt: "What should CoCo complete in the background?" }); if (!prompt) return;
  const mode = await vscode.window.showQuickPick(["Run now", "Create for approval"], { placeHolder: "Task approval" }); if (!mode) return;
  const request = `${prompt}\n\nIDE context:\n${JSON.stringify(editorContext(), null, 2)}`;
  const { task } = await api(context, "/v1/tasks", { method: "POST", body: JSON.stringify({ approved: mode === "Run now", cwd: folder.uri.fsPath, prompt: request, worktree: true }) });
  vscode.window.showInformationMessage(`CoCo task ${task.id} ${task.status === "blocked" ? "awaits approval" : "queued in a worktree"}.`);
}
async function showTasks(context) {
  const { tasks } = await api(context, "/v1/tasks");
  const selected = await vscode.window.showQuickPick(tasks.toReversed().map((task) => ({ description: task.status, detail: task.result || task.lastError || task.cwd, label: task.prompt, task })), { placeHolder: "CoCo task history" });
  if (selected?.task.status === "blocked" && selected.task.trigger === "manual") {
    const action = await vscode.window.showWarningMessage(`Approve CoCo task ${selected.task.id}?`, { modal: true }, "Approve");
    if (action === "Approve") { await api(context, `/v1/tasks/${selected.task.id}/approve`, { method: "POST" }); vscode.window.showInformationMessage(`CoCo task ${selected.task.id} approved.`); }
    return;
  }
  if (selected?.task.result) { const document = await vscode.workspace.openTextDocument({ content: selected.task.result, language: "markdown" }); await vscode.window.showTextDocument(document, { preview: true }); }
}
async function diffActive() {
  const editor = vscode.window.activeTextEditor; if (!editor || editor.document.uri.scheme !== "file") return;
  const gitUri = editor.document.uri.with({ scheme: "git", query: JSON.stringify({ path: editor.document.uri.fsPath, ref: "HEAD" }) });
  await vscode.commands.executeCommand("vscode.diff", gitUri, editor.document.uri, `CoCo Review: ${editor.document.fileName}`);
}
function activate(context) {
  context.subscriptions.push(vscode.commands.registerCommand("coco.createTask", () => createTask(context)), vscode.commands.registerCommand("coco.showTasks", () => showTasks(context)), vscode.commands.registerCommand("coco.openControl", () => vscode.env.openExternal(vscode.Uri.parse(controlUrl()))), vscode.commands.registerCommand("coco.diffActive", diffActive));
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90); item.text = "$(hubot) CoCo"; item.command = "coco.createTask"; item.tooltip = "Create a CoCo background task"; item.show(); context.subscriptions.push(item);
}
module.exports = { activate, deactivate() {} };
