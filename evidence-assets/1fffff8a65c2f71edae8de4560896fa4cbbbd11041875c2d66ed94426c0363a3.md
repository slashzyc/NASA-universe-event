# LunaMargin 云服务

云服务使用 Cloudflare Worker、D1 数据库和 R2 对象存储。原有 Node.js＋SQLite 本地服务继续保留，两者复用完全相同的科学算法及已校验 NASA 输入。

## 地址与能力

完整云端入口：[LunaMargin 在线工作台](https://lunamargin-slashzyc.laceysquirrel4.chatgpt.site/?lang=zh)。上一发布的公开接口、浏览器流程和录像见 [全站交互验收](INTERACTION_ACCEPTANCE.md)。本轮发布隔离变更先由本地真实存储合同与独立 A/B 产物验收；发布后的公开记录需另行确认，不能沿用旧版本通过数。

- `/service-config.json` 返回 `service:true`、`serviceType:cloud-d1`，以及明确的能力字段。
- 云版已实现的能力：既有三组 NASA 数据的覆盖查询、真实算法计算、服务端记录、保存任务、重命名、复制、删除、原结果恢复、只读分享。
- `capabilities.newDates:false`：云版暂未部署持续串行的新日期获取队列。界面应提供已有日期与设备文件保存，不能展示已接通的新日期抓取。原有本地 Node 管线仍保留真实 NASA 获取、缓存和退避功能。
- GitHub Pages 继续提供独立浏览器模式。云端在同一个 origin 提供界面和业务接口。首页、工作台、全部应用源码、月球必需影像、科学算法和三组输入与 Worker 同包；不再代理 GitHub Pages 的可变 HTML、源码或数据路径。
- 入口以不缓存的跳转进入 `/releases/<buildId>/index.html` 或 `navigator.html`，保留查询条件。相对资源固定在该发布空间；刷新和旧链接不会混入另一个发布的脚本。运行期间界面与服务发生更新失配时，正式计算明确要求重开当前版本；已保存的原证据仍可读。
- 大录像及审计文件使用清单中的 `evidence-assets/<sha256>.<ext>`。首次仅从固定 Pages 源站的这个不可变路径获取，严格校验字节数和 SHA-256，之后缓存到 R2。重定向、替换内容、未发布文件都会返回可见错误；不回退到同名可变文件。它们的展示不改变科学计算数据。

## 数据持久化与权限

D1 的 `lm_*` 表保存研究点、覆盖及版本索引、匿名访客、任务条件、分析状态、任务名称与分享权限。研究点与数据索引键包含发布 ID；A/B 同时访问和回滚不互相覆盖索引。完整输入和分析证据保存为 R2 私有对象，D1 保留对象索引及 SHA-256。读取任务时先核对访客或分享令牌，再读取并验证对象；不会公开整个存储桶。

编辑身份由 HttpOnly、Secure、SameSite=Lax Cookie 保存。数据库只保存令牌摘要。只读分享使用独立随机能力令牌，不能调用所有者编辑接口；删除任务会撤销它的分享。复制任务引用同一不可变原始计算，新计算创建新记录。

服务端拒绝未知地点、任意坐标、未覆盖日期及不匹配高度。当前高度只有 2 m。JSON 请求最多 64 KB，每位访客每分钟最多 30 次修改，每位访客最多 200 个已保存任务、1,000 次计算。使用云平台数据库与对象存储绑定，不向浏览器发送凭据。

## 构建与发布

```sh
node scripts/build.mjs
node scripts/build-worker.mjs
node tests/cloud-service.mjs
node tests/cloud-release-isolation.mjs
```

第二条命令将发布清单所引用的确切界面、后端规则、原始算法和三份真实数据编入 `dist/server/index.js`，而不是读取另一次发布的可变源码。清单同时记录应用、服务、数据和资源指纹。构建阶段与运行时均核对摘要；没有动态执行客户端提交代码。Worker 不修改算法，不使用假结果。构建器限制 gzip 产物不超过保守的 3 MiB 预算，超限会失败而非生成不完整包。

正式发布顺序：生成最终产物和所有内容寻址快照，先确认对应 SHA 路径在 Pages 可读，再发布同一产物的 Worker。核心任务操作不依赖这个媒体源站；大型证据在源站未就绪时显示明确失败。保存曾部署的构建产物即可回滚 Worker；D1/R2 中旧记录和已验证快照不随回滚删除。任何情况下都不能用“当前同名文件”替换缺失的历史快照。

## 接口版本约束

`service-config.json`、`/api/health` 和 `/api/coverage` 返回 `release:{apiVersion:2,buildId,algorithmSha256,datasets}`。`POST /api/analyses` 必须明确提交当前界面 `clientRelease:{apiVersion:2,buildId}`，以及要计算的 `buildId`、`algorithmSha256`、`datasetSha256`。缺失、过期或交叉指纹返回 409，且不创建计算记录。覆盖、地点、高度或任务到达约束不符合时返回 422。

界面发布版本与计算版本分别保存在证据的 `interfaceBuildId` 和 `calculationBuildId`。当前界面可明确请求仍可执行的历史计算版本；使用当前版本重新计算必须传当前指纹并创建新分析，不覆盖原证据。`missionConstraints` 保留原始允许开始时间、最迟到达时间、等待预算及声明的排序偏好，与几何条件一起规范化并保存。偏好不是“已经执行搜索”的证明。

本地 Node 新日期任务完成后，`coverage.campaigns` 给出对应生成数据包的 `buildId`、`algorithmSha256` 和 `sha256`。界面采用该包时使用这些精确计算指纹，`clientRelease` 仍为实际界面版本。云端 `newDates:false`，不能调用尚未部署的获取队列。

`.openai/hosting.json` 移除 `static`，声明 `d1:"DB"` 与 `r2:"BUCKET"`，保留原 `project_id`。由 Sites 发布流程创建并绑定存储。正式发布前必须核对平台实际返回的绑定与迁移结果。

`db/schema.ts` 为结构定义，`drizzle/` 是 Drizzle 0.31.10 实际生成的 SQL、快照和日志。迁移只建表和索引，不包含科学数据；平台在 Worker 上传前应用。运行中的请求不创建或修改表结构，只初始化经过校验的元数据和对象。以后变更应追加迁移，不重写已应用 SQL。

生成迁移需要 Drizzle 开发工具，不是服务运行依赖。当前生成命令使用忽略目录 `tmp/cloud-tools` 中固定的 `drizzle-kit@0.31.10`、`drizzle-orm@0.45.2`，配置为根目录 `drizzle.config.ts`。可以在开发环境安装相同版本后执行 `drizzle-kit generate --config drizzle.config.ts`。

## 校验范围

[云接口合同检查](cloud-contract-validation.json) 使用编译后的 Worker、真实磁盘 SQLite 和文件对象，经 D1/R2 接口适配测试科学基线、持久化、权限、分享撤销和证据完整性。它不冒充真实云端验证；公开地址验证必须在发布后另做。

[A/B 发布隔离检查](cloud-release-isolation-validation.json) 编译两个独立 Worker，并使用同一真实磁盘数据库和对象目录验证：发布索引隔离、无外部前端请求、旧界面与新服务拒绝混用、算法/数据错配拒绝、历史重算不覆盖、任务约束保存、回滚后证据/分享继续可读、大文件篡改和重定向被拒绝以及 R2 字节范围读取。B 仅为本地 HTML 注释与资源测试夹具，未把故障版本发布给真实用户。

正式部署后运行 `node tests/cloud-live.mjs https://实际公开域名`，直接验证公开 HTTP 服务的真实计算、双条件差异、保存恢复、访客权限、只读分享与撤销。测试只清理自己创建的临时任务；验收记录 `docs/cloud-live-validation.json` 不包含会话或分享令牌。此检查不能替代浏览器操作录像，也不声称重启过托管平台。

既有发布中的历史算法摘要若与本次编译算法不同，云服务明确拒绝执行该历史算法。保存的原记录仍可读取；当前版本重算须创建新记录。算法本身未发生变化时，原有版本清单和数据快照继续可复查。

接口依据 Cloudflare 官方 [D1 prepared statements](https://developers.cloudflare.com/d1/worker-api/prepared-statements/)、[D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/) 与 [R2 Worker API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)。大证据放入 R2，避免依赖 [D1 单行大小上限](https://developers.cloudflare.com/d1/platform/limits/)。
