# trackers-to-aria2

Cloudflare Workers 服务：把 `ngosang/trackerslist` 的换行分隔 tracker 列表转成逗号分隔，可直接给 aria2 用。

上游：`https://github.com/ngosang/trackerslist`，每天自动更新。

核心逻辑（`src/index.js`）：`split(/\r?\n/)` → `trim` → 去空行 → 去 `#` 行内注释（兼容 `blacklist.txt` 的 `url # reason` 格式） → 去重 → `join(",")`。

## 部署

```bash
npm install
npx wrangler login
npm run deploy   # 发布
npm run dev      # 本地预览 http://127.0.0.1:8787/
```

`wrangler.toml` 入口为 `src/index.js`。

## 用法

三种等价写法：

```text
/?list=<id>&format=<fmt>
/<id>?format=<fmt>
/aria2/<id>
```

系统路由：

| 路径 | 说明 |
|---|---|
| `/` | 默认 `list=all, format=comma`（兼容旧版） |
| `/aria2` | 默认 `list=all, format=aria2`（兼容旧版） |
| `/help` 或 `/?help` | 返回用法文本（`?help=0/false/no/off` 不触发，按普通请求处理） |
| `/health` | 返回 `ok` |

系统路由大小写不敏感，兼容尾斜杠（如 `/health/`、`/Aria2/best`）。`/aria2` 为精确匹配或 `aria2/` 前缀，强制 `format=aria2`。

`list` 也接受 `?type=` / `?file=` 别名参数；路径支持 `trackers_all_udp.txt`、`trackers-all-udp` 全名形式。

## list 变体

| id | 上游文件 | 说明 |
|---|---|---|
| `best` | `trackers_best.txt` | 最优 ~20 条 |
| `all` | `trackers_all.txt` | 全部，默认 |
| `all_udp` | `trackers_all_udp.txt` | 仅 UDP |
| `all_http` | `trackers_all_http.txt` | 仅 HTTP |
| `all_https` | `trackers_all_https.txt` | 仅 HTTPS |
| `all_ws` | `trackers_all_ws.txt` | WebSocket/WebTorrent |
| `all_i2p` | `trackers_all_i2p.txt` | 需 I2P Router |
| `all_yggdrasil` | `trackers_all_yggdrasil.txt` | 需 Yggdrasil Router |
| `best_ip` | `trackers_best_ip.txt` | 最优的 IP 版，免 DNS |
| `all_ip` | `trackers_all_ip.txt` | 全部的 IP 版 |
| `all_yggdrasil_ip` | `trackers_all_yggdrasil_ip.txt` | Yggdrasil IP 版 |
| `blacklist` | `blacklist.txt` | 黑名单（`url # reason` 格式，已自动去注释） |

别名：`udp→all_udp`、`http→all_http`、`https→all_https`、`ws→all_ws`、`i2p→all_i2p`、`ip→all_ip`、`yggdrasil→all_yggdrasil`、`yggdrasil_ip→all_yggdrasil_ip`。非法 `list` 返回 `400`。

## format 格式

| format | 输出 | 用途 |
|---|---|---|
| `comma`（默认） | `udp://a,http://b,...` | 通用逗号分隔 |
| `aria2` | `bt-tracker=udp://a,http://b,...` | 直接粘进 `aria2.conf` |
| `lines` | 换行分隔（已清洗去重） | 还原上游格式 |
| `json` | `{"list","file","count","trackers"}` | 程序调用 |

非法 `format` 返回 `400`。

## 示例

假设部署域名为 `https://trackers.example.workers.dev`：

```bash
# 默认全部，逗号分隔
curl 'https://trackers.example.workers.dev/'

# 仅 UDP，给 aria2 用
curl 'https://trackers.example.workers.dev/all_udp?format=aria2'
curl 'https://trackers.example.workers.dev/aria2/all_udp'
curl 'https://trackers.example.workers.dev/?list=udp&format=aria2'

# 最优 + JSON
curl 'https://trackers.example.workers.dev/?list=best&format=json'
curl 'https://trackers.example.workers.dev/best_ip?format=json'
```

aria2 用法（二选一）：

```bash
# 1. 启动参数
aria2c --bt-tracker="$(curl -s 'https://trackers.example.workers.dev/all?format=comma')" ...

# 2. 写入 aria2.conf
curl -s 'https://trackers.example.workers.dev/best?format=aria2' >> aria2.conf
```

## 行为说明

- 上游经 `fetch` + `cf: { cacheEverything: true, cacheTtlByStatus: { "200-299": 43200, "404": 60, "500-599": 0 } }` 边缘缓存：成功响应 12h，404 只缓 60s，5xx 不缓存；成功响应带 `cache-control: public, max-age=43200` 和 `access-control-allow-origin: *`。
- 只允许 `GET` / `HEAD`（`HEAD` 统一空 body），其他方法 `405`（带 `Allow: GET, HEAD`）；上游非 2xx 返回 `502`，网络异常返回 `500`；错误响应带 `access-control-allow-origin: *` + `cache-control: no-store`。
- 白名单限定 12 个上游文件，防止 SSRF。
