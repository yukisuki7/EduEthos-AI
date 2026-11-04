# Study-Mate 作本科毕设参考的源码核查

核查 commit：`d8114f38363272852b339d6788b2f8f007243b43`（main）。本地对已 shallow clone 的源码作只读检查；未安装依赖、运行项目或验证真实学习效果。源码链接固定到该 commit。

## 系统定位与结构

README 将 Study-Mate 描述为面向数学与计算机自学的工作流、技能和插件：按宿主条件组织资料收集、课程设计、讲解和练习评估角色；可委派则委派，否则依次完成。[README.md L89](https://github.com/Miaotofu01/Study-Mate/blob/d8114f38363272852b339d6788b2f8f007243b43/README.md#L89)

这不是常见的 FastAPI + MySQL + RAG Web 应用。main 的核心是 DSH 插件、多宿主技能与本地学习工作区。当前 README 另说明曾有 FastAPI + Next/React Web 运行时，但它已从 main 移出；主线程核查的独立分支为 `web/0.7.0-beta`，commit `c7fdedf21839689d91f9d61e995ff6f19c9d4170`，含 `study-mate-web` 后端与前端源码。该分支 README 定位单人本地应用、文件/YAML 数据，无账号鉴权；实际运行未验证。注意 README 的 CORS 描述已过时，当前 `backend/app/main.py` 使用 localhost/127.0.0.1 白名单，不能照抄通配跨域的旧描述。可查看 [Web 分支 README](https://github.com/Miaotofu01/Study-Mate/blob/c7fdedf21839689d91f9d61e995ff6f19c9d4170/study-mate-web/README.md) 与 [Web 分支后端入口](https://github.com/Miaotofu01/Study-Mate/blob/c7fdedf21839689d91f9d61e995ff6f19c9d4170/study-mate-web/backend/app/main.py)。

## main 中实际实现

- 原生工具注册集中在 [`lib/tools/index.ts` L109-L131](https://github.com/Miaotofu01/Study-Mate/blob/d8114f38363272852b339d6788b2f8f007243b43/lib/tools/index.ts#L109-L131)：九个学习工具（工作区上下文、课程/课件/题库/交接校验、改写、离线导出、来源 URL 核验），另有答疑预设独立注册的 `studymate_lesson_read`，以及任务域和实验域工具。`registerStudyMateTools` 汇总到 DSH 提供的工具注册接口，[`lib/tools/index.ts` L142-L162](https://github.com/Miaotofu01/Study-Mate/blob/d8114f38363272852b339d6788b2f8f007243b43/lib/tools/index.ts#L142-L162)。角色分工、课程生成和讲解流程主要写在技能提示、任务协议和课件约定中，不应全部描述成自研 Agent 执行引擎。
- 学习资料与状态采用本地目录/文件：学生提供的本地教材转为 Markdown 存入 `reference/`；在线来源存成 `sources/`，之后依据来源产出课程。[README.md L119](https://github.com/Miaotofu01/Study-Mate/blob/d8114f38363272852b339d6788b2f8f007243b43/README.md#L119)。阅读端和 Host 通过文件与 YAML 工作区衔接。核查范围内未发现主线依赖 MySQL/PostgreSQL、向量数据库或 embedding 检索的实现；主线具备的是来源收集、文件化和工具式 URL 可达性核验，不宜称为向量 RAG。
- 题目有四层和四类：客观题在页面判分，开放题学生自评，实操题由 Host 代跑命令并记录真实输出。[`layered-practice/SKILL.md` L25-L36](https://github.com/Miaotofu01/Study-Mate/blob/d8114f38363272852b339d6788b2f8f007243b43/preset/skills/layered-practice/SKILL.md#L25-L36)。作答按课程节点写入 `attempts/` 文件，带版本校验与操作 ID 防重；[`lib/attempts.ts` L342-L356](https://github.com/Miaotofu01/Study-Mate/blob/d8114f38363272852b339d6788b2f8f007243b43/lib/attempts.ts#L342-L356)。当前进度只有“未开始／学习中／已学完”三档；`mastery` 字段已从新 schema 移除。[`progress.schema.json` L1-L17](https://github.com/Miaotofu01/Study-Mate/blob/d8114f38363272852b339d6788b2f8f007243b43/schemas/progress.schema.json#L1-L17)。所以不应将其描述为已具备经过验证的自动能力测量或掌握度模型。
- 多角色派发依赖宿主提供的子代理工具：DSH 配置启用 `spawn` provider，禁用 `fork`，并注释说明注册/派发后端由宿主提供。[`agent.cordis.yml` L183-L230](https://github.com/Miaotofu01/Study-Mate/blob/d8114f38363272852b339d6788b2f8f007243b43/preset/learning/agent.cordis.yml#L183-L230)。技能提示描述角色职责与不支持委派时的串行流程；是否真正并行取决于宿主。

## 对毕设选题的含义

可借鉴它的课程依赖图、按课型设计作业、来源清单与可追溯产物、作答证据、文件状态版本控制和工作流状态恢复等设计。若把它转成高校课程助学毕设，应自主构建面向学生/教师的服务端与授权模型，并提出可实测的问题，例如“带来源回答的准确性”或“不同练习反馈对学习任务成功率的影响”。公开仓库的技能规范、stars、自动结构测试都不等于学生真实学习成效；成效需要固定题集、基线、参与者或严谨的受控实验来支持。

范围限制：只检查 main 的 README、插件注册、题目规范和作答/进度结构；Web 分支信息来自主线程检查。未审计全部代码、未运行测试、未检查该仓库 Issues/历史，也未访谈作者或用户。
