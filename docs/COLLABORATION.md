# 项目协作

后续共同开发以 [GitHub 仓库](https://github.com/yukisuki7/EduEthos-AI) 为准。首次公开版本来自经过脱敏的独立副本；原本机项目目录、其他副本和服务器上的文件不会自动与这个仓库同步。请从仓库克隆开发，避免把旧目录中的私有资料或凭据复制进来。

## 每次修改的流程

接受仓库协作邀请后，首次克隆：

```bash
git clone https://github.com/yukisuki7/EduEthos-AI.git
cd EduEthos-AI
```

开始一项修改时，先更新主分支，再创建自己的分支：

```bash
git switch main
git pull --ff-only origin main
git switch -c feat/improve-chat
```

修改后先运行与改动相关的检查，再提交并推送。提交前用 `git diff` 和 `git status` 检查文件范围，只暂存自己准备提交的文件。

```bash
git add <修改的文件路径>
git commit -m "改进聊天界面"
git push -u origin feat/improve-chat
```

在 GitHub 发起目标分支为 `main` 的 Pull Request，说明修改目的、实际变化和验证结果。`CI` 工作流会自动运行 `verify` 检查。由项目负责人审查并合并，不直接向 `main` 推送日常修改。主分支更新后，部署工作流会复用同一组检查，通过后才进入部署；也可以手动运行 `CI`，只检查而不上线。

如果主分支已有新提交，先把 `origin/main` 合并到自己的分支，解决冲突并重新检查，再推送。不要强制覆盖他人的分支或主分支。

## 修改哪些文件

| 内容 | 位置 |
| --- | --- |
| 前端页面、样式和交互 | `course-demo/dist/index.html`、`styles.css`、`app.js` 等；这些是当前直接维护的源码 |
| Node 自托管服务、账号与数据存储 | `course-demo/server/` |
| 模型问答、资料检索和兼容的 Worker 入口 | `course-demo/worker/` |
| 检查脚本 | `course-demo/scripts/` 与 `knowledge-base/runtime/check-retrieval.mjs` |
| 脱敏的运行检索资料 | `knowledge-base/runtime/generated/` 与 `course-demo/worker/documents.json` |

`worker/assets.mjs`、`dist/server/` 和 `dist/.openai/` 是构建产物，不需要提交。修改检索代码或资料时应保持知识库与部署副本一致；在 `course-demo` 中运行 `node scripts/sync-knowledge.mjs` 可从知识库同步部署副本。公开仓库没有原始资料，重新提取和生成需要具有使用权限的本地原件。

## 本地检查

使用 Node.js 22.22 或更新版本。在 `course-demo` 下执行：

```bash
node scripts/build-worker.mjs
node scripts/check-worker.mjs
node ../knowledge-base/runtime/check-retrieval.mjs
node scripts/check-account-isolation.mjs
node scripts/check-account-http.mjs
node scripts/check-account-ui.cjs
node scripts/check-answer-policy.mjs
node scripts/check-answer-ui.cjs
node scripts/check-auto-teaching.mjs
node scripts/check-demo-auth.mjs
node scripts/check-demo-ui.cjs
```

这些检查使用本地数据、临时数据库或模型桩，不需要生产密钥，也不调用真实模型。检查通过不能替代浏览器操作验证、真实模型回答质量、教学效果或长期运行验证。涉及界面行为的改动应补充实际操作说明；涉及数据库结构的改动应说明兼容性、备份和迁移方案。

## 上线与敏感文件

自动检查通过和合并代码不代表部署一定成功；合并后应查看部署工作流的结果，并访问网站验证本次修改。部署机制、初始化步骤和故障处理见 [持续部署说明](../course-demo/deploy/CONTINUOUS-DEPLOYMENT.md)。

密钥、密码、Cookie、私钥、数据库、聊天记录、原始教学资料及含个人信息的提取文本都不能提交。`.gitignore` 只能防止部分误操作，提交前仍需检查。服务器的模型密钥和现有用户数据由部署配置独立保留；同伴开发无需获取生产服务器密码。
