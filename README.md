# bili-product-insight — B站产品传播洞察

自动化采集任意产品/竞品在 B 站的视频数据，分析传播策略，提炼对自身产品的营销启发，
生成可交互 HTML 报告并一键部署为国内外可访问的公网链接（隐藏个人信息）。

## 快速开始

- 触发方式：直接说「分析 XX 在 B 站的传播」即可自动执行本 skill。
- 交互步骤（全程最少 2 个问题）：
  1. 想分析哪个产品？
  2. （可选）补充搜索关键词 / 你的自家产品名
  3. 自动采集 → 分析 → 生成报告 → 部署公网，最终返回一个可直接分享的链接

## 目录结构

```
bili-product-insight/
├── SKILL.md               # skill 主文件（触发描述 + 自动化工作流）
├── README.md              # 本文件
└── scripts/
    ├── collect.mjs        # B站单产品采集（多关键词去重、相关性过滤）
    ├── gen_report.mjs     # 数据分析 + 华为风格 HTML 报告生成
    └── deploy.mjs         # 公网部署（GitHub Pages / Gitee，中性化仓库名）
```

## 脚本独立用法

```bash
# 1. 采集
node scripts/collect.mjs "Trae" "trae" "trae ide" --pages 15 --out data/

# 2. 分析 + 生成报告
node scripts/gen_report.mjs data/trae_videos.json "Trae" \
  --brand "我的产品" --desc "一句话描述" --out trae_报告.html

# 3. 部署
node scripts/deploy.mjs trae_报告.html --product "Trae"
```

## 首次部署配置（一次性）

写入 `~/.config/bili-insight/config.json`（或由引导流程帮你创建）：

```json
{
  "github": { "username": "你的GitHub用户名", "token": "ghp_xxx" }
}
```

token 获取：GitHub → Settings → Developer settings → Personal access tokens(NEW) → 勾选 `repo`。配置文件权限为 600，仅本机可见。

可选：配置 Gitee token 后部署走 Gitee Pages，国内访问最快：

```json
{
  "gitee": { "username": "你的Gitee用户名", "token": "gitee_xxx" }
}
```

> 注意：token 是敏感信息，请勿提交到 git 或发送给第三方。可随时在平台侧撤销。

## 隐私说明

- 报告中不含任何个人信息
- 部署仓库名自动中性化：`bili-insight-<产品>-<随机5位>`
- 公网托管必然暴露 GitHub/Gitee 用户名；如需完全匿名，可注册一个不含个人信息的账户专用部署

## 输出示例

- 主链接：`https://<username>.github.io/bili-insight-trae-abc12/`
- 国内CDN：`https://cdn.jsdelivr.net/gh/<username>/bili-insight-trae-abc12@main/index.html`