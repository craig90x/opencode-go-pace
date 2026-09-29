# opencode-go-pace

给 [opencode.ai](https://opencode.ai) Console 的 **Go 套餐 usage 进度条**叠一条「时间已过」刻度 —— 一眼看出用量速度是偏快还是偏慢。

```
Rolling usage  4%  [-66pt]                 Resets in 1h 31m
██░░░░░░░░░░░░|░░░░░░░░░░░░░░░░░░░░░░░░░
               ↑ 时间已过 71.2%
```

| 元素 | 含义 |
|---|---|
| 绿色填充 | 用量进度（usage %） |
| 竖线 | 同一窗口内「时间已过」进度 |
| `-66pt` | 用量% − 时间%；**正数（红）= 用太快**，**负数（绿）= 用太慢**，灰 = 基本同步 |

## 安装

1. 给浏览器装 [Tampermonkey](https://www.tampermonkey.net/)（Chrome / Edge / Firefox 均可）
2. 点开 [`opencode-go-pace.user.js`](./opencode-go-pace.user.js) → Tampermonkey 会弹出安装页 → 安装
   （也可以新建脚本后整段粘贴）
3. 打开 opencode.ai Console 的 **Go** 页，刻度自动出现

脚本按 `https://opencode.ai/console/*` 生效，只改前端渲染。

## 原理

Console 的 Go 页本身会请求同源接口：

```
GET /console/api/go/status        # 需要 x-org-id 头 + 登录态
```

返回每条 meter 的精确窗口与用量：

```json
{
  "access": {
    "meters": {
      "fiveHour": { "startsAt": "...", "resetsAt": "...", "limitMicroCents": 1200000000, "usedMicroCents": 44462449 },
      "week":     { "startsAt": "...", "resetsAt": "...", "limitMicroCents": 3000000000, "usedMicroCents": 134688769 },
      "month":    { "resetsAt": "...", "limitMicroCents": 6000000000, "usedMicroCents": 134688769 }
    }
  }
}
```

脚本复用这个接口（同源、自带 cookie，无需额外凭据），所以时间刻度是

```
timeFrac = (now - startsAt) / (resetsAt - startsAt)
```

用**真实窗口起止**算出来的，不靠硬编码「5h / 7d / 30d」。

DOM 锚点：三条 `[role="progressbar"]`，`aria-label` 分别是 `Rolling usage used` / `Weekly usage used` / `Monthly usage used`；fill 宽度用 `flex: N 1 0%`。接口拿不到时回退到 `aria-valuenow` + 行头 `span[title]` 的 reset 时刻 + 已知周期长度。

## 限制

- 纯前端注入，不发任何外部请求
- 依赖上面那两个锚点；opencode 改版后可能失效，改版后按真实 DOM 重新定位即可
- 需要处于 console 登录态

## License

MIT
