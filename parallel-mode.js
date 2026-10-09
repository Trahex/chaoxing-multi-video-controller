    function createParallelController(app) {
        const entries = new Map();
        const timeouts = new Map();
        const epoch = app._localEpoch;
        let alive = true;
        let monitor = null;
        let blurred = false;
        let blocked = false;
        let overflow = false;
        let currentNode = null;
        let lastFrameCount = 0;
        let completedFrames = 0;
        const valid = () => alive && !app._localStopped && epoch === app._localEpoch;
        const background = entry => document.hidden || blurred || !!(entry && entry.video.ownerDocument.hidden);
        const later = (callback, ms) => {
            const id = setTimeout(() => { timeouts.delete(id); if (valid()) callback(); }, ms);
            timeouts.set(id, () => {});
            return id;
        };
        const detach = entry => {
            for (const [target, name, handler] of entry.listeners) target.removeEventListener(name, handler);
        };
        const entryValid = entry => valid() && entries.get(entry.frame) === entry;
        const playWithTimeout = video => new Promise((resolve, reject) => {
            let settled = false;
            const finish = (callback, value) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                timeouts.delete(timer);
                callback(value);
            };
            const timer = setTimeout(() => finish(reject, new Error('播放请求超过 8 秒未响应')), 8000);
            timeouts.set(timer, () => finish(resolve, false));
            try { Promise.resolve(video.play()).then(() => finish(resolve, true), error => finish(reject, error)); }
            catch (error) { finish(reject, error); }
        });
        const tryPlay = async (entry, reason, initial = false) => {
            if (!entryValid(entry) || blocked || entry.busy || entry.done || entry.manualPaused || overflow) return;
            const now = Date.now();
            if (!initial) {
                if (!entry.video.paused && now - entry.lastProgress < 8000) return;
                if (background(entry) && !helperUI.backgroundRecovery) return;
                if (now - entry.windowStart >= 60000) { entry.windowStart = now; entry.recoveries = 0; }
                if (now - entry.lastAttempt < 2000 || entry.recoveries >= 6) return;
                entry.recoveries++;
            }
            entry.lastAttempt = now;
            entry.busy = true;
            entry.error = '';
            try {
                entry.video.muted = true;
                entry.video.playbackRate = 1;
                if (!entry.video.paused && !initial) entry.video.pause();
                await playWithTimeout(entry.video);
                if (!entryValid(entry)) return;
                entry.started = true;
                if (entry.video.paused) entry.error = '播放器仍为暂停状态';
            } catch (error) {
                if (!entryValid(entry)) return;
                entry.error = error.name + ': ' + error.message;
                console.warn('[SHU 并行] 第 ' + (entry.index + 1) + ' 个视频播放失败（' + reason + '）', error);
            } finally { entry.busy = false; }
        };
        const register = (frame, video, index) => {
            const now = Date.now();
            const entry = { frame, video, index, listeners: [], busy: false, started: false, done: video.ended,
                manualPaused: false, lastInteraction: 0, lastAttempt: 0, windowStart: now, recoveries: 0,
                lastTime: Number(video.currentTime || 0), lastProgress: now, error: '' };
            entries.set(frame, entry);
            const on = (target, name, handler) => {
                target.addEventListener(name, handler);
                entry.listeners.push([target, name, handler]);
            };
            on(video.ownerDocument, 'pointerdown', () => { entry.lastInteraction = Date.now(); });
            on(video.ownerDocument, 'keydown', () => { entry.lastInteraction = Date.now(); });
            on(video, 'ended', () => { if (entryValid(entry)) entry.done = true; });
            on(video, 'pause', () => {
                if (!entryValid(entry) || entry.busy || entry.done || video.ended || blocked) return;
                if (!background(entry) && entry.lastInteraction && Date.now() - entry.lastInteraction < 2500) {
                    entry.manualPaused = true;
                    return;
                }
                if (background(entry) && !helperUI.backgroundRecovery) return;
                later(() => tryPlay(entry, '暂停恢复'), 350);
            });
            on(video, 'play', () => { if (entryValid(entry)) entry.manualPaused = false; });
            on(video.ownerDocument, 'visibilitychange', () => { later(() => tryPlay(entry, '子框架切屏'), 350); });
            // Invoke every play() immediately during the Start button's gesture.
            // Awaiting the first media promise here would serialize all players.
            void tryPlay(entry, '并行启动', true);
            return entry;
        };
        const scan = () => {
            if (!valid()) return;
            let position;
            try { position = app._resolveCatalogPosition('parallel'); } catch (_) {}
            if (position && position.ok) {
                if (currentNode && currentNode !== position.node) {
                    for (const entry of entries.values()) { detach(entry); if (!entry.video.paused) entry.video.pause(); }
                    entries.clear();
                }
                currentNode = position.node;
            }
            const frames = app._getVideoTaskFrames();
            lastFrameCount = frames.length;
            app._videoTaskCount = lastFrameCount;
            completedFrames = frames.filter(frame => app._isVideoTaskFrameComplete(frame) && !entries.has(frame)).length;
            overflow = frames.length >= app.configs.videoTaskFrameMaxCount;
            for (const [frame, entry] of entries) {
                if (!frames.includes(frame)) { detach(entry); if (!entry.video.paused) entry.video.pause(); entries.delete(frame); }
            }
            for (let index = 0; index < frames.length; index++) {
                const frame = frames[index];
                if (app._isVideoTaskFrameComplete(frame) && !entries.has(frame)) continue;
                const video = app._videoElInFrame(frame);
                if (!video) continue;
                const old = entries.get(frame);
                if (old && old.video === video) { old.index = index; continue; }
                if (old) { detach(old); if (!old.video.paused) old.video.pause(); }
                register(frame, video, index);
            }
        };
        const tick = () => {
            if (!valid()) return;
            const question = app.configs.interactionGuard && app._findInteractionDialog(document, 0);
            const wasBlocked = blocked;
            blocked = !!question;
            if (blocked && !wasBlocked) {
                for (const entry of entries.values()) if (!entry.video.paused) entry.video.pause();
            }
            scan();
            const now = Date.now();
            for (const entry of entries.values()) {
                if (entry.video.ended) entry.done = true;
                const current = Number(entry.video.currentTime || 0);
                if (Math.abs(current - entry.lastTime) >= 0.01) { entry.lastTime = current; entry.lastProgress = now; }
                if (!entry.done && !entry.manualPaused && (entry.video.paused || now - entry.lastProgress >= 8000)) {
                    void tryPlay(entry, entry.video.paused ? '定时暂停恢复' : '进度未推进');
                }
            }
        };
        const wake = () => {
            if (!valid() || !helperUI.backgroundRecovery) return;
            later(tick, 350);
        };
        const blur = () => { blurred = true; wake(); };
        const focus = () => { blurred = false; wake(); };
        const describe = frame => {
            const entry = entries.get(frame);
            if (!entry) return app._isVideoTaskFrameComplete(frame) ? '平台已完成' : '等待视频加载';
            if (entry.done) return '已播到结尾';
            if (entry.error) return entry.error;
            if (entry.manualPaused) return '手动暂停';
            if (entry.busy) return '等待播放请求';
            if (entry.recoveries >= 6 && entry.video.paused) return '反复被暂停，恢复冷却中';
            if (entry.video.paused) return '暂停';
            return Date.now() - entry.lastProgress >= 8000 ? '播放标志正常但进度未推进' : '正在播放';
        };
        const controller = {
            start() {
                document.addEventListener('visibilitychange', wake);
                window.addEventListener('blur', blur);
                window.addEventListener('focus', focus);
                tick();
                monitor = setInterval(tick, 1000);
            },
            summary() {
                const rows = [...entries.values()];
                const playing = rows.filter(entry => !entry.done && !entry.video.paused && !entry.video.ended).length;
                const ended = rows.filter(entry => entry.done).length;
                const advancing = rows.filter(entry => !entry.done && !entry.video.paused && entry.lastTime > 0 && Date.now() - entry.lastProgress < 4000).length;
                const paused = rows.filter(entry => !entry.done && entry.video.paused).length;
                const waiting = Math.max(0, lastFrameCount - rows.length - completedFrames);
                let message = '并行播放中';
                if (blocked) message = '有互动题，已暂停恢复；请手动处理';
                else if (overflow) message = '视频数量达到扫描上限，请停止后检查目录';
                else if (!lastFrameCount) message = '等待视频任务点加载';
                else if (lastFrameCount && ended === rows.length && !waiting) message = '本页视频已播到结尾，请核对平台任务点';
                else if (rows.some(entry => entry.error)) message = '部分播放器未能启动，请查看诊断';
                else if (paused) message = '部分视频暂停；恢复受播放器与浏览器限制';
                return { total: lastFrameCount, playing, advancing, ended, paused, waiting, message };
            },
            describe,
            dispose() {
                alive = false;
                if (monitor) clearInterval(monitor);
                for (const [id, cancel] of [...timeouts]) { clearTimeout(id); cancel(); }
                timeouts.clear();
                document.removeEventListener('visibilitychange', wake);
                window.removeEventListener('blur', blur);
                window.removeEventListener('focus', focus);
                for (const entry of entries.values()) detach(entry);
                entries.clear();
            },
        };
        return controller;
    }

    function installScreenRecovery(app) {
        let blurred = false;
        let cleanup = [];
        const originalPause = app._handleVideoPause;
        const inBackground = () => document.hidden || blurred;
        app._handleVideoPause = function (event) {
            if (this._localStopped) return;
            if (helperUI.backgroundRecovery && inBackground()) {
                this._userPaused = false;
                this._schedule(() => {
                    if (this._isPlaying && !this._interactionBlocked) this._tryResumePlayback('切屏暂停恢复');
                }, 1400);
                return;
            }
            return originalPause.call(this, event);
        };
        app._installScreenRecovery = function () {
            this._removeScreenRecovery();
            const wake = () => {
                if (this._localStopped || !helperUI.backgroundRecovery) return;
                this._userPaused = false;
                this._schedule(() => {
                    if (!this._interactionBlocked) this._tryResumePlayback('窗口切换');
                }, 1400);
            };
            const onBlur = () => { blurred = true; wake(); };
            const onFocus = () => { blurred = false; wake(); };
            document.addEventListener('visibilitychange', wake);
            window.addEventListener('blur', onBlur);
            window.addEventListener('focus', onFocus);
            cleanup = [() => document.removeEventListener('visibilitychange', wake), () => window.removeEventListener('blur', onBlur), () => window.removeEventListener('focus', onFocus)];
        };
        app._removeScreenRecovery = function () {
            for (const remove of cleanup) remove();
            cleanup = [];
            blurred = false;
        };
    }
