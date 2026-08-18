# 匿名安装统计使用说明

## 当前接口

- Worker：`https://mnrails-telemetry.mr-wuyzhn.workers.dev/`
- 健康检查：`GET /health`，正常应返回 HTTP 200。
- 匿名上报：`POST /ping`，合法写入正常应返回 HTTP 204。
- D1 数据库：`mnrails-telemetry-db`
- Worker Binding：`DB`

插件只发送 `schema`、随机 `install_id`、插件 `version` 和 `channel`。正式版和 Beta 使用相同的本地键保存安装 ID；切换版本或渠道不会新增安装实例。上报最多每 12 小时一次，仅 HTTP 204 后更新时间，8 秒超时或任何失败都静默，不影响更新检查或插件功能。

## 在 Cloudflare 控制台查询

登录 Cloudflare Dashboard，进入 **Storage & databases → D1 SQL database → mnrails-telemetry-db → Console**，粘贴下方 SQL 并执行。

也可使用 Wrangler 查询远程数据库：

```powershell
npx wrangler login
npx wrangler d1 execute mnrails-telemetry-db --remote --command "SELECT COUNT(*) AS total FROM installations"
```

务必保留 `--remote`；否则查询的可能是本地开发数据库。

## 常用统计 SQL

累计安装实例：

```sql
SELECT COUNT(*) AS total_installations
FROM installations;
```

累计、24 小时、7 日和 30 日活跃汇总：

```sql
SELECT
  COUNT(*) AS total_installations,
  SUM(last_seen >= unixepoch() - 86400) AS active_24h,
  SUM(last_seen >= unixepoch() - 7 * 86400) AS active_7d,
  SUM(last_seen >= unixepoch() - 30 * 86400) AS active_30d
FROM installations;
```

当前 Stable/Beta 分布：

```sql
SELECT channel, COUNT(*) AS installations
FROM installations
GROUP BY channel
ORDER BY installations DESC;
```

30 日活跃安装的 Stable/Beta 分布：

```sql
SELECT channel, COUNT(*) AS active_30d
FROM installations
WHERE last_seen >= unixepoch() - 30 * 86400
GROUP BY channel
ORDER BY active_30d DESC;
```

当前版本分布：

```sql
SELECT version, channel, COUNT(*) AS installations
FROM installations
GROUP BY version, channel
ORDER BY installations DESC, version DESC;
```

最近活跃的安装实例（排查数据时使用）：

```sql
SELECT
  install_id,
  version,
  channel,
  datetime(first_seen, 'unixepoch') AS first_seen_utc,
  datetime(last_seen, 'unixepoch') AS last_seen_utc
FROM installations
ORDER BY last_seen DESC
LIMIT 50;
```

按首次出现日期统计新增安装实例：

```sql
SELECT
  date(first_seen, 'unixepoch') AS day_utc,
  COUNT(*) AS new_installations
FROM installations
GROUP BY day_utc
ORDER BY day_utc DESC
LIMIT 30;
```

## 接口自检

PowerShell：

```powershell
Invoke-WebRequest "https://mnrails-telemetry.mr-wuyzhn.workers.dev/health" -UseBasicParsing

$body = @{
  schema = 1
  install_id = "00000000-0000-4000-8000-000000000000"
  version = "telemetry-smoke-test"
  channel = "stable"
} | ConvertTo-Json -Compress

Invoke-WebRequest "https://mnrails-telemetry.mr-wuyzhn.workers.dev/ping" `
  -Method Post -ContentType "application/json" -Body $body -UseBasicParsing
```

本次交付自检已经写入上述固定 ID 的测试记录。验证完后可清除，避免计入正式统计：

```powershell
npx wrangler d1 execute mnrails-telemetry-db --remote --command "DELETE FROM installations WHERE install_id = '00000000-0000-4000-8000-000000000000'"
```

## 指标含义

- 累计安装实例：至少成功运行并上报过一次的匿名插件实例，不等于下载次数或自然人数。
- 活跃安装实例：`last_seen` 落在对应时间窗口内的安装实例。
- 卸载后保留设置再安装通常仍算同一实例；清空插件/系统设置后会生成新 ID，可能造成少量重复。
- 下载但从未运行插件的安装包不会进入统计。
