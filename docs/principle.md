# 技术原理与版本差异

## 当前代码

安装脚本由 PR #58 基础代码与本地面板、并行播放模块构建。并行模式发现可访问的视频任务点，通过真实播放器静音并启动多个视频，跟踪播放与进度状态。停止操作取消监控并暂停播放器；手动暂停和互动题暂停按现有逻辑处理。

源码位于根目录，保留现有构建路径以避免上传时改变功能。

## 用户总结提出的互斥机制

按用户提供的分析，特定学习通播放器的 `studyControl.singleton` 会为每个播放器生成随机 ID。播放时通过 `Ext.setCookie('videojs_id', id)` 写入共享 Cookie，然后每秒读取该 Cookie。若读取到其他播放器的 ID，则暂停当前播放器。

用户提出在每个可访问播放器 iframe 内包装 `Ext.getCookie`：仅对 `videojs_id` 返回 `undefined`，其他 Cookie 调用原函数。这样可以让 singleton 的非 undefined 判断不成立，同时保留正常的 `pause()`。

```js
const originalGetCookie = Ext.getCookie;
Ext.getCookie = function (name, ...args) {
    if (name === 'videojs_id') return undefined;
    return originalGetCookie.call(this, name, ...args);
};
```

这段是原理示例，尚未集成到本仓库安装脚本。详细分析与用户报告的测试结果见 [项目总结](project-summary.md)。总结中的测试属于用户提供的历史证据，当前上传未重新验证平台脚本。

## 适用条件

该方案依赖 iframe 同源可访问，以及平台仍使用 `Ext.getCookie('videojs_id')` 进行互斥判断。平台改用其他同步机制后需重新定位。无论采用哪个方案，浏览器播放成功均不能保证服务端同时记录多个视频的进度。
