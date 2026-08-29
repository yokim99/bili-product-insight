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
  ['教程入门', /教程|入门|新手|零基础|0基础|保姆|手把手|指南|怎么用|如何用|教|学会|开始|起步|初学|小白|第一/],
  ['安装部署', /安装|部署|配置|下载|setup|环境搭建|装|启动|接入/],
  ['实战应用', /实战|项目|开发|构建|搭建|写一个|做一个|全栈|后端|前端|系统|用.*做|跑通|实操|落地|上手/],
  ['测评对比', /对比|vs|VS|测评|评测|比较|替代|pk|PK|谁更|哪个好|横评|和.*比|与.*比|还是/],
  ['使用技巧', /技巧|秘籍|玩法|隐藏|彩蛋|小技巧|用法|操作|窍门|攻略|干货|进阶|高阶/],
  ['功能展示', /功能|特性|新功能|体验|演示|展示|试玩|介绍|是什么|啥/],
  ['效率提升', /效率|提升|省时|快速|加速|提速|节省|解放|提效|秒|分钟搞定/],
  ['用户反馈', /感受|踩坑|避坑|吐槽|好评|差评|真实|用后|体验报告|使用报告/],
  ['新闻资讯', /发布|上线|更新|宣布|推出|首发|火|热|爆|杀疯|炸|颠覆|白嫖|神器|火了/],
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

  // ---------- 深度分析指标 ----------
  const ts = Object.entries(a.themes).sort((x, y) => y[1].play - x[1].play);
  const top5Pct = (a.top50.slice(0, 5).reduce((s, v) => s + v.play, 0) / a.totalPlay * 100).toFixed(1);
  const top10Pct = (a.top50.slice(0, 10).reduce((s, v) => s + v.play, 0) / a.totalPlay * 100).toFixed(1);
  const topThemePct = a.count ? (ts[0]?.[1].count / a.count * 100).toFixed(0) : 0;
  const maxMonth = a.months.length ? a.months.reduce((m, x) => x[1] > m[1] ? x : m, a.months[0]) : null;
  const recent3C = a.months.slice(-3).reduce((s, m) => s + m[1], 0);
  const recent3Pct = a.count ? (recent3C / a.count * 100).toFixed(0) : 0;
  const authorConc = a.totalPlay ? (a.topAuthors.slice(0, 3).reduce((s, [, d]) => s + d.play, 0) / a.totalPlay * 100).toFixed(0) : 0;
  const t20 = a.top50.slice(0, 20);
  const qPct = (t20.filter(v => /[？?]/.test(v.title)).length / t20.length * 100).toFixed(0);
  const numPct = (t20.filter(v => /\d/.test(v.title)).length / t20.length * 100).toFixed(0);
  const emoPct = (t20.filter(v => /杀疯|白嫖|神器|颠覆|最强|最好|火|炸|裂|绝|牛|强|香|离谱|逆天|疯了|炸裂/.test(v.title)).length / t20.length * 100).toFixed(0);
  const top3Names = ts.slice(0, 3).map(([n]) => n);
  const weakThemes = ['测评对比', '实战应用', '安装部署', '新闻资讯'].filter(t => !top3Names.includes(t));
  const headEffect = top5Pct > 50 ? '强头部驱动' : top5Pct > 30 ? '头部+长尾均衡' : '长尾分散';
  const emoWords = a.topKeywords.filter(([k]) => ['免费','神器','颠覆','革命','最强','最好','首选','白嫖','国产'].includes(k)).map(([k]) => k);

  // ---------- TOP5 爆款拆解 ----------
  const GENE_RULES = [
    { key: '疑问钩子', re: /[？?]|为啥|为什么|怎么/, why: '从众心理+好奇缺口——"大家都看我也得看，看完还想知道答案"', tpl: '为啥${P}这么火？/ ${P}到底好不好用？' },
    { key: '反常识冲击', re: /居然|竟然|杀疯|白嫖|颠覆|离谱|逆天|疯了/, why: '打破固有印象——"XX居然会白嫖"挑战用户已有认知，情绪共鸣拉满互动率', tpl: '${P}居然会让你白嫖？简直杀疯了' },
    { key: '学习成本承诺', re: /一个视频|搞懂|X分钟|保姆|最简单|入门|一看就会/, why: '确定性承诺——明确告诉用户"看完这个就够了"，降低点击决策成本', tpl: '一个视频搞懂${P}！/ 这可能是最简单的一集' },
    { key: '拟人化玩梗', re: /养虾|养|龙虾|吉祥物|表情包|梗/, why: '产品拟人化/昵称梗——把工具变成"宠物"，制造社区身份认同（懂梗=圈内人）', tpl: '如果你真想养虾，这可能是最简单的一集' },
    { key: '数字悬念', re: /\d{3,}小时|\d{3,}天|神奇|不可思议|想不到|竟然发现/, why: '具体数字+未解悬念——大数字制造夸张感，悬念词逼用户点进去找答案', tpl: '我用${P}从10000小时监控中找到了神奇的一幕！' },
  ];
  const top5Cards = a.top50.slice(0, 5).map((v, i) => {
    const likeRate = v.play ? (v.like / v.play * 100).toFixed(1) : '0';
    const genes = GENE_RULES.filter(g => g.re.test(v.title));
    const geneHtml = genes.length ? genes.map(g =>
      `<div style="margin:6px 0"><span style="background:#C7000B;color:#fff;font-size:11px;padding:2px 8px;border-radius:3px;margin-right:6px">${g.key}</span><span style="font-size:12px;color:#444">${g.why}</span></div>`
    ).join('') : '<div style="font-size:12px;color:#666">直述式标题——靠UP主自身流量带动</div>';
    return `<div style="background:#fff;border:1px solid #f0f0f0;border-left:4px solid #C7000B;border-radius:8px;padding:14px 16px;margin-bottom:12px">
<div style="font-size:14px;font-weight:600;color:#1d1d1f;margin-bottom:4px">TOP${i+1} · ${v.title}</div>
<div style="font-size:12px;color:#888;margin-bottom:8px">${fmt(v.play)}播放 · ${fmt(v.like)}点赞 · 点赞率${likeRate}% · ${v.author || '未知'}</div>
${geneHtml}
</div>`;
  }).join('');
  const top5LikeRates = a.top50.slice(0, 5).map(v => v.play ? v.like / v.play * 100 : 0);
  const maxLikeIdx = top5LikeRates.indexOf(Math.max(...top5LikeRates));
  const geneSummary = GENE_RULES.map(g =>
    `<tr><td style="font-weight:600;color:#C7000B">${g.key}</td><td style="font-size:12px">${g.tpl.replace(/\$\{P\}/g, brand || productName)}</td></tr>`
  ).join('');
  const top5Html = `
<div style="background:#f9f9fb;border-radius:8px;padding:16px 18px;margin-bottom:16px">
<h3 style="font-size:15px;color:#C7000B;margin-bottom:10px">五、TOP5爆款拆解（热门核心原因 + 可复制基因）</h3>
<p style="font-size:12px;color:#666;margin-bottom:10px">逐条拆解播放量TOP5视频的标题基因——为什么火、哪些基因可以直接复制到${brand || productName}的内容里：</p>
${top5Cards}
<div style="background:linear-gradient(135deg,#fff5f5,#fff);border-radius:8px;padding:14px 16px;border:1px solid #ffe0e0">
<p style="font-size:13px;color:#C7000B;font-weight:600;margin-bottom:8px">5大可复制基因模板（${brand || productName}直接套用）：</p>
<table style="width:100%;border-collapse:collapse;font-size:13px">${geneSummary}</table>
<p style="font-size:12px;color:#666;margin-top:8px">点赞率最高的视频是TOP${maxLikeIdx+1}（${top5LikeRates[maxLikeIdx].toFixed(1)}%）——情绪型标题不仅拉播放，互动率也是普通标题的2-3倍。</p>
</div>
</div>`;

  // 内容矩阵
  const matrixRows = ts.slice(0, 4).map(([t, d]) => {
    const pct = (d.count / a.count * 100).toFixed(0);
    const sug = {
      '教程入门': `每期聚焦1个功能点，"X分钟搞懂${brand}XX"系列化产出`,
      '安装部署': `覆盖Win/Mac/Linux三平台，解决新手第一道门槛`,
      '实战应用': `真实项目全流程录屏，从需求到交付完整展示`,
      '测评对比': `与竞品功能逐一PK+场景适配+明确推荐`,
      '使用技巧': `隐藏玩法/快捷操作/进阶技巧，"你不知道的${brand}"包装`,
      '功能展示': `新功能首发演示+使用场景代入+效果对比`,
      '效率提升': `量化效率对比（前X分钟→后Y分钟），用数据说话`,
      '用户反馈': `真实使用体验+踩坑避坑指南，建立信任感`,
      '新闻资讯': `版本更新第一时间解读，抢首发流量`,
      '其他': `挖掘长尾场景，${brand}在非主流领域的应用`,
    }[t] || `分享${brand}在${t}场景的实战经验`;
    return `<tr><td style="font-weight:600;color:#C7000B">${t}</td><td style="text-align:center">${d.count}条 (${pct}%)</td><td>${fmt(d.play)}</td><td style="font-size:12px;color:#444">${sug}</td></tr>`;
  }).join('');

  // 标题公式
  const formulas = [];
  if (qPct > 25) formulas.push(`<tr><td style="font-weight:600;color:#C7000B">疑问悬念式 (${qPct}%)</td><td style="font-size:12px">"为啥${brand}这么火？""${brand}到底好不好用？"</td><td style="font-size:12px;color:#666">引发好奇，适合认知期拉新</td></tr>`);
  if (numPct > 25) formulas.push(`<tr><td style="font-weight:600;color:#C7000B">数字量化式 (${numPct}%)</td><td style="font-size:12px">"一个视频搞懂${brand}""${brand}让效率提升X倍"</td><td style="font-size:12px;color:#666">制造确定感，降低决策成本</td></tr>`);
  if (emoPct > 25) formulas.push(`<tr><td style="font-weight:600;color:#C7000B">情感冲击式 (${emoPct}%)</td><td style="font-size:12px">"${brand}杀疯了""白嫖${brand}简直神器"</td><td style="font-size:12px;color:#666">激发情绪共鸣，适合破圈传播</td></tr>`);
  if (!formulas.length) formulas.push(`<tr><td style="font-weight:600;color:#C7000B">直述式</td><td style="font-size:12px">"${brand}使用体验""${brand}功能介绍"</td><td style="font-size:12px;color:#666">平实直接，适合功能展示</td></tr>`);

  const brandHtml = brand ? `
<section style="background:#fff;border-radius:10px;padding:28px;margin:0 0 24px;box-shadow:0 3px 14px rgba(199,0,11,.12);border-left:5px solid #C7000B">
<div style="display:inline-block;background:#C7000B;color:#fff;font-size:11px;padding:2px 10px;border-radius:10px;margin-bottom:10px">核心结论 · 置顶</div>
<h2 style="font-size:20px;color:#C7000B;margin-bottom:8px">对「${brand}」的传播启发</h2>
<p style="font-size:13px;color:#666;margin-bottom:18px">基于「${productName}」B站 ${a.count} 条视频 / ${fmt(a.totalPlay)} 播放量的传播数据，为 ${brand}${desc ? '（' + desc + '）' : ''} 提炼差异化洞察与可执行打法。</p>

<!-- 板块1：核心发现 -->
<div style="background:linear-gradient(135deg,#fff5f5,#fff);border-radius:8px;padding:16px 18px;margin-bottom:16px;border:1px solid #ffe0e0">
<h3 style="font-size:15px;color:#C7000B;margin-bottom:10px">一、核心发现</h3>
<div style="font-size:13px;color:#333;line-height:2">
<strong style="color:#C7000B">发现1 · 传播量级：</strong>${productName}在B站累计 ${fmt(a.totalPlay)} 播放 / ${a.count} 条视频 / 均播 ${fmt(a.avgPlay)}，属于${a.totalPlay > 50000000 ? '高热度' : a.totalPlay > 10000000 ? '中热度' : '早期'}传播阶段。${brand}对标此量级，首期目标可设为 ${fmt(Math.round(a.totalPlay * 0.3))} 播放（30%对标）。<br>
<strong style="color:#C7000B">发现2 · 头部效应：</strong>TOP5视频贡献 ${top5Pct}% 播放量，TOP10贡献 ${top10Pct}%，呈<strong>${headEffect}</strong>格局。${top5Pct > 40 ? '意味着1-2条爆款视频决定整体传播量，需集中资源打造头部内容。' : '意味着内容分布较均匀，可批量产出中等播放内容。'}<br>
<strong style="color:#C7000B">发现3 · 主题集中度：</strong>「${ts[0]?.[0]}」占 ${topThemePct}% 为绝对主力主题，${ts[1] ? '其次「' + ts[1][0] + '」' : ''}。用户核心关注点是<strong>${ts[0]?.[0]}</strong>，${brand}的内容策略应以此为锚点。<br>
<strong style="color:#C7000B">发现4 · 发布节奏：</strong>${maxMonth ? maxMonth[0] + ' 为爆发月（' + maxMonth[1] + '条）' : ''}，近3个月占总量 ${recent3Pct}%。${recent3Pct > 50 ? '传播力在加速增长，产品处于上升期。' : recent3Pct > 25 ? '传播力稳定，有持续内容产出。' : '传播力趋于平缓，需新内容刺激。'}<br>
<strong style="color:#C7000B">发现5 · UP主生态：</strong>TOP3作者贡献 ${authorConc}% 播放量，${authorConc > 50 ? '高度依赖少数头部UP主，需重点维护KOL关系。' : authorConc > 25 ? '头部UP主与中腰部共创，生态较健康。' : '内容来源分散，以素人/中腰部为主，可低成本铺量。'}
</div>
</div>

<!-- 板块2：内容结构设计 -->
<div style="background:#f9f9fb;border-radius:8px;padding:16px 18px;margin-bottom:16px">
<h3 style="font-size:15px;color:#C7000B;margin-bottom:10px">二、内容结构设计（可执行内容矩阵）</h3>
<p style="font-size:12px;color:#666;margin-bottom:8px">基于 ${productName} 主题分布，为 ${brand} 设计内容矩阵——每类内容给出具体选题方向与产出形式：</p>
<table style="width:100%;border-collapse:collapse;font-size:13px">
<thead><tr style="background:#f0f0f0"><th style="padding:6px 8px;text-align:left">主题</th><th style="padding:6px 8px;text-align:center">${productName}现状</th><th style="padding:6px 8px;text-align:left">播放量</th><th style="padding:6px 8px;text-align:left">${brand} 选题建议</th></tr></thead>
<tbody>${matrixRows}</tbody></table>
${weakThemes.length ? `<p style="font-size:12px;color:#C7000B;margin-top:10px"><strong>差异化蓝海：</strong>${productName}在「${weakThemes.join('、')}」主题上内容薄弱，${brand}可优先从此切入，避开红海竞争，建立先发优势。</p>` : ''}
</div>

<!-- 板块3：卖点文案设计 -->
<div style="background:#f9f9fb;border-radius:8px;padding:16px 18px;margin-bottom:16px">
<h3 style="font-size:15px;color:#C7000B;margin-bottom:10px">三、卖点文案设计（标题公式 + 实操模板）</h3>
<p style="font-size:12px;color:#666;margin-bottom:8px">基于 TOP20 视频标题逆向工程，提炼高传播标题公式：</p>
<table style="width:100%;border-collapse:collapse;font-size:13px">
<thead><tr style="background:#f0f0f0"><th style="padding:6px 8px;text-align:left">标题公式</th><th style="padding:6px 8px;text-align:left">示例模板</th><th style="padding:6px 8px;text-align:left">适用场景</th></tr></thead>
<tbody>${formulas.join('')}</tbody></table>
<p style="font-size:12px;color:#666;margin-top:10px"><strong style="color:#C7000B">高频卖点词：</strong>${a.topKeywords.slice(0, 8).map(([k, c]) => `${k}(${c})`).join('、')}。${brand}标题可组合使用：产品名 + 痛点场景 + 卖点词 + 量化收益。</p>
${emoWords.length ? `<p style="font-size:12px;color:#666"><strong style="color:#C7000B">已验证情感词：</strong>${emoWords.join('、')} 在 ${productName} 标题中被验证有效，${brand} 可直接借鉴测试。</p>` : `<p style="font-size:12px;color:#666"><strong style="color:#C7000B">情感词机会：</strong>${productName} 标题较少使用情感冲击词，${brand} 可用"神器/颠覆/白嫖"等词先行测试，形成文案差异化。</p>`}
</div>

<!-- 板块4：营销启示 -->
<div style="background:linear-gradient(135deg,#fff5f5,#fff);border-radius:8px;padding:16px 18px;border:1px solid #ffe0e0">
<h3 style="font-size:15px;color:#C7000B;margin-bottom:10px">四、营销启示（可落地执行计划）</h3>
<div style="font-size:13px;color:#333;line-height:2">
<strong style="color:#C7000B">Step 1 · 种草期（第1-2周）：</strong>产出 ${brand} 入门教程 3-5 条，标题用"${brand}X分钟搞懂XX功能"公式，目标UP主：中腰部科技区（粉丝5-20万），成本可控、铺基础认知。<br>
<strong style="color:#C7000B">Step 2 · 破圈期（第3-4周）：</strong>合作 1-2 位头部UP主（参考 ${productName} 的 ${a.topAuthors.slice(0, 2).map(([n]) => '「' + n + '」').join('、')} 类型），用"${brand}杀疯了/白嫖神器"情感式标题，目标单条 50万+ 播放。<br>
<strong style="color:#C7000B">Step 3 · 深度期（第5-8周）：</strong>产出 ${brand} 实战项目全流程视频 + 与竞品横评，切入${weakThemes.length ? '「' + weakThemes[0] + '」' : '差异化'}蓝海主题，建立内容深度护城河。<br>
<strong style="color:#C7000B">Step 4 · 持续期（长期）：</strong>跟踪 ${brand} 版本更新第一时间解读（抢首发流量），月均产出 4-6 条，维持${maxMonth ? '类似 ' + maxMonth[0] + ' 的' : ''}爆发节奏。
</div>
</div>

${top5Html}
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

<div class="note"><b>数据说明：</b>通过B站搜索API采集「${productName}」相关视频，页面数据按播放量降序展示。主题归类基于标题关键词规则匹配（9类：教程入门→安装部署→实战应用→测评对比→使用技巧→功能展示→效率提升→用户反馈→新闻资讯→其他），视频概要为基于标题的自动推断。<strong>报告不含任何个人信息。</strong></div>

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