# 学习通多视频同时播放控制器

一个 Tampermonkey / 油猴脚本，用于识别同一章节页面中的多个视频，通过屏蔽播放器 `videojs_id` Cookie 的读取解除互斥，提供一键静音并行播放、全部暂停和悬浮控制面板。

## 安装

1. 在 Chrome / Chromium 浏览器安装 Tampermonkey。
2. [点击安装用户脚本](https://raw.githubusercontent.com/Trahex/chaoxing-multi-video-controller/main/src/chaoxing-multi-video.user.js)。也可以新建油猴脚本，粘贴 `src/chaoxing-multi-video.user.js` 的全部内容并保存。
3. 打开学习通课程章节页面，等待右下角出现“🎬 多视频控制器”。

## 使用

- **一键开始**：重新扫描播放器，安装 Cookie Hook，静音并行启动全部可访问视频。
- **全部暂停**：调用播放器原有暂停方法。
- **重新扫描播放器**：手动识别动态加载的视频；脚本也每两秒自动扫描。
- **状态显示**：显示实际正在播放的视频数、识别总数和已解除互斥的视频数。
- **拖动与收起**：拖动标题栏移动面板，点击“− / +”收起或展开。

视频默认静音。可以在原播放器中单独调整声音。自动扫描不自动播放新出现的视频；切换章节后按需再次点击“一键开始”。

## 原理

根据项目总结，学习通 Video.js 的 `studyControl.singleton` 在播放时写入 `videojs_id`，并定时读取该 Cookie。当共享 ID 与当前播放器 ID 不一致时暂停当前播放器。

脚本在各个可访问的视频 iframe 中包装 `Ext.getCookie`，仅对 `videojs_id` 返回 `undefined`，其余 Cookie 保持原调用。不会改写 `HTMLMediaElement.prototype.pause`，正常暂停与结束行为保留。

详细说明见 [技术原理](docs/principle.md)，排查方法见 [调试说明](docs/debugging.md)。

## 兼容性

匹配范围：

```text
https://mooc1.shu.edu.cn/*
https://mooc2-ans.shu.edu.cn/*
https://*.chaoxing.com/*
```

递归扫描同源 iframe，优先使用已存在的 Video.js Player，未找到实例时使用原生 `<video>`。跨域 iframe 自动跳过。

## 验证情况

用户提供的项目总结记录了 3 个视频持续推进和 11 个视频同时播放的历史测试。本仓库脚本根据该总结重新实现；这些历史结果不代表此版本已在登录课程页面实测。

## 已知限制

- 浏览器端同时播放不能保证服务器同时记录全部学习进度。服务端可能有心跳、并发、时长和任务点验证。
- 无法访问跨域 iframe；播放器需与课程页面处于可访问的同源环境。
- 方案依赖当前 `Ext.getCookie('videojs_id')` 机制。平台改用其他机制后需重新分析。
- 静音有助于满足自动播放策略，但启动仍可能被浏览器或播放器拒绝。
- 面板最小化是收起网页控制面板，不是将浏览器窗口最小化到系统任务栏。

## 项目结构

```text
src/chaoxing-multi-video.user.js  可直接安装的脚本
docs/principle.md                技术原理
docs/debugging.md                调试与验证
README.md
LICENSE
.gitignore
```

## 使用范围

本项目只控制浏览器端真实播放器，不修改或伪造学习进度、观看时长、任务完成状态、心跳请求或服务器 API 返回结果。请遵守课程与平台的使用规则。

## License

[MIT](LICENSE)
