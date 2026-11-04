# Pi Agent 二开作本科毕设的适配性核查

日期：2026-11-03。仅核查官方仓库文档及部分源码；未安装依赖、运行服务或测试，也未核验学院选题规范。

## 来源与版本

用户确认所指是原 `badlogic/pi-mono`。该 GitHub 地址当前重定向至 `earendil-works/pi`。`git ls-remote` 核查 main 为 `9c9ce8547e5a88cbe834a53e9a6d83a789d08e47`，以下源码链接固定到此版本。

## 可核实事实

1. 主仓库定位为可扩展 Agent harness，包含统一模型 API、Agent 核心、持久化运行时、编程 CLI 和终端界面库；不是预先建好的高校课程/预约业务系统。[README](https://github.com/earendil-works/pi/blob/9c9ce8547e5a88cbe834a53e9a6d83a789d08e47/README.md)
2. Agent 核心实现包含工具集、消息状态、上下文转换、事件订阅、工具执行前后钩子与执行策略。因此可接入课程检索、课表查询、保存计划等领域工具，但领域授权和约束需要由应用实现。[Agent 源码](https://github.com/earendil-works/pi/blob/9c9ce8547e5a88cbe834a53e9a6d83a789d08e47/packages/agent/src/agent.ts)
3. 编程 Agent SDK 在 Node.js/Bun 中使用 TypeScript；支持工具覆盖、会话管理、资源加载和事件订阅，默认会话可持久化。跨语言可使用 CLI/RPC 子进程集成。保留 Python/FastAPI 时会增加跨进程集成与状态/生命周期管理成本，不能当作 Python 包直接替换 LangGraph。[SDK](https://github.com/earendil-works/pi/blob/9c9ce8547e5a88cbe834a53e9a6d83a789d08e47/packages/coding-agent/docs/sdk.md)
4. 扩展文档说明可注册自定义工具、订阅事件与提供交互；主 README 明确 Pi 默认使用启动进程权限，不内置对文件、进程、网络与凭证的操作系统权限限制。业务确认钩子和独立会话不等于沙箱或多用户数据授权。[扩展文档](https://github.com/earendil-works/pi/blob/9c9ce8547e5a88cbe834a53e9a6d83a789d08e47/packages/coding-agent/docs/extensions.md)、[权限说明](https://github.com/earendil-works/pi/blob/9c9ce8547e5a88cbe834a53e9a6d83a789d08e47/README.md#permissions--containerization)

## 设计判断（尚未实现或验证）

- 普通课程问答、本人课表、计划保存：可使用 Pi 核心实现，但仍需完成 Web 界面、业务 API、数据库、文档检索、权限与评测；在沿用现有 Python 课程路线的条件下，是否值得增加 TypeScript 运行时需要权衡。
- 编程课程实验助学：与 Pi 编程/工具执行能力较匹配，可限定一门课、固定任务与受控工作区，形成“读取任务—学生提交—运行预设测试—按失败证据给提示—记录结果”的流程。需把代码执行隔离和资源限制纳入范围；测试结果不直接等于学生理解程度。
- 预约系统：Pi 可解释需求和调用受控工具；空闲、冲突、容量、权限、幂等、确认及最终写入仍由确定性业务服务处理。Pi 不自动解决这些事务约束。
- 二开是否足以成为毕设取决于独立领域模型、实现和实验，而不是改 UI 或新增提示词。建议在论文中明确基础框架、借鉴部分和自己的实现，固定依赖版本。
