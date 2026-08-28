#!/usr/bin/env node
// B站产品传播洞察报告生成脚本（单产品版）
// 用法: node scripts/gen_report.mjs <数据JSON> <产品名> [--brand 自身产品名] [--desc 自身产品一句话描述] [--out 输出HTML]
// 示例: node scripts/gen_report.mjs data/trae_videos.json "Trae" --brand "CodeArts" --desc "华为云AI编程助手" --out report.html

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ---------- 参数解析 ----------
const args = process.argv.slice(2);
const cmd = { data: null, product: '', brand: '', desc: '', out: '' };
let phase = 'data';
for (const a of args) {
  if (a === '--brand') { phase = 'brand'; continue; }
  if (a === '--desc') { phase = 'desc'; continue; }
  if (a === '--out') { phase = 'out'; continue; }
  if (phase === 'data') { cmd.data = a; phase = 'name'; continue; }
  if (phase === 'name') { cmd.product = a; phase = 'cmd'; continue; }
  if (phase === 'brand') { cmd.brand = a; phase = 'cmd'; continue; }
  if (phase === 'desc') { cmd.desc = a; phase = 'cmd'; continue; }
  if (phase === 'out') { cmd.out = a; phase = 'cmd'; continue; }
}
if (!cmd.data || !cmd.product) {
  console.error('用法: node gen_report.mjs <数据JSON> <产品名> [--brand 自身产品] [--desc 描述] [--out HTML]');
  process.exit(1);
}

// ---------- 主题分类 ----------
const THEME_RULES = [
  ['教程入门', /教程|入门|新手|零基础|保姆|手把手|指南|怎么用|如何用/],
  ['安装部署', /安装|部署|配置|下载|\bsetup\b|环境搭建/],
  ['实战应用', /实战|项目|开发|构建|搭建|写一个|做一个|全栈|后端|前端|系统/],
  ['测评对比', /对比|\bvs\b|测评|评测|比较|替代|\bpk\b|谁更|哪个好|横评/],
  ['新闻资讯', /发布|上线|更新|宣布|推出|首发/],
];
function classifyTheme(title) {
  const t = title.toLowerCase();
  for (const [name, re] of THEME_RULES) { if (re.test(t)) return name; }
  return '其他';
}

// ---------- 卖点词 ----------
const KEYWORD_GROUPS = {
  '教程': ['教程', '入门', '保姆', '手把手', '零基础', '指南'],
  '场景': ['实战', '项目', '开发', '工作', '效率', '生产力'],
  '对比': ['对比', 'vs', 'VS', '测评', '评测', '替代'],
  '产品': ['ide', 'IDE', '插件', 'cli', 'CLI', 'agent', 'Agent', '智能体'],
  '情感': ['免费', '国产', '神器', '颠覆', '革命', '最强', '最好', '首选'],
  '技术': ['ai', 'AI', '编程', '代码', '补全', '生成', '重构'],
};

// ---------- 视频概要 ----------
function summarizeVideo(title, theme) {
  const base = {
    '教程入门': ['基础功能教学', '从安装配置到核心功能逐一讲解', '降低上手门槛，适合新手快速入门'],
    '安装部署': ['环境搭建与安装配置', '按步骤演示安装流程与常见问题', '快速完成环境准备，开始使用产品'],
    '实战应用': ['用产品完成实际开发项目', '从需求分析到编码实现全流程演示', '展示产品在实际开发中的能力与效率提升'],
    '测评对比': ['多产品横向对比评测', '功能对比→场景适配→推荐结论', '帮助用户做选购决策'],
    '新闻资讯': ['产品动态与版本更新', '介绍新功能/新版本变化', '跟踪产品最新进展'],
    '其他': ['产品体验分享或场景展示', '基于个人使用经验分享', '展示产品在实际场景中的价值'],
  };
  let [content, logic, viewpoint] = base[theme] || base['其他'];
  if (/半佛|抢回|偷走|人生/.test(title)) { content = '场景化宣传，从工作痛点情感切入'; logic = '痛点共鸣→产品亮相→效果对比→价值升华'; viewpoint = 'AI工具帮人抢回被工作偷走的时间'; }
  if (/保姆|手把手|零基础/.test(title)) logic = '从零开始，极其详细的逐步操作演示';
  if (/对比|\bvs\b|横评|谁更|哪个好/.test(title)) { content = '竞品横向对比评测'; logic = '功能逐一对比→场景适配→明确推荐'; }
  if (/免费/.test(title)) viewpoint = '强调免费可用，降低尝试门槛';
  if (/国产|自主/.test(title)) viewpoint = '国产替代方案，自主可控';
  if (/效率|提升|倍|生产力/.test(title)) viewpoint = '量化效率提升，用数据证明价值';
  return { content, logic, viewpoint };
}

// ---------- 数据分析 ----------
function analyze(videos, productName) {
  const count = videos.length;
  const totalPlay = videos.reduce((s, v) => s + v.play, 0);
  const totalLike = videos.reduce((s, v) => s + v.like, 0);
  const totalFav = videos.reduce((s, v) => s + v.favorite, 0);
  const avgPlay = count ? Math.round(totalPlay / count) : 0;
  const likeRate = totalPlay ? (totalLike / totalPlay * 100).toFixed(2) : '0';

  const themes = {};
  videos.forEach(v => { const t = classifyTheme(v.title); (themes[t] = themes[t] || { count: 0, play: 0 }); themes[t].count++; themes[t].play += v.play; });

  const kwCount = {};
  videos.forEach(v => {
    for (const words of Object.values(KEYWORD_GROUPS)) { for (const w of words) { if (v.title.includes(w)) kwCount[w] = (kwCount[w] || 0) + 1; } }
  });
  const topKeywords = Object.entries(kwCount).sort((a, b) => b[1] - a[1]).slice(0, 15);

  const top50 = [...videos].sort((a, b) => b.play - a.play).slice(0, 50);

  const monthly = {};
  videos.forEach(v => { if (v.pubdate_str) { const m = v.pubdate_str.substring(0, 7); monthly[m] = (monthly[m] || 0) + 1; } });
  const months = Object.entries(monthly).sort((a, b) => a[0].localeCompare(b[0])).slice(-12);

  const authorMap = {};
  videos.forEach(v => { if (v.author) { authorMap[v.author] = authorMap[v.author] || { count: 0, play: 0 }; authorMap[v.author].count++; authorMap[v.author].play += v.play; } });
  const topAuthors = Object.entries(authorMap).sort((a, b) => b[1].play - a[1].play).slice(0, 6);

  return { count, totalPlay, totalLike, totalFav, avgPlay, likeRate, themes, topKeywords, top50, months, topAuthors };
}

function fmt(n) { if (n >= 10000) return (n / 10000).toFixed(1) + '万'; return n.toLocaleString(); }

// ---------- HTML 生成 ----------
function genHTML(a, productName, brand, desc) {
  const themeRows = Object.entries(a.themes).sort((x, y) => y[1].play - x[1].play)
    .map(([t, d]) => `<span style="background:#fff0f0;color:#C7000B;border-radius:12px;padding:3px 12px;font-size:12px;margin:3px 4px;display:inline-block">${t} <b>${d.count}</b>/${fmt(d.play)}</span>`).join('');

  const kwHtml = a.topKeywords.map(([k, c]) => `<span style="display:inline-block;margin:3px 4px;padding:3px 10px;border-radius:12px;background:#fff0f0;color:#C7000B;font-size:${Math.min(17, 12 + c / 3)}px">${k}<sub style="color:#999">${c}</sub></span>`).join('');

  const authorHtml = a.topAuthors.map(([name, d], i) =>
    `<span style="display:inline-block;margin:3px 6px;padding:3px 10px;background:#f5f5f7;border-radius:12px;font-size:12px">${i + 1}. ${name}（${d.count}条/${fmt(d.play)}）</span>`).join('');

  const monthHtml = a.months.map(([m, c]) => {
    const max = Math.max(...a.months.map(x => x[1]));
    const pct = Math.round(c / max * 100);
    return `<div style="margin:4px 0;display:flex;align-items:center"><span style="width:70px;font-size:12px;color:#666">${m}</span><div style="flex:1;background:#f0f0f0;border-radius:3px;height:16px"><div style="background:linear-gradient(90deg,#C7000B,#ff4444);height:16px;border-radius:3px;width:${pct}%"></div></div><span style="width:30px;text-align:right;font-size:12px;color:#C7000B">${c}</span></div>`;
  }).join('');

  const topRows = a.top50.map((v, i) => {
    const theme = classifyTheme(v.title);
    const sum = summarizeVideo(v.title, theme);
    const t = v.title.length > 55 ? v.title.substring(0, 55) + '…' : v.title;
    return `<tr>
<td style="color:#C7000B;font-weight:700">${fmt(v.play)}</td>
<td><a href="${v.url}" target="_blank" title="${v.title}" style="color:#1470b5;text-decoration:none">${t}</a>
<div style="font-size:11px;color:#888;margin-top:3px;line-height:1.5"><span style="color:#C7000B">内容:</span>${sum.content} · <span style="color:#C7000B">逻辑:</span>${sum.logic}<br><span style="color:#C7000B">观点:</span>${sum.viewpoint}</div></td>
<td><span style="background:#f0f0f0;border-radius:10px;padding:2px 8px;font-size:11px">${theme}</span></td>
<td style="font-size:12px">${v.author}</td><td>${fmt(v.like)}</td><td>${fmt(v.favorite)}</td><td style="font-size:12px;color:#888">${v.pubdate_str}</td></tr>`;
  }).join('');

  const brandHtml = brand ? `
<section style="background:#fff;border-radius:10px;padding:24px;margin:0 0 24px;box-shadow:0 3px 14px rgba(199,0,11,.12);border-left:5px solid #C7000B">
<div style="display:inline-block;background:#C7000B;color:#fff;font-size:11px;padding:2px 10px;border-radius:10px;margin-bottom:10px">核心结论 · 置顶</div>
<h2 style="font-size:20px;color:#C7000B;margin-bottom:12px">对「${brand}」的传播启发</h2>
<p style="font-size:13px;color:#666;margin-bottom:14px">分析目标产品「${productName}」在 B 站的传播策略，提炼对 ${brand}${desc ? '（' + desc + '）' : ''} 可直接借鉴的打法：</p>
<div style="background:#f9f9fb;border-radius:8px;padding:14px 18px;font-size:14px;color:#333;line-height:1.9">
<strong style="color:#C7000B">1. 内容主题布局：</strong>${productName}以"${Object.entries(a.themes).sort((x,y)=>y[1].play-x[1].play).map(([t,d])=>t).slice(0,3).join('、')}"为主要内容带。${brand}应优先补齐前三主题的内容缺口（当前TOP50占比估算：${Object.entries(a.themes).slice(0,3).map(([t,d])=>`${t}${(d.count/a.count*100).toFixed(0)}%`).join('、')}）。<br>
<strong style="color:#C7000B">2. 高传播卖点句式：</strong>TOP 视频标题多用"${a.topKeywords.slice(0,4).map(([k])=>k).join('、')}"等词。建议标题模板：“${brand}”+ 场景痛点 + 量化收益。<br>
<strong style="color:#C7000B">3. 头部UP主合作：</strong>${productName}传播力前${Math.min(3, a.topAuthors.length)}作者贡献主要播放量。建议优先商务合作粉丝50万+的科技/效率区UP主，用产品实景演示+可复制成果。部分合作方向：${a.topAuthors.slice(0,3).map(([n],i)=>`${i+1}「${n}」类博主`).join('、')}。<br>
<strong style="color:#C7000B">4. 内容差异化机会：</strong>“测评对比”“实战应用”在${productName}的内容占比为${(a.themes['测评对比']?.count||0 + (a.themes['实战应用']?.count||0)) ? (((a.themes['测评对比']?.count||0)+(a.themes['实战应用']?.count||0))/a.count*100).toFixed(0)+'%' : '0%'}，是该产品相对薄弱的蓝海区域，${brand}可从此切入形成差异化。<br>
<strong style="color:#C7000B">5. 情感化标题策略：</strong>${a.topKeywords.some(([k])=>['神器','颠覆','革命','免费','国产'].includes(k)) ? '该类词已在其标题中被验证有效，可借鉴。' : '该类词在其标题中较少使用，存在差异化空间，可先行测试。'}
</div>
</section>` : '';

  const today = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${productName} B站传播策略洞察报告</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:"Microsoft YaHei","微软雅黑",-apple-system,sans-serif;background:#f5f5f7;color:#1d1d1f;line-height:1.7}
.header{background:linear-gradient(135deg,#C7000B 0%,#8b0000 100%);color:#fff;padding:44px 40px;text-align:center}
.header h1{font-size:28px;margin-bottom:10px}
.header p{font-size:14px;opacity:.92;max-width:800px;margin:0 auto}
.header .meta{margin-top:12px;font-size:12px;opacity:.8}
.container{max-width:1240px;margin:0 auto;padding:28px 22px}
h2.sec{font-size:20px;color:#C7000B;border-left:4px solid #C7000B;padding-left:12px;margin:32px 0 16px}
.stats{display:flex;gap:14px;flex-wrap:wrap;background:#fff;border-radius:10px;padding:20px;box-shadow:0 2px 10px rgba(0,0,0,.06)}
.stat{background:#f9f9fb;border-radius:8px;padding:12px 16px;min-width:110px;flex:1}
.stat .l{font-size:11px;color:#888}
.stat .v{font-size:22px;font-weight:700;color:#C7000B}
.note{background:#fffbe6;border:1px solid #ffe58f;border-radius:8px;padding:12px 16px;margin:16px 0;font-size:13px;color:#614700}
.card{background:#fff;border-radius:10px;padding:22px;margin:16px 0;box-shadow:0 2px 10px rgba(0,0,0,.06)}
table{width:100%;border-collapse:collapse;font-size:13px;background:#fff}
th{background:#f5f5f7;padding:8px;text-align:left;font-weight:600;color:#555;font-size:12px}
td{padding:7px 8px;border-bottom:1px solid #f0f0f0}
tr:hover{background:#fff8f8}
.search{padding:8px 14px;border:1px solid #ddd;border-radius:6px;font-size:13px;width:260px;margin-bottom:10px}
.footer{text-align:center;padding:24px;color:#888;font-size:12px}
</style></head>
<body>
<div class="header">
<h1>${productName} · B站传播策略洞察报告</h1>
<p>内容主题 · 内容结构 · 卖点文案 · 播放点赞数据 · TOP 50 视频全览${brand ? ' · 对' + brand + '的启发' : ''}</p>
<div class="meta">报告生成：${today} ｜ 数据来源：B站搜索API ｜ 共 ${a.count} 条视频 ｜ 每条视频可点击跳转</div>
</div>
<div class="container">

${brandHtml}

<div class="note"><b>数据说明：</b>通过B站搜索API采集「${productName}」相关视频，页面数据按播放量降序展示。主题归类基于标题关键词规则匹配（优先级：教程入门→安装部署→实战应用→测评对比→新闻资讯→其他），视频概要为基于标题的自动推断。<strong>报告不含任何个人信息。</strong></div>

<h2 class="sec">核心数据总览</h2>
<div class="stats">
<div class="stat"><div class="l">有效视频</div><div class="v" style="font-size:22px;font-weight:700;color:#C7000B">${a.count}</div></div>
<div class="stat"><div class="l">总播放量</div><div class="v">${fmt(a.totalPlay)}</div></div>
<div class="stat"><div class="l">总点赞</div><div class="v">${fmt(a.totalLike)}</div></div>
<div class="stat"><div class="l">总收藏</div><div class="v">${fmt(a.totalFav)}</div></div>
<div class="stat"><div class="l">平均播放</div><div class="v">${fmt(a.avgPlay)}</div></div>
<div class="stat"><div class="l">点赞率</div><div class="v">${a.likeRate}%</div></div>
</div>

<h2 class="sec">主题分布</h2>
<div class="card"><div style="margin-bottom:8px;font-size:13px;color:#666">各主题视频数 / 累计播放量：</div>${themeRows}</div>

<h2 class="sec">高频卖点词</h2>
<div class="card">${kwHtml}</div>

<h2 class="sec">发布节奏（近12个月）</h2>
<div class="card">${monthHtml}</div>

<h2 class="sec">头部作者</h2>
<div class="card">${authorHtml}</div>

<h2 class="sec">TOP 50 视频全览（可搜索 · 可跳转）</h2>
<div class="card">
<input class="search" placeholder="搜索标题关键词..." oninput="filterRows(this.value)">
<table id="vidTable"><thead><tr><th>播放</th><th>标题（点击跳转B站）</th><th>主题</th><th>作者</th><th>点赞</th><th>收藏</th><th>发布</th></tr></thead><tbody>${topRows}</tbody></table>
</div>


<div class="footer">B站传播洞察 · 自动生成 ｜ 数据采集与分析方法见正文 ｜ 隐私说明：本页面与链接不含任何个人信息</div>
</div>
<script>
function filterRows(q){q=q.toLowerCase();document.querySelectorAll('#vidTable tbody tr').forEach(r=>{r.style.display=r.cells[1].textContent.toLowerCase().includes(q)?'':'none'})}
</script>
</body></html>`;
}

// ---------- 主流程 ----------
const videos = JSON.parse(fs.readFileSync(cmd.data, 'utf-8'));
const a = analyze(videos, cmd.product);

const defaultOut = cmd.out || path.join(process.cwd(), `${cmd.product.replace(/\s+/g,'')}_bilibili_report.html`);
fs.writeFileSync(defaultOut, genHTML(a, cmd.product, cmd.brand || '', cmd.desc || ''));
console.log(`报告已生成: ${defaultOut}`);
console.log(`大小: ${(fs.statSync(defaultOut).size/1024).toFixed(1)} KB`);