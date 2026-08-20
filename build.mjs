#!/usr/bin/env node
// 从 posts/*.json 确定性地渲染每篇报告页与首页 index.html。
// 报告数据由调研流水线生成，本脚本只负责渲染，保证 HTML 稳定不出错。
import { readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const POSTS = join(ROOT, "posts");
const SITE_TITLE = "大模型每日进展";
const SITE_DESC = "每天 10:30 自动调研：模型发布 · 论文方法 · 开源生态 · 产品行业";

const esc = (s = "") =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const isHttp = (u = "") => /^https?:\/\//i.test(u);

function page(title, body) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="stylesheet" href="/llm-daily/assets/style.css">
</head>
<body>
<div class="wrap">
${body}
<footer class="site">由 Claude Code 自动生成 · 内容来自公开网络检索，请以原始来源为准</footer>
</div>
</body>
</html>`;
}

function renderItem(it) {
  const tags = Array.isArray(it.tags) && it.tags.length
    ? `<div class="tags">${it.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>`
    : "";
  const src = isHttp(it.url)
    ? `<div class="src">来源：<a href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.source || it.url)}</a></div>`
    : it.source
    ? `<div class="src">来源：${esc(it.source)}</div>`
    : "";
  return `<div class="item">
  <h3>${esc(it.title)}</h3>
  <p>${esc(it.summary)}</p>
  ${src}
  ${tags}
</div>`;
}

function renderPost(p) {
  const sections = (p.sections || [])
    .filter((s) => s && Array.isArray(s.items) && s.items.length)
    .map(
      (s) => `<section>
  <h2>${esc(s.heading)}</h2>
  ${s.items.map(renderItem).join("\n")}
</section>`
    )
    .join("\n");
  const body = `<a class="back" href="/llm-daily/">← 返回列表</a>
<article>
  <p class="meta">${esc(p.date)}</p>
  <h1>${esc(p.title)}</h1>
  ${p.summary ? `<div class="summary">${esc(p.summary)}</div>` : ""}
  ${sections || '<p class="empty">今日暂无内容。</p>'}
</article>`;
  return page(p.title, body);
}

function renderIndex(posts) {
  const list = posts.length
    ? `<ul class="post-list">${posts
        .map(
          (p) => `<li>
  <span class="date">${esc(p.date)}</span>
  <h2><a href="/llm-daily/posts/${esc(p.date)}.html">${esc(p.title)}</a></h2>
  <p class="excerpt">${esc(p.summary || "")}</p>
</li>`
        )
        .join("\n")}</ul>`
    : '<p class="empty">还没有报告，等第一篇生成后会显示在这里。</p>';
  const body = `<header class="site">
  <h1><a href="/llm-daily/">${esc(SITE_TITLE)}</a></h1>
  <p>${esc(SITE_DESC)}</p>
</header>
${list}`;
  return page(SITE_TITLE, body);
}

async function main() {
  let files = [];
  if (existsSync(POSTS)) {
    files = (await readdir(POSTS)).filter((f) => f.endsWith(".json"));
  }
  const posts = [];
  for (const f of files) {
    try {
      const data = JSON.parse(await readFile(join(POSTS, f), "utf8"));
      if (!data.date) data.date = f.replace(/\.json$/, "");
      if (!data.title) data.title = `${SITE_TITLE} · ${data.date}`;
      posts.push(data);
    } catch (e) {
      console.error(`[build] 跳过无法解析的 ${f}: ${e.message}`);
    }
  }
  posts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  for (const p of posts) {
    await writeFile(join(POSTS, `${p.date}.html`), renderPost(p), "utf8");
  }
  await writeFile(join(ROOT, "index.html"), renderIndex(posts), "utf8");
  await writeFile(join(ROOT, ".nojekyll"), "", "utf8");
  console.log(`[build] 渲染完成：${posts.length} 篇报告`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
