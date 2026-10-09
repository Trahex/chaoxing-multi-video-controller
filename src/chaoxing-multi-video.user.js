// ==UserScript==
// @name         学习通多视频同时播放控制器
// @namespace    https://github.com/Trahex/chaoxing-multi-video-controller
// @version      1.0.0
// @description  递归发现同源视频，精准屏蔽 videojs_id 互斥，一键静音并行播放和暂停。
// @match        https://mooc1.shu.edu.cn/*
// @match        https://mooc2-ans.shu.edu.cn/*
// @match        https://*.chaoxing.com/*
// @noframes
// @run-at       document-idle
// @grant        none
// @license      MIT
// ==/UserScript==

(() => {
    'use strict';

    const PANEL_ID = 'chaoxing-multi-video-controller';
    const COOKIE_HOOK = Symbol.for('chaoxing.multiVideo.cookieHook');
    if (document.getElementById(PANEL_ID)) return;
    let videos = [];
    let inaccessibleFrames = 0;
    let actionVersion = 0;
    let playbackRequested = false;

    // 每个 iframe 有独立的 Ext 对象；保留其他 Cookie 的参数和调用上下文。
    function hookCookie(win) {
        const ext = win.Ext;
        if (!ext || typeof ext.getCookie !== 'function') return false;
        const original = ext.getCookie;
        if (original[COOKIE_HOOK]) return true;
        const wrapped = function (name, ...args) {
            if (name === 'videojs_id') return undefined;
            return original.call(this, name, ...args);
        };
        Object.defineProperty(wrapped, COOKIE_HOOK, { value: true });
        try {
            ext.getCookie = wrapped;
            return ext.getCookie === wrapped;
        } catch {
            return false;
        }
    }

    function findPlayer(win, video) {
        // 只获取已初始化的 Video.js 实例，避免扫描创建第二个播放器。
        const vjs = win.videojs;
        if (!vjs) return null;
        try {
            const container = video.closest('.video-js');
            const ids = [container?.id, video.id, video.id?.replace(/_html5_api$/, '')];
            const players = typeof vjs.getPlayers === 'function' ? vjs.getPlayers() : vjs.players;
            for (const id of ids.filter(Boolean)) {
                const player = players?.[id]
                    || (typeof vjs.getPlayer === 'function' ? vjs.getPlayer(id) : null);
                if (player && !(typeof player.isDisposed === 'function' && player.isDisposed())) {
                    return player;
                }
            }
        } catch {
            // Video.js 尚未初始化时回退到原生 video，下次扫描重试。
        }
        return null;
    }

    function scan() {
        const found = [];
        const visited = new Set();
        inaccessibleFrames = 0;
        function visit(win) {
            if (!win || visited.has(win)) return;
            visited.add(win);
            let doc;
            try {
                doc = win.document;
                if (!doc) return;
                const media = [...doc.querySelectorAll('video')];
                const hooked = media.length > 0 && hookCookie(win);
                for (const video of media) {
                    found.push({ video, player: findPlayer(win, video), hooked });
                }
                for (const frame of doc.querySelectorAll('iframe')) {
                    try {
                        visit(frame.contentWindow);
                    } catch {
                        inaccessibleFrames++;
                    }
                }
            } catch {
                inaccessibleFrames++;
            }
        }
        visit(window);
        videos = found;
        renderStatus();
    }

    function pause(entry) {
        try {
            if (typeof entry.player?.pause === 'function') entry.player.pause();
            else entry.video.pause();
        } catch {
            // 已销毁的 iframe 或播放器会在下一次扫描时清理。
        }
    }

    async function playAll() {
        scan();
        const version = ++actionVersion;
        playbackRequested = true;
        if (!videos.length) {
            message.textContent = '未找到视频，请等待页面加载后重新扫描。';
            return;
        }
        message.textContent = '正在启动全部视频…';
        // 所有 play() 均在同一次点击处理内调用，不串行等待。
        const tasks = videos.map(entry => {
            try {
                entry.video.muted = true;
                if (typeof entry.player?.muted === 'function') entry.player.muted(true);
                const result = typeof entry.player?.play === 'function'
                    ? entry.player.play() : entry.video.play();
                return Promise.resolve(result).then(() => {
                    // 用户在异步 play() 返回前点了暂停，仍以暂停操作为准。
                    if (!playbackRequested) pause(entry);
                });
            } catch (error) {
                return Promise.reject(error);
            }
        });
        const results = await Promise.allSettled(tasks);
        if (version !== actionVersion) return;
        const failed = results.filter(result => result.status === 'rejected').length;
        message.textContent = failed
            ? `${failed} 个视频启动失败，请检查播放器或浏览器自动播放限制。`
            : '已发出播放请求；请观察实际播放状态。';
        renderStatus();
    }

    function pauseAll() {
        playbackRequested = false;
        actionVersion++;
        scan();
        videos.forEach(pause);
        message.textContent = '已暂停全部可访问的视频。';
        renderStatus();
    }

    const host = document.createElement('div');
    host.id = PANEL_ID;
    host.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483647;';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
        <style>
            :host { color-scheme: light; }
            * { box-sizing: border-box; }
            .panel { width:280px; max-width:calc(100vw - 16px); color:#172033;
                background:#fff; border:1px solid #d7deea; border-radius:12px;
                box-shadow:0 8px 32px #0003; font:14px/1.5 system-ui,sans-serif; }
            header { display:flex; align-items:center; justify-content:space-between;
                padding:12px; background:#edf3ff; border-radius:12px 12px 0 0;
                cursor:move; touch-action:none; user-select:none; }
            h2 { font:600 14px/1.4 system-ui,sans-serif; margin:0; }
            button { border:1px solid #c8d4e8; border-radius:7px; padding:8px 10px;
                background:#f5f8ff; color:#172033; cursor:pointer; font:inherit; }
            button:hover { background:#e7eeff; }
            button:focus-visible { outline:2px solid #2563eb; outline-offset:2px; }
            #toggle { padding:1px 8px; font-size:20px; }
            #body { padding:12px; }
            #status { font-weight:600; margin-bottom:4px; }
            #details, #message { color:#526077; font-size:12px; }
            .actions { display:flex; gap:8px; margin:12px 0 8px; }
            #play { color:#fff; background:#2563eb; border-color:#2563eb; }
            #scan { width:100%; }
            #message { margin-top:8px; overflow-wrap:anywhere; }
            [hidden] { display:none !important; }
        </style>
        <section class="panel" aria-label="多视频控制器">
            <header><h2>🎬 多视频控制器</h2>
                <button id="toggle" type="button" aria-label="收起面板" aria-expanded="true">−</button>
            </header>
            <div id="body">
                <div id="status" aria-live="polite">正在扫描…</div>
                <div id="details"></div>
                <div class="actions">
                    <button id="play" type="button">▶ 一键开始</button>
                    <button id="pause" type="button">⏸ 全部暂停</button>
                </div>
                <button id="scan" type="button">↻ 重新扫描播放器</button>
                <div id="message" aria-live="polite">点击开始后将静音播放。</div>
            </div>
        </section>`;
    const status = root.getElementById('status');
    const details = root.getElementById('details');
    const message = root.getElementById('message');

    function renderStatus() {
        videos = videos.filter(entry => entry.video.isConnected);
        const playing = videos.filter(entry => !entry.video.paused && !entry.video.ended).length;
        const hooked = videos.filter(entry => entry.hooked).length;
        status.textContent = `▶ 正在播放 ${playing}/${videos.length} · ${videos.length} 个视频`;
        details.textContent = `已解除互斥 ${hooked}/${videos.length}`
            + (inaccessibleFrames ? ` · 跳过 ${inaccessibleFrames} 个不可访问框架` : '');
    }

    root.getElementById('play').addEventListener('click', playAll);
    root.getElementById('pause').addEventListener('click', pauseAll);
    root.getElementById('scan').addEventListener('click', () => {
        scan();
        message.textContent = '扫描完成；未安装 Ext Hook 的播放器可能仍存在互斥。';
    });
    root.getElementById('toggle').addEventListener('click', event => {
        const body = root.getElementById('body');
        body.hidden = !body.hidden;
        event.currentTarget.textContent = body.hidden ? '+' : '−';
        event.currentTarget.setAttribute('aria-expanded', String(!body.hidden));
        event.currentTarget.setAttribute('aria-label', body.hidden ? '展开面板' : '收起面板');
    });

    const header = root.querySelector('header');
    let drag = null;
    header.addEventListener('pointerdown', event => {
        if (event.button !== 0 || event.target.closest('button')) return;
        const rect = host.getBoundingClientRect();
        drag = { id: event.pointerId, dx: event.clientX - rect.left, dy: event.clientY - rect.top };
        header.setPointerCapture(event.pointerId);
        event.preventDefault();
    });
    header.addEventListener('pointermove', event => {
        if (!drag || drag.id !== event.pointerId) return;
        const rect = host.getBoundingClientRect();
        host.style.left = `${Math.max(0, Math.min(innerWidth - rect.width, event.clientX - drag.dx))}px`;
        host.style.top = `${Math.max(0, Math.min(innerHeight - rect.height, event.clientY - drag.dy))}px`;
        host.style.right = 'auto';
        host.style.bottom = 'auto';
    });
    const endDrag = () => { drag = null; };
    header.addEventListener('pointerup', endDrag);
    header.addEventListener('pointercancel', endDrag);
    header.addEventListener('lostpointercapture', endDrag);

    document.body.appendChild(host);
    scan();
    // 延迟初始化与章节替换会在下一轮发现；不自动启动新视频。
    let scanTimer = window.setInterval(scan, 2000);
    let statusTimer = window.setInterval(renderStatus, 1000);
    window.addEventListener('pagehide', () => {
        window.clearInterval(scanTimer);
        window.clearInterval(statusTimer);
    }, { once: true });
    window.addEventListener('pageshow', event => {
        if (!event.persisted) return;
        scan();
        scanTimer = window.setInterval(scan, 2000);
        statusTimer = window.setInterval(renderStatus, 1000);
    });
})();
