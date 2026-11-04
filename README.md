# EduEthos AI · 知芯课程助教

面向《计算机组成原理》的课程问答与教学分析项目。前端使用 HTML、CSS、JavaScript 和 Alpine.js；自托管后端使用 Node.js 内置 SQLite，服务端检索脱敏课程片段并调用 DeepSeek。

## 当前功能

- 管理员创建个人账号和班级，分配学生与教师。
- 学生个人对话、反馈与资料按账号保存，可跨设备恢复。
- 教师仅查看获授权班级的提问统计，支持 Word 报告导出。
- 课程资料关键词/BM25 检索、来源追溯、模型问答与教学提示。

## 目录

| 目录 | 内容 |
| --- | --- |
| [course-demo](course-demo/) | 网页、Node 服务、Worker 适配、部署模板和检查脚本 |
| [knowledge-base](knowledge-base/) | 脱敏运行资料、检索与本地资料处理脚本 |
| [design-preview](design-preview/) | 界面设计方案与预览图 |
| [work](work/) | 技术选型与研究记录，部分方案尚未实现 |

## 本地运行

参与修改和提交 PR 见 [项目协作](docs/COLLABORATION.md)；合并后的上线与故障处理见 [持续部署说明](course-demo/deploy/CONTINUOUS-DEPLOYMENT.md)。

需要 Node.js 22.22 或更新版本，自托管服务使用内置 `node:sqlite`。

```powershell
cd course-demo
$env:PUBLIC_ORIGIN='http://127.0.0.1:8767'
$env:DATABASE_PATH="$PWD/runtime/eduethos.sqlite"
node server/manage.mjs bootstrap-admin admin 管理员
node server/index.mjs
```

创建管理员时按提示输入密码。访问 http://127.0.0.1:8767 。使用真实模型时在服务器环境中配置 `DEEPSEEK_API_KEY`，不要提交密钥。

部署与维护见 [部署说明](course-demo/deploy/README.md)；应用细节与兼容的早期 Demo 模式见 [应用说明](course-demo/README.md)。公开副本中的 `203.0.113.10` 是示例 IP，部署前应替换为自己的地址。Sites 发布需在 `course-demo/.openai/hosting.json` 配置自己的项目 ID；Node 自托管不依赖它。

## 公开范围

仓库包含当前项目的可公开文件快照。密钥、登录凭据、数据库、用户记录、原始教学文档、含个人信息的提取文本、工具缓存、旧部署包和调试证据均不上传；原始本地 Git 历史未发布。完整资料仅在本地保留。

当前已有脱敏运行片段可直接构建、检索和运行；重新执行原件提取或 `knowledge-base/runtime/prepare.mjs` 需要自行准备具有使用权限的本地原件与中间文件。课程材料不附带额外的再分发授权，引用或复用前应核实权属。仓库未声明统一开源许可；第三方 Alpine.js 保留其原有许可声明。

自动化检查用于验证程序行为，不能代替真实模型语义质量、教学效果、大规模并发、备份恢复与长期运维验证。教师统计反映提问情况，不代表学习掌握程度。部分子目录文档保留早期 Demo 的记录，当前个人账号服务以自托管部署说明为准。
