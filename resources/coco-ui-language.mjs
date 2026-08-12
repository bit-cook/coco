import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ZH = {
  "API key": "API 密钥",
  "Automatic": "自动",
  "Current": "当前",
  "Enter to select · Esc to go back": "回车选择 · Esc 返回",
  "Maximum reasoning": "最大推理",
  "Model Name:": "模型名称：",
  "No API key providers available.": "没有可用的 API 密钥提供商。",
  "No matching models": "没有匹配的模型",
  "No matching providers": "没有匹配的提供商",
  "No providers available": "没有可用的提供商",
  "No providers logged in. Use /login first.": "没有已登录的提供商。请先使用 /login。",
  "No reasoning": "不使用推理",
  "No subscription providers available.": "没有支持账号登录的提供商。",
  "Only showing models from configured providers. Use /login to add providers.": "仅显示已配置提供商的模型。使用 /login 添加提供商。",
  "Querying available models / 正在查询可用模型...": "正在查询可用模型...",
  "Refreshing model catalogs…": "正在刷新模型目录…",
  "Model catalogs refreshed.": "模型目录已刷新。",
  "Select a model / 选择模型": "选择模型",
  "Select authentication method:": "选择认证方式：",
  "Select provider to configure:": "选择要配置的提供商：",
  "Select provider to logout:": "选择要退出登录的提供商：",
  "Theme": "主题",
  "Thinking...": "思考中...",
  "Use API key": "使用 API 密钥",
  "Login with subscription": "使用提供商账号登录",
  "subscription": "账号登录",
  "configured": "已配置",
  "unconfigured": "未配置",
  "login-required": "需要登录",
  "navigate": "导航",
  "select": "选择",
  "cancel": "取消",
  "scope": "范围",
  "all": "全部",
  "scoped": "限定",
};

function agentDir() { return process.env.COCO_CODING_AGENT_DIR || join(process.env.HOME || homedir(), ".coco", "agent"); }
export function uiLocale() {
  try { return JSON.parse(readFileSync(join(agentDir(), "language.json"), "utf8")).locale === "zh-CN" ? "zh-CN" : "en"; }
  catch {
    const value = [process.env.LC_ALL, process.env.LC_MESSAGES, process.env.LANG].find((entry) => typeof entry === "string" && entry.trim() !== "") ?? "";
    return /^(?:zh|cmn)(?:[_-](?:CN|SG|Hans))?(?:[.@]|$)/i.test(value) ? "zh-CN" : "en";
  }
}
export function uiText(value) {
  if (uiLocale() !== "zh-CN" || typeof value !== "string") return value;
  if (ZH[value]) return ZH[value];
  return value
    .replace(/^Select authentication method for (.+):$/, "选择 $1 的认证方式：")
    .replace(/^Login to (.+)$/, "登录 $1")
    .replace(/^Model Name: (.+)$/, "模型名称：$1")
    .replace(/^Configured (.+)$/, "已配置 $1")
    .replace(/ login-required/g, " 需要登录")
    .replace(/ • unconfigured/g, " • 未配置")
    .replace(/ ✓ configured/g, " ✓ 已配置");
}
