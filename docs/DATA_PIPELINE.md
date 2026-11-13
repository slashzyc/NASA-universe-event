# 新日期数据管线

服务端保留已发布的三个月数据包。日期请求先检查这些包和已生成的包是否完整覆盖所需时段；命中后直接复用。缺失时，后台从 NASA/JPL Horizons 获取太阳及地球星历，再与原有 Connecting Ridge 地形及九点地平线配对。浏览器只访问本项目接口。

当前范围：2026-01-01 至 2029-01-01 UTC，每次最多 31 天；观测高度固定 2 m；30 分钟间隔；只有 ROI 1、4、6 的已验证坐标可计算。查询端点向外取整至 30 分钟边界，以完整覆盖请求。请求 1 m、5 m、其他位置或范围外日期会明确失败。

## 从请求到可计算数据

1. `POST /api/data-jobs` 提交 `{start, stop, observerHeightM: 2}`，可带受支持的 `siteId`。返回持久化任务编号。
2. `GET /api/data-jobs/:id` 返回该访客拥有的任务状态。`queued` 是等待；`fetching` 是获取或复用来源表；`processing` 是校验并组合；`succeeded` 返回 `datasetId`；`failed` 返回真实错误。
3. 全局串行队列依次处理三个地点的太阳和地球，共六张来源表。`completedRequests` 表示已完成校验的来源表数，包含缓存命中；不是伪造的时间进度。整体数据包缓存命中另有 `cached: true`。
4. 只有六张表均通过检查才注册新的数据包。工作台“分析这个日期”将 `datasetId` 作为 `campaign` 提交给现有正式计算接口。此时仍由原有已验证算法计算，数据获取成功不等于任务通过。

持久数据位于 `LUNAMARGIN_DATA_DIR/horizons`：`jobs` 保存恢复点，`raw` 保存原始响应和查询参数，`datasets` 保存内容摘要命名的数据包和索引；SQLite 管理任务所有者、状态、数据索引和后续分析。备份和恢复须包含 SQLite 及整个数据目录。服务重启会把未完成任务重新排队，并复用校验通过的响应。运行单个 Node 服务进程；多副本部署需要共享队列协调器后才能开放。

## 来源与验证

- [JPL API 使用要求](https://ssd-api.jpl.nasa.gov/doc/)：缓存复用、同一时间仅一项请求、失败退避、应用专用 User-Agent、禁止浏览器嵌入上游 API、检查响应版本。
- [Horizons 参数文档](https://ssd-api.jpl.nasa.gov/doc/horizons.html)：地月观察者为 `coord@301`，`GEODETIC` 经度、纬度、地面高程加 2 m，`QUANTITIES=4`，AIRLESS，UTC，30 分钟。
- [NASA PGDA 地形产品](https://pgda.gsfc.nasa.gov/products/78)及[轨道调整产品](https://pgda.gsfc.nasa.gov/products/90)：地形与地平线复用已发布包中的对应坐标及高度；不从月球封面纹理提取地形。

每次请求的 `User-Agent` 默认是 `LunaMargin/1.0 (+https://github.com/slashzyc/NASA-universe-event/issues)`。部署者可以用 `LUNAMARGIN_JPL_USER_AGENT` 设置实际维护者联系地址，必须保留正确产品名、版本和联系信息。429、5xx、网络及超时失败最多重试三次，指数退避并考虑 `Retry-After`；其他数据/参数错误直接失败。每次请求间至少等待一秒。

当前文档标注 API 1.3；本项目真实归档及本轮实际请求返回 1.2。管线明确接受经相同数量 4 表格检查的 1.2、1.3，保存实际版本，遇到其他版本停止并要求检查格式。除版本外还核对目标天体、月球中心、经纬度与高度、MEAN_ME 朝向、AIRLESS、方位/高度角列、有限角值、起止时间和每一个连续采样时刻。响应与数据包均有 SHA-256 校验值。

`sourceDataTime` 是来源响应实际获取时间；`generatedAt` 是本地数据包生成时间；`calculatedAt` 是任务计算时间。未来日期星历是计算星历，不是实时观测。九点继续复用中心星历，保留原有 35.4 m 范围近似和所有地形/几何模型限制。

## 本轮验证

`node --test tests/horizons.test.js` 覆盖真实归档响应解析、输入边界、未知版本拒绝，以及隔离的模拟上游测试：串行、退避、缓存、服务重启、失败不生成数据包。模拟响应仅存在于测试临时目录。

[真实新日期记录](new-date-validation.json)来自 2026-11-13 的六次串行 NASA 请求，覆盖 2027-07-01 至 07-03，三个地点各 97 个样本。原有地形/九点地平线一致。使用原算法分析 7 月 1 日 24 小时，ROI 1、4、6 的共同可见时长分别为 24、0、约 2.329 小时；三者数据覆盖均完整。此记录证明真实获取与计算链路，不代替后续完整工作台、数据库、分享与导出验收。

[新日期浏览器验收](new-date-browser-validation.json)另外通过真实构建的工作台操作缓存请求、48 小时计算、SQLite 与导出一致性、动态数据集刷新、重启后任务恢复和 390 px 只读分享。最后一项明确向测试服务注入上游 HTTP 400，检查失败不会产生科学结果。

完整复现这项门禁：

```text
node scripts/fetch-validation-seed.mjs
npm run build
node tests/explorer-new-date-browser.mjs
```

第一条命令明确进行真实 NASA 获取；缓存命中不重复联网。默认缓存目录为项目上级的 `tmp/explorer-real-pipeline/horizons`。可用 `--data-dir DIRECTORY` 指定持久目录，并在浏览器测试中设置 `LUNAMARGIN_REAL_CACHE` 指向其 `horizons` 子目录。获取时间不同会改变数据包摘要，测试从真实缓存索引读取预期摘要，不要求重现某个历史时间戳。单元测试和浏览器门禁不会自行访问 NASA。
