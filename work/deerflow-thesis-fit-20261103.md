# DeerFlow 二开作为本科毕设底座：快速适配性核查

补充版本记录：主线程在本次核查末通过 git ls-remote 观察到 main 为 `14abd9a28eb035f277aa56098caab1b0600c6e8d`。下文基于当时的官方文档快照，未逐文件核对到该 commit；运行与安全结论仍未实测。

日期：2026-11-03。依据当前官方 `bytedance/deer-flow` README、LICENSE、Docker Compose 与 backend 文档作只读核查；未安装依赖、未运行服务/测试，也未审计完整代码或自行验证文档中测试结论。`main` 是可变分支，正式引用或开工前应记录实际 commit SHA。

## 结论

DeerFlow 2.0 是功能范围很广、工程复杂度较高的 Agent 应用/运行时。它更适合作为“课程助学 Agent 的宿主”来扩展；若毕设重点是 Vue + FastAPI + MySQL 的校园业务系统，或实验室/研讨室预约的可靠提交，直接二开会带入较重的运行时、部署与安全面。它不能替代预约业务自身的容量、冲突检查、授权、事务和幂等逻辑。

如果选择 DeerFlow，较可控的方式是：保留其 Agent Runtime、对话和流式界面；将课程/预约业务做成单独、确定性的领域 API；通过受限 MCP 工具或薄适配层让 Agent 调用。身份由服务端从登录上下文传入，工具不得信任模型文本中的 user_id。预约提交需经过明确确认，并在领域 API 中再次校验空闲、权限及冲突，再用数据库事务和幂等键落库。不要让 Agent 获得通用 SQL、任意 shell 或广泛文件写权限。

## 官方仓库可核实的定位和实现线索

- 当前 README 将 DeerFlow 2.0 定位为面向长时任务的“SuperAgent harness”，重点是研究、编码、创建，组合 subagents、memory、sandbox、tools 和 skills；并明确说 2.0 是从头重写，与 1.x 无共享代码。按旧教程或 1.x 架构套用当前 `main` 有版本错配风险。[README](https://github.com/bytedance/deer-flow/blob/main/README.md)
- README 称项目基于 LangGraph/LangChain，并支持扩展 skills、tools、MCP、custom agents 与 AgentMiddleware；这是通用 Agent 扩展机制，不是现成的校园课程模型或预约流程。自定义中间件可加领域约束/工具治理；MCP 可接入专用业务 API；RAGFlow 可选集成，支持检索证据引用。RAGFlow 为可配置的外部知识服务，不能等同于课程文件上传后自动得到高质量、可评估的课程 RAG。[README: Skills & Tools / RAGFlow / MCP](https://github.com/bytedance/deer-flow/blob/main/README.md)
- README 列 Python 3.12+、Node.js 22+。实际 `docker/docker-compose.yaml` 的说明列出 nginx、Next.js frontend、FastAPI Gateway + agent runtime、Redis Stream bridge，provisioner 可选；sandbox 可用本机、Docker 或 Kubernetes。部署体量高于仅一套 Vue/FastAPI/MySQL 项目。官方 README 给单开发者轻负载的参考起点为 4 vCPU / 8 GB RAM，推荐 8 vCPU / 16 GB；共享服务器推荐起点 8 vCPU / 16 GB，Docker 还要额外留出镜像构建与 sandbox 资源。它们是项目方建议值，不是本项目实测需求。[README 部署建议](https://github.com/bytedance/deer-flow/blob/main/README.md)、[Docker Compose](https://github.com/bytedance/deer-flow/blob/main/docker/docker-compose.yaml)
- 当前官方运行配置支持 SQLite/PostgreSQL 持久层；README 的多实例部署说明要求 PostgreSQL、数据库事件存储和 Redis stream bridge 等配套。它没有以 MySQL 为默认持久化选项；若用户坚持教程 MySQL，应让业务系统的 MySQL 与 DeerFlow 的运行时存储分层，或另行评估更换/实现存储适配，不能假定 SQLAlchemy 一接即可兼容。[README 配置](https://github.com/bytedance/deer-flow/blob/main/README.md)、[backend 配置文档](https://github.com/bytedance/deer-flow/blob/main/backend/docs/CONFIGURATION.md)
- 当前认证设计文档描述了浏览器认证、OIDC/SSO、用户级 thread/file/memory/agent 隔离；但角色仅有 `admin` 和 `user`，明确尚未实现细粒度 RBAC。高校课程场景仍需补课程教师、选课学生、助教等授权与课程成员关系；校内统一认证集成也需验证。[AUTH_DESIGN.md](https://github.com/bytedance/deer-flow/blob/main/backend/docs/AUTH_DESIGN.md)
- Gateway 提供 LangGraph-compatible API 与 SSE；SSE 能传运行事件和模型消息，但不代替业务状态机。通过 `POST /api/.../runs/stream` 可以流式运行，thread/run 需要按用户作用域管理。[API.md](https://github.com/bytedance/deer-flow/blob/main/backend/docs/API.md)
- 安全边界不能忽略：README 指出 Agent 能执行命令；Docker socket 模式具有近似宿主 root 的风险。官方提醒 Gateway admin 可注册 stdio MCP servers，这接近授予在 Gateway 容器内执行代码的能力。课程或预约应用应限制管理权限、MCP 命令与工具清单、sandbox 网络/文件边界；不要为展示工具调用而给出宽权限。[README 安全说明](https://github.com/bytedance/deer-flow/blob/main/README.md)
- LICENSE 原文是 MIT，版权行包括 `Copyright (c) 2025 Bytedance Ltd. and/or its affiliates` 和 `Copyright (c) 2025-2026 DeerFlow Authors`；复制、修改、分发需在副本或重要部分中保留版权和许可声明，且附“AS IS”免责声明。还要检查具体依赖、模型 SDK、前端组件和外部技能各自许可证。[LICENSE](https://github.com/bytedance/deer-flow/blob/main/LICENSE)

## 对两类毕设的匹配度

### 高校课程助学

这是更自然的匹配：现成的多轮 Agent、skills/MCP、自定义 agent、对话流、用户隔离、可选 RAGFlow，可承载课程规则问答、资料引用、学习计划和作业/学习记录工具。但这些只是运行时与产品底座；学生仍需设计一门课程的知识结构、RAG 评估集、计划约束和记录权限。若主线课程助手项目已经包含 FastAPI、MySQL、RAG 与工作流，DeerFlow 可能造成双重服务架构和重复功能；最好明确由谁持有登录、学习数据和工具授权。

建议研究范围：一门真实课程；有来源的课程问答；基于课表/可用时间约束的复习计划；练习记录驱动的计划调整。用固定资料和问题集比较无检索与 RAG，报告引用可追溯、检索质量、计划约束满足和用户确认前后写入正确性。不要把模型口吻或“学习反馈”直接称为学习掌握度。

### 实验室 / 研讨室预约

Agent 可以澄清人数、时段、设备和用途并推荐候选场地；真实空闲、容量、身份和冲突提交必须由预约领域服务决定。DeerFlow 的规划、子代理、sandbox 对固定的“查规则—查空闲—确认—提交”流程通常是超额能力。更重要的是多余架构提高了授权和部署成本，而 LangGraph/Harness 的事件持久化不自动与 MySQL 写入原子绑定。

如果预约是主贡献，建议复用课程工程脚手架与 LangGraph/MCP 等单一流程层，做受限 Agent；不要把 DeerFlow 全仓作为毕设底座。若坚持 DeerFlow，则把它当对话/Agent Runtime，独立部署预约 API；只暴露 `search_slots`、`get_rules`、`create_booking`、`cancel_booking` 等窄工具，提交工具由服务端校验当前用户、事务性冲突和幂等键，并要求用户确认预约摘要。对本科范围来说，先做研讨室预约比多资源实验室/设备预约更容易收窄。

## 风险与范围成本

DeerFlow 确实替你提供了不少横切能力，但将其跑起来和理解它的运行时、worker、模型/工具策略、sandbox、数据库与 Redis，都会占用毕设时间。其面向通用 Agent 的扩展与安全边界也会让导师需要区分“复用底座”与“本人贡献”。如果论文标题/目标写成自行设计校园助学或预约系统，应清楚标注上游仓库来源、代码复用比例、自己的领域设计、实验对照和验证结果。仅改 prompt、skills、页面文案不足以证明核心系统独立贡献。

## 事实/推断与限制

项目定位、运行依赖、部署拓扑、数据库支持、认证范围、扩展点和许可证来自当前官方仓库的 README、配置、Compose、认证/API 文档及 LICENSE。适配课程助学或预约、推荐分工方式、复杂度与论文可解释性属于基于这些资料的设计判断；没有访谈学校、部署运行、检查每条代码路径或做功能/性能/安全测试。因此这里只能给架构选择建议，不能证明它适合真实校内上线或保证毕设通过。
