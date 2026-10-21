# Learning Statistics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 交付仅管理员可见的完整学习参与统计及可靠活跃阅读采集。
**Architecture:** 阅读采集、报表查询、后台呈现各自独立，通过 learning-stats/types.ts 的固定接口衔接。保留既有行为表及匿名累计，新建阅读会话/计时片段与采集起点，不补造历史时长。
**Tech Stack:** Next 16.3 / React 19 / Drizzle / PostgreSQL / PGlite / Vitest / Playwright。
**Spec:** docs/superpowers/specs/2026-10-20-learning-statistics.md

## Global Constraints
仅管理员统计及导出；30秒有效阅读、5分钟闲置、30分钟访问去重、两年实名保留。无登录说明弹窗。当前分支提交及服务器验收后发布。

## Review Focus
- 并发心跳/重复请求/多标签页不能重复计时（Task 1）。
- 主题页屏幕外文章、隐藏/失焦/闲置均暂停（Task 1）。
- 历史未采集与真实0不同；上海午夜、日期范围正确（Task 2）。
- 非管理员与已停用账号绕过UI直调服务或导出必须拒绝（Task 2/3）。
- Excel文本防公式、停用会话失效、两年清理保持匿名累计（Task 4）。

### Task 1: 活跃阅读采集
文件：schema.ts、drizzle/0018_learning_statistics.sql、learning-stats/tracking.ts、ui/reading-tracker.tsx、api/stats/reading、文章和主题阅读入口、计时测试。
接口：learningReadSessions(id,userId,articleId,startedAt,lastHeartbeatAt,activeSeconds,qualifiedAt)；learningReadTicks(id,sessionId,userId,articleId,occurredAt,seconds)；learningStatsConfig(key,startedAt)；users.excludeFromLearningStats boolean。
- [x] 写30秒阈值、重试、多标签并发、无权/不可读文章测试并验证RED。
- [x] 事务内锁用户、服务端时间限额心跳；前台可见/焦点/闲置/交集检测，覆盖全部阅读角色和入口。
- [x] 运行采集用例，验证GREEN。

### Task 2: 报表与日期口径
文件：learning-stats/types.ts、report.ts、period.ts、tests/module/learning-report.test.ts。
接口：createLearningReportService(database).getReport(actorId, StatsFilter): Promise<LearningReport>，字段见 types.ts。
- [x] 写权限、日期、过滤、真实去重/跨版本、历史空值、停用/测试排除及分页用例并验证RED。
- [x] 以现有行为表和新增阅读片段分组统计；只读查询不引入计分。
- [x] 运行报表用例，验证GREEN。

### Task 3: 管理后台
文件：manage/stats 页面及CSS、manage/page.tsx、tests/e2e/stats.spec.ts。
接口：消费Task 2报表，导出URL /api/stats/people-export，保留当前查询参数。
- [x] 更新E2E为管理员三视图、编辑/阅读者拒绝、筛选排序分页与导出，验证RED。
- [x] 实现总览趋势、人员/内容表、实名阅读下载登录明细、账号管理链接。
- [x] 运行E2E，验证GREEN。

### Task 4: 整合与发布
文件：导出xlsx模块及路由、content-stats清理/旧入口权限、账号管理与测试、CONTEXT、ADR、VERSION、版本记录及Excel。
- [x] 写Excel/停用会话/保留期回归，验证RED；实现汇总Excel和审计、两年保留，确保旧服务无权限旁路。
- [x] 格式、lint、typecheck、全量本地/真实PG测试、构建、关键E2E；独立审查后修复。
- [x] V6.0记录和Excel，本地提交；备份部署验收；GitHub推送与v6.0标签。

执行：用户已明确“请实施”，无需再次确认计划。依据并行技能仅在文件所有权无重叠的任务间委派；主代理负责整合验证和发布。

验收记录：docs/operations/releases/v6.0.md。运行代码提交 da6fa48；最终发布提交与标签以 Git v6.0 为准。
