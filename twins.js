// Optional presentation sharing the live public engine; no second engine, API,
// word list or voice bank. Open iceface_onomatoi.html?twins=1.
(() => {
  if (new URLSearchParams(location.search).get('twins') !== '1') return;
  document.body.classList.add('twins-mode');
  document.documentElement.lang = 'ja';
  document.title = 'ことばの双子・実験中 — Onomatoi';
  const root = document.createElement('section');
  root.id = 'twins';
  root.setAttribute('aria-labelledby', 'twins-title');
  root.innerHTML = `
    <div class="twins-heading"><span class="twins-label">ONOMATOI / 実験中</span>
      <h1 id="twins-title">ことばの双子</h1>
      <p>同じ一筆から、ふたつの声。<br>右のかたちを大きく、小さく。ことばはどう変わる？</p></div>
    <div id="twins-loading"></div>
    <div class="twins-grid">
      <section class="twin-card" id="twin-card-left" aria-label="左の双子">
        <header><strong>もとの一筆</strong><span>ここに描く</span></header>
        <div class="twin-board"><canvas id="twin-left" aria-label="左の枠に一筆描く"></canvas>
          <p id="twin-invite-left">まんなかに、ひと筆。<br>小さめに描くと、大きくできます。</p></div>
        <output class="twin-word" id="twin-word-left">…</output>
        <button class="twin-listen" id="twin-play-left" disabled>▶ 左を聴く</button>
      </section>
      <section class="twin-card" id="twin-card-right" aria-label="右の双子">
        <header><strong id="twin-right-title">大きさを変えた一筆</strong><span id="twin-size">もとの 100%</span></header>
        <div class="twin-board"><canvas id="twin-right" aria-label="拡大縮小した右の形"></canvas>
          <p id="twin-invite-right">もうひとつの形が<br>ここに生まれます。</p></div>
        <output class="twin-word" id="twin-word-right">…</output>
        <button class="twin-listen" id="twin-play-right" disabled>▶ 右を聴く</button>
      </section>
    </div>
    <div class="twins-controls">
      <div class="twin-modes" role="group" aria-label="右のかたちの動かし方">
        <button type="button" class="twin-mode" data-mode="scale" aria-pressed="true" disabled>大きさ</button>
        <button type="button" class="twin-mode" data-mode="y" aria-pressed="false" disabled>上下</button>
        <button type="button" class="twin-mode" data-mode="x" aria-pressed="false" disabled>左右</button>
        <button type="button" class="twin-mode" data-mode="rot" aria-pressed="false" disabled>回転</button>
        <button type="button" class="twin-mode" data-mode="sx" aria-pressed="false" disabled>横に伸ばす</button>
        <button type="button" class="twin-mode" data-mode="sy" aria-pressed="false" disabled>縦に伸ばす</button>
      </div>
      <p id="twin-axis-note" class="twins-footnote twin-axis-note" hidden></p>
      <label class="twins-scale-label" for="twin-scale"><span id="twin-scale-title">右のかたちの大きさ</span><output id="twin-percent">100%</output></label>
      <input id="twin-scale" type="range" min="40" max="200" step="1" value="100" disabled aria-describedby="twin-scale-note">
      <div class="twin-band-track" id="twin-band-wrap" hidden>
        <div class="twin-band" id="twin-band" role="group" aria-label="40%から上限までの全倍率の語。区間を押すと、その倍率の右の声が鳴ります"></div>
        <span class="twin-band-100" id="twin-band-100" aria-hidden="true"></span>
        <span class="twin-band-now" id="twin-band-now" aria-hidden="true"></span>
      </div>
      <div class="twins-scale-ends"><span id="twin-scale-min">小さく · 40%</span><span id="twin-scale-max">大きく · 200%</span></div>
      <div class="twin-band-info" id="twin-band-info" hidden>
        <p id="twin-band-desc" class="twin-band-desc" aria-live="polite"></p>
        <ul class="twin-band-legend" aria-label="帯の色">
          <li><i class="L1"></i><span>1〜2%</span></li><li><i class="L2"></i><span>3〜5%</span></li><li><i class="L3"></i><span>6〜10%</span></li>
          <li><i class="L4"></i><span>11〜20%</span></li><li><i class="L5"></i><span>21%〜</span></li><li><i class="R"></i><span>行って戻る</span></li>
        </ul>
        <p class="twins-footnote" id="twin-band-note"></p>
      </div>
      <div class="twins-actions">
        <button id="twin-pair" disabled>▶ 左 → 右を聴く</button>
        <button id="twin-reset" class="twin-secondary" disabled>100%に戻す</button>
        <button id="twin-stop" class="twin-quiet">■ 止める</button>
        <button id="twin-clear" class="twin-quiet">描き直す</button>
      </div>
      <p id="twin-message" role="status">左の枠に描くと、ふたつのことばが生まれます。</p>
      <p id="twin-scale-note" class="twins-footnote"></p>
      <p class="twins-footnote">Onomatoiと同じしくみ・同じ声で動く、試作の聴き比べです。<br>一筆はこの画面だけに残ります。再読み込みすると消えます。<br>つくる・こえ　PuppeTwin</p>
    </div><a class="twins-back" href="./iceface_onomatoi.html">← おのまといに戻る</a>`;
  document.querySelector('main').prepend(root);
  const $ = id => document.getElementById(id);
  $('twins-loading').append($('loading-note'));
  const left = $('twin-left'), right = $('twin-right'), scale = $('twin-scale');
  // A fixed square keeps both interpretations identical across resizing/rotation.
  const size = 600;
  let source = [], draft = [], rightPoints = [], leftResult = null, rightResult = null;
  let pointer = null, playbackToken = 0, revision = 0, renderPending = false;
  // How the right shape is moved: size (40%..limit), position (up/down, left/right) of its bounding-box centre,
  // rotation (degrees, about the box centre) or a one-axis stretch (40%..limit). `unit` = the slider's unit.
  const BAND_UNIT = '帯 = つまみの全範囲 (1%刻み) の語。区切り = 語が変わる位置。<br>色が濃いほど、同じ語が続く幅が広い。';
  const AXIS = (axis, name, lo, hi) => ({ axis, title: `右のかたちの${name}の位置`, heading: '位置を変えた一筆', canvas: '位置を動かした右の形',
    value: v => `${lo[0]}から ${v}%`, size: v => `${lo[0]}から ${v}%`, reset: '元の位置に戻す', same: '位置が変わっても、同じことば。',
    ends: r => [`${lo} · ${r.min}%`, `${hi} · ${r.max}%`], bandLabel: r => `${name}の位置、${r.min}%から${r.max}%までの全範囲の語。区間を押すと、その位置の右の声が鳴ります`,
    note: '指を離すと、右の声が鳴ります。動かせる範囲は、形が枠に収まるところまで。', bandNote: () => `${BAND_UNIT}縦線 = 元の位置。`,
    unset: 'この位置では声になりません。', at: '右の位置を動かしてみて。', unit: '%' });
  const STRETCH = (axis, dir, name, lo, hi) => ({ axis, unit: '%', title: `右のかたちの${name}`, heading: `${dir}に伸ばした一筆`, canvas: `${dir}に伸ばした右の形`,
    value: v => `${name} ${v}%`, size: v => `${name} ${v}%`, reset: '100%に戻す', same: `${name}が変わっても、同じことば。`,
    ends: r => [`${lo} · ${r.min}%`, `${hi} · ${r.max}%`], bandLabel: r => `${name}、${r.min}%から${r.max}%までの全範囲の語。区間を押すと、その${name}の右の声が鳴ります`,
    note: `指を離すと、右の声が鳴ります。${dir}にだけ伸び縮みします。上限は、形が枠に収まるところまで。`,
    bandNote: r => `帯 = ${r.min}%〜上限の全範囲の語。区切り = 語が変わる位置。<br>色が濃いほど、同じ語が続く幅が広い。縦線 = 100%。`,
    unset: `この${name}では声になりません。`, at: `右の${name}を動かしてみて。` });
  const MODES = {
    scale: { title: '右のかたちの大きさ', heading: '大きさを変えた一筆', canvas: '拡大縮小した右の形', value: v => `${v}%`, size: v => `もとの ${v}%`,
      reset: '100%に戻す', same: '大きさが変わっても、同じことば。', ends: r => [`小さく · ${r.min}%`, `大きく · ${r.max}%`],
      bandLabel: r => `${r.min}%から${r.max}%までの全倍率の語。区間を押すと、その倍率の右の声が鳴ります`,
      note: '指を離すと、右の声が鳴ります。大きさの上限は、形が枠に収まるところまで。<br>形が変わっても、同じことばになることがあります。',
      bandNote: r => `帯 = ${r.min}%〜上限の全倍率の語。区切り = 語が変わる位置。<br>色が濃いほど、同じ語が続く幅が広い。縦線 = 100%。`,
      unset: 'もう少し大きくすると、声になります。', at: '右の大きさを動かしてみて。', unit: '%' },
    y: { ...AXIS('y', '上下', '上', '下'), aside: '高さは声の明るさの軸。上ほど明るい' },
    x: { ...AXIS('x', '左右', '左', '右'), aside: '左右は語に使わない (iOS 版では声の左右の聞こえに使う・Web には左右の聞こえはない)' },
    rot: { title: '右のかたちの向き', heading: '向きを変えた一筆', canvas: '回転した右の形', unit: '°',
      value: v => v === 0 ? '元の向き' : v > 0 ? `時計回りに ${v}°` : `反時計回りに ${-v}°`,
      size: v => v === 0 ? '元の向き' : v > 0 ? `時計回りに ${v}°` : `反時計回りに ${-v}°`,
      reset: '元の向きに戻す', same: '向きが変わっても、同じことば。', ends: r => [`反時計 · ${r.min}°`, `時計 · ${r.max}°`],
      bandLabel: r => `${r.min}度から${r.max}度までの全範囲の語。区間を押すと、その向きの右の声が鳴ります`,
      note: '指を離すと、右の声が鳴ります。回せる範囲は、形が枠に収まるところまで。', bandNote: () => '帯 = つまみの全範囲 (1度刻み) の語。区切り = 語が変わる位置。<br>色が濃いほど、同じ語が続く幅が広い。縦線 = 元の向き。',
      unset: 'この向きでは声になりません。', at: '右の向きを動かしてみて。',
      aside: '向きは形の読み (角・弧の向き) に効く。開いた弧は向きで語が変わる' },
    sx: { ...STRETCH('x', '横', '横幅', '細く', '太く'), aside: '縦横の比は口の形 (開き・丸み) の読みに効く' },
    sy: { ...STRETCH('y', '縦', '縦幅', '細く', '太く'), aside: '縦横の比は口の形 (開き・丸み) の読みに効く' }
  };
  const BAND_HINT = '区間にふれると、その位置の語が分かります。押すと、右の声が鳴ります。';
  let mode = 'scale', ranges = {}, bands = {}, bandRun = 0, bandTimer = 0, bandWidth = 0;
  const range = () => ranges[mode] ?? { min: 40, max: 200, origin: 100 };
  const bandState = () => bands[mode] ?? (bands[mode] = { words: [], done: false });
  const enabledIds = ['twin-play-left', 'twin-play-right', 'twin-pair', 'twin-reset', 'twin-scale'];
  function enable(value) {
    enabledIds.forEach(id => { $(id).disabled = !value; });
    root.querySelectorAll('.twin-mode').forEach(b => { b.disabled = !value; });
  }
  function stop() {
    playbackToken++;
    pendingEvent = null;
    stopAll();
    root.querySelectorAll('.is-speaking').forEach(el => el.classList.remove('is-speaking'));
  }
  function paint(target, points) {
    const rect = target.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    target.width = Math.round(rect.width * dpr); target.height = Math.round(rect.height * dpr);
    const ctx = target.getContext('2d');
    ctx.setTransform(target.width / size, 0, 0, target.height / size, 0, 0);
    ctx.strokeStyle = '#282828'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.stroke();
  }
  function read(points) {
    const ink = TwinsGeometry.prepare(points, size);
    return interpretStroke(ink.points, ink.w, ink.h,
      { coarse: true, hc: 0, language: 'ja' });
  }
  function word(result) { return result.event.displayWordOverride ?? namingKanaOf(result.event.moras); }
  function updateRight() {
    if (!leftResult) return;
    const percent = Number(scale.value), m = MODES[mode], origin = range().origin;
    rightPoints = transform(source, percent);
    rightResult = percent === origin ? leftResult : read(rightPoints);
    paint(right, rightPoints);
    $('twin-word-right').textContent = rightResult ? word(rightResult) : '…';
    $('twin-percent').textContent = m.value(percent);
    $('twin-size').textContent = m.size(percent);
    $('twin-message').textContent = !rightResult ? m.unset
      : percent === origin ? `同じかたち、同じことば。${m.at}`
      : word(leftResult) === word(rightResult) ? `${m.same}声も聴き比べてみて。`
      : 'ことばが変わりました。左と右を聴き比べてみて。';
    $('twin-play-right').disabled = !rightResult;
    $('twin-pair').disabled = !rightResult;
    markBand();
  }
  // The right shape for a slider value in the current mode (the origin value is the untouched drawing).
  function transform(points, percent) {
    if (percent === range().origin) return points.map(p => ({ ...p }));
    if (mode === 'scale') return TwinsGeometry.scale(points, percent / 100);
    if (mode === 'rot') return TwinsGeometry.rotate(points, percent);
    if (mode === 'sx' || mode === 'sy') return TwinsGeometry.stretch(points, MODES[mode].axis, percent / 100);
    return TwinsGeometry.moveTo(points, size, MODES[mode].axis, percent);
  }
  // The word band: every 1% over the slider's whole range, read with the same read()/word() as the slider.
  function bandWord(points, percent) {
    try {
      const result = read(transform(points, percent));
      return result ? word(result) : '∅';
    } catch (e) { console.warn('twins band', percent, e); return '∅'; }
  }
  function stopBand() { bandRun++; clearTimeout(bandTimer); }
  function hideBand() { $('twin-band-wrap').hidden = true; $('twin-band-info').hidden = true; }
  // Computes (or resumes) the current mode's band; a finished band is reused. Words are kept per mode in `bands`.
  function startBand() {
    stopBand();
    const run = bandRun, rev = revision, points = source, r = range(), count = r.max - r.min + 1, state = bandState(), m = mode;
    $('twin-band-wrap').hidden = false; $('twin-band-info').hidden = false;
    $('twin-band').setAttribute('aria-label', MODES[m].bandLabel(r));
    $('twin-band-note').innerHTML = MODES[m].bandNote(r);
    const step = () => {
      // A new stroke / clear / mode switch changes revision or bandRun: drop the stale computation.
      if (run !== bandRun || rev !== revision) return;
      const t0 = performance.now();
      while (state.words.length < count && (state.words.length === 0 || performance.now() - t0 < 10)) {
        const percent = r.min + state.words.length;
        state.words.push(percent === r.origin ? word(leftResult) : bandWord(points, percent));
      }
      state.done = state.words.length >= count;
      renderBand();
      if (!state.done) bandTimer = setTimeout(step, 0);
    };
    step();
  }
  function runText(r) {
    const u = MODES[mode].unit, range = r.length === 1 ? `${r.start}${u}` : `${r.start}〜${r.start + r.length - 1}${u}`;
    return `${range}: ${r.word === '∅' ? '∅(語にならない)' : r.word}${r.returns ? ' (すぐ元の語に戻る)' : ''}`;
  }
  function bandDesc(text) {
    const r = range(), state = bandState();
    $('twin-band-desc').textContent = text ?? (state.done ? BAND_HINT : `帯を計算中… ${Math.round(state.words.length / (r.max - r.min + 1) * 100)}%`);
  }
  function renderBand() {
    const band = $('twin-band'), r0 = range(), span = r0.max - r0.min + 1, state = bandState(), bandDone = state.done,
      runs = TwinsGeometry.runs(state.words, r0.min);
    bandWidth = band.clientWidth;   // labels depend on it; re-render only when the width changes
    band.setAttribute('aria-busy', String(!bandDone));
    band.replaceChildren(...runs.map(r => {
      // Computing: plain cells (not yet operable). Done: one button per run.
      const el = document.createElement(bandDone ? 'button' : 'span');
      el.className = `s ${r.returns ? 'R' : 'L' + TwinsGeometry.bandLevel(r.length)}`;
      el.style.flex = `0 0 ${r.length / span * 100}%`;
      if (r.length / span * bandWidth < 4) el.classList.add('thin');   // keep a 1px gap on very narrow runs
      // Show the word only where it fits (~13px per kana); narrow runs stay blank.
      if (r.length / span * bandWidth >= r.word.length * 13 + 8) el.textContent = r.word;
      if (bandDone) {
        el.type = 'button'; el.title = runText(r); el.setAttribute('aria-label', runText(r));
        el.dataset.start = r.start; el.dataset.length = r.length;
        el.onclick = () => {
          scale.value = String(Math.round(r.start + (r.length - 1) / 2));
          updateRight(); hear(['right']);
        };
        el.addEventListener('pointerenter', () => bandDesc(runText(r)));
        el.addEventListener('pointerleave', () => bandDesc());
        el.addEventListener('focus', () => bandDesc(runText(r)));
        el.addEventListener('blur', () => bandDesc());
      }
      return el;
    }));
    if (!bandDone) bandDesc();
    else if (!band.contains(document.activeElement)) bandDesc();
    markBand();
  }
  // Slider-position marker, the 100% line, current run + roving tabindex.
  function markBand() {
    if (!leftResult || $('twin-band-wrap').hidden) return;
    const r = range(), span = r.max - r.min + 1, percent = Number(scale.value);
    $('twin-band-100').style.left = `${(r.origin - r.min + .5) / span * 100}%`;
    $('twin-band-now').style.left = `${(percent - r.min + .5) / span * 100}%`;
    const buttons = [...$('twin-band').querySelectorAll('button')];
    const current = buttons.find(b => percent >= Number(b.dataset.start) && percent < Number(b.dataset.start) + Number(b.dataset.length));
    buttons.forEach(b => {
      b.tabIndex = b === current ? 0 : -1;
      if (b === current) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    });
  }
  $('twin-band').addEventListener('keydown', e => {
    const buttons = [...$('twin-band').querySelectorAll('button')], i = buttons.indexOf(document.activeElement);
    if (i < 0) return;
    const next = { ArrowLeft: i - 1, ArrowRight: i + 1, Home: 0, End: buttons.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    buttons[Math.max(0, Math.min(buttons.length - 1, next))].focus();
  });
  async function hear(sides) {
    stop();
    const token = playbackToken;
    const ctx = ensureCtx();
    try {
      await ctx.resume();
      await preloadAll();
      if (token !== playbackToken) return;
      if (ctx.state !== 'running') throw new Error('audio suspended');
      for (const side of sides) {
        if (token !== playbackToken) return;
        const result = side === 'left' ? leftResult : rightResult;
        if (!result) return;
        $('twin-card-' + side).classList.add('is-speaking');
        playEvent(result.event);
        // Wait for actual scheduled sources, including the legacy fallback.
        const nodes = activeNodes.slice();
        await Promise.all(nodes.map(node => new Promise(resolve => node.addEventListener('ended', resolve, { once: true }))));
        if (token !== playbackToken) return;
        $('twin-card-' + side).classList.remove('is-speaking');
        if (side !== sides[sides.length - 1]) await new Promise(resolve => setTimeout(resolve, 300));
      }
    } catch (_) {
      if (token !== playbackToken) return;
      stop();
      $('twin-message').textContent = '声を準備できませんでした。「左を聴く」でもう一度お試しください。';
    }
  }
  function position(e) {
    const rect = left.getBoundingClientRect();
    return { x: Math.max(4, Math.min(size - 4, (e.clientX - rect.left) / rect.width * size)),
      y: Math.max(4, Math.min(size - 4, (e.clientY - rect.top) / rect.height * size)) };
  }
  left.addEventListener('pointerdown', e => {
    if (pointer !== null || !e.isPrimary || e.button !== 0) return;
    e.preventDefault(); stop(); revision++; stopBand(); hideBand(); bands = {};
    pointer = e.pointerId; draft = [position(e)]; enable(false);
    $('twin-invite-left').hidden = true;
    // 取り込みに失敗しても筆は続ける (例外で pointer が残ると、次の一筆を受け付けなくなる)
    try { left.setPointerCapture(pointer); } catch (_) {}
    paint(left, draft);
  });
  left.addEventListener('pointermove', e => {
    if (e.pointerId !== pointer) return;
    draft.push(position(e)); paint(left, draft);
  });
  function cancelDraft() {
    pointer = null; draft = []; paint(left, source); enable(!!leftResult);
    $('twin-invite-left').hidden = !!source.length;
    if (leftResult) startBand();   // the previous stroke's band was dropped at pointerdown
  }
  left.addEventListener('pointercancel', cancelDraft);
  left.addEventListener('lostpointercapture', () => { if (pointer !== null) cancelDraft(); });
  left.addEventListener('pointerup', e => {
    if (e.pointerId !== pointer) return;
    draft.push(position(e)); pointer = null;
    const distance = draft.reduce((s, p, i) => i ? s + Math.hypot(p.x - draft[i-1].x, p.y - draft[i-1].y) : 0, 0);
    if (distance < 8) { cancelDraft(); $('twin-message').textContent = '点から、少し線を伸ばしてみてください。'; return; }
    source = draft; draft = [];
    leftResult = read(source);
    if (!leftResult) { clear(); return; }
    ranges = { scale: { min: 40, max: Math.floor(TwinsGeometry.maxScale(source, size) * 100), origin: 100 },
      y: TwinsGeometry.positionRange(source, size, 'y'), x: TwinsGeometry.positionRange(source, size, 'x'),
      rot: TwinsGeometry.rotationRange(source, size),
      sx: TwinsGeometry.stretchRange(source, size, 'x'), sy: TwinsGeometry.stretchRange(source, size, 'y') };
    bands = {};
    $('twin-word-left').textContent = word(leftResult);
    $('twin-invite-right').hidden = true;
    paint(left, source); enable(true); applyMode(); updateRight(); startBand(); hear(['left']);
  });
  scale.addEventListener('input', () => {
    stop();
    if (renderPending) return;
    renderPending = true;
    const currentRevision = revision;
    requestAnimationFrame(() => { renderPending = false; if (currentRevision === revision) updateRight(); });
  });
  scale.addEventListener('change', () => { updateRight(); hear(['right']); });
  $('twin-play-left').onclick = () => hear(['left']);
  $('twin-play-right').onclick = () => hear(['right']);
  $('twin-pair').onclick = () => hear(['left', 'right']);
  $('twin-stop').onclick = stop;
  $('twin-reset').onclick = () => { stop(); scale.value = String(range().origin); updateRight(); };
  // Slider range/labels/texts follow the mode; the slider starts at that mode's origin (right = the left shape).
  function applyMode() {
    const m = MODES[mode], r = range(), [lo, hi] = m.ends(r);
    scale.min = String(r.min); scale.max = String(r.max); scale.value = String(r.origin);
    $('twin-scale-min').textContent = lo; $('twin-scale-max').textContent = hi;
    $('twin-scale-title').textContent = m.title;
    $('twin-right-title').textContent = m.heading;
    right.setAttribute('aria-label', m.canvas);
    $('twin-reset').textContent = m.reset;
    $('twin-scale-note').innerHTML = m.note;
    root.querySelectorAll('.twin-band-legend span').forEach((el, i) => {   // legend labels follow the unit
      if (i < 5) el.textContent = ['1〜2', '3〜5', '6〜10', '11〜20', '21'][i] + (i === 4 ? `${m.unit}〜` : m.unit);
    });
    $('twin-axis-note').hidden = !m.aside; $('twin-axis-note').textContent = m.aside ?? '';
    root.querySelectorAll('.twin-mode').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  }
  root.querySelectorAll('.twin-mode').forEach(b => b.addEventListener('click', () => {
    if (!leftResult || b.dataset.mode === mode) return;
    stop(); stopBand(); mode = b.dataset.mode;
    applyMode(); updateRight(); startBand();
  }));
  function clear() {
    stop(); revision++; stopBand(); hideBand(); bands = {}; ranges = {}; mode = 'scale'; pointer = null;
    source = []; draft = []; rightPoints = []; leftResult = null; rightResult = null;
    enable(false); applyMode();
    $('twin-size').textContent = 'もとの 100%'; $('twin-percent').textContent = '100%';
    for (const side of ['left', 'right']) { $('twin-word-' + side).textContent = '…'; $('twin-invite-' + side).hidden = false; }
    $('twin-message').textContent = '左の枠に描くと、ふたつのことばが生まれます。';
    paint(left, []); paint(right, []);
  }
  $('twin-clear').onclick = clear;
  // 描いている途中の resize (iPhone/iPad のアドレスバーの出入り等) で一筆を捨てない。座標は毎回 600 の枠へ写すので続けて描ける
  window.addEventListener('resize', () => { paint(left, pointer !== null ? draft : source); paint(right, rightPoints); if (leftResult && !$('twin-band-wrap').hidden && $('twin-band').clientWidth !== bandWidth) renderBand(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  clear();
})();
