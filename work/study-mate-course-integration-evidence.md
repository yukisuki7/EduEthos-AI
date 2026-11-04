# Study-Mate 与校园课程助手组合的毕设评估

核查日期：2026-11-03。范围：用户提供的课程简介、Study-Mate 公开仓库与项目内已有源码副本。未运行项目或测试，未取得商业课程源码，未核验学校毕设规范。

## 已核查的项目边界

- `git ls-remote` 确认 main 为 `d8114f38363272852b339d6788b2f8f007243b43`，项目内 `.tools/research/Study-Mate` HEAD 与其一致；Web 分支 `web/0.7.0-beta` 为 `c7fdedf21839689d91f9d61e995ff6f19c9d4170`。
- 主线定位是学习工作流、技能与宿主插件；`lib/tools/index.ts` 的工具注册依赖宿主提供 `ctx.tools.register`。这不是可以直接合入 Vue/FastAPI 的独立多用户后端。[README](https://github.com/Miaotofu01/Study-Mate/blob/d8114f38363272852b339d6788b2f8f007243b43/README.md)、[工具注册](https://github.com/Miaotofu01/Study-Mate/blob/d8114f38363272852b339d6788b2f8f007243b43/lib/tools/index.ts)
- 独立 Web 分支采用 FastAPI、Next.js/React 和文件/YAML 工作区；与课程介绍的 Vue/MySQL 底座不同。其 README 和 main 对分支的说明不能作为当前运行验证。[Web README](https://github.com/Miaotofu01/Study-Mate/blob/c7fdedf21839689d91f9d61e995ff6f19c9d4170/study-mate-web/README.md)
- 当前固定 commit 的 `progress.schema.json` 是“未开始、学习中、已学完”三档，已删除 `mastery`。未固定版本的 raw main 曾返回旧缓存，故本评估使用本地与固定 commit 交叉核对。[进度 schema](https://github.com/Miaotofu01/Study-Mate/blob/d8114f38363272852b339d6788b2f8f007243b43/schemas/progress.schema.json)
- 练习规范区分客观题页内判分、开放题学生自评、实操 Host 代跑；这些事实不能直接解释为经过验证的掌握度或学习效果。[练习规范](https://github.com/Miaotofu01/Study-Mate/blob/d8114f38363272852b339d6788b2f8f007243b43/preset/skills/layered-practice/SKILL.md)
- 仓库 LICENSE 标注 MIT，要求在副本或软件的重要部分保留版权与许可声明。课程源码和课程资料的使用及公开发布边界需另外核查，不能从该仓库的许可推导。[LICENSE](https://github.com/Miaotofu01/Study-Mate/blob/d8114f38363272852b339d6788b2f8f007243b43/LICENSE)

## 设计判断与建议

以用户粘贴的课程项目作为唯一多用户服务底座，借鉴 Study-Mate 的课程节点、练习组织、来源记录和进度设计；逐项适配为自身的数据模型与工作流，而非整仓拼接。课程介绍中的功能与安全目标尚未通过源码或运行核验。

建议限一门课程或其部分章节，以教师大纲和允许使用的资料为依据，完成“带来源答疑—制定计划—记录练习—调整复习任务”的闭环。课表可由手工维护或导入获得，不依赖真实教务接口。计划结合课表、截止日期、可用时间和明确的练习记录，经过确定性规则校验、用户确认后写入。

可作为独立工作论证的重点：

1. 课程/用户数据授权：身份来自可信服务端上下文，检索、课表和计划工具均检查权限，验证跨用户与跨课程访问。
2. 来源可追溯问答：保留课程、文档与章节/页码信息；用人工核对的固定题集比较无检索与有检索的回答正确性、引用支持性和无依据问题处理。
3. 反馈驱动计划：把错题、未完成任务、可用时长作为可追溯输入；验证计划时间冲突、预算超限、重复写入及反馈前后任务变化。

上述属于建议的实现与评估方案，不是已有成果。自动化测试和问答评测不能替代真实学习成效实验。系统型本科毕设的功能与工程体量具有可行性，但学院对算法创新、独立工作和第三方代码复用的要求仍未知。
