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
        <header><strong>大きさを変えた一筆</strong><span id="twin-size">もとの 100%</span></header>
        <div class="twin-board"><canvas id="twin-right" aria-label="拡大縮小した右の形"></canvas>
          <p id="twin-invite-right">もうひとつの形が<br>ここに生まれます。</p></div>
        <output class="twin-word" id="twin-word-right">…</output>
        <button class="twin-listen" id="twin-play-right" disabled>▶ 右を聴く</button>
      </section>
    </div>
    <div class="twins-controls">
      <label class="twins-scale-label" for="twin-scale"><span>右のかたちの大きさ</span><output id="twin-percent">100%</output></label>
      <input id="twin-scale" type="range" min="40" max="200" step="1" value="100" disabled aria-describedby="twin-scale-note">
      <div class="twin-band-track" id="twin-band-wrap" hidden>
        <div class="twin-band" id="twin-band" role="group" aria-label="40%から上限までの全倍率の語。区間を押すと、その倍率の右の声が鳴ります"></div>
        <span class="twin-band-100" id="twin-band-100" aria-hidden="true"></span>
        <span class="twin-band-now" id="twin-band-now" aria-hidden="true"></span>
      </div>
      <div class="twins-scale-ends"><span>小さく · 40%</span><span id="twin-scale-max">大きく · 200%</span></div>
      <div class="twin-band-info" id="twin-band-info" hidden>
        <p id="twin-band-desc" class="twin-band-desc" aria-live="polite"></p>
        <ul class="twin-band-legend" aria-label="帯の色">
          <li><i class="L1"></i>1〜2%</li><li><i class="L2"></i>3〜5%</li><li><i class="L3"></i>6〜10%</li>
          <li><i class="L4"></i>11〜20%</li><li><i class="L5"></i>21%〜</li><li><i class="R"></i>行って戻る</li>
        </ul>
        <p class="twins-footnote">帯 = 40%〜上限の全倍率の語。区切り = 語が変わる位置。<br>色が濃いほど、同じ語が続く幅が広い。縦線 = 100%。</p>
      </div>
      <div class="twins-actions">
        <button id="twin-pair" disabled>▶ 左 → 右を聴く</button>
        <button id="twin-reset" class="twin-secondary" disabled>100%に戻す</button>
        <button id="twin-stop" class="twin-quiet">■ 止める</button>
        <button id="twin-clear" class="twin-quiet">描き直す</button>
      </div>
      <p id="twin-message" role="status">左の枠に描くと、ふたつのことばが生まれます。</p>
      <p id="twin-scale-note" class="twins-footnote">指を離すと、右の声が鳴ります。大きさの上限は、形が枠に収まるところまで。<br>形が変わっても、同じことばになることがあります。</p>
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
  const BAND_MIN = 40, BAND_HINT = '区間にふれると、その倍率の語が分かります。押すと、右の声が鳴ります。';
  let bandWords = [], bandDone = false, bandRun = 0, bandTimer = 0, bandWidth = 0;
  const enabledIds = ['twin-play-left', 'twin-play-right', 'twin-pair', 'twin-reset', 'twin-scale'];
  function enable(value) { enabledIds.forEach(id => { $(id).disabled = !value; }); }
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
    const percent = Number(scale.value);
    rightPoints = TwinsGeometry.scale(source, percent / 100);
    rightResult = percent === 100 ? leftResult : read(rightPoints);
    paint(right, rightPoints);
    $('twin-word-right').textContent = rightResult ? word(rightResult) : '…';
    $('twin-percent').textContent = `${percent}%`;
    $('twin-size').textContent = `もとの ${percent}%`;
    $('twin-message').textContent = !rightResult ? 'もう少し大きくすると、声になります。'
      : percent === 100 ? '同じかたち、同じことば。右の大きさを動かしてみて。'
      : word(leftResult) === word(rightResult) ? '大きさが変わっても、同じことば。声も聴き比べてみて。'
      : 'ことばが変わりました。左と右を聴き比べてみて。';
    $('twin-play-right').disabled = !rightResult;
    $('twin-pair').disabled = !rightResult;
    markBand();
  }
  // The word band: every 1% from 40% to scale.max, read with the same read()/word() as the slider.
  function bandWord(points, percent) {
    try {
      const result = read(TwinsGeometry.scale(points, percent / 100));
      return result ? word(result) : '∅';
    } catch (e) { console.warn('twins band', percent, e); return '∅'; }
  }
  function stopBand() { bandRun++; clearTimeout(bandTimer); }
  function hideBand() { $('twin-band-wrap').hidden = true; $('twin-band-info').hidden = true; }
  function startBand() {
    stopBand();
    const run = bandRun, rev = revision, points = source, max = Number(scale.max), count = max - BAND_MIN + 1;
    bandWords = []; bandDone = false;
    $('twin-band-wrap').hidden = false; $('twin-band-info').hidden = false;
    const step = () => {
      // A new stroke / clear changes revision or bandRun: drop the stale computation.
      if (run !== bandRun || rev !== revision) return;
      const t0 = performance.now();
      do {
        const percent = BAND_MIN + bandWords.length;
        bandWords.push(percent === 100 ? word(leftResult) : bandWord(points, percent));
      } while (bandWords.length < count && performance.now() - t0 < 10);
      bandDone = bandWords.length >= count;
      renderBand();
      if (!bandDone) bandTimer = setTimeout(step, 0);
    };
    step();
  }
  function runText(r) {
    const range = r.length === 1 ? `${r.start}%` : `${r.start}〜${r.start + r.length - 1}%`;
    return `${range}: ${r.word === '∅' ? '∅(語にならない)' : r.word}${r.returns ? ' (すぐ元の語に戻る)' : ''}`;
  }
  function bandDesc(text) { $('twin-band-desc').textContent = text ?? (bandDone ? BAND_HINT : `帯を計算中… ${Math.round(bandWords.length / (Number(scale.max) - BAND_MIN + 1) * 100)}%`); }
  function renderBand() {
    const band = $('twin-band'), span = Number(scale.max) - BAND_MIN + 1, runs = TwinsGeometry.runs(bandWords, BAND_MIN);
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
    const span = Number(scale.max) - BAND_MIN + 1, percent = Number(scale.value);
    $('twin-band-100').style.left = `${(100 - BAND_MIN + .5) / span * 100}%`;
    $('twin-band-now').style.left = `${(percent - BAND_MIN + .5) / span * 100}%`;
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
    e.preventDefault(); stop(); revision++; stopBand(); hideBand();
    pointer = e.pointerId; draft = [position(e)]; enable(false);
    $('twin-invite-left').hidden = true;
    left.setPointerCapture(pointer); paint(left, draft);
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
    scale.max = String(Math.floor(TwinsGeometry.maxScale(source, size) * 100));
    scale.value = '100';
    $('twin-scale-max').textContent = `大きく · ${scale.max}%`;
    $('twin-word-left').textContent = word(leftResult);
    $('twin-invite-right').hidden = true;
    paint(left, source); enable(true); updateRight(); startBand(); hear(['left']);
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
  $('twin-reset').onclick = () => { stop(); scale.value = '100'; updateRight(); };
  function clear() {
    stop(); revision++; stopBand(); hideBand(); bandWords = []; pointer = null;
    source = []; draft = []; rightPoints = []; leftResult = null; rightResult = null;
    enable(false); scale.value = '100'; scale.max = '200';
    $('twin-scale-max').textContent = '大きく · 200%';
    $('twin-size').textContent = 'もとの 100%'; $('twin-percent').textContent = '100%';
    for (const side of ['left', 'right']) { $('twin-word-' + side).textContent = '…'; $('twin-invite-' + side).hidden = false; }
    $('twin-message').textContent = '左の枠に描くと、ふたつのことばが生まれます。';
    paint(left, []); paint(right, []);
  }
  $('twin-clear').onclick = clear;
  window.addEventListener('resize', () => { if (pointer !== null) cancelDraft(); paint(left, source); paint(right, rightPoints); if (leftResult && !$('twin-band-wrap').hidden && $('twin-band').clientWidth !== bandWidth) renderBand(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  clear();
})();
