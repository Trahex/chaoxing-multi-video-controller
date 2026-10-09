# 学习通多视频与倍速助手

Tampermonkey 用户脚本，提供同一小节多视频并行播放、顺序播放、倍速选择和悬浮控制面板。主要适配上海大学学习通课程播放页。

## 安装与使用

1. 安装 Tampermonkey 扩展。
2. [点击安装脚本](https://raw.githubusercontent.com/Trahex/chaoxing-multi-video-controller/main/%E5%AD%A6%E4%B9%A0%E9%80%9A%E5%A4%9A%E8%A7%86%E9%A2%91%E5%80%8D%E9%80%9F.user.js)，或下载根目录的 `学习通多视频倍速.user.js` 后通过 Tampermonkey 导入。
3. 停用其他控制同一播放器的脚本，刷新课程播放页。
4. 在右上方“学习通 · 多视频助手”面板选择模式，点击“开始”。
5. 切换模式前点击“停止”；无法播放时点击“诊断”，查看控制台输出。

完整操作说明见 [使用说明](使用说明.md)。

## 当前功能

- 并行模式：启动同小节可访问的未完成视频，默认原速、静音。
- 顺序模式：按任务点顺序播放，提供 2×、3×、6×、8×选项，显示实际倍速。
- 开始、停止、诊断，以及可拖动、可收起的悬浮面板。
- 显示播放数量、进度推进数量及播放结束数量。
- 可选切屏暂停恢复，保留手动暂停与互动题暂停处理。
- 识别新旧课程目录、延迟加载播放器及平台已完成标记。

## 兼容性与限制

脚本匹配上海大学 `mooc1.shu.edu.cn` 和 `*.chaoxing.com` 的课程播放页，具体范围见用户脚本头部。跨域 iframe 无法访问时会显示诊断。后台标签页可能被浏览器限流或冻结，平台也可能限制并行播放及倍速。

本地模拟环境已通过 14 项回归场景，包括 12 个播放器并行启动；该结果不等于登录课程页面的实际验证。服务器记录的学习进度与浏览器播放状态可能不同。

## 开发

要求 Node.js 18 或更新版本，以及 pnpm。

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm test
```

`build-local.mjs` 从 `v3_optimized.pr58.js` 构建，注入 `local-panel.js` 和 `parallel-mode.js`，生成根目录的安装脚本。`verify-local.mjs` 使用 `pr58-regression.mjs` 中的模拟环境运行本地测试。

## 来源与设计文档

当前代码基于 [xuexitongScript PR #58](https://github.com/chaolucky18/xuexitongScript/pull/58)，来源提交为 `06530033be6f142025fd7df6ae9bf70546850ba8`。本仓库是独立修改版本，不代表上游正式发布。

[项目方案](docs/project-summary.md) 保留用户提供的技术总结。[技术原理说明](docs/principle.md) 区分当前实现和该总结提出的 `Ext.getCookie('videojs_id')` Hook 方案；当前版本尚未集成这个 Hook，也不把总结中的 11 视频实测作为当前版本验证结果。

## 使用范围与许可

脚本调用真实播放器，不伪造学习进度、观看时长、心跳或服务器任务完成状态。请按课程及平台规则使用。

上游仓库未提供明确许可证，本仓库保留来源署名，暂不额外授予整份派生代码的开源许可。详见 [LICENSE](LICENSE)。
