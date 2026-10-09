# 学习通多播放器互斥与解除方式

## 播放器结构

项目总结中，顶层页面没有直接可见的 `<video>`，视频位于多个播放器 iframe 中，播放器页面类似 `/ananas/modules/video/index.html`。顶层页面需要递归扫描同源 iframe，不能固定某一个 iframe 编号或层级。访问被同源策略阻止时捕获异常并跳过。

每个播放器 iframe 都可能有独立的 `videojs` 和 `Ext` 对象，因此 Hook 必须在各个包含视频的文档上下文中执行。

## studyControl.singleton

按用户提供的源码分析，Video.js 的 `studyControl` 扩展注册了 singleton 逻辑，可简化为：

```js
function singleton(player) {
    const id = Math.floor(Math.random() * 9999999);
    player.on('play', () => Ext.setCookie('videojs_id', id));
    player.setInterval(() => {
        const currentId = Ext.getCookie('videojs_id');
        if (typeof currentId !== 'undefined' && currentId != id) {
            player.pause();
        }
    }, 1000);
}
```

例如 A 的 ID 为 123，B 的 ID 为 456：A 播放时 Cookie 为 123，B 播放后改为 456。A 下一轮检查发现 Cookie 不等于自身 ID，于是调用正常的暂停方法。

因此直接调用多个 `video.play()` 仍无法保证它们持续播放；暂停来源是播放器扩展中的互斥判断。

## 只屏蔽 videojs_id 的读取

```js
const originalGetCookie = Ext.getCookie;
Ext.getCookie = function (name, ...args) {
    if (name === 'videojs_id') return undefined;
    return originalGetCookie.call(this, name, ...args);
};
```

singleton 读取该 Cookie 时得到 `undefined`，第一个条件不成立，因此不会由这段互斥逻辑调用 `player.pause()`。其他 Cookie 的读取仍使用原函数，保留参数、上下文与返回值。脚本标记包装函数，重复扫描时不重复嵌套 Hook；延迟初始化或替换 `Ext.getCookie` 后，下次扫描重新检查。

## 保留正常暂停

脚本不覆盖 `HTMLMediaElement.prototype.pause` 或 Video.js 的 `pause`。用户暂停、播放器内部暂停、结束处理及错误恢复依旧使用原方法。“全部暂停”优先调用已存在 Video.js Player 的 `pause()`，否则调用原生 video 的 `pause()`。

## 批量播放与生命周期

扫描获得已注册的 Video.js 实例，避免为已初始化的视频创建第二个播放器。未发现实例时回退原生 video。每个播放器先静音，随后在同一次按钮点击中发出全部 `play()` 请求，再用 `Promise.allSettled` 等待结果，使一个失败的播放器不阻止其他播放器启动。

自动扫描更新播放器集合并清理已移除的视频，不自动播放新视频，也不在用户手动暂停后抢播。“全部暂停”会使尚未完成的启动操作失效。

## 验证与边界

用户总结记录过 3 个视频在 5 秒内各推进约 5 秒，以及 11 个视频的 DOM 和 Player 均显示未暂停、时间持续增长。这些是用户提供的历史结果；本仓库重建版本需在实际课程页面再次验证。

本方案仅解除这一浏览器端 Cookie 互斥机制，不保证服务端进度与任务完成状态。若平台不再使用该 Cookie，或 iframe 变为不可访问的跨域文档，需要重新分析。
