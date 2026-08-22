# 腾讯 CloudBase 匿名统计中转部署

目标链路：

```text
MarginNote 插件 -> CloudBase /ping -> Cloudflare Worker -> D1
                         失败 -> Cloudflare /ping（插件备用）
```

中转代码位于 `cloudbase/telemetry-relay/`。它是 Node.js 18 HTTP 云函数，使用原生 HTTP 服务监听 `9000`，无需第三方依赖。它会限制请求体为 1 KiB，校验并只转发 `schema`、`install_id`、`version`、`channel`，等待上游响应；上游返回 `204` 时返回 `204`，超时返回 `504`，其他上游失败返回 `502`。

## 1. 准备中转密钥

在 PowerShell 生成随机密钥：

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$relaySecret = [Convert]::ToBase64String($bytes)
$relaySecret
```

把密钥临时保存到密码管理器。不要写入源码、插件或 Git。

## 2. 配置 Cloudflare Worker

推荐给现有 Worker 增加专用的 `POST /relay/ping`，并保留公开 `POST /ping` 兼容旧插件。专用入口先校验请求头：

```js
if (url.pathname === "/relay/ping") {
  if (
    request.method !== "POST" ||
    request.headers.get("X-Telemetry-Relay-Secret") !== env.TELEMETRY_RELAY_SECRET
  ) {
    return new Response(null, { status: 403 });
  }

  // 通过后复用现有 /ping 的校验和 D1 写入逻辑。
}
```

在 Worker 项目目录执行并粘贴第 1 步生成的同一个值：

```powershell
npx wrangler secret put TELEMETRY_RELAY_SECRET
npx wrangler deploy
```

也可以在 Cloudflare Dashboard 的 Worker **Settings -> Variables and Secrets** 中新增类型为 Secret 的 `TELEMETRY_RELAY_SECRET`。不要把密钥放进 `wrangler.toml` 的普通变量。

当前仓库不包含 Worker 源码，因此这里无法替你合并路由。CloudBase 代码默认先转发现有的公开 `/ping`，便于先打通链路；完成专用路由后，在 CloudBase 中把 `TELEMETRY_WORKER_URL` 设置成：

```text
https://mnrails-telemetry.mr-wuyzhn.workers.dev/relay/ping
```

## 3. 创建 CloudBase HTTP 云函数

1. 登录腾讯云 CloudBase 控制台，选择环境，进入 **云函数 -> 新建云函数**。
2. 函数名称填写 `mnrails-telemetry-relay`，类型选择 **HTTP 云函数**。
3. 运行时选择 **Node.js 18.15**，内存 128 MiB 或 256 MiB，函数超时设为 5 秒。
4. 上传 `cloudbase/telemetry-relay/` 目录中的三个文件：`index.js`、`package.json`、`scf_bootstrap`。代码没有 npm 依赖，不需要上传 `node_modules`。
5. 确保 `scf_bootstrap` 使用 LF 换行并有可执行权限。若控制台的 HTTP 函数模板已带启动脚本，保留模板脚本并确认内容为：

   ```bash
   #!/bin/bash
   /var/lang/node18/bin/node index.js
   ```

6. 添加环境变量：

   | 名称 | 值 |
   | --- | --- |
   | `TELEMETRY_RELAY_SECRET` | 第 1 步生成的密钥 |
   | `TELEMETRY_WORKER_URL` | `https://mnrails-telemetry.mr-wuyzhn.workers.dev/relay/ping`；专用路由未上线时暂填现有 `/ping` |

7. 保存并部署。部署后查看一次函数日志，确认服务已监听 `0.0.0.0:9000` 且无启动错误。

## 4. 配置 HTTP 网关路由

1. 进入 CloudBase **HTTP 网关**（旧控制台名称为“HTTP 访问服务”）。
2. 新建“域名关联资源”：资源选择 `mnrails-telemetry-relay`，域名先选择 CloudBase 默认域名，触发路径填写 `/ping`。
3. 等待路由生效，记录完整地址，例如：

   ```text
   https://your-env-id.region.app.tcloudbase.com/ping
   ```

生产长期使用建议绑定已备案的自定义域名。函数的“限额设置”中建议先设一个符合安装量的保守 QPS 上限，并观察 429、502、504 和调用量后再调整。

## 5. 验证中转链路

把地址替换为实际 CloudBase 地址：

```powershell
$relayUrl = "https://你的CloudBase域名/ping"
$body = @{
  schema = 1
  install_id = "00000000-0000-4000-8000-000000000000"
  version = "relay-test"
  channel = "stable"
} | ConvertTo-Json -Compress

$response = Invoke-WebRequest $relayUrl `
  -Method Post `
  -ContentType "application/json" `
  -Body $body `
  -UseBasicParsing

$response.StatusCode
```

预期为 `204`。再验证防护：

```powershell
Invoke-WebRequest $relayUrl -Method Get -SkipHttpErrorCheck
Invoke-WebRequest $relayUrl -Method Post -ContentType "application/json" -Body '{}' -SkipHttpErrorCheck
```

预期分别为 `405` 和 `400`。如果合法请求返回 `502`，检查 Worker 路由、密钥是否一致和 CloudBase 出网日志；返回 `504` 表示 3 秒内未收到 Worker 响应；返回 `500` 通常表示 CloudBase 未配置 `TELEMETRY_RELAY_SECRET`。

## 6. 把 CloudBase 地址写入插件构建

插件构建时通过环境变量注入主地址，源码和安装包中不包含中转密钥：

```powershell
$env:TELEMETRY_RELAY_ENDPOINT = "https://你的CloudBase域名/ping"
pnpm check
pnpm test
pnpm build
Remove-Item Env:TELEMETRY_RELAY_ENDPOINT
```

构建后的插件依次请求 CloudBase 主地址和 Cloudflare 备用地址。任一地址返回 `204` 才更新本地成功时间；两者均失败时静默结束。

可检查构建产物是否包含地址：

```powershell
Select-String -Path .\dist\mn4-answer-matcher\main.js -Pattern "你的CloudBase域名" -SimpleMatch
```

最后清理固定测试 ID，避免计入正式统计：

```powershell
npx wrangler d1 execute mnrails-telemetry-db --remote --command "DELETE FROM installations WHERE install_id = '00000000-0000-4000-8000-000000000000'"
```

## 7. 上线前检查

- CloudBase 合法请求稳定返回 `204`，默认域名没有安全提示页或鉴权跳转。
- Worker `/relay/ping` 使用 Secret 校验，CloudBase 和 Worker 的密钥一致。
- CloudBase 环境变量和日志中不打印请求体、安装 ID或密钥。
- CloudBase 已设置请求/调用限额，并开启 5xx、超时和调用量告警。
- 使用注入了 `TELEMETRY_RELAY_ENDPOINT` 的正式构建产物，而不是未注入地址的旧包。
