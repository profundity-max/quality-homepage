# 模板文件采用隔离区、扫描通过后发布与版本快照

## 状态

已接受（Slice 4 生效）

## 背景

FILE-01/02 要求模板上传后先进入隔离区，本地恶意文件扫描通过后才能发布；扫描失败或不可用时不允许设为有效。TPL-07/08 要求新版本先保存草稿、发布后旧有效版本成为历史、阅读者只看到当前有效版本。TPL-05 要求不限制模板扩展名，所有文件只存储与下载、不在网页中解析执行。

## 决策

- **隔离区 = 状态标记 + 受控目录**：模板文件写入受控文件目录（复用文章图片的 FileStorage seam，扩展名白名单传 null 即不限制），`template_versions.quarantine_state`（pending/passed/failed/quarantined）标记隔离状态；`quarantine_reason` 记录失败原因（FILE-02）。
- **扫描 adapter 可注入**（ADR-0004 seam）：服务只依赖 `FileScanner` 接口，生产实现为本地扫描，测试注入可控实现；扫描服务不可用时保持隔离并明确报错（FILE-02）。
- **版本状态机**：`template_versions.status`（draft/active/superseded）+ `templates.status`（draft/published/archived）；发布仅允许扫描通过的草稿版本，旧 active 自动 superseded（TPL-07/08）；阅读者视图只查 published 模板的 active 版本（TPL-09）。
- **下载**：`/templates/[stableId]/download` 强制 `Content-Disposition: attachment`，安全处理文件名，只提供当前有效版本并累加下载计数（FILE-03/04）。
- **单文件上限 500 MB**（TPL-06），环境变量可配置，上传前校验。

## 后果

- 恶意文件扫描成为发布前置条件，失败原因对管理员可见可追溯。
- 版本历史完整：旧有效版本可被编辑者追溯（TPL-08），副本获得新标识且不复制统计（TPL-10）。
- 任意扩展名文件只落盘不出网执行，网页无解析/预览面（TPL-05）。
- 代价：扫描是同步阻塞步骤（第一版）；`download_count` 为全量计数，下载人数（去重）留待统计切片。
