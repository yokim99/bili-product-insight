#!/usr/bin/env node
// B站单产品视频数据采集脚本（多排序维度，覆盖全时间范围）
// 用法: node scripts/collect.mjs <产品名> <搜索关键词...> [--pages N] [--orders click,pubdate,totalrank] [--out 输出目录]
// 示例: node scripts/collect.mjs "Trae" "trae" "trae ide" --pages 6 --out /tmp/bili
// 说明:
//   - 多关键词 × 多排序维度（播放量/最新/综合）自动合并去重，避免"只采到最近数据"
//   - order=click 拿到全时间范围内的高播放头部内容，order=pubdate 拿到最新发布
//   - 输出 JSON 文件到指定目录

import https from 'https';
import fs from 'fs';
import path from 'path';

// ---------- 参数解析 ----------
const args = process.argv.slice(2);
const cmdArgs = { keywords: [], pages: 6, out: null, orders: null };
let phase = 'cmd'; // cmd | pages | out | orders
for (const a of args) {
  if (a === '--pages') { phase = 'pages'; continue; }
  if (a === '--out') { phase = 'out'; continue; }
  if (a === '--orders') { phase = 'orders'; continue; }
  if (a === '--help' || a === '-h') { printHelp(); process.exit(0); }
  if (phase === 'pages') { cmdArgs.pages = parseInt(a, 10) || 6; phase = 'cmd'; continue; }
  if (phase === 'out') { cmdArgs.out = a; phase = 'cmd'; continue; }
  if (phase === 'orders') { cmdArgs.orders = a.split(',').map(s => s.trim()).filter(Boolean); phase = 'cmd'; continue; }
  cmdArgs.keywords.push(a);
}

// 支持的所有排序维度（点击播放量 / 最新发布 / 综合热度 / 收藏数）
const ALL_ORDERS = ['click', 'pubdate', 'totalrank', 'stow'];
const ORDERS = cmdArgs.orders && cmdArgs.orders.length ? cmdArgs.orders : ALL_ORDERS.slice(0, 3);
const MAX_PAGES = Math.min(cmdArgs.pages, 10);

function printHelp() {
  console.log('B站视频采集脚本（多排序维度）');
  console.log('用法: node collect.mjs <产品名> <搜索关键词...> [--pages N] [--orders 排序] [--out 目录]');
  console.log('示例: node collect.mjs "Trae" "trae" --pages 6 --orders click,pubdate,totalrank --out /tmp/bili');
  console.log('  --pages N    每个关键词×每种排序下的采集页数（默认6，约900条上限）');
  console.log('  --orders     排序维度，逗号分隔: click(播放量)/pubdate(最新)/totalrank(综合)/stow(收藏)，默认前三种');
  console.log('  --out 目录   输出JSON目录（默认脚本目录下 data/）');
}

if (cmdArgs.keywords.length < 1) {
  console.error('错误: 请提供产品名！\n用法: node collect.mjs <产品名> <搜索关键词...> [--pages N]');
  process.exit(1);
}

const productName = cmdArgs.keywords[0];
const keywords = cmdArgs.keywords;

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const DATA_DIR = cmdArgs.out || path.join(SCRIPT_DIR, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function fetch(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': UA, 'Referer': 'https://www.bilibili.com/', ...headers } }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data, headers: res.headers }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function getBuvid3() {
  console.log('获取 buvid3...');
  const res = await fetch('https://api.bilibili.com/x/frontend/finger/spi');
  const json = JSON.parse(res.data);
  const buvid3 = json.data?.b_3;
  if (!buvid3) throw new Error('无法获取 buvid3');
  return buvid3;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function searchVideos(keyword, page, buvid3, order) {
  const url = `https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodeURIComponent(keyword)}&page=${page}&page_size=50&order=${order}`;
  const res = await fetch(url, { Cookie: `buvid3=${buvid3}` });
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  const json = JSON.parse(res.data);
  if (json.code !== 0) throw new Error(`API error: ${json.message}`);
  return json.data;
}

function parseVideo(item) {
  return {
    bvid: item.bvid,
    title: item.title?.replace(/<[^>]+>/g, '') || '',
    play: item.play || 0,
    like: item.like || 0,
    danmaku: item.video_review || 0,
    favorite: item.favorites || 0,
    reply: item.review || 0,
    pubdate: item.pubdate,
    pubdate_str: item.pubdate ? new Date(item.pubdate * 1000).toISOString().split('T')[0] : '',
    duration: item.duration || 0,
    author: item.author || '',
    mid: item.mid || 0,
    typename: item.typename || '',
    tag: item.tag || '',
    desc: (item.description || '').replace(/<[^>]+>/g, '').substring(0, 200),
    url: `https://www.bilibili.com/video/${item.bvid}`,
  };
}

function filterRelevant(video) {
  // 关键词相关性过滤：仅检查标题是否命中任一搜索关键词（大小写不敏感）
  // 不检查 tag：B站搜索接口会按 tag 匹配返回大量内容无关的视频（如 tag 被打了产品名但视频本身无关）
  const title = (video.title || '').toLowerCase();
  return keywords.some(k => title.includes(k.toLowerCase()));
}

async function collect(keyword, order, buvid3) {
  console.log(`\n=== 采集 "${keyword}" (排序: ${order}) ===`);
  const videos = [];
  const seen = new Set();
  for (let page = 1; page <= MAX_PAGES; page++) {
    try {
      const data = await searchVideos(keyword, page, buvid3, order);
      if (!data?.result?.length) { console.log(`  第${page}页无数据，停止`); break; }
      let added = 0;
      for (const item of data.result) {
        const v = parseVideo(item);
        if (!seen.has(v.bvid) && filterRelevant(v)) { seen.add(v.bvid); videos.push(v); added++; }
      }
      console.log(`  第${page}页: ${data.result.length}条 → 有效${added}条，累计${videos.length}条`);
      if (data.result.length < 50) break;
      await sleep(500);
    } catch (e) {
      console.error(`  第${page}页出错: ${e.message}`);
      await sleep(2000);
    }
  }
  return videos;
}

async function main() {
  console.log(`B站视频采集：${productName}（关键词: ${keywords.join(' / ')}，排序: ${ORDERS.join('+')}）`);
  console.log('时间:', new Date().toLocaleString('zh-CN'));
  const buvid3 = await getBuvid3();

  let all = [];
  const seen = new Set();
  for (const kw of keywords) {
    for (const order of ORDERS) {
      const vids = await collect(kw, order, buvid3);
      const added = vids.filter(v => !seen.has(v.bvid));
      added.forEach(v => seen.add(v.bvid));
      all = all.concat(added);
      await sleep(800);
    }
  }

  // 按播放量降序排序
  all.sort((a, b) => b.play - a.play);
  const totalPlay = all.reduce((s, v) => s + v.play, 0);
  const totalLike = all.reduce((s, v) => s + v.like, 0);

  // 时间跨度统计
  const dates = all.map(v => v.pubdate_str).filter(Boolean).sort();
  const spanStr = dates.length ? `(${dates[0]} ~ ${dates[dates.length - 1]})` : '';

  const safeName = productName.toLowerCase().replace(/\s+/g, '_').replace(/[^\w\u4e00-\u9fa5]/g, '');
  const filePath = path.join(DATA_DIR, `${safeName}_videos.json`);
  fs.writeFileSync(filePath, JSON.stringify(all, null, 2));

  console.log(`\n========== 采集完成 ==========`);
  console.log(`产品: ${productName}`);
  console.log(`有效视频: ${all.length} 条`);
  console.log(`时间跨度: ${spanStr}`);
  console.log(`总播放: ${totalPlay.toLocaleString()}`);
  console.log(`总点赞: ${totalLike.toLocaleString()}`);
  console.log(`输出: ${filePath}`);
}

main().catch(e => { console.error('采集失败:', e); process.exit(1); });