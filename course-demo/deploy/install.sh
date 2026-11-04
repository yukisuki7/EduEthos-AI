#!/usr/bin/env bash
# Run from an extracted release directory as root. No credentials in arguments.
set -euo pipefail
release_dir="$(pwd -P)"
case "$release_dir" in /opt/eduethos/releases/*) ;; *) echo 'Extract under /opt/eduethos/releases/<version> first.' >&2; exit 1;; esac
test -f server/index.mjs
test -x /usr/bin/node
getent passwd eduethos >/dev/null || useradd --system --home-dir /var/lib/eduethos --shell /usr/sbin/nologin eduethos
install -d -m 0755 /etc/eduethos /opt/eduethos
install -d -o eduethos -g eduethos -m 0700 /var/lib/eduethos
if ! test -f /etc/eduethos/eduethos.env; then
  install -m 0600 deploy/eduethos.env.example /etc/eduethos/eduethos.env
fi
install -m 0644 deploy/eduethos.service /etc/systemd/system/eduethos.service
install -m 0644 deploy/eduethos-proxy.service /etc/systemd/system/eduethos-proxy.service
install -m 0644 deploy/Caddyfile.ip /etc/eduethos/Caddyfile
/usr/bin/caddy validate --config /etc/eduethos/Caddyfile --adapter caddyfile
chown -R root:root "$release_dir"
chmod -R go-w "$release_dir"
ln -sfn "$release_dir" /opt/eduethos/current
systemctl daemon-reload
systemctl enable eduethos.service eduethos-proxy.service
systemctl restart eduethos.service
systemctl restart eduethos-proxy.service
echo 'Installed isolated application and dedicated HTTPS proxy. Existing Caddy :80 config was not changed.'
