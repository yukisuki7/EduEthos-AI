# 腾讯云自托管账号版

## 当前部署

- 服务器：Ubuntu 24.04，上海，`203.0.113.10`。
- 源码：`/opt/eduethos/releases/20261103-accounts`，当前指针 `/opt/eduethos/current`。
- 进程：`eduethos.service`，仅监听 `127.0.0.1:8767`。
- 数据库：`/var/lib/eduethos/eduethos.sqlite`；包含用户、会话、班级成员和用户学习状态。升级源码不覆盖它。
- 环境：`/etc/eduethos/eduethos.env`，root 权限 `0600`；模型密钥不进入源码或网页。
- HTTPS：独立 `eduethos-proxy.service` 监听 TCP 443，Caddy 为公网 IP 申请 Let's Encrypt `shortlived` 证书并自动续期；不改现有 `/etc/caddy/Caddyfile` 和 HTTP 80 应用。保持443对证书验证服务器可达。
- 2026-11-03 已完成公网 HTTPS 验收：TCP443放行后，Let's Encrypt IP证书签发成功；Windows客户端验证证书并返回HTTP200。Caddy配置`default_sni`以兼容浏览器访问IP时不发送SNI的行为。
- DeepSeek密钥已写入服务器root专用0600配置文件；通过HTTPS授权请求得到真实`deepseek-flash`模型回答。未把密钥写入本地源码、静态文件或发布包。
- 公网API已验证A/B私有状态、伪造归属拒绝、跨标签身份拒绝、教师班级范围和授权撤销、退出会话失效；真实浏览器验证学生登录、恢复服务端历史和退出回登录页。临时3个账号及2个班级已按确切ID清理，仅保留正式管理员。

## 本地运行

需要 Node 22.22+（使用内置 `node:sqlite`，该版本会输出实验功能提示）。数据、部署凭据与临时文件均位于项目内的忽略目录，不应加入源码。

PowerShell：

```powershell
$env:PUBLIC_ORIGIN='http://127.0.0.1:8767'
$env:DATABASE_PATH="$PWD/runtime/eduethos.sqlite"
node server/manage.mjs bootstrap-admin admin 管理员
node server/index.mjs
```

创建管理员时输入隐藏密码。密码不放在命令参数中。用管理员登录后，管理页可创建个人学生/教师账号、创建班级，再把学生和教师分配到同一班级。移除教师的班级分配后，后续统计请求立即按新权限处理。

每个账号保留最近20个对话、每个40轮；教师统计范围是被授权班级学生仍保留的记录，既不是完整审计日志，也不表示真实学习掌握程度。服务器没有把共享体验账号迁成个人身份。

## 服务检查与维护

```bash
sudo systemctl status eduethos eduethos-proxy --no-pager
curl -s http://127.0.0.1:8767/api/health
sudo journalctl -u eduethos --since '-15 min' --no-pager
sudo journalctl -u eduethos-proxy --since '-15 min' --no-pager
sudo systemctl restart eduethos
sudo systemctl restart eduethos-proxy
```

代理关闭了管理 API，因此更改配置后使用 `restart`，不要对它执行默认 `caddy reload`（机器上的2019管理端口属于原有Caddy进程）。IP HTTPS与原HTTP服务是两个不同入口；不要用HTTP登录账号。

模型密钥已配置；后续更换时，在 `/etc/eduethos/eduethos.env` 修改 `DEEPSEEK_API_KEY` 并重启应用。`/api/health` 的 `configured` 应为 `true`，随后用授权账号做一次真实问答。不得把其他项目的模型密钥自动挪用到此服务。

## 备份与恢复

用 Python 标准库创建一致的 SQLite 在线备份，不能在运行时只复制主数据库而漏掉 WAL：

```bash
sudo -u eduethos python3 - <<'PY'
import sqlite3, datetime, pathlib
folder = pathlib.Path('/var/lib/eduethos/backups')
folder.mkdir(mode=0o700, exist_ok=True)
target = folder / ('eduethos-' + datetime.datetime.now().strftime('%Y%m%d-%H%M%S') + '.sqlite')
with sqlite3.connect('/var/lib/eduethos/eduethos.sqlite') as source, sqlite3.connect(target) as destination:
    source.backup(destination)
print('Backup created:', target.name)
PY
```

应把备份另存到服务器之外的受控位置；同机备份不能防整机丢失。恢复前停应用、另存当前数据库及其WAL/SHM，验证备份完整性和文件属主，再替换恢复并启动；恢复同时会恢复备份中的账号、会话和授权，必须复核。当前未配置自动异地备份或执行恢复演练。

## 验证与边界

```bash
node scripts/check-account-isolation.mjs
node scripts/check-account-http.mjs
node scripts/check-account-ui.cjs
```

覆盖独立账号、跨账号访问/写入、教师班级范围及撤销、角色与平台Header伪造、会话过期/登出撤销、跨源请求、并发版本和页面切号。教师可见被授权学生的提问原文与反馈，学生需知晓这个范围。数据库和根服务器管理员仍能管理数据，这不是对服务器所有者的加密隔离。尚未完成大规模并发、长期运行、真实班级教学评测。

公开运营需处理腾讯云中国内地服务器备案及域名规划： https://cloud.tencent.cn/document/product/243/18910 。IP HTTPS证书只解决传输加密，不替代备案。IP证书与Caddy配置依据： https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability 和 https://caddyserver.com/docs/caddyfile/directives/tls 。
