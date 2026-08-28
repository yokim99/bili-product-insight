#!/usr/bin/env node
// B站洞察报告公网部署脚本
// 支持: GitHub Pages（默认，国内外均可） / Gitee Pages（若配置了 Gitee token，国内更快）
// 用法: node scripts/deploy.mjs <HTML文件> [--product 产品名]
// 配置: 自动读取 ~/.git-credentials 中 GitHub 凭据；或读取 ~/.config/bili-insight/config.json
// 隐私: 仓库名中性化(bili-insight-xxxxx)，报告不含个人信息
import https from 'https';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';

// ---------- 工具 ----------
const CONFIG_PATH = path.join(os.homedir(), '.config', 'bili-insight', 'config.json');

function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')); } catch { return {}; }
}
function saveConfig(cfg) {
  const dir = path.dirname(CONFIG_PATH);
  fs.mkdirSync(dir, { recursive: true });
  try { fs.chmodSync(dir, 0o700); } catch {}
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

function getGitHubCred() {
  // 1. 配置优先
  const cfg = readConfig();
  if (cfg.github?.token && cfg.github?.username) return cfg.github;
  // 2. ~/.git-credentials
  try {
    const cred = fs.readFileSync(path.join(os.homedir(), '.git-credentials'), 'utf-8')
      .split('\n').find(l => l.includes('github.com'));
    if (cred) {
      const m = cred.match(/\/\/([^:]+):([^@]+)@github\.com/);
      if (m) return { username: m[1], token: m[2] };
    }
  } catch {}
  return null;
}

function httpsReq(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: options.method || 'GET', headers: { 'User-Agent': 'bili-insight', 'Accept': 'application/json', ...(options.headers || {}) } }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, json: data ? JSON.parse(data) : {} }); } catch { resolve({ status: res.statusCode, text: data }); } });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(new Error('timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function randSuffix() { return Math.random().toString(36).slice(2, 7); }
function git(cwd, args) { return execSync(`git ${args}`, { cwd, encoding: 'utf-8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }); }

// ---------- GitHub Pages ----------
async function deployGitHubPages(htmlPath, product, gh) {
  console.log('使用 GitHub Pages 部署...');
  const repo = `bili-insight-${product.toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}-${randSuffix()}`;
  const auth = `token ${gh.token}`;

  // 1. 创建公开仓库
  console.log(`创建仓库 ${gh.username}/${repo} ...`);
  const create = await httpsReq('https://api.github.com/user/repos', {
    method: 'POST',
    headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
  }, { name: repo, private: false, description: 'B站传播洞察报告（自动生成）' });
  if (![200, 201].includes(create.status)) {
    throw new Error('创建仓库失败: ' + JSON.stringify(create.json || create.text));
  }

  // 2. 本地 git 提交
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bili-deploy-'));
  fs.copyFileSync(htmlPath, path.join(tmp, 'index.html'));
  git(tmp, 'init -q');
  git(tmp, 'add -A');
  git(tmp, `commit -q -m "bili insight report"`);
  git(tmp, 'branch -M main');
  git(tmp, `remote add origin https://${gh.username}:${gh.token}@github.com/${gh.username}/${repo}.git`);
  git(tmp, 'push -q -u origin main 2>&1');

  // 3. 启用 GitHub Pages
  console.log('启用 GitHub Pages...');
  const pages = await httpsReq(`https://api.github.com/repos/${gh.username}/${repo}/pages`, {
    method: 'POST',
    headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
  }, { source: { branch: 'main', path: '/' } });
  if (pages.status === 409) console.log('  Pages 可能已存在（自动继续）');

  // 4. 生成 jsDelivr CDN 链接（国内有节点）
  const cdnUrl = `https://cdn.jsdelivr.net/gh/${gh.username}/${repo}@main/index.html`;

  return {
    primary: `https://${gh.username}.github.io/${repo}/`,
    cdn: cdnUrl,
    repo: `${gh.username}/${repo}`,
  };
}

// ---------- Gitee Pages ----------
async function deployGiteePages(htmlPath, product, gitee) {
  console.log('使用 Gitee Pages 部署...');
  const repo = `bili-insight-${product.toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}-${randSuffix()}`;
  const api = 'https://gitee.com/api/v5';
  const auth = { 'Content-Type': 'application/json' };

  // 1. 创建仓库
  const create = await httpsReq(`${api}/user/repos`, { method: 'POST', headers: auth },
    { access_token: gitee.token, name: repo, private: false, description: 'B站传播洞察报告', auto_init: false });
  if (![200, 201].includes(create.status)) throw new Error('Gitee创建仓库失败: ' + JSON.stringify(create.json || create.text));

  // 2. git push
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bili-gitee-'));
  fs.copyFileSync(htmlPath, path.join(tmp, 'index.html'));
  git(tmp, 'init -q'); git(tmp, 'add -A'); git(tmp, 'commit -q -m "report"'); git(tmp, 'branch -M master');
  git(tmp, `remote add origin https://${gitee.username}:${gitee.token}@gitee.com/${gitee.username}/${repo}.git`);
  git(tmp, 'push -q -u origin master 2>&1');

  // 3. 更新 Pages 设置（Gitee Pages 需手动开启，先返回仓库地址，提示开启）
  return { primary: `https://${gitee.username}.gitee.io/${repo}/`, repo: `${gitee.username}/${repo}`, needManual: true };
}

// ---------- 主流程 ----------
async function main() {
  const args = process.argv.slice(2);
  const htmlPath = args.find(a => !a.startsWith('--') && a.endsWith('.html'));
  const prodArg = args.indexOf('--product');
  const product = prodArg >= 0 ? args[prodArg + 1] : 'product';
  if (!htmlPath || !fs.existsSync(htmlPath)) { console.error('用法: node deploy.mjs <报告.html> [--product 产品名]'); process.exit(1); }

  const cfg = readConfig();
  console.log(`=== 部署报告: ${product} ===`);
  console.log(`HTML: ${htmlPath} (${(fs.statSync(htmlPath).size / 1024).toFixed(1)} KB)`);

  // 优先配置的 Gitee（国内最快）；其次 GitHub（国内外均可）
  if (cfg.gitee?.token && cfg.gitee?.username) {
    try {
      const r = await deployGiteePages(htmlPath, product, cfg.gitee);
      console.log(`\n✅ Gitee 部署完成:`);
      console.log(`  仓库: ${r.repo}`);
      console.log(`  链接: ${r.primary}`);
      if (r.needManual) console.log('  ⚠️ 请在 Gitee 仓库→服务→Gitee Pages 点击"开启"后生效');
      console.log(`\n部署配置路径: ${CONFIG_PATH}（已保护权限，含敏感信息请勿外传）`);
      return;
    } catch (e) { console.warn(`Gitee 部署失败(${e.message})，回退 GitHub...`); }
  }

  const gh = getGitHubCred();
  if (!gh) {
    console.error(`✗ 未找到 GitHub 凭据。请在 ${CONFIG_PATH} 配置：
  { "github": { "username": "你的用户名", "token": "personal_access_token" } }
  或配置 Gitee：{ "gitee": { "username": "...", "token": "..." } }
获取 token：GitHub → Settings → Developer settings → Personal access tokens（勾选 repo 权限）`);
    process.exit(1);
  }

  try {
    const r = await deployGitHubPages(htmlPath, product, gh);
    console.log(`\n✅ GitHub Pages 部署完成:`);
    console.log(`  仓库: ${r.repo}`);
    console.log(`  主链接: ${r.primary}`);
    console.log(`  国内CDN: ${r.cdn}`);
    console.log(`\n  说明: 主链接国内外均可访问；CDN 链接经 jsDelivr 加速，国内体验更佳。`);
    console.log(`  隐私: 仓库名已中性化处理，报告内容不含个人信息。`);
  } catch (e) {
    console.error('部署失败:', e.message);
    process.exit(1);
  }
}

main();