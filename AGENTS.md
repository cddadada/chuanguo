## 项目定位

本目录是“核容锅筒工序扫码打卡”本地静态原型，用于说明业务闭环、交互流程、PRD/SOP 口径和开发验收点。

它不是生产系统代码，不连接真实后端，不写入真实业务数据。所有状态只允许使用浏览器 `localStorage` 和本地 mock 数据。

## 目录约定

- 页面入口保持为 `index.html`，旧 SOP 入口保留为 `sop.html`。
- 业务页面保持为 `upload.html`、`printer.html`、`checkin.html`、`dashboard.html`。
- 共享业务状态、mock 数据、跨页面逻辑优先维护在 `assets/state.js`。
- 公共样式维护在 `assets/styles.css`。
- 项目规则、验证清单、Agent 运维说明放在 `docs/`。
- 本地验证脚本放在 `scripts/`，命名为 `*-regression.mjs` 或 `*-check.mjs`。
- 不新增真实接口地址、账号、密码、token 或带鉴权参数的链接。

## 业务口径

- 对象粒度是锅筒，唯一识别粒度是“令号 + 锅筒图号”。
- 同一令号可以包含多个锅筒，打印、看板、扫码都必须能区分到锅筒图号。
- 只做“完成打卡”，不做“开始打卡”。
- 数量工序录入“当前累计已完成数量”，不是追加数量。
- 数量工序未达到目标数量时仍显示进行中。
- 工序清单以 `assets/state.js -> PROCESS_NAMES` 为准，保持 22 道标准工序。
- 看板中“公司计划完工”展示锅筒主对象计划，不等同于单工序计划调整。
- 打卡记录和计划调整入口只面向具备权限的查看/调整人员。

## 变更纪律

- 改跨页面行为时，先改 `assets/state.js`，再改页面消费逻辑。
- 改 PRD/SOP/UI 文案时，同步检查 README 和 `docs/` 里的口径是否冲突。
- 不用注释报错、绕过验证、隐藏失败来“跑通”。
- 不删除文件、目录或 git 历史；如确需删除，先问 CD。
- 不执行 `git push`、`git rebase`、`git reset --hard`。
- 不改 `.env`、密钥、token、CI/CD、数据库 schema、生产发布配置。

## 验证命令

常规改动后至少运行：

```bash
npm run eval
```

如果只改文档，可运行：

```bash
npm run check:docs
```

如果改了页面脚本、共享状态或关键业务口径，运行：

```bash
npm run check
```

验证失败时先定位根因，不要通过放宽断言或删掉检查来通过。

