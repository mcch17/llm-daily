#!/usr/bin/env bash
# 每日调研 + 发布流水线：
#   1) 用 claude 无头模式按四个维度 websearch 调研，生成 posts/<date>.json
#   2) node build.mjs 重建首页与报告页
#   3) git 提交并推送到 GitHub Pages
# 由系统级定时（launchd/crontab）每天调用。定时环境 PATH 很精简，这里显式补齐。
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

# --- 补齐 PATH（定时任务不继承交互式 shell 的 PATH）---
NODE_BIN="/Users/machengconghui.1/.nvm/versions/node/v24.17.0/bin"
export PATH="$NODE_BIN:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

LOG="$SCRIPT_DIR/run.log"
DATE="$(date +%Y-%m-%d)"
OUT="posts/$DATE.json"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }

log "===== 开始每日调研 $DATE ====="

# --- 1) 调研：拼装带日期与输出路径的 prompt，调用 claude ---
HEADER="今天的日期是 ${DATE}。请把最终 JSON 写入文件：${OUT}（相对当前目录）。以下是任务说明：

"
PROMPT="${HEADER}$(cat "$SCRIPT_DIR/prompt.md")"

# 超时保护：优先用 gtimeout/timeout，避免无头进程卡死
TIMEOUT_BIN=""
if command -v gtimeout >/dev/null 2>&1; then TIMEOUT_BIN="gtimeout 900"; elif command -v timeout >/dev/null 2>&1; then TIMEOUT_BIN="timeout 900"; fi

log "调用 claude 调研中…"
# shellcheck disable=SC2086
$TIMEOUT_BIN claude -p "$PROMPT" \
  --permission-mode acceptEdits \
  --allowedTools "WebSearch" "WebFetch" "Read" "Write" "Edit" "Glob" "Grep" \
  >> "$LOG" 2>&1
CLAUDE_RC=$?
log "claude 退出码：$CLAUDE_RC"

# --- 2) 校验今日 JSON 是否生成且合法 ---
if [ ! -f "$OUT" ]; then
  log "错误：未生成 $OUT，跳过本次发布。"
  exit 1
fi
if ! node -e "JSON.parse(require('fs').readFileSync('$OUT','utf8'))" 2>>"$LOG"; then
  log "错误：$OUT 不是合法 JSON，跳过本次发布。"
  exit 1
fi

# --- 3) 重建站点 ---
log "重建站点…"
node build.mjs >> "$LOG" 2>&1 || { log "错误：build.mjs 失败"; exit 1; }

# --- 4) 提交并推送 ---
if [ -n "$(git status --porcelain)" ]; then
  git add -A >> "$LOG" 2>&1
  git commit -m "每日进展 $DATE" >> "$LOG" 2>&1
  if git push >> "$LOG" 2>&1; then
    log "已推送到 GitHub Pages。"
  else
    log "警告：git push 失败（检查网络/鉴权），本地已提交。"
  fi
else
  log "无变更，跳过提交。"
fi

log "===== 完成 $DATE ====="
