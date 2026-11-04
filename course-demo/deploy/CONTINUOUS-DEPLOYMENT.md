# 合并后自动部署

日常流程：同伴从 `main` 创建分支 → 提交 Pull Request → `verify` 检查通过 → 负责人审查并合并 → `Deploy` 检查并上线 → 查看运行结果和网站。

协作命令见 [项目协作](../../docs/COLLABORATION.md)。本项目当前直接维护 `dist/` 下的前端文件；自托管入口为 `server/index.mjs`。

## 自动化如何工作

- `.github/workflows/ci.yml` 在 PR 中检查，也由部署流程复用。使用 Node 22.22.3，不读取生产密钥或调用付费模型。
- `.github/workflows/deploy.yml` 仅允许 `main` 上的 push 或手动运行部署，检查失败不上线。较旧提交发现主分支已更新时跳过，由新提交的运行部署。
- `production` 环境只允许 `main`；部署密钥在该环境的 Secrets 中。部署任务串行执行，服务器也有独占锁。
- 发送包只含 Git 已跟踪的 `course-demo/dist`、`server`、`worker`。知识库部署副本已在 `worker/documents.json`，原件不进入服务器发布包。
- SSH 专用用户为 `eduethos-deploy`，密钥被限定为固定接收程序，不能打开交互终端、转发端口或执行任意命令。
- 服务器上的接收程序固定安装为 root 所有的 `/usr/local/sbin/eduethos-github-deploy`；它只接收普通应用文件，拒绝路径穿越、链接、私有配置和超大包，不以 root 执行新应用代码。
- 应用代码发布到 `/opt/eduethos/releases/<时间>-<提交>`；先创建 SQLite 一致性备份，再原子切换 `/opt/eduethos/current`，以原 `eduethos` 服务用户启动。
- 健康检查验证账号隔离模式、知识片段、模型配置状态和实际运行目录。失败时切回上一版代码并重启。

数据库 `/var/lib/eduethos/eduethos.sqlite`、环境配置 `/etc/eduethos/eduethos.env` 和 HTTPS/Caddy 配置保持独立，普通代码部署不覆盖它们。部署不会执行 `deploy/install.sh`，避免公开模板中的示例地址覆盖真实代理配置。

## 初始化与维护

初始化需要服务器管理权限：安装固定接收程序，创建专用用户和受限 SSH key，配置精确 sudo 规则，将 SSH 私钥及经过核实的服务器主机公钥加入 GitHub `production` 环境，再开启主分支保护。不能把私钥、密码或生产配置写入仓库。

环境 Secrets：`DEPLOY_HOST`、`DEPLOY_PORT`、`DEPLOY_USER`、`DEPLOY_SSH_KEY`、`DEPLOY_KNOWN_HOSTS`。主机公钥必须从可信的现有 SSH 连接核实，工作流不临时信任 `ssh-keyscan` 结果。

主分支保护应要求 PR、至少一位审查者和 `verify` 检查，禁用强推和删除。仓库拥有者仍应审查工作流、部署程序、账号权限和数据库相关改动。修改仓库中的接收程序不会自动覆盖服务器上的固定副本，升级它需要管理员审查后单独安装。

## 查看上线结果

打开仓库 **Actions → Deploy → 最近一次运行**。`checks` 和 `deploy-production` 成功才代表本次自动化完成；运行摘要包含部署提交。网站需要额外验证本次实际修改，自动检查不代表真实模型质量或教学效果已验证。

服务器管理员可执行：

```bash
sudo systemctl status eduethos --no-pager
sudo journalctl -u eduethos --since '-15 min' --no-pager
sudo cat /opt/eduethos/current/release.json
```

更新后现有浏览器需要刷新；已经打开的页面不会主动热更新。普通重启可能造成短暂中断。

## 回退与数据

上线前备份位于 `/var/backups/eduethos/`，仅 root 可读。程序回退不自动恢复数据库，避免覆盖上线期间的新数据。数据库结构变更必须另写迁移、兼容和恢复方案；旧代码可能无法读取新结构，不能把代码回退当成通用的数据回退。

备份与历史版本暂不自动删除，需要维护磁盘占用。备份仍在同一台服务器，不是异地灾备，也不代替恢复演练。可在不接触生产数据的 Linux 环境运行 `python3 course-demo/scripts/check-deployment.py` 检查归档边界、WAL 数据备份和失败回退逻辑。
