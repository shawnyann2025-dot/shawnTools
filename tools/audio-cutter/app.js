(() => {
  const $ = (id) => document.getElementById(id);
  const fileInput = $('file');
  const drop = $('drop');
  const editor = $('editor');
  const wave = $('wave');
  const canvas = $('canvas');
  const ctx2d = canvas.getContext('2d');
  const startInput = $('start');
  const endInput = $('end');
  const lenInput = $('len');
  const modeSelect = $('mode');
  const fadeIn = $('fadeIn');
  const fadeOut = $('fadeOut');
  const playBtn = $('play');
  const exportBtn = $('export');
  const status = $('status');

  const HANDLE_PX = 10;
  const JOIN_FADE = 0.005; // 删除模式下拼接处的微小淡化，避免爆音

  let audioCtx = null;
  let buffer = null;
  let fileName = 'audio';
  let peaks = null;
  const sel = { start: 0, end: 0 };
  let cursor = null;
  const player = { source: null, startedAt: 0, offset: 0, map: null, raf: 0 };

  // ---------- 时间格式 ----------
  const fmt = (t) => {
    t = Math.max(0, t);
    const m = Math.floor(t / 60);
    const s = t - m * 60;
    return `${m}:${s.toFixed(3).padStart(6, '0')}`;
  };
  const parse = (str) => {
    const parts = String(str).trim().split(':').map(Number);
    if (!parts.length || parts.some((n) => !Number.isFinite(n))) return NaN;
    return parts.reduce((acc, n) => acc * 60 + n, 0);
  };

  // ---------- 加载 ----------
  const getCtx = () => (audioCtx ||= new (window.AudioContext || window.webkitAudioContext)());

  async function load(file) {
    if (!file) return;
    stop();
    status.textContent = '正在解码…';
    try {
      const data = await file.arrayBuffer();
      buffer = await getCtx().decodeAudioData(data);
    } catch (e) {
      status.textContent = '';
      alert('无法解码该文件，请换一个格式试试。');
      return;
    }
    fileName = file.name.replace(/\.[^.]+$/, '') || 'audio';
    $('name').textContent = file.name;
    $('info').textContent = `${fmt(buffer.duration)} · ${buffer.sampleRate} Hz · ${buffer.numberOfChannels === 1 ? '单声道' : buffer.numberOfChannels + ' 声道'}`;
    $('total').textContent = fmt(buffer.duration);
    sel.start = 0;
    sel.end = buffer.duration;
    cursor = null;
    drop.hidden = true;
    editor.hidden = false;
    status.textContent = '';
    resize();
    syncInputs();
  }

  fileInput.addEventListener('change', () => load(fileInput.files[0]));
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('over')));
  drop.addEventListener('drop', (e) => { e.preventDefault(); load(e.dataTransfer.files[0]); });
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer.files[0]) load(e.dataTransfer.files[0]); });

  $('reset').onclick = () => {
    stop();
    buffer = null;
    fileInput.value = '';
    editor.hidden = true;
    drop.hidden = false;
  };

  // ---------- 波形绘制 ----------
  function computePeaks(width) {
    const chans = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
    const len = buffer.length;
    const out = new Float32Array(width * 2);
    const per = len / width;
    const step = Math.max(1, Math.floor(per / 400)); // 长音频时跳采样，保持流畅
    for (let x = 0; x < width; x++) {
      let min = 0, max = 0;
      const from = Math.floor(x * per);
      const to = Math.min(len, Math.floor((x + 1) * per));
      for (const ch of chans) {
        for (let i = from; i < to; i += step) {
          const v = ch[i];
          if (v < min) min = v;
          else if (v > max) max = v;
        }
      }
      out[x * 2] = min;
      out[x * 2 + 1] = max;
    }
    return out;
  }

  function resize() {
    if (!buffer) return;
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = wave.getBoundingClientRect();
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    peaks = computePeaks(canvas.width);
    draw();
  }
  new ResizeObserver(resize).observe(wave);

  function draw(playhead) {
    if (!buffer || !peaks) return;
    const W = canvas.width, H = canvas.height, mid = H / 2;
    const dpr = window.devicePixelRatio || 1;
    const css = getComputedStyle(document.documentElement);
    const accent = css.getPropertyValue('--accent').trim() || '#6366f1';
    const muted = css.getPropertyValue('--muted').trim() || '#888';
    const removing = modeSelect.value === 'remove';
    const sx = (sel.start / buffer.duration) * W;
    const ex = (sel.end / buffer.duration) * W;

    ctx2d.clearRect(0, 0, W, H);

    // 选区背景
    ctx2d.fillStyle = removing ? 'rgba(239,68,68,.12)' : hexA(accent, 0.12);
    ctx2d.fillRect(sx, 0, ex - sx, H);

    // 波形
    for (let x = 0; x < W; x++) {
      const inSel = x >= sx && x <= ex;
      const highlighted = removing ? !inSel : inSel;
      ctx2d.fillStyle = highlighted ? accent : hexA(muted, 0.45);
      const min = peaks[x * 2], max = peaks[x * 2 + 1];
      const y1 = mid - max * mid * 0.95;
      const y2 = mid - min * mid * 0.95;
      ctx2d.fillRect(x, y1, 1, Math.max(1, y2 - y1));
    }

    // 选区边缘
    ctx2d.fillStyle = removing ? '#ef4444' : accent;
    for (const x of [sx, ex]) {
      ctx2d.fillRect(x - dpr, 0, 2 * dpr, H);
      ctx2d.beginPath();
      ctx2d.roundRect?.(x - 5 * dpr, mid - 14 * dpr, 10 * dpr, 28 * dpr, 4 * dpr);
      ctx2d.fill();
    }

    // 光标 / 播放头
    const t = playhead ?? cursor;
    if (t != null) {
      ctx2d.fillStyle = css.getPropertyValue('--text').trim() || '#000';
      ctx2d.fillRect((t / buffer.duration) * W - dpr / 2, 0, dpr, H);
    }
  }

  function hexA(color, a) {
    const m = color.match(/^#([\da-f]{3}|[\da-f]{6})$/i);
    if (!m) return color;
    let h = m[1];
    if (h.length === 3) h = [...h].map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  }

  // ---------- 交互：选区 ----------
  const timeAt = (clientX) => {
    const r = wave.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * buffer.duration;
  };
  const pxOf = (t) => (t / buffer.duration) * wave.getBoundingClientRect().width;

  let drag = null;
  wave.addEventListener('pointerdown', (e) => {
    if (!buffer) return;
    wave.setPointerCapture(e.pointerId);
    const x = e.clientX - wave.getBoundingClientRect().left;
    const t = timeAt(e.clientX);
    if (Math.abs(x - pxOf(sel.start)) <= HANDLE_PX) drag = { type: 'start' };
    else if (Math.abs(x - pxOf(sel.end)) <= HANDLE_PX) drag = { type: 'end' };
    else drag = { type: 'new', anchor: t, x0: e.clientX, moved: false };
  });

  wave.addEventListener('pointermove', (e) => {
    if (!buffer) return;
    if (!drag) {
      const x = e.clientX - wave.getBoundingClientRect().left;
      const near = Math.abs(x - pxOf(sel.start)) <= HANDLE_PX || Math.abs(x - pxOf(sel.end)) <= HANDLE_PX;
      wave.style.cursor = near ? 'ew-resize' : 'crosshair';
      return;
    }
    const t = timeAt(e.clientX);
    if (drag.type === 'start') sel.start = Math.min(t, sel.end);
    else if (drag.type === 'end') sel.end = Math.max(t, sel.start);
    else {
      if (!drag.moved && Math.abs(e.clientX - drag.x0) < 3) return;
      drag.moved = true;
      sel.start = Math.min(drag.anchor, t);
      sel.end = Math.max(drag.anchor, t);
    }
    if (player.source) stop();
    syncInputs();
  });

  const endDrag = (e) => {
    if (!drag) return;
    if (drag.type === 'new' && !drag.moved) {
      // 单击：设置播放起点
      cursor = timeAt(e.clientX);
      const wasPlaying = !!player.source;
      stop();
      if (wasPlaying) play();
      else draw();
    }
    drag = null;
  };
  wave.addEventListener('pointerup', endDrag);
  wave.addEventListener('pointercancel', () => (drag = null));

  function syncInputs() {
    startInput.value = fmt(sel.start);
    endInput.value = fmt(sel.end);
    lenInput.value = fmt(sel.end - sel.start);
    exportBtn.disabled = modeSelect.value === 'keep' ? sel.end - sel.start <= 0 : sel.end - sel.start >= buffer.duration;
    draw();
  }

  function commitInput(input, key) {
    const t = parse(input.value);
    if (Number.isFinite(t)) {
      sel[key] = Math.min(buffer.duration, Math.max(0, t));
      if (sel.start > sel.end) [sel.start, sel.end] = [sel.end, sel.start];
      stop();
    }
    syncInputs();
  }
  startInput.addEventListener('change', () => commitInput(startInput, 'start'));
  endInput.addEventListener('change', () => commitInput(endInput, 'end'));
  [startInput, endInput].forEach((i) => i.addEventListener('keydown', (e) => e.key === 'Enter' && i.blur()));

  $('all').onclick = () => { sel.start = 0; sel.end = buffer.duration; stop(); syncInputs(); };
  modeSelect.onchange = () => { stop(); syncInputs(); };
  const showFade = () => {
    $('fadeInVal').textContent = `${(+fadeIn.value).toFixed(1)} s`;
    $('fadeOutVal').textContent = `${(+fadeOut.value).toFixed(1)} s`;
    if (player.source) stop();
  };
  fadeIn.oninput = fadeOut.oninput = showFade;

  // ---------- 渲染输出 ----------
  // 返回 { buffer, map }，map 把输出时间映射回原始时间（用于播放头显示）
  function render() {
    const sr = buffer.sampleRate;
    const nCh = buffer.numberOfChannels;
    const s = Math.round(sel.start * sr);
    const e = Math.round(sel.end * sr);
    const removing = modeSelect.value === 'remove';
    const segments = removing ? [[0, s], [e, buffer.length]].filter(([a, b]) => b > a) : [[s, e]];
    const total = segments.reduce((n, [a, b]) => n + b - a, 0);
    const out = getCtx().createBuffer(nCh, Math.max(1, total), sr);

    for (let c = 0; c < nCh; c++) {
      const src = buffer.getChannelData(c);
      const dst = out.getChannelData(c);
      let pos = 0;
      segments.forEach(([a, b], i) => {
        dst.set(src.subarray(a, b), pos);
        if (segments.length > 1) {
          // 拼接处做极短淡化
          const n = Math.min(Math.round(JOIN_FADE * sr), b - a);
          if (i > 0) for (let k = 0; k < n; k++) dst[pos + k] *= k / n;
          if (i < segments.length - 1) for (let k = 0; k < n; k++) dst[pos + (b - a) - 1 - k] *= k / n;
        }
        pos += b - a;
      });
      const fi = Math.min(total, Math.round(+fadeIn.value * sr));
      const fo = Math.min(total, Math.round(+fadeOut.value * sr));
      for (let k = 0; k < fi; k++) dst[k] *= k / fi;
      for (let k = 0; k < fo; k++) dst[total - 1 - k] *= k / fo;
    }

    const map = removing
      ? (t) => (t < sel.start ? t : t + (sel.end - sel.start))
      : (t) => t + sel.start;
    return { buffer: out, map };
  }

  // ---------- 播放 ----------
  function play() {
    if (!buffer) return;
    const ac = getCtx();
    ac.resume();
    const { buffer: out, map } = render();

    // 从光标处开始（若光标落在输出范围内）
    let offset = 0;
    if (cursor != null) {
      const removing = modeSelect.value === 'remove';
      if (!removing && cursor >= sel.start && cursor < sel.end) offset = cursor - sel.start;
      else if (removing && cursor < sel.start) offset = cursor;
      else if (removing && cursor >= sel.end) offset = cursor - (sel.end - sel.start);
    }

    const source = ac.createBufferSource();
    source.buffer = out;
    source.connect(ac.destination);
    source.onended = () => { if (player.source === source) stop(); };
    source.start(0, offset);
    Object.assign(player, { source, startedAt: ac.currentTime - offset, map, duration: out.duration });
    playBtn.textContent = '■ 停止';

    const tick = () => {
      const t = ac.currentTime - player.startedAt;
      if (t >= player.duration) return;
      draw(player.map(t));
      player.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  function stop() {
    cancelAnimationFrame(player.raf);
    if (player.source) {
      const s = player.source;
      player.source = null;
      try { s.stop(); } catch {}
    }
    playBtn.textContent = '▶ 试听';
    draw();
  }

  playBtn.onclick = () => (player.source ? stop() : play());
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || !buffer || editor.hidden) return;
    if (['INPUT', 'SELECT', 'BUTTON'].includes(document.activeElement.tagName)) return;
    e.preventDefault();
    playBtn.click();
  });

  // ---------- 导出 WAV ----------
  function encodeWav(buf) {
    const nCh = buf.numberOfChannels;
    const sr = buf.sampleRate;
    const len = buf.length;
    const dataSize = len * nCh * 2;
    const view = new DataView(new ArrayBuffer(44 + dataSize));
    const str = (o, s) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
    str(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); str(8, 'WAVE');
    str(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, nCh, true); view.setUint32(24, sr, true);
    view.setUint32(28, sr * nCh * 2, true); view.setUint16(32, nCh * 2, true); view.setUint16(34, 16, true);
    str(36, 'data'); view.setUint32(40, dataSize, true);

    const chans = Array.from({ length: nCh }, (_, i) => buf.getChannelData(i));
    let o = 44;
    for (let i = 0; i < len; i++) {
      for (let c = 0; c < nCh; c++) {
        const v = Math.max(-1, Math.min(1, chans[c][i]));
        view.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
        o += 2;
      }
    }
    return new Blob([view], { type: 'audio/wav' });
  }

  exportBtn.onclick = () => {
    if (!buffer) return;
    status.textContent = '正在导出…';
    setTimeout(() => {
      const blob = encodeWav(render().buffer);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileName}_剪辑.wav`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      status.textContent = `已导出 ${a.download}（${(blob.size / 1048576).toFixed(2)} MB）`;
    }, 20);
  };
})();
