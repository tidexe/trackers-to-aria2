const BASE =
  "https://raw.githubusercontent.com/ngosang/trackerslist/master";

// 白名单：只允许上游已存在的变体，防止 SSRF
const LISTS = {
  best: "trackers_best.txt",
  all: "trackers_all.txt",
  all_udp: "trackers_all_udp.txt",
  all_http: "trackers_all_http.txt",
  all_https: "trackers_all_https.txt",
  all_ws: "trackers_all_ws.txt",
  all_i2p: "trackers_all_i2p.txt",
  all_yggdrasil: "trackers_all_yggdrasil.txt",
  best_ip: "trackers_best_ip.txt",
  all_ip: "trackers_all_ip.txt",
  all_yggdrasil_ip: "trackers_all_yggdrasil_ip.txt",
  blacklist: "blacklist.txt",
};

// 别名 -> 规范 id
const ALIASES = {
  udp: "all_udp",
  http: "all_http",
  https: "all_https",
  ws: "all_ws",
  i2p: "all_i2p",
  yggdrasil: "all_yggdrasil",
  ip: "all_ip",
  yggdrasil_ip: "all_yggdrasil_ip",
};

function normalizeList(raw) {
  if (!raw) return "all";
  let s = raw.trim().toLowerCase().replace(/\.txt$/, "").replace(/-/g, "_");
  // 兼容 trackers_best / trackers-all-udp 这类全名
  s = s.replace(/^trackers_/, "");
  if (s === "" || s === "aria2") return "all";
  if (LISTS[s]) return s;
  if (ALIASES[s]) return ALIASES[s];
  return null;
}

function helpText() {
  return [
    "trackers-to-aria2",
    "",
    "Usage:",
    "  /?list=<id>&format=<fmt>   /<id>?format=<fmt>   /aria2/<id>",
    "",
    "list id:",
    `  ${Object.keys(LISTS).join(", ")}`,
    `  aliases: ${Object.keys(ALIASES).join(", ")}`,
    "",
    "format:",
    "  comma (default): udp://a,http://b,...",
    "  aria2: bt-tracker=udp://a,http://b,...",
    "  lines: 原始换行格式（清洗后）",
    "  json: {\"list\",\"file\",\"count\",\"trackers\"}",
    "",
    "Examples:",
    "  /?list=all_udp",
    "  /best?format=aria2",
    "  /aria2/all_udp",
    "  /?list=best_ip&format=json",
  ].join("\n");
}

// 错误响应：统一带 CORS + no-store，避免浏览器缓存坏响应；HEAD 显式空 body
function errorRes(body, status, method) {
  return new Response(method === "HEAD" ? null : body, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method;
    const isHead = method === "HEAD";

    if (method !== "GET" && method !== "HEAD") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
          "access-control-allow-origin": "*",
          allow: "GET, HEAD",
        },
      });
    }

    // 系统路由：大小写不敏感，兼容尾斜杠（pathname 已去首尾斜杠）
    const pathname = url.pathname.replace(/^\/+|\/+$/g, "");
    const lowerPath = pathname.toLowerCase();
    if (lowerPath === "health") {
      return new Response(isHead ? null : "ok", {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "access-control-allow-origin": "*",
        },
      });
    }
    // ?help 空值/真值才出帮助；?help=0/false/no/off 视为普通请求放行
    const helpVal = url.searchParams.get("help");
    const wantHelp =
      lowerPath === "help" ||
      (helpVal !== null &&
        !["0", "false", "no", "off"].includes(helpVal.trim().toLowerCase()));
    if (wantHelp) {
      return new Response(isHead ? null : helpText() + "\n", {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "access-control-allow-origin": "*",
        },
      });
    }

    // ---- 解析 list ----
    let format = (url.searchParams.get("format") || "").trim().toLowerCase();

    // 兼容旧路由 /aria2：精确匹配或 aria2/ 前缀，大小写不敏感
    let listRaw = url.searchParams.get("list") ||
      url.searchParams.get("type") ||
      url.searchParams.get("file");

    const isAria2Route =
      lowerPath === "aria2" || lowerPath.startsWith("aria2/");
    if (isAria2Route) {
      if (!format) format = "aria2";
      const rest = pathname.slice("aria2".length).replace(/^\/+/, "");
      if (!listRaw) listRaw = rest || "all";
    } else if (!listRaw) {
      listRaw = pathname || "all";
    }
    if (!format) format = "comma";
    if (!["comma", "aria2", "lines", "json"].includes(format)) {
      return errorRes(
        `Invalid format=${format}, expected: comma|aria2|lines|json\n`,
        400,
        method
      );
    }

    const id = normalizeList(listRaw);
    if (!id) {
      return errorRes(
        `Invalid list=${listRaw}, expected one of: ${Object.keys(LISTS).join(", ")} (aliases: ${Object.keys(ALIASES).join(", ")})\n`,
        400,
        method
      );
    }

    const upstream = `${BASE}/${LISTS[id]}`;
    try {
      const upstreamRes = await fetch(upstream, {
        // cacheEverything 必须保留（txt 默认不一定被边缘缓存）；
        // cacheTtlByStatus 让 2xx 缓 12h、404 只缓 60s、5xx 不缓存，
        // 避免一次上游抖动被缓存半天
        cf: {
          cacheEverything: true,
          cacheTtlByStatus: { "200-299": 43200, 404: 60, "500-599": 0 },
        },
      });
      if (!upstreamRes.ok) {
        return errorRes(`Upstream error: ${upstreamRes.status}`, 502, method);
      }
      const text = await upstreamRes.text();

      // 核心：换行 -> 数组，去空行、去 `#` 行内注释、去空格、去重
      // 兼容 blacklist.txt 的 `udp://... # reason` 格式；其它纯 URL 文件不受影响
      const trackers = [
        ...new Set(
          text
            .split(/\r?\n/)
            .map((s) => {
              s = s.trim();
              if (!s || s.startsWith("#")) return "";
              const hash = s.indexOf("#");
              if (hash !== -1) s = s.slice(0, hash).trim();
              return s;
            })
            .filter(Boolean)
        ),
      ];

      let body, contentType = "text/plain; charset=utf-8";
      if (format === "aria2") {
        body = `bt-tracker=${trackers.join(",")}`;
      } else if (format === "lines") {
        body = trackers.length ? trackers.join("\n") + "\n" : "";
      } else if (format === "json") {
        contentType = "application/json; charset=utf-8";
        body = JSON.stringify(
          { list: id, file: LISTS[id], count: trackers.length, trackers },
          null,
          2
        );
      } else {
        body = trackers.join(","); // comma，aria2 直接可用
      }

      return new Response(isHead ? null : body, {
        headers: {
          "content-type": contentType,
          "cache-control": "public, max-age=43200",
          "access-control-allow-origin": "*",
        },
      });
    } catch (e) {
      return errorRes(`Fetch failed: ${e?.message || e}`, 500, method);
    }
  },
};
