# V7.0 Architecture Deepening Implementation Plan

**Goal:** 顺序优化阅读时序、报表执行范围和编辑草稿恢复。
**Spec:** ../specs/2026-10-22-architecture-deepening.md
**Architecture:** 保留模块化单体，集中行为状态；复用现有数据库、存储与请求 adapter。
**Execution:** 当前会话按用户要求逐项实施。

- [x] 阅读：新增 client-session，先增加交错时序测试，再迁移 ReadingTracker；保留浏览器采样与 HTTP 接线。
- [x] 报表：新增人员专用汇总入口、共享分组口径与独立知识缺口读取；验证导出和全量报表人员结果一致。
- [x] 草稿：新增 draft-session，先验证在途编辑/断网恢复，再迁移 editor 的保存和恢复状态；保留服务端规则。
- [x] 全量验证、独立复核、更新 ADR/版本/Excel、本地提交。
- [x] LAN 部署验收后发布 GitHub 与 v7.0。

## Review Focus

- 暂停不能被等待中的旧采样重新启动。
- 离页停止请求在队列空闲时同步发起。
- 人员导出保持权限、姓名筛选、排序及审计。
- 保存成功不能删除在途输入产生的新草稿。
- 销毁后的异步响应不得改变界面或触发新保存。
