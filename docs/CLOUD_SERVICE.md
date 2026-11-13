# LunaMargin 云服务

云服务使用 Cloudflare Worker、D1 数据库和 R2 对象存储。原有 Node.js＋SQLite 本地服务继续保留，两者复用完全相同的科学算法及已校验 NASA 输入。

## 地址与能力

完整云端入口由本项目既有 Sites 地址提供；实际公开部署结果及公开地址验收另记录于本轮交付文档。这里的源码和本地合同测试本身不表示已经成功上线。

- `/service-config.json` 返回 `service:true`、`serviceType:cloud-d1`，以及明确的能力字段。
- 云版已实现的能力：既有三组 NASA 数据的覆盖查询、真实算法计算、服务端记录、保存任务、重命名、复制、删除、原结果恢复、只读分享。
- `capabilities.newDates:false`：云版暂未部署持续串行的新日期获取队列。界面应提供已有日期与设备文件保存，不能展示已接通的新日期抓取。原有本地 Node 管线仍保留真实 NASA 获取、缓存和退避功能。
- Github Pages 继续提供可独立运行的浏览器模式。云端在同一个 origin 提供界面和业务接口，避免跨站 Cookie 依赖；前端静态资源从固定的 GitHub Pages 源站读取。用户不能指定任意代理地址。

## 数据持久化与权限

D1 的 `lm_*` 表保存研究点、覆盖及版本索引、匿名访客、任务条件、分析状态、任务名称与分享权限。完整输入和分析证据保存为 R2 私有对象，D1 保留对象索引及 SHA-256。读取任务时先核对访客或分享令牌，再读取并验证对象；不会公开整个存储桶。

编辑身份由 HttpOnly、Secure、SameSite=Lax Cookie 保存。数据库只保存令牌摘要。只读分享使用独立随机能力令牌，不能调用所有者编辑接口；删除任务会撤销它的分享。复制任务引用同一不可变原始计算，新计算创建新记录。

服务端拒绝未知地点、任意坐标、未覆盖日期及不匹配高度。当前高度只有 2 m。JSON 请求最多 64 KB，每位访客每分钟最多 30 次修改，每位访客最多 200 个已保存任务、1,000 次计算。使用云平台数据库与对象存储绑定，不向浏览器发送凭据。

## 构建与发布

```sh
node scripts/build.mjs
node scripts/build-worker.mjs
node tests/cloud-service.mjs
```

第二条命令将原始算法字节、不可变发布清单和三份真实数据编入 `dist/server/index.js`。构建阶段与运行时均核对摘要；没有动态执行客户端提交代码。Worker 不修改算法，不使用假结果。

`.openai/hosting.json` 移除 `static`，声明 `d1:"DB"` 与 `r2:"BUCKET"`，保留原 `project_id`。由 Sites 发布流程创建并绑定存储。正式发布前必须核对平台实际返回的绑定与迁移结果。

`db/schema.ts` 为结构定义，`drizzle/` 是 Drizzle 0.31.10 实际生成的 SQL、快照和日志。迁移只建表和索引，不包含科学数据；平台在 Worker 上传前应用。运行中的请求不创建或修改表结构，只初始化经过校验的元数据和对象。以后变更应追加迁移，不重写已应用 SQL。

生成迁移需要 Drizzle 开发工具，不是服务运行依赖。当前生成命令使用忽略目录 `tmp/cloud-tools` 中固定的 `drizzle-kit@0.31.10`、`drizzle-orm@0.45.2`，配置为根目录 `drizzle.config.ts`。可以在开发环境安装相同版本后执行 `drizzle-kit generate --config drizzle.config.ts`。

## 校验范围

[云接口合同检查](cloud-contract-validation.json) 使用编译后的 Worker、真实磁盘 SQLite 和文件对象，经 D1/R2 接口适配测试科学基线、持久化、权限、分享撤销和证据完整性。它不冒充真实云端验证；公开地址验证必须在发布后另做。

正式部署后运行 `node tests/cloud-live.mjs https://实际公开域名`，直接验证公开 HTTP 服务的真实计算、双条件差异、保存恢复、访客权限、只读分享与撤销。测试只清理自己创建的临时任务；验收记录 `docs/cloud-live-validation.json` 不包含会话或分享令牌。此检查不能替代浏览器操作录像，也不声称重启过托管平台。

既有发布中的历史算法摘要若与本次编译算法不同，云服务明确拒绝执行该历史算法。保存的原记录仍可读取；当前版本重算须创建新记录。算法本身未发生变化时，原有版本清单和数据快照继续可复查。

接口依据 Cloudflare 官方 [D1 prepared statements](https://developers.cloudflare.com/d1/worker-api/prepared-statements/)、[D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/) 与 [R2 Worker API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)。大证据放入 R2，避免依赖 [D1 单行大小上限](https://developers.cloudflare.com/d1/platform/limits/)。
