# opencode-go-pace

给 [opencode.ai](https://opencode.ai) Console 的 **Go 套餐 usage 进度条**叠一条「时间已过」刻度 —— 一眼看出用量速度是偏快还是偏慢；并把**金额换算成输出 token**，对齐任务里实时滚动的输出词元。

```
Rolling usage  4%  [-66pt]                 Resets in 1h 31m
██░░░░░░░░░░░░|░░░░░░░░░░░░░░░░░░░░░░░░░
               ↑ 时间已过 71.2%
剩 $11.43 ≈ 494 万 输出tok · 已用 $0.57 ≈ 24.5 万 输出tok
```

| 元素 | 含义 |
|---|---|
| 绿色填充 | 用量进度（usage %） |
| 竖线 | 同一窗口内「时间已过」进度 |
| `-66pt` | 用量% − 时间%；**正数（红）= 用太快**，**负数（绿）= 用太慢**，灰 = 基本同步 |
| `剩 $… ≈ … 输出tok` | 剩余金额按常规配比折算成还能产出的输出 token 数 |

## 金额 ⇄ 输出 token 换算

任务运行时界面只会实时显示**输出词元**，所以把额度进度折算成输出 token 更直观。

- 单价（$/M，DeepSeek V4.1 Flash @ Go）：输入 `0.15` / 输出 `0.60` / 缓存读 `0.003`
- 常规配比（2026-09-23 账单实测：输入 4.47% / 输出 0.55% / 缓存 94.8%）：每 1 个输出 token 配 `8.03` 输入 + `170.5` 缓存读 token
- 综合成本 = `0.60 + 8.03×0.15 + 170.5×0.003 = $2.316 / M 输出tok`
- 反算：`输出tok = microCents ÷ 231.6`（满额参照：$12≈518 万 · $30≈1295 万 · $60≈2591 万）

三个系数（`P_IN / P_OUT / P_CACHE / K_IN / K_CACHE`）都在脚本顶部，换模型或配比变了直接改常量即可。

## 安装

1. 给浏览器装 [Tampermonkey](https://www.tampermonkey.net/)（Chrome / Edge / Firefox 均可）
2. 用 **raw 直链**安装（Tampermonkey 只拦截 raw 响应，GitHub 文件预览页不会触发）：

   <https://raw.githubusercontent.com/craig90x/opencode-go-pace/main/opencode-go-pace.user.js>

   → 弹出安装页 → 安装。（兜底：也可以新建脚本后整段粘贴）
3. 打开 opencode.ai Console 的 **Go** 页，刻度自动出现

> ⚠️ 在仓库页点文件名只会打开 GitHub 的**文件预览页**（HTML），Tampermonkey 不拦截、不弹安装 —— 必须用上面的 raw 直链。装好后脚本的 `@updateURL` 指向同一个 raw 地址，以后改版会自动更新。

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
