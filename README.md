# trackers-to-aria2

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/tidexe/trackers-to-aria2)

把 `ngosang/trackerslist` 的换行分隔 tracker 列表转成逗号分隔，开箱即用，可直接喂给 aria2。

**在线 Demo：<https://trackers-to-aria2.tidex.workers.dev>**

> [!NOTE]
> 上游为 [`ngosang/trackerslist`](https://github.com/ngosang/trackerslist)，每天自动更新。本服务只做清洗与格式转换，不存储数据。

## 特性

- 零依赖单文件 Worker，入口为 `src/index.js`
- 清洗去重：按行切分 → 去空行 → 去 `#` 行内注释 → 去重（兼容 `blacklist.txt` 的 `url # reason` 格式）
- 两种等价调用写法，支持 `aria2.conf` 直粘格式与 JSON 程序调用
- 边缘缓存 12 小时，CORS 全开，`curl` 一行即可用

## 快速开始

在线 Demo 为 `https://trackers-to-aria2.tidex.workers.dev`，可直接试：

```bash
# 根路径返回使用提示
curl 'https://trackers-to-aria2.tidex.workers.dev/'

# 全部，逗号分隔
curl 'https://trackers-to-aria2.tidex.workers.dev/all'

# 最优 20 条，直接写入 aria2.conf
curl -s 'https://trackers-to-aria2.tidex.workers.dev/best?format=aria2' >> aria2.conf

# 启动时动态注入
aria2c --bt-tracker="$(curl -s 'https://trackers-to-aria2.tidex.workers.dev/all_udp?format=comma')" ...
```

## 用法

两种等价写法：

```text
/?list=<id>&format=<fmt>
/<id>?format=<fmt>
```

根路径 `/`（无路径、无 `list`/`type`/`file` 参数）返回使用提示（与 `/help` 相同）；带路径或 `list` 参数才输出 tracker。例外：`?help=0/false/no/off` 显式放行时按默认 `all` 输出；`?format` 非法时直接 `400`。

### 系统路由

| 路径 | 说明 |
| --- | --- |
| `/` | 返回使用提示（与 `/help` 相同） |
| `/help` 或 `/?help` | 返回用法文本 |
| `/health` | 返回 `ok` |
| `/robots.txt` | 返回 `Disallow: /`，拒绝爬虫 |

> [!TIP]
> - 路由大小写不敏感，兼容尾斜杠，如 `/health/`、`/HELP`。
> - `aria2` 不是合法 `list` id（`/aria2` 返回 `400`），输出 aria2 格式请用 `?format=aria2`。
> - `?help=0/false/no/off` 不触发帮助，按普通请求处理。
> - `list` 也接受 `?type=` / `?file=` 参数；路径支持 `trackers_all_udp.txt`、`trackers-all-udp` 全名形式。

## list 变体

| id | 上游文件 | 说明 |
| --- | --- | --- |
| `best` | `trackers_best.txt` | 最优约 20 条，推荐 |
| `all` | `trackers_all.txt` | 全部 |
| `all_udp` | `trackers_all_udp.txt` | 仅 UDP，推荐给 aria2 |
| `all_http` | `trackers_all_http.txt` | 仅 HTTP |
| `all_https` | `trackers_all_https.txt` | 仅 HTTPS |
| `all_ws` | `trackers_all_ws.txt` | WebSocket / WebTorrent |

<details>
<summary>更多变体（IP 版、特殊网络、黑名单）</summary>

| id | 上游文件 | 说明 |
| --- | --- | --- |
| `best_ip` | `trackers_best_ip.txt` | 最优的 IP 版，免 DNS |
| `all_ip` | `trackers_all_ip.txt` | 全部的 IP 版 |
| `all_i2p` | `trackers_all_i2p.txt` | 需 I2P Router |
| `all_yggdrasil` | `trackers_all_yggdrasil.txt` | 需 Yggdrasil Router |
| `all_yggdrasil_ip` | `trackers_all_yggdrasil_ip.txt` | Yggdrasil IP 版 |
| `blacklist` | `blacklist.txt` | 黑名单，已自动去 `#` 注释 |

</details>

### 别名

| 别名 | 等价于 |
| --- | --- |
| `udp` | `all_udp` |
| `http` | `all_http` |
| `https` | `all_https` |
| `ws` | `all_ws` |
| `i2p` | `all_i2p` |
| `ip` | `all_ip` |
| `yggdrasil` | `all_yggdrasil` |
| `yggdrasil_ip` | `all_yggdrasil_ip` |

> [!WARNING]
> 只有白名单内的 12 个上游文件允许访问（防 SSRF），非法 `list` 返回 `400`。
> `list` 会规范化：转小写、`-` 转 `_`、去 `.txt` 后缀与 `trackers_` 前缀。

## format 格式

| format | 输出示例 | 用途 |
| --- | --- | --- |
| `comma`（默认） | `udp://a,http://b,...` | 通用逗号分隔 |
| `aria2` | `bt-tracker=udp://a,http://b,...` | 直接粘进 `aria2.conf` |
| `lines` | 换行分隔，已清洗去重 | 还原上游格式 |
| `json` | `{"list","file","count","trackers"}` | 程序调用 |

非法 `format` 返回 `400`。

## 示例

```bash
# 仅 UDP，给 aria2 用（两种写法等价）
curl 'https://trackers-to-aria2.tidex.workers.dev/all_udp?format=aria2'
curl 'https://trackers-to-aria2.tidex.workers.dev/?list=udp&format=aria2'

# 最优 + JSON
curl 'https://trackers-to-aria2.tidex.workers.dev/?list=best&format=json'
curl 'https://trackers-to-aria2.tidex.workers.dev/best_ip?format=json'
```

## 行为说明

**缓存**

- 上游 `fetch` 走边缘缓存：`2xx` 缓 12h，`404` 只缓 60s，`5xx` 不缓存。
- 成功响应：`cache-control: public, max-age=43200` + `access-control-allow-origin: *`。
- 错误响应：`cache-control: no-store` + `access-control-allow-origin: *`。

**请求与错误码**

| 情况 | 状态码 |
| --- | --- |
| 只允许 `GET` / `HEAD`（`HEAD` 统一空 body），其他方法带 `Allow: GET, HEAD` | `405` |
| 非法 `list` / `format` | `400` |
| 上游非 2xx | `502` |
| 网络异常 | `500` |

## 部署

```bash
npm install
npx wrangler login
npm run deploy   # 发布
npm run dev      # 本地预览 http://127.0.0.1:8787/
```

`wrangler.toml` 入口为 `src/index.js`，保持单文件零依赖。
