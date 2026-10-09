import { readFileSync, writeFileSync } from 'node:fs';

let source = readFileSync('v3_optimized.pr58.js', 'utf8').replace(/\r\n/g, '\n');
const replace = (from, to) => {
  if (!source.includes(from)) throw new Error('PR source changed: ' + from.slice(0, 80));
  source = source.replace(from, to);
};
replace("const VERSION = 'V3.4';", "const VERSION = 'V3.4.2 SHU 并行版';");
replace('    // F7（#33 #47）', '    const helperUI = createHelperUI();\n    // F7（#33 #47）');
replace('                playbackRate: 1.0,', '                playbackRate: helperUI.savedRate,');
replace('                // 默认改为 1.0 原速（平台约束，不是脚本缺陷）', '                // PR 原版默认 1.0；本地版按用户需求默认 2.0，并提供 2/3/6/8 选择。平台可能限制实际倍速');
replace('                videoTaskFrameMaxCount: 12,', '                videoTaskFrameMaxCount: 128,');
replace("tree.find('.posCatalog_select').length", "tree.find('.posCatalog_select, .ncells').length");
replace("console.error('%c脚本启动失败：页面没有 jQuery，且 CDN 加载被浏览器/网络拦截。'", "helperUI.setMessage('jQuery 加载失败，请检查网络或拦截扩展');\n            console.error('%c脚本启动失败：页面没有 jQuery，且 CDN 加载被浏览器/网络拦截。'");
replace("console.error('%c脚本启动超时：未检测到课程目录（#coursetree）。'", "helperUI.setMessage('未找到课程目录，请确认课程播放页已加载');\n                    console.error('%c脚本启动超时：未检测到课程目录（#coursetree）。'");

// Wait for the first pending task instead of selecting a later, already loaded video.
replace(`                            for (let i = pendingIndex; i < taskFrames.length; i++) {
                                const taskVideo = this._videoElInFrame(taskFrames[i]);
                                if (taskVideo) {
                                    this._currentVideoTaskIndex = i;
                                    this._videoEl = taskVideo;
                                    return taskVideo;
                                }
                            }`, `                            this._currentVideoTaskIndex = pendingIndex;
                            this._videoEl = this._videoElInFrame(taskFrames[pendingIndex]);
                            if (!this._videoEl) {
                                this._waitingVideoTaskIndex = pendingIndex;
                                helperUI.setMessage('等待第 ' + (pendingIndex + 1) + '/' + taskFrames.length + ' 个视频；可点击诊断检查跨域或加载问题');
                            }
                            return this._videoEl;`);
replace('            _getVideoEl() {', '            _getVideoEl() {\n                this._waitingVideoTaskIndex = null;');
replace("                    if (el == null) {\n                        if (this._currentStepTitle()", "                    if (el == null) {\n                        if (this._waitingVideoTaskIndex != null) throw new Error('当前视频任务点未加载或无法访问，保留顺序等待');\n                        if (this._currentStepTitle()");

// Fence asynchronous play results so Stop cannot restart playback monitoring.
replace('            async play() {\n                try {', '            async play() {\n                if (this._localStopped) return;\n                const localEpoch = this._localEpoch;\n                try {');
replace("                        this._tryTimes = 0;\n                        console.log(`%c视频开始播放", "                        if (this._localStopped || localEpoch !== this._localEpoch) return;\n                        this._tryTimes = 0;\n                        console.log(`%c视频开始播放");
replace("                    } catch (playError) {\n                        console.error", "                    } catch (playError) {\n                        if (this._localStopped || localEpoch !== this._localEpoch) return;\n                        console.error");
replace('            _handlePlayError(error) {', '            _handlePlayError(error) {\n                if (this._localStopped) return;\n                const localEpoch = this._localEpoch;');
replace("                    console.log('%c静音播放成功'", "                    if (this._localStopped || localEpoch !== this._localEpoch) return;\n                    console.log('%c静音播放成功'");
replace("                }).catch((e) => {\n                    console.error('静音播放也失败:'", "                }).catch((e) => {\n                    if (this._localStopped || localEpoch !== this._localEpoch) return;\n                    console.error('静音播放也失败:'");

// Keep new and old course trees usable, without changing the page DOM.
source = source.replaceAll("el.children('ul').children('li')", 'this._catalogChapters()');
replace("            _catalogNodesOf(chapterEl) {", `            _catalogChapters() {
                const el = this._getTreeContainer();
                const modern = el.children('ul').children('li');
                return modern.length && el.find('.posCatalog_select').length ? modern : el.find('.cells');
            },
            _catalogNodesOf(chapterEl) {
                if (!$(chapterEl).find('.posCatalog_select').length) {
                    return $(chapterEl).find('.ncells').toArray().filter(node => !node.querySelector('.ncells'));
                }`);
replace("                const nodesOf = (chapterEl) => this._catalogNodesOf(chapterEl);", `                const nodesOf = (chapterEl) => this._catalogNodesOf(chapterEl);
                if (!el.find('.posCatalog_select').length) {
                    if (override && Number.isInteger(override.chapterIndex) && chapters[override.chapterIndex]) {
                        const nodes = nodesOf(chapters[override.chapterIndex]);
                        const nodeIndex = Number(override.nodeIndex) || 0;
                        if (!nodes[nodeIndex]) return empty('旧版目录无法定位目标小节');
                        return { ok: true, source: 'tracked', chapters, chapterIndex: override.chapterIndex, nodes, nodeIndex, node: nodes[nodeIndex] };
                    }
                    for (let chapterIndex = 0; chapterIndex < chapters.length; chapterIndex++) {
                        const nodes = nodesOf(chapters[chapterIndex]);
                        const nodeIndex = nodes.findIndex(node => node.matches('.currents') || node.querySelector('.currents'));
                        if (nodeIndex >= 0) return { ok: true, source: 'legacy-active', chapters, chapterIndex, nodes, nodeIndex, node: nodes[nodeIndex] };
                    }
                    return empty('旧版目录没有 .currents 高亮小节，请手动选择小节');
                }`);
replace("const clickableSpan = $nCell.find('.posCatalog_name')[0];", "const clickableSpan = $nCell.find('.posCatalog_name, a[title], a')[0];");
replace("const titleSpan = $(position.node).find('.posCatalog_name')[0];", "const titleSpan = $(position.node).find('.posCatalog_name, a[title], a')[0];");

replace(`        try {
            app.run();`, `        try {
            helperUI.connect(app);`);
source = source.replace(/\n\}\)\(\);\s*$/, '\n' + readFileSync('local-panel.js', 'utf8') + '\n' + readFileSync('parallel-mode.js', 'utf8') + '\n})();\n');
const header = `// ==UserScript==
// @name         学习通 SHU 多视频与倍速助手
// @namespace    local.shu.xuexitong.multivideo
// @version      3.4.2
// @description  同小节顺序或并行播放，切屏暂停恢复，开始/停止/诊断，2/3/6/8 倍速选择
// @match        *://mooc1.shu.edu.cn/mycourse/studentstudy*
// @match        *://mooc1.shu.edu.cn/mooc2-ans/mycourse/studentstudy*
// @match        *://*.chaoxing.com/mycourse/studentstudy*
// @match        *://*.chaoxing.com/mooc2-ans/mycourse/studentstudy*
// @noframes
// @run-at       document-idle
// @grant        none
// ==/UserScript==
// 基础源码：ywdddddddddd/xuexitongScript PR #58
// 提交：06530033be6f142025fd7df6ae9bf70546850ba8
// 本地增强：严格顺序等待、可选并行原速播放、切屏恢复、2/3/6/8 倍速、停止后的异步保护。
// 这是本地修改版，不代表原项目已合并或官方发布。
`;
writeFileSync('学习通多视频倍速.user.js', header + source, 'utf8');
console.log('Built 学习通多视频倍速.user.js');
