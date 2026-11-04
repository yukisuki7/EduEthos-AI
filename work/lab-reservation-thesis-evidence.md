# 智能实验室预约系统毕设方向：技术核查

日期：2026-11-03

## 核查结论

该方向在技术上可行，LangGraph 适合将预约流程拆成查询、澄清、确认、执行等节点；但它提供的是流程状态持久化与恢复机制，不替代预约业务的数据库一致性、幂等、防重复提交和权限校验。SSE 只是一种服务端向客户端发送事件的传输机制；页面展示的节点状态、工具调用事件或模型输出片段，不能仅因采用 SSE 就称为“完整推理过程”。

## LangGraph：澄清、确认与恢复

LangGraph 的 `interrupt()` 可暂停图执行，将可 JSON 序列化的中断数据交给调用方；使用 checkpointer 和稳定的 `thread_id` 后，可以用 `Command(resume=...)` 恢复同一线程。这适用于缺字段时向学生追问，以及在最终提交预约前要求用户确认。官方文档也说明中断节点恢复时会从该节点开头重新执行，因此中断前执行的代码可能再次运行；写入副作用应置于确认后，或设计成可安全重试。

参考：[LangGraph Interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts)、[LangGraph Persistence](https://docs.langchain.com/oss/python/langgraph/persistence)。

## 不会自动保证预约正确性

LangGraph checkpoints 保存图状态和节点进度，不会把图外部的 MySQL 写入和 checkpoint 组合成一个原子事务，也不会天然使“提交预约”只执行一次。官方建议在可重执行节点中使用幂等逻辑，例如幂等键、upsert 或写前检查。预约业务仍应自行处理：

- 同一用户或不同用户并发预约同一实验室/设备时的时间冲突。
- 重试、刷新、SSE 断线重连后的重复提交。
- 确认内容与执行内容绑定，避免用户确认后时段/资源发生变化。
- 取消、管理员审批与预约提交之间的状态转换和权限。

MySQL InnoDB 支持事务、行级锁、ACID 与锁定读；普通一致性 `SELECT` 不会锁住资源，预约校验与写入若分成无锁读取再写入，会有并发竞态。应在事务中使用适当的锁定读或原子约束/条件更新，并通过并发测试验证：独占资源的冲突时段最多产生一个有效预约，共享资源的有效预约总量不超过容量。如何建模时段（固定 slot、区间重叠、容量计数）会影响具体约束，不能仅凭技术栈确定。

参考：[MySQL 8.0 InnoDB Introduction](https://dev.mysql.com/doc/refman/8.0/en/innodb-introduction.html)、[Transaction Isolation Levels](https://dev.mysql.com/doc/refman/8.0/en/innodb-transaction-isolation-levels.html)、[Consistent Nonlocking Reads](https://dev.mysql.com/doc/refman/8.0/en/innodb-consistent-read.html)、[InnoDB Best Practices](https://dev.mysql.com/doc/refman/8.4/en/innodb-best-practices.html)。

## SSE 与“过程可见”

SSE 定义浏览器接收 `text/event-stream` 事件的方式，支持服务端逐条发送事件和连接错误处理。它不决定事件内容是否可信、完整或安全。可以通过明确的事件类型展示诸如 `checking_availability`、`awaiting_confirmation`、`booking_created`、工具名称及结果摘要；也可以流式传输模型生成的可展示文本。该 UI 是应用定义的进度与输出视图，不能因此宣称展示了模型的完整内部推理。建议只输出可审计的步骤、依据、校验结果和工具调用摘要，并避免把敏感提示或隐藏推理链发给用户。

参考：[MDN: Using server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)、[LangGraph streaming](https://docs.langchain.com/oss/python/langgraph/streaming)。

## 对毕设论证的含义

使用 Vue、FastAPI、MySQL、RAG、Tool Calling、LangGraph 和 SSE 组成一个功能项目，说明了实现范围，但技术名词数量本身不构成研究贡献。更有力的毕设问题可以聚焦“如何在自然语言预约中实现可审计、可恢复且并发安全的预约提交”，再通过固定场景集验证字段澄清正确率、预约约束通过率、冲突并发下的重复有效预约数、确认/取消状态正确率、来源可追溯率及失败恢复行为。RAG 应负责规则文本类问答；空闲状态、容量和可预约性应由 MySQL 查询及确定性业务规则判断，模型不能作为事实来源。

可控范围建议：限定一种实验室/设备资源模型、预约粒度和状态机；先实现并测试传统预约系统，再将自然语言 Agent 作为受约束入口与基线比较。需要区分仿真数据和真实校内流程验证；没有真实用户或管理员参与时，只能报告合成测试或受控实验结果。

## 范围和限制

本核查只针对所给项目描述和官方技术资料；未检查课程源码、未运行系统或测试，也未核验学校的选题规范和导师要求。故此结论是技术可行性判断，不代表该课程项目本身足以直接作为毕业论文成果。
