# 学习通多视频同时播放控制器

## 1. 项目目标

开发一个 Tampermonkey / 油猴脚本，用于解决学习通页面中：

> 同一个章节页面存在多个视频时，启动一个视频会自动暂停其他视频的问题。

最终实现：

- 自动识别页面中的多个学习通视频播放器
- 允许多个视频同时播放
- 一键启动全部视频
- 一键暂停全部视频
- 自动扫描视频播放器
- 显示当前识别到的视频数量和播放状态
- 控制面板可以拖动
- 控制面板可以收起 / 展开
- 不使用粗暴的全局 `pause()` 拦截
- 尽可能保留 Video.js 原本的正常暂停和播放器行为

主要测试环境：

- 学习通 / 超星
- 上海大学学习通站点
- `mooc1.shu.edu.cn`
- `mooc2-ans.shu.edu.cn`
- Chrome / Chromium 浏览器
- Tampermonkey

---

# 2. 问题发现过程

最开始的目标是让同一个页面中纵向排列的多个视频同时播放。

测试发现，即使直接执行：

```js
video.play()
```

多个视频仍然会互相暂停。

这意味着问题不是：

- 浏览器自动播放策略
- 页面失焦
- `visibilitychange`
- 简单的 DOM 事件监听器

而是学习通播放器自身主动执行了暂停逻辑。

---

# 3. 页面播放器结构

最初：

```js
document.querySelectorAll('video').length
```

返回：

```text
0
```

说明顶层页面不存在直接可访问的视频标签。

继续递归扫描 iframe 后发现：

```text
TOP
 ├─ iframe[0] → video
 ├─ iframe[1] → video
 ├─ iframe[2] → video
 ...
 └─ iframe[11] → video
```

测试页面中曾找到 12 个视频。

播放器页面类似：

```text
https://mooc1.shu.edu.cn/ananas/modules/video/index.html
```

这些播放器 iframe 与主页面处于允许访问的同源环境，因此父页面 JavaScript 可以访问：

```js
iframe.contentWindow
iframe.contentDocument
```

以及播放器中的：

```js
video
videojs
Ext
```

---

# 4. 第一次关键定位

对 HTMLMediaElement 的：

```js
pause()
```

进行调用栈监控后发现，当启动另一个视频时，旧视频的暂停调用来源于：

```text
video.min.js
videojs-ext.min.js
```

典型调用栈：

```text
pause
video.min.js
video.min.js
videojs-ext.min.js
...
```

因此可以确定：

> 学习通自己的 Video.js 扩展代码主动执行了 `pause()`。

这也解释了为什么普通的“移除事件监听器”脚本不能解决问题。

---

# 5. 源码分析

进一步获取并分析了：

```text
videojs-ext.min.js
```

虽然源码经过压缩和混淆，但定位到了关键逻辑：

```js
'singleton': function(player) {

    var self = this,
        id = parseInt(Math.random() * 0x98967f);

    player.on('play', function() {

        Ext.setCookie(
            'videojs_id',
            id
        );

    });

    player.setInterval(function() {

        var currentId =
            Ext.getCookie('videojs_id');

        if (
            typeof currentId != 'undefined' &&
            currentId != id
        ) {

            player.pause();

        }

    }, 1000);
}
```

该逻辑属于：

```js
videojs.registerPlugin(
    'studyControl',
    ...
);
```

---

# 6. 学习通的视频互斥机制

学习通实际上实现了一个播放器 Singleton / 单实例机制。

每个播放器初始化时生成自己的随机 ID：

```js
const id = random();
```

当视频开始播放：

```js
player.on('play', () => {
    Ext.setCookie(
        'videojs_id',
        id
    );
});
```

然后播放器每隔约：

```text
1000 ms
```

检查：

```js
Ext.getCookie('videojs_id')
```

如果发现：

```text
Cookie 中的 ID != 当前播放器 ID
```

就执行：

```js
player.pause();
```

例如：

```text
视频 A
ID = 123

视频 B
ID = 456
```

A 开始：

```text
videojs_id = 123
```

B 开始：

```text
videojs_id = 456
```

一秒内 A 检查：

```text
456 != 123
```

于是执行：

```js
A.pause()
```

这就是多个视频无法同时播放的核心原因。

---

# 7. 最终解决思路

没有去修改：

```js
player.pause()
```

也没有全局拦截：

```js
HTMLMediaElement.prototype.pause
```

而是只针对 Singleton 判断进行修改。

对每个播放器 iframe 中的：

```js
Ext.getCookie
```

做 Hook。

原始逻辑：

```js
Ext.getCookie(name)
```

修改成：

```js
Ext.getCookie = function(name, ...args) {

    if (name === 'videojs_id') {
        return undefined;
    }

    return originalGetCookie.call(
        this,
        name,
        ...args
    );
};
```

于是播放器执行：

```js
Ext.getCookie('videojs_id')
```

永远得到：

```js
undefined
```

Singleton 判断条件：

```js
typeof currentId != 'undefined'
```

不成立。

因此不会继续：

```js
player.pause();
```

---

# 8. 为什么这种方案更好

曾经测试过另一种方案：

```js
HTMLMediaElement.prototype.pause = function() {
    // 阻止 pause
}
```

虽然一定程度有效，但问题比较大：

- 用户自己无法正常暂停
- 视频播放完成时可能异常
- Video.js 内部状态可能失同步
- 错误恢复逻辑可能失效
- 学习通其他正常的 pause 行为也会被阻止

最终采用的：

```text
仅屏蔽 videojs_id
```

方案更加精准。

它只修改：

```text
多播放器互斥
```

而保留：

```text
正常暂停
播放结束
Video.js 状态
其他 Cookie
其他播放器行为
```

---

# 9. 实际验证结果

首先测试 3 个视频。

5 秒检测：

```text
视频1
paused = false
+5.0 秒

视频2
paused = false
+5.0 秒

视频3
paused = false
+5.0 秒
```

证明三个播放器确实同时推进。

随后测试另一页面，共：

```text
11 个视频
```

状态：

```text
视频  DOM_paused  Player_paused

1     false       false
2     false       false
3     false       false
4     false       false
5     false       false
6     false       false
7     false       false
8     false       false
9     false       false
10    false       false
11    false       false
```

同时：

```text
DOM_time
Player_time
```

均持续增长。

说明：

> 11 个播放器成功同时播放。

---

# 10. 自动扫描方案

由于不同学习通页面 iframe 层级可能变化，因此不能写死：

```js
document.querySelector('#iframe')
```

也不能假设：

```js
iframe[0]
```

一定是课程内容。

最终使用递归扫描：

```js
function scan(win, path = 'TOP') {

    const videos =
        win.document.querySelectorAll('video');

    // 保存视频

    const frames =
        win.document.querySelectorAll('iframe');

    frames.forEach(frame => {

        scan(
            frame.contentWindow,
            ...
        );

    });
}
```

这样支持：

```text
TOP
 └ iframe
      └ iframe
           └ iframe
                └ video
```

等不同页面结构。

如果遇到跨域 iframe：

```js
try {
    ...
} catch {
    return;
}
```

自动跳过。

---

# 11. Video.js 支持

找到 video 后优先尝试：

```js
win.videojs(video)
```

获得 Video.js Player：

```js
const player =
    win.videojs(video);
```

然后通过：

```js
player.play()
player.pause()
player.paused()
player.currentTime()
player.muted()
```

控制播放器。

如果没有 Video.js，则回退：

```js
video.play()
video.pause()
```

---

# 12. 一键播放

浏览器对于脚本自动启动多个带声音的视频可能进行限制。

因此“一键开始”会先：

```js
video.muted = true;
```

以及：

```js
player.muted(true);
```

然后并行执行：

```js
Promise.all(...)
```

而不是：

```js
for (...) {
    await player.play();
}
```

避免播放器一个一个等待启动。

---

# 13. 当前 Tampermonkey 功能

最终油猴版本已经实现一个右下角悬浮面板：

```text
┌─────────────────────────┐
│ 🎬 多视频控制器       − │
├─────────────────────────┤
│ ▶ 正在播放 11/11        │
│                11 个视频 │
│                         │
│ ▶ 一键开始  ⏸ 全部暂停 │
│                         │
│ ↻ 重新扫描播放器        │
└─────────────────────────┘
```

功能包括：

### 一键开始

执行：

```text
重新扫描
↓
定位 video
↓
定位 Video.js
↓
Hook Ext.getCookie
↓
屏蔽 videojs_id
↓
全部静音
↓
并行启动
```

### 全部暂停

通过：

```js
player.pause()
```

正常暂停所有视频。

没有屏蔽正常的 pause 行为。

### 重新扫描

适合：

- 切换章节
- 页面动态加载
- 新 iframe 出现
- 视频播放器延迟初始化

### 面板最小化

这里的“最小化”指：

> 收起油猴悬浮控制面板。

点击：

```text
−
```

后变为小型标题栏。

点击：

```text
+
```

重新展开。

普通网页 JavaScript / Tampermonkey 没有权限可靠地把 Chrome / Edge 整个窗口最小化到 Windows 任务栏，因此没有实现系统窗口级最小化。

### 面板拖动

控制面板支持鼠标拖拽。

---

# 14. Tampermonkey 匹配范围

目前包括：

```js
// @match https://mooc1.shu.edu.cn/*
// @match https://mooc2-ans.shu.edu.cn/*
// @match https://*.chaoxing.com/*
```

后续可以根据测试情况扩展。

---

# 15. 项目建议名称

GitHub 仓库名称可以考虑：

```text
chaoxing-multi-video
```

或者：

```text
chaoxing-multi-video-controller
```

或者：

```text
chaoxing-parallel-player
```

比较推荐：

```text
chaoxing-multi-video-controller
```

项目中文名：

```text
学习通多视频同时播放控制器
```

---

# 16. 推荐 GitHub 项目结构

```text
chaoxing-multi-video-controller/
│
├── src/
│   └── chaoxing-multi-video.user.js
│
├── docs/
│   ├── principle.md
│   └── debugging.md
│
├── screenshots/
│   └── controller.png
│
├── README.md
├── LICENSE
└── .gitignore
```

简单一点也可以：

```text
chaoxing-multi-video-controller/
│
├── chaoxing-multi-video.user.js
├── README.md
└── LICENSE
```

---

# 17. README 推荐内容

README 建议至少包含：

```text
项目简介
安装方法
使用方法
功能列表
原理
兼容性
已知限制
免责声明
开发过程
License
```

---

# 18. 安装方式

README 可以写：

1. 安装 Tampermonkey。
2. 创建新的用户脚本。
3. 粘贴：

```text
chaoxing-multi-video.user.js
```

内容。
4. 保存。
5. 打开学习通课程页面。
6. 等待右下角出现：

```text
🎬 多视频控制器
```

7. 点击：

```text
▶ 一键开始
```

---

# 19. 当前已验证功能

已经实测：

- 多 iframe 自动发现
- 11 个视频同时播放
- `videojs_id` Singleton Hook
- Video.js 播放
- 原生 `<video>` 状态获取
- 批量静音
- 一键播放
- 一键暂停
- 重新扫描
- 状态显示
- 面板拖动
- 面板收起

---

# 20. 已知限制

## ① 服务器端学习进度

该项目解决的是：

```text
浏览器端播放器互斥
```

并不能保证：

```text
学习通服务器会同时记录所有视频的学习进度
```

服务器可能存在：

- 心跳上报
- 并发限制
- 学习时长验证
- 服务端任务点验证

这些不属于当前项目范围。

项目不应修改或伪造：

```text
学习进度
学习时长
任务完成状态
心跳请求
服务器 API 返回结果
```

---

## ② 跨域 iframe

如果播放器未来迁移到与课程页面完全不同的域：

```text
Same-Origin Policy
```

可能阻止：

```js
iframe.contentWindow.document
```

访问。

当前方案依赖于播放器 iframe 可以访问。

---

## ③ 学习通更新

核心方案依赖当前播放器存在：

```js
Ext.getCookie('videojs_id')
```

如果学习通以后修改为：

```text
localStorage
BroadcastChannel
postMessage
SharedWorker
服务器锁
```

等其他机制，需要重新分析。

---

## ④ 自动播放限制

Chrome / Edge 对多媒体自动播放有限制。

因此当前脚本默认：

```js
muted = true
```

再启动全部播放器。

---

# 21. 后续可以继续开发的功能

Codex 后续可以考虑实现：

### 设置菜单

例如：

```text
☑ 自动扫描
☑ 自动解除互斥
☑ 自动播放
☑ 自动静音
```

---

### 单独控制视频

例如：

```text
视频 1   ▶ ⏸
视频 2   ▶ ⏸
视频 3   ▶ ⏸
```

---

### 播放速度

例如：

```text
0.5x
1.0x
1.25x
1.5x
2.0x
```

但需要注意学习通可能另外存在倍速限制代码。

---

### 自动检测页面变化

可以通过：

```js
MutationObserver
```

监听课程页面新增 iframe。

这样切换章节后不需要手动：

```text
重新扫描播放器
```

---

### 保存面板位置

可以利用：

```js
localStorage
```

保存：

```text
left
top
collapsed
```

刷新后保持位置。

---

### 状态面板

增加：

```text
已找到：11
正在播放：11
已暂停：0
已结束：0
```

---

### 更好的播放器生命周期处理

页面切换章节后，旧 iframe 可能被销毁。

可以检测：

```js
video.isConnected
```

自动清理失效播放器。

---

# 22. 最重要的技术结论

整个项目最关键的发现是：

> 学习通的视频互斥并不是浏览器行为，也不是简单的 play/pause DOM Listener，而是 Video.js 的 `studyControl` 插件实现了 Singleton 播放机制。

其核心行为可以概括为：

```js
player.on('play', () => {

    Ext.setCookie(
        'videojs_id',
        playerId
    );

});

setInterval(() => {

    const id =
        Ext.getCookie(
            'videojs_id'
        );

    if (
        id &&
        id !== playerId
    ) {

        player.pause();

    }

}, 1000);
```

当前项目通过：

```js
if (name === 'videojs_id') {
    return undefined;
}
```

精准关闭这一互斥机制。

这也是整个项目最值得写进 README / 技术原理文档的部分。

---

# 23. 给 Codex 的任务说明

接下来可以直接把以下要求交给 Codex：

> 根据这份项目总结，将当前已经验证可用的 Tampermonkey 脚本整理成一个规范的 GitHub 开源项目。
>
> 仓库名称使用 `chaoxing-multi-video-controller`。
>
> 保留现有核心逻辑，不要随意重构导致失效，尤其需要保留：
>
> - 递归扫描同源 iframe
> - Video.js Player 获取
> - `Ext.getCookie('videojs_id')` Hook
> - 一键并行播放
> - 一键暂停
> - 自动静音
> - 重新扫描
> - 悬浮控制面板
> - 面板拖动
> - 面板收起/展开
>
> 创建：
>
> ```text
> chaoxing-multi-video-controller/
> ├── src/
> │   └── chaoxing-multi-video.user.js
> ├── docs/
> │   └── principle.md
> ├── README.md
> ├── LICENSE
> └── .gitignore
> ```
>
> README 使用中文为主，说明安装、使用方法、技术原理、兼容性和限制。
>
> `docs/principle.md` 详细解释学习通 `studyControl.singleton`、`videojs_id` 和 `Ext.getCookie` 的工作机制。
>
> 不加入伪造学习进度、伪造观看时长、修改服务器任务完成状态、伪造心跳等功能。
>
> 在修改代码后保持 Tampermonkey 可以直接安装运行。
>
> 最后初始化 Git 仓库，并准备提交到 GitHub。