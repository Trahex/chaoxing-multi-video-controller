import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEnv, tree, chapterSpecs, writeFrame, stubVideo } from './pr58-regression.mjs';

const source = readFileSync('学习通多视频倍速.user.js', 'utf8');
const html = tree(chapterSpecs(['1.1', '1.2'])) + '<div class="prev_title" title="视频"></div>'
  + [1, 2, 3].map(i => `<div class="ans-job"><iframe class="ans-insertvideo-online" id="task-${i}" src="about:blank"></iframe></div>`).join('');
const environments = [];
function envFor(markup = html) {
  const env = createEnv({ source, html: markup, url: 'https://mooc1.shu.edu.cn/mycourse/studentstudy?chapterId=1' });
  environments.push(env);
  return env;
}
async function videoFor(env, i, options) {
  const doc = await writeFrame(env, `task-${i}`, `<video id="video_html5_api" src="https://example.com/${i}.mp4"></video>`);
  return stubVideo(env, doc.querySelector('video'), options);
}
async function finish(env, video) {
  video.__state.ended = true;
  video.dispatchEvent(new env.window.Event('ended'));
  await env.advance(1100);
}
let passed = 0;
async function test(name, callback) {
  await callback();
  passed++;
  console.log('PASS ' + name);
}
try {
  await test('面板可见、手动启动、仅提供 2/3/6/8 倍速', async () => {
    const env = envFor();
    const first = await videoFor(env, 1);
    const app = await env.boot();
    const root = env.window.document.getElementById('shu-xuexitong-panel').shadowRoot;
    assert.deepEqual([...root.getElementById('rate').querySelectorAll('option')].map(x => x.value), ['2', '3', '6', '8']);
    assert.equal(first.__calls.play, 0);
    assert.equal(root.getElementById('start').disabled, false);
    root.getElementById('start').click();
    await env.advance(50);
    assert.equal(app._getVideoEl(), first);
    assert.equal(first.playbackRate, 2);
    assert.ok(first.__calls.play > 0);
    app.stop();
  });
  await test('同小节三视频按 1→2→3 播放，最后才切到下一小节', async () => {
    const env = envFor();
    const first = await videoFor(env, 1);
    const second = await videoFor(env, 2);
    const third = await videoFor(env, 3);
    const app = await env.boot();
    app.run();
    await env.advance(50);
    assert.equal(app._getVideoEl(), first);
    await finish(env, first);
    assert.equal(app._getVideoEl(), second);
    assert.equal(env.treeClicks().length, 0);
    // A stale ended event from the first player cannot skip the second player.
    first.dispatchEvent(new env.window.Event('ended'));
    await env.advance(100);
    assert.equal(app._getVideoEl(), second);
    await finish(env, second);
    assert.equal(app._getVideoEl(), third);
    assert.equal(env.treeClicks().length, 0);
    await finish(env, third);
    assert.equal(env.lastTreeClickTitle(), '1.2');
    app.stop();
  });
  await test('第一个视频延迟加载时不改播中间视频，加载后恢复顺序', async () => {
    const env = envFor();
    const second = await videoFor(env, 2);
    const app = await env.boot();
    app.run();
    await env.advance(2100);
    assert.equal(app._getVideoEl(), null);
    assert.equal(second.__calls.play, 0);
    assert.equal(env.treeClicks().length, 0);
    const first = await videoFor(env, 1);
    await env.advance(2100);
    assert.equal(app._getVideoEl(), first);
    assert.ok(first.__calls.play > 0);
    assert.equal(second.__calls.play, 0);
    app.stop();
  });
  await test('倍速即刻切换、沿用到后续视频并在重新加载脚本后保存', async () => {
    const env = envFor();
    const first = await videoFor(env, 1);
    const second = await videoFor(env, 2);
    let app = await env.boot();
    app.run();
    await env.advance(50);
    const select = env.window.document.getElementById('shu-xuexitong-panel').shadowRoot.getElementById('rate');
    for (const speed of [3, 6, 8]) {
      select.value = String(speed);
      select.dispatchEvent(new env.window.Event('change'));
      assert.equal(first.playbackRate, speed);
      assert.equal(app.configs.playbackRate, speed);
    }
    await finish(env, first);
    assert.equal(second.playbackRate, 8);
    app.stop();
    env.eval(source);
    await env.advance(1100);
    app = env.window.app;
    assert.equal(app.configs.playbackRate, 8);
    assert.equal(env.window.document.querySelectorAll('#shu-xuexitong-panel').length, 1);
    assert.equal(app._localStopped, true);
  });
  await test('停止取消待执行视频切换，清除监控并暂停播放器', async () => {
    const env = envFor();
    const first = await videoFor(env, 1);
    const second = await videoFor(env, 2);
    const app = await env.boot();
    app.run();
    await env.advance(50);
    first.__state.ended = true;
    first.dispatchEvent(new env.window.Event('ended'));
    app.stop();
    await env.advance(5000);
    assert.equal(second.__calls.play, 0);
    assert.equal(env.treeClicks().length, 0);
    assert.equal(app._checkInterval, null);
    assert.equal(app._interactionWatcher, null);
    assert.equal(app._timers.size, 0);
    assert.ok(first.__calls.pause > 0, 'stop must pause the video that just ended');
  });
  await test('播放 Promise 延迟返回时，停止后不会重新启动监控', async () => {
    const env = envFor();
    const first = await videoFor(env, 1);
    let resolvePlay;
    first.play = () => new Promise(resolve => { resolvePlay = resolve; });
    const app = await env.boot();
    app.run();
    assert.equal(typeof resolvePlay, 'function');
    app.stop();
    resolvePlay();
    await env.advance(500);
    assert.equal(app._checkInterval, null);
    assert.equal(app._localStopped, true);
    assert.equal(app._timers.size, 0);
  });
  await test('已完成的首个任务点被识别，后续未完成视频仍按顺序播放', async () => {
    const env = envFor();
    env.window.document.getElementById('task-1').parentElement.classList.add('ans-job-finished');
    const second = await videoFor(env, 2);
    const third = await videoFor(env, 3);
    const app = await env.boot();
    app.run();
    await env.advance(50);
    assert.equal(app._getVideoEl(), second);
    await finish(env, second);
    assert.equal(app._getVideoEl(), third);
    app.stop();
  });
  await test('跨域的首个视频有诊断，不静默改播后面的视频', async () => {
    const env = envFor();
    const frame = env.window.document.getElementById('task-1');
    Object.defineProperty(frame, 'contentDocument', { get: () => null });
    Object.defineProperty(frame, 'contentWindow', { get: () => ({ get document() { throw new env.window.DOMException('Blocked', 'SecurityError'); } }) });
    const second = await videoFor(env, 2);
    const app = await env.boot();
    app.run();
    await env.advance(100);
    const rows = env.window.__shuXuexitongUI.diagnose();
    assert.equal(rows[0].框架可访问, false);
    assert.equal(app._getVideoEl(), null);
    assert.equal(second.__calls.play, 0);
    assert.equal(env.treeClicks().length, 0);
    app.stop();
  });
  await test('旧版 .cells/.ncells/.currents 目录能够定位及选择下一小节', async () => {
    const env = envFor('<div id="coursetree"><div class="cells"><div class="ncells"><a title="旧1">旧1</a><span class="currents"></span></div><div class="ncells"><a title="旧2">旧2</a></div></div></div>');
    const app = await env.boot();
    const position = app._resolveCatalogPosition('test');
    assert.equal(position.ok, true);
    assert.equal(position.nodeIndex, 0);
    assert.equal(position.nodes.length, 2);
    let chosen;
    app._localStopped = false;
    app.playCurrentIndex = node => { chosen = node; };
    app.nextUnit();
    assert.equal(chosen.querySelector('a').title, '旧2');
    app.stop();
  });
  await test('并行模式一次启动 12 个播放器，原速静音，显示实际在播数', async () => {
    const markup = tree(chapterSpecs(['1.1', '1.2'])) + '<div class="prev_title" title="视频"></div>'
      + Array.from({ length: 12 }, (_, i) => `<div class="ans-job"><iframe class="ans-insertvideo-online" id="task-${i + 1}" src="about:blank"></iframe></div>`).join('');
    const env = envFor(markup);
    const videos = [];
    for (let i = 1; i <= 12; i++) videos.push(await videoFor(env, i));
    const app = await env.boot();
    const root = env.window.document.getElementById('shu-xuexitong-panel').shadowRoot;
    const mode = root.getElementById('mode');
    mode.value = 'parallel';
    mode.dispatchEvent(new env.window.Event('change'));
    root.getElementById('start').click();
    assert.ok(videos.every(video => video.__calls.play === 1), 'all play() calls issued before awaiting any promise');
    await env.advance(50);
    assert.ok(videos.every(video => video.playbackRate === 1 && video.muted && !video.paused));
    assert.equal(app._parallel.summary().playing, 12);
    assert.equal(app._parallel.summary().total, 12);
    assert.equal(root.getElementById('rate').disabled, true);
    for (const video of videos) video.__state.currentTime = 5;
    await env.advance(1000);
    assert.equal(app._parallel.summary().advancing, 12);
    const callsBeforeStop = videos.map(video => video.__calls.play);
    app.stop();
    env.window.dispatchEvent(new env.window.Event('blur'));
    await env.advance(5000);
    assert.equal(app._parallel, null);
    assert.ok(videos.every(video => video.paused));
    assert.deepEqual(videos.map(video => video.__calls.play), callsBeforeStop);
    assert.equal(env.clock.timers.size, 1, 'only the panel refresh timer remains');
  });
  await test('并行切屏后恢复全部暂停播放器，近期操作不会被误判为手动暂停', async () => {
    const env = envFor();
    const videos = [await videoFor(env, 1), await videoFor(env, 2), await videoFor(env, 3)];
    const app = await env.boot();
    const root = env.window.document.getElementById('shu-xuexitong-panel').shadowRoot;
    root.getElementById('mode').value = 'parallel';
    root.getElementById('mode').dispatchEvent(new env.window.Event('change'));
    app.run();
    await env.advance(2500);
    Object.defineProperty(env.window.document, 'hidden', { configurable: true, get: () => true });
    env.window.document.dispatchEvent(new env.window.Event('visibilitychange'));
    for (const video of videos) {
      video.ownerDocument.dispatchEvent(new env.window.Event('pointerdown'));
      video.pause();
    }
    await env.advance(500);
    assert.ok(videos.every(video => !video.paused));
    assert.ok(videos.every(video => video.__calls.play >= 2));
    assert.equal(app._parallel.summary().playing, 3);
    app.stop();
  });
  await test('并行前台手动暂停不被抢播，关闭后台恢复后切屏不自动恢复', async () => {
    const env = envFor();
    const videos = [await videoFor(env, 1), await videoFor(env, 2), await videoFor(env, 3)];
    const app = await env.boot();
    const root = env.window.document.getElementById('shu-xuexitong-panel').shadowRoot;
    root.getElementById('mode').value = 'parallel';
    root.getElementById('mode').dispatchEvent(new env.window.Event('change'));
    app.run();
    await env.advance(2500);
    videos[0].ownerDocument.dispatchEvent(new env.window.Event('pointerdown'));
    videos[0].pause();
    await env.advance(3000);
    assert.equal(videos[0].__calls.play, 1);
    assert.equal(videos[0].paused, true);
    root.getElementById('background').checked = false;
    Object.defineProperty(env.window.document, 'hidden', { configurable: true, get: () => true });
    videos[1].pause();
    await env.advance(3000);
    assert.equal(videos[1].paused, true);
    assert.equal(videos[1].__calls.play, 1);
    app.stop();
  });
  await test('并行遇到互动题暂停恢复，处理后继续；播放结束不抢跳章节', async () => {
    const env = envFor();
    const videos = [await videoFor(env, 1), await videoFor(env, 2), await videoFor(env, 3)];
    const app = await env.boot();
    const root = env.window.document.getElementById('shu-xuexitong-panel').shadowRoot;
    root.getElementById('mode').value = 'parallel';
    root.getElementById('mode').dispatchEvent(new env.window.Event('change'));
    app.run();
    await env.advance(2500);
    app._findInteractionDialog = () => ({ text: '请完成题目' });
    await env.advance(1100);
    assert.ok(videos.every(video => video.paused));
    assert.match(app._parallel.summary().message, /互动题/);
    app._findInteractionDialog = () => null;
    await env.advance(1100);
    assert.ok(videos.every(video => !video.paused));
    for (const video of videos) {
      video.__state.ended = true;
      video.dispatchEvent(new env.window.Event('ended'));
    }
    await env.advance(1500);
    assert.equal(app._parallel.summary().ended, 3);
    assert.equal(env.treeClicks().length, 0);
    app.stop();
  });
  await test('顺序模式切屏暂停不会被近期点击误判为手动暂停', async () => {
    const env = envFor();
    const first = await videoFor(env, 1);
    const app = await env.boot();
    app.run();
    await env.advance(2500);
    app._lastUserInteractionTs = env.clock.now;
    env.window.dispatchEvent(new env.window.Event('blur'));
    first.pause();
    assert.equal(app._userPaused, false);
    await env.advance(1800);
    assert.ok(first.__calls.play >= 2);
    assert.equal(first.paused, false);
    app.stop();
  });
  console.log(`All ${passed} scenario tests passed.`);
} finally {
  for (const env of environments) env.close();
}
