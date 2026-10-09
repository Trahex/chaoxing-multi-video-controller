    function createHelperUI() {
        const UI_KEY = '__shuXuexitongUI';
        if (window[UI_KEY]) window[UI_KEY].dispose();
        const speeds = [2, 3, 6, 8];
        let mode = 'sequential';
        try { if (localStorage.getItem('shu.xuexitong.mode') === 'parallel') mode = 'parallel'; } catch (_) {}
        const storageKey = 'shu.xuexitong.rate';
        let savedRate = 2;
        try {
            const value = Number(localStorage.getItem(storageKey));
            if (speeds.includes(value)) savedRate = value;
        } catch (_) { /* Storage is optional. */ }
        const host = document.createElement('div');
        host.id = 'shu-xuexitong-panel';
        host.style.cssText = 'position:fixed;right:16px;top:88px;z-index:2147483647;width:280px';
        const root = host.attachShadow({ mode: 'open' });
        root.innerHTML = `<style>
            :host{color-scheme:light;font:14px/1.5 system-ui,"Microsoft YaHei",sans-serif;color:#18253a}
            .panel{background:#fff;border:1px solid #cdd7e5;border-radius:12px;padding:15px;box-shadow:0 6px 28px #0003}
            strong{display:block;margin-bottom:8px;font-size:15px}
            p{margin:8px 0;overflow-wrap:anywhere} .small{font-size:12px;color:#65748a}
            .row{display:flex;gap:8px;align-items:center} select{flex:1;padding:6px;border:1px solid #bdc9da;border-radius:6px;background:#fff;color:#18253a}
            button{flex:1;border:0;border-radius:6px;padding:8px;cursor:pointer;background:#e9eef5;color:#18253a;font:inherit}
            #start{background:#2364cf;color:#fff} button:disabled{opacity:.45;cursor:default}
        </style><div class="panel">
            <strong>学习通 · 多视频助手</strong>
            <div class="row"><label for="mode">模式</label><select id="mode" aria-label="播放模式">
                <option value="sequential">逐个播放</option><option value="parallel">同时播放（原速、静音）</option>
            </select></div>
            <div class="row"><label for="rate">倍速</label><select id="rate" aria-label="播放倍速">
                ${speeds.map(speed => `<option value="${speed}">${speed}×</option>`).join('')}
            </select></div>
            <label class="small"><input type="checkbox" id="background" checked>切屏暂停后尝试恢复</label>
            <p id="status" role="status">等待课程目录加载…</p>
            <p id="progress" class="small">本小节视频：待识别</p>
            <p id="actual" class="small">播放器实际倍速：待播放</p>
            <div class="row"><button id="start" disabled>开始</button><button id="stop" disabled>停止</button><button id="diagnose">诊断</button></div>
            <p class="small">倍速以播放器实际值为准。</p>
        </div>`;
        (document.body || document.documentElement).appendChild(host);
        const find = id => root.getElementById(id);
        const select = find('rate');
        select.value = String(savedRate);
        find('mode').value = mode;
        let app = null;
        let message = '等待课程目录加载…';
        let uiTimer = null;
        const refresh = () => {
            select.disabled = mode === 'parallel';
            find('mode').disabled = !!app && !app._localStopped;
            find('start').disabled = !app || !app._localStopped;
            find('stop').disabled = !app || app._localStopped;
            const video = app && app._videoEl;
            let status = message;
            if (app && app._parallel && !app._localStopped) {
                const summary = app._parallel.summary();
                find('status').textContent = summary.message;
                find('progress').textContent = `在播 ${summary.playing}/${summary.total} · 进度推进 ${summary.advancing} · 已播到结尾 ${summary.ended}`;
                find('actual').textContent = `并行原速、静音 · 暂停 ${summary.paused} · 等待加载 ${summary.waiting}`;
                return;
            }
            if (app && !app._localStopped) {
                if (app._interactionBlocked) status = '有互动题，请手动处理后继续';
                else if (app._waitingVideoTaskIndex != null) status = message;
                else if (app._userPaused) status = '播放器已手动暂停，可停止后重新开始';
                else if (video && !video.paused && !video.ended) status = '正在播放';
                else if (app._handlingVideoEnd) status = '视频结束，准备切换';
                else if (app._isPlaying) status = '等待播放器继续播放';
            }
            find('status').textContent = status;
            const count = app ? app._videoTaskCount : 0;
            find('progress').textContent = count ? `本小节视频：${Math.min(app._currentVideoTaskIndex + 1, count)} / ${count}` : '本小节视频：待识别';
            find('actual').textContent = video ? `所选 ${savedRate}× · 播放器实际 ${video.playbackRate}×` : `所选 ${savedRate}× · 播放器实际：待播放`;
        };
        const ui = {
            get savedRate() { return savedRate; },
            get mode() { return mode; },
            get backgroundRecovery() { return find('background').checked; },
            setMessage(value) { message = value; refresh(); },
            connect(player) {
                app = player;
                installLocalBehavior(app);
                message = '已就绪，选择倍速后点击开始';
                if (uiTimer) clearInterval(uiTimer);
                uiTimer = setInterval(refresh, 750);
                refresh();
            },
            dispose() {
                if (uiTimer) clearInterval(uiTimer);
                host.remove();
            },
            diagnose() {
                if (!app) {
                    console.info('[SHU 助手] 脚本面板已注入，播放器尚未初始化；检查 #coursetree 和 jQuery。');
                    return;
                }
                const frames = app._getVideoTaskFrames();
                const rows = frames.map((frame, index) => {
                    let accessible = false;
                    try { accessible = !!(frame.contentDocument || frame.contentWindow.document); } catch (_) {}
                    return {
                        视频序号: index + 1,
                        框架可访问: accessible,
                        已找到视频: !!app._videoElInFrame(frame),
                        平台完成标记: app._isVideoTaskFrameComplete(frame),
                        当前状态: app._parallel ? app._parallel.describe(frame) : '顺序模式',
                        已播秒数: Number((app._videoElInFrame(frame) || {}).currentTime || 0).toFixed(1),
                    };
                });
                console.info('[SHU 助手] 诊断：', { 版本: app.version, 已停止: app._localStopped, 选择倍速: savedRate, 实际倍速: app._videoEl ? app._videoEl.playbackRate : null, 任务点数: frames.length });
                if (typeof console.table === 'function') console.table(rows);
                else console.log(rows);
                message = `诊断已输出到 F12 Console；识别到 ${frames.length} 个视频任务点`;
                refresh();
                return rows;
            },
        };
        find('start').addEventListener('click', () => {
            if (!app || !app._localStopped) return;
            try { message = '正在识别视频…'; app.run(); } catch (error) {
                app.stop();
                message = '启动失败：' + error.message;
                console.error('[SHU 助手]', error);
            }
            refresh();
        });
        find('stop').addEventListener('click', () => { if (app) app.stop(); });
        find('diagnose').addEventListener('click', () => ui.diagnose());
        find('mode').addEventListener('change', () => {
            if (app && !app._localStopped) return;
            mode = find('mode').value === 'parallel' ? 'parallel' : 'sequential';
            try { localStorage.setItem('shu.xuexitong.mode', mode); } catch (_) {}
            refresh();
        });
        select.addEventListener('change', () => {
            const value = Number(select.value);
            if (!speeds.includes(value)) return;
            savedRate = value;
            try { localStorage.setItem(storageKey, String(value)); } catch (_) {}
            if (app) {
                app.configs.playbackRate = value;
                if (app._videoEl) {
                    try { app._videoEl.playbackRate = value; }
                    catch (error) { message = '播放器拒绝倍速设置：' + error.message; }
                }
            }
            refresh();
        });
        window[UI_KEY] = ui;
        return ui;
    }

    function installLocalBehavior(app) {
        app._localStopped = true;
        app._localEpoch = 0;
        app._waitingVideoTaskIndex = null;
        const originalRun = app.run;
        const originalDestroy = app.destroy;
        const originalSchedule = app._schedule;
        const originalFrames = app._getVideoTaskFrames;
        const originalNext = app.nextUnit;
        const originalEnded = app._handleVideoEnded;
        app.run = function () {
            if (!this._localStopped) return;
            this._localStopped = false;
            this._localEpoch++;
            this.configs.autoplay = true;
            this.configs.playbackRate = helperUI.savedRate;
            this._waitingVideoTaskIndex = null;
            helperUI.setMessage('正在识别视频…');
            if (helperUI.mode === 'parallel') {
                this._parallel = createParallelController(this);
                this._parallel.start();
                return;
            }
            this._installScreenRecovery();
            return originalRun.call(this);
        };
        app.destroy = function () {
            this._localStopped = true;
            this._localEpoch++;
            this.configs.autoplay = false;
            if (this._parallel) {
                this._parallel.dispose();
                this._parallel = null;
            }
            this._removeScreenRecovery();
            return originalDestroy.call(this);
        };
        app.stop = function () {
            const videos = new Set([this._videoEl, this._eventVideoEl]);
            for (const frame of this._getVideoTaskFrames()) videos.add(this._videoElInFrame(frame));
            this.destroy();
            for (const video of videos) {
                if (video && typeof video.pause === 'function') {
                    try { video.pause(); } catch (error) { console.warn('[SHU 助手] 暂停失败', error); }
                }
            }
            helperUI.setMessage('已停止；点击开始可继续');
        };
        app._schedule = function (fn, ms) {
            if (this._localStopped) return null;
            const epoch = this._localEpoch;
            return originalSchedule.call(this, () => {
                if (!this._localStopped && epoch === this._localEpoch) fn();
            }, ms);
        };
        app.nextUnit = function () {
            if (!this._localStopped && !this._parallel) return originalNext.call(this);
        };
        app._handleVideoEnded = function (event) {
            if (!this._localStopped && !this._parallel) return originalEnded.call(this, event);
        };
        // Parent video wrappers and their nested player frames can describe one task.
        // Keep only the innermost identifiable task frame, in document order.
        app._getVideoTaskFrames = function () {
            const frames = [...new Set(originalFrames.call(this))];
            return frames.filter(frame => {
                try {
                    const doc = frame.contentDocument || frame.contentWindow.document;
                    return !doc || !frames.some(other => other !== frame && other.ownerDocument === doc);
                } catch (_) { return true; }
            });
        };
        const originalNoVideo = app._handleNoVideoNode;
        app._handleNoVideoNode = function () {
            helperUI.setMessage('没有识别到可播放视频；请点击诊断或手动处理当前任务');
            return originalNoVideo.call(this);
        };
        installScreenRecovery(app);
    }
