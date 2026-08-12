# THROWAWAY — 品集｜Q Nexus UI 原型

设计问题：品集｜Q Nexus 的首页、知识文章阅读页和 Markdown 编辑页，应该采用什么视觉结构与交互层级？

本目录包含三套结构明显不同的方向，可通过 `?variant=A|B|C&page=home|article|editor` 切换。它使用静态数据、无持久化，不是正式产品代码。

## 运行

```bash
npm run prototype --prefix prototype/q-nexus-ui
```

然后打开：<http://localhost:4173>

## 方向

- A — Editorial Space：大留白、编辑式区块、内容像一本持续生长的工程手册
- B — Knowledge Atlas：全局知识地图、紧凑左轨、强调快速定位和上下文
- C — Focus Studio：搜索与当前任务主导、模块像可进入的工作空间

底部浮动栏可切换页面与方向；键盘左右键切换方向。在输入框或编辑区中按方向键不会触发切换。
