# 月球地图连续性与旧页面核查

本轮前后截图均由本机 Chrome 对 `http://127.0.0.1:4173/` 的真实 HTTP 页面拍摄。修改前的图记录此前已部署的三维首页首屏；修改后的图记录选中研究点 1 西北样本、处于局部九点层级的状态。它们是不同操作阶段的真实画面，没有拼接、替换月球或伪造计算结果。

- 修改前首屏：[桌面](screenshots/globe-before-first-screen-desktop.png)、[390 px 手机模拟](screenshots/globe-before-first-screen-mobile.png)。
- 修改后局部选点：[桌面](screenshots/globe-after-local-desktop.png)、[390 px 手机模拟](screenshots/globe-after-local-mobile.png)。
- [修改前缺陷](globe-continuity-before.json)：两种尺寸中，九点按钮按 Enter 选中后，焦点实际变成 `BODY`。
- [修改后 16 项检查](globe-continuity-validation.json)：稳定节点、键盘方向与边界、首页迷你工作台同步、层级独立显示、44 px 操作目标、12 px 文本、隐藏暂停、返回保留状态以及双语与覆盖边界全部通过，无页面异常。

原截图中静态照片及 `THE LUNAR SOUTH POLE` 标签不在当前 4173 的新响应中。核查的新响应包含三维 `moon-canvas`，且 HTML 使用 `Cache-Control: no-cache`；WebGL 降级显示二维经纬地图，不会恢复该旧照片。证据只能说明用户截图与当前新响应不同，不能仅凭截图确定是旧标签页、另一个服务副本还是缓存。

代码提供 `setSelection({siteId, patchId, level?})` 与 `getSelection()`；无效地点或取样点不会静默替换成邻近结果。全球、南极区域和局部九点按钮分别改变地图层级，保存同一已选点。区域 SVG 使用真实 `hidden` 属性，避免把 JavaScript 属性赋值误当作已隐藏。进入工作台时停止球体自转与后台绘制，返回时保持暂停。
