/* Railway presentation adapter. The original Onomatoi engine and recordings are unchanged. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';
  const HISTORY_KEY = 'onomatoi.railway.stations.v1';
  const API = 'https://onomatoi-reaction.puppetwin.workers.dev';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let stops = [], current = null, previous = 'はじまり', total = 0;
  let animation = 0, rideVersion = 0, requestController = null, requestVersion = 0;
  let soundOn = true, provider = 'checking', activeIndex = -1;
  try {
    const stored = JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}');
    if (Array.isArray(stored.stops)) {
      stops = stored.stops.filter(s => typeof s.word === 'string' && s.word.length < 41 &&
        Array.isArray(s.points) && s.points.length >= 2 && s.points.length <= 600 &&
        s.points.every(p => Array.isArray(p) && p.length === 2 && p.every(n => Number.isFinite(n) && n >= 0 && n <= 1)) &&
        s.event && Array.isArray(s.event.moras) && s.event.moras.length < 80).slice(-24);
      total = Math.max(stops.length, Number.isSafeInteger(stored.total) ? stored.total : stops.length);
    }
  } catch (_) {}
  const originalPlay = window.playEvent;
  window.playEvent = function(event) { if (soundOn) return originalPlay(event); };
  function notify(message) {
    $('toast').textContent = message;
    $('toast').classList.add('show');
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => $('toast').classList.remove('show'), 2800);
  }
  function persist() {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify({total, stops})); } catch (_) {}
  }
  function create(tag, attrs = {}) {
    const el = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
    return el;
  }
  function pathData(points, width, height) {
    return points.map((p, i) => `${i ? 'L' : 'M'}${(p[0] * width).toFixed(2)},${(p[1] * height).toFixed(2)}`).join(' ');
  }
  function lineName(entry) {
    const axes = entry.axes || {}, shape = entry.shape || {};
    if (shape.loops > 0 || shape.isClosed) return 'ぐるぐる環状線';
    if (shape.corners >= 3 || axes.sharp > .45) return 'ギザギザ急行線';
    if (axes.bright < -.45) return 'しーん支線';
    if (axes.round > .4) return 'ぽよぽよ線';
    return 'くねくね本線';
  }
  function officeMessage(entry) {
    const shape = entry.shape || {}, axes = entry.axes || {};
    const w = entry.word;
    if (shape.loops > 0 || shape.isClosed) return `${w}駅に到着です。くるりと巡って、はじめの気持ちに戻ってきました。`;
    if (shape.corners >= 3 || axes.sharp > .45) return `次は、${w}。少々カーブが続きますので、ひらめきをしっかりお持ちください。`;
    if (axes.bright < -.45) return `${w}駅です。静かな車窓を、どうぞそのままお楽しみください。`;
    return `${w}駅へようこそ。名前のなかった風景に、あなたのひと筆が到着しました。`;
  }
  function setProvider() {
    $('luna-state').textContent = current?.luna ? 'GPT-6 Luna' : provider === 'ready' ? 'Luna 乗務中' : provider === 'checking' ? 'Luna 接続確認中' : 'Luna 接続待ち';
    $('luna-note').textContent = current?.luna
      ? 'Lunaが線の特徴と駅名から連想したひとことです。音声は聴いていません。'
      : provider === 'ready'
        ? 'ボタンを押すとLunaが返答します。現在の案内文は駅務室の定型案内です。'
        : '現在は駅務室の定型案内です。Lunaの接続には、このサイトの接続元の許可が必要です。';
  }
  function cancelRequest() {
    requestController?.abort();
    requestController = null;
    requestVersion++;
    $('luna-ask').disabled = !current;
    $('luna-ask').textContent = current?.luna ? 'もうひとこと、車掌さん ↗' : 'Luna車掌に聞く ↗';
  }
  function board(entry, label) {
    $('station-name').textContent = entry.word;
    $('station-romaji').textContent = entry.romaji.toUpperCase();
    $('station-number').textContent = `OT ${String(entry.number).padStart(2, '0')}`;
    $('previous-station').textContent = entry.previous || 'はじまり';
    $('following-station').textContent = 'まだない駅 →';
    $('board-caption').textContent = label;
    $('line-name').textContent = lineName(entry);
    $('conductor-text').textContent = entry.luna || officeMessage(entry);
    $('rail-replay').disabled = false;
    $('luna-ask').disabled = false;
    $('journey-count').textContent = String(total).padStart(2, '0');
    setProvider();
  }
  function chime() {
    if (!soundOn) return;
    const ctx = ensureCtx();
    const notes = [523.25, 659.25, 783.99, 659.25];
    notes.forEach((freq, i) => {
      const start = ctx.currentTime + i * .14;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(.045, start + .018);
      g.gain.exponentialRampToValueAtTime(.0001, start + .42);
      o.connect(g); g.connect(ctx.destination); o.start(start); o.stop(start + .45);
    });
  }
  function restoreInk(entry) {
    const rect = canvas.getBoundingClientRect();
    stroke = entry.points.map(p => ({x:p[0] * rect.width, y:p[1] * rect.height}));
    confirmedCorners = [];
    presetShapePts = null;
    strokeHistoryInk = [];
    pendingPt = null;
    redraw();
  }
  function drawRail(entry) {
    const layer = $('rail-layer');
    const rect = canvas.getBoundingClientRect();
    const width = rect.width, height = rect.height;
    layer.setAttribute('viewBox', `0 0 ${width} ${height}`);
    layer.replaceChildren();
    const d = pathData(entry.points, width, height);
    layer.append(create('path', {d, fill:'none', stroke:'#a1aca0', 'stroke-width':13, 'stroke-linecap':'butt', 'stroke-dasharray':'2.5 8', opacity:'.85'}));
    layer.append(create('path', {d, fill:'none', stroke:'#48594f', 'stroke-width':5.5, 'stroke-linejoin':'round', 'stroke-linecap':'round'}));
    const path = create('path', {d, fill:'none', stroke:'#faf9f3', 'stroke-width':2, 'stroke-linejoin':'round', 'stroke-linecap':'round'});
    layer.append(path);
    for (const p of [entry.points[0], entry.points[entry.points.length - 1]]) {
      layer.append(create('circle', {cx:p[0] * width, cy:p[1] * height, r:6.5, fill:'#fafaf7', stroke:'#456857', 'stroke-width':2}));
    }
    const train = create('g');
    train.append(create('rect', {x:-19, y:-10, width:37, height:19, rx:5, fill:'#fffaf1', stroke:'#283b41', 'stroke-width':1.4}));
    train.append(create('rect', {x:-18, y:3, width:35, height:3.5, fill:'#f27fa5'}));
    for (const x of [-12,-3,6]) train.append(create('rect', {x, y:-6, width:6, height:6, rx:1, fill:'#98c0e4', stroke:'#58727b', 'stroke-width':'.6'}));
    train.append(create('circle', {cx:-10,cy:10,r:3,fill:'#283b41'}),create('circle', {cx:10,cy:10,r:3,fill:'#283b41'}));
    layer.append(train);
    return {path, train};
  }
  function travel(entry, replay = false) {
    cancelAnimationFrame(animation);
    const token = ++rideVersion;
    current = entry;
    $('rail-invitation').hidden = true;
    $('sky-caption').hidden = true;
    restoreInk(entry);
    const {path, train} = drawRail(entry);
    const length = path.getTotalLength();
    const duration = reducedMotion ? 1 : Math.max(2200, Math.min(5200, length * 7));
    const started = performance.now();
    board(entry, replay ? 'もう一度、あの駅へ' : '次は');
    $('drawing-label').textContent = lineName(entry);
    $('operation').textContent = `${entry.word}駅へ、ひらめき運転中。`;
    $('travel-status').textContent = `次は、${entry.word}。${entry.word}です。`;
    function frame(now) {
      if (token !== rideVersion) return;
      const linear = Math.min(1, (now - started) / duration);
      const t = linear * linear * (3 - 2 * linear);
      const point = path.getPointAtLength(t * length);
      const ahead = path.getPointAtLength(Math.min(length, t * length + 2));
      const behind = path.getPointAtLength(Math.max(0, t * length - 2));
      let angle = Math.atan2(ahead.y - behind.y, ahead.x - behind.x) * 180 / Math.PI;
      if (angle > 90 || angle < -90) angle += 180;
      train.setAttribute('transform', `translate(${point.x} ${point.y}) rotate(${angle})`);
      if (linear < 1) animation = requestAnimationFrame(frame);
      else {
        $('board-caption').textContent = 'ただいま到着';
        $('travel-status').textContent = `${entry.word}駅に到着しました。次の線路も、ひと筆どうぞ。`;
        $('operation').textContent = `${entry.word}駅に停車中。まもなく、次のひと筆へ。`;
        chime();
      }
    }
    animation = requestAnimationFrame(frame);
    renderHistory();
  }
  function renderHistory() {
    const history = $('station-history');
    history.replaceChildren();
    $('route-caption').textContent = stops.length ? `${total}駅の旅。駅名を押すと、もう一度。` : 'あなたの路線図は、ここから。';
    $('journey-count').textContent = String(total).padStart(2, '0');
    if (!stops.length) {
      const p = document.createElement('p'); p.className = 'empty-route'; p.textContent = 'ひと筆ごとに、あなただけの駅が増えていきます。'; history.append(p); return;
    }
    stops.forEach((stop, i) => {
      const button = document.createElement('button');
      button.className = 'stop' + (i === activeIndex ? ' selected' : '');
      button.setAttribute('aria-label', `${stop.word}駅へもう一度乗る`);
      const dot = document.createElement('span'); dot.className = 'dot';
      const name = document.createElement('strong'); name.textContent = stop.word;
      const number = document.createElement('small'); number.textContent = `OT ${String(stop.number).padStart(2, '0')}`;
      button.append(dot, name, number);
      button.onclick = () => { cancelRequest(); activeIndex = i; ensureCtx(); playEvent(stop.event); travel(stop, true); };
      history.append(button);
    });
  }
  function accept(detail) {
    if (detail.src !== 'draw') return;
    cancelRequest();
    const event = detail.event;
    const entry = {
      word: event.displayWordOverride ?? namingKanaOf(event.moras),
      romaji: romajiOf(event), event: structuredClone(event),
      points: detail.points.filter(p => p.every(Number.isFinite)).map(p => p.map(v => Math.max(0, Math.min(1, v)))),
      axes: structuredClone(detail.explanation?.axes || event.axes || {}),
      shape: Object.fromEntries(['corners','loops','isClosed'].map(k => [k, detail.explanation?.shape?.[k] ?? (k === 'isClosed' ? false : 0)])),
      number: ++total, previous: stops[stops.length - 1]?.word || 'はじまり'
    };
    if (entry.points.length < 2) return;
    stops.push(entry);
    if (stops.length > 24) stops.shift();
    activeIndex = stops.length - 1;
    persist();
    travel(entry);
    requestAnimationFrame(() => { $('station-history').scrollLeft = $('station-history').scrollWidth; });
  }
  window.addEventListener('onomatoi-utterance', ({detail}) => accept(detail));
  canvas.addEventListener('pointerdown', () => {
    cancelAnimationFrame(animation); rideVersion++; cancelRequest();
    $('rail-layer').replaceChildren();
    $('rail-invitation').hidden = true;
    $('sky-caption').hidden = false;
    $('travel-status').textContent = 'ただいま敷設中。指を離すと、出発します。';
  });
  canvas.addEventListener('pointercancel', () => {
    drawing = false; pendingPt = null; coarseInk = null;
    $('travel-status').textContent = '線路の敷設を中断しました。もう一度、ひと筆どうぞ。';
  });
  $('rail-clear').onclick = () => {
    cancelAnimationFrame(animation); rideVersion++; cancelRequest(); current = null; activeIndex = -1;
    $('btn-clear').click();
    $('rail-layer').replaceChildren(); $('rail-invitation').hidden = false; $('sky-caption').hidden = false;
    $('travel-status').textContent = '次の駅は、まだ誰も知りません。';
    $('drawing-label').textContent = 'あなたの線路';
    $('rail-replay').disabled = true; $('luna-ask').disabled = true;
    $('station-name').textContent = 'まだない駅'; $('station-romaji').textContent = 'NOT YET NAMED';
    $('station-number').textContent = 'OT —'; $('board-caption').textContent = '次のひと筆を待っています';
    $('line-name').textContent = 'ひらめき本線';
    $('operation').textContent = '本日も、自由な線で運行しています。';
    $('conductor-text').textContent = 'ご乗車ありがとうございます。行き先は、あなたの一筆におまかせします。';
    setProvider(); renderHistory();
  };
  $('rail-replay').onclick = () => {
    if (!current) return;
    ensureCtx(); playEvent(current.event); travel(current, true);
  };
  $('rail-sound').onclick = () => {
    soundOn = !soundOn;
    if (!soundOn) { pendingEvent = null; stopAll(); }
    else ensureCtx();
    $('rail-sound').setAttribute('aria-pressed', String(soundOn));
    $('rail-sound').querySelector('span').textContent = soundOn ? '音あり' : '音なし';
    notify(soundOn ? '音声と到着チャイムを鳴らします。' : '音を止めました。静かな旅をどうぞ。');
  };
  document.querySelectorAll('[data-track]').forEach(button => {
    button.onclick = () => {
      ensureCtx();
      const rect = canvas.getBoundingClientRect();
      let pts = [];
      const kind = button.dataset.track;
      if (kind === 'curve') {
        for (let i = 0; i <= 90; i++) { const t = i / 90; pts.push({x:(.12 + .76 * t) * rect.width, y:(.5 + .22 * Math.sin(t * Math.PI * 3)) * rect.height}); }
      } else if (kind === 'zigzag') {
        const raw = [[.12,.6],[.25,.28],[.4,.7],[.55,.3],[.7,.68],[.87,.38]];
        pts = raw.map(([x,y]) => ({x:x * rect.width, y:y * rect.height}));
      } else {
        for (let i = 0; i <= 110; i++) { const t = i / 110 * Math.PI * 3.6, r = .27 - i / 110 * .21; pts.push({x:(.5 + Math.cos(t) * r) * rect.width, y:(.5 + Math.sin(t) * r * 1.5) * rect.height}); }
      }
      stroke = pts; presetShapePts = null; pendingPt = null; confirmedCorners = []; strokeHistoryInk = []; redraw();
      const dense = densified(pts, 6);
      const result = interpretStroke(dense, rect.width, rect.height, {coarse:true, hc:Number($('kn-hc').value), language:uiLang});
      setSliders(result.ax);
      playAndRemember(result.event, result.ax, false, 'draw', {shape:result.cx});
    };
  });
  $('luna-ask').onclick = async () => {
    if (!current || $('luna-ask').disabled) return;
    const entry = current, token = ++requestVersion;
    requestController?.abort(); requestController = new AbortController();
    const timeout = setTimeout(() => requestController?.abort(), 22000);
    $('luna-ask').disabled = true; $('luna-ask').textContent = '車掌さん、車窓を眺めています…';
    $('luna-state').textContent = 'Lunaへ問い合わせ中';
    try {
      const response = await fetch(API + '/api/reaction', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({word:entry.word,lang:'ja',axes:Object.fromEntries(['size','sharp','tex','bright','round','open'].map(k => [k, entry.axes[k] ?? 0])),shape:entry.shape,responseStyle:'impression',lens:'sound_map'}),
        signal:requestController.signal
      });
      const data = await response.json();
      if (token !== requestVersion || current !== entry) return;
      if (!response.ok || data.mode !== 'luna' || !data.text) {
        const message = response.status === 429 ? '本日のLuna車掌の乗務は終了しました。また明日、ご乗車ください。' : 'Luna車掌はただいま接続できません。駅務室の案内で運行を続けます。';
        notify(message); provider = 'unavailable'; return;
      }
      entry.luna = data.text; provider = 'ready';
      $('conductor-text').textContent = data.text; persist();
    } catch (error) {
      if (token !== requestVersion) return;
      provider = 'unavailable';
      notify('Lunaへの接続ができませんでした。駅務室の案内で運行を続けます。');
    } finally {
      clearTimeout(timeout);
      if (token === requestVersion) { $('luna-ask').disabled = false; $('luna-ask').textContent = entry.luna ? 'もうひとこと、車掌さん ↗' : 'Luna車掌に聞く ↗'; setProvider(); }
    }
  };
  $('guide-open').onclick = () => $('guide-dialog').showModal();
  $('guide-close').onclick = () => $('guide-dialog').close();
  $('guide-dialog').addEventListener('click', e => { if (e.target === $('guide-dialog')) { const r = e.target.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) e.target.close(); } });
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (current && !drawing) { cancelAnimationFrame(animation); rideVersion++; restoreInk(current); const {path,train} = drawRail(current); const p = path.getPointAtLength(path.getTotalLength()); train.setAttribute('transform', `translate(${p.x} ${p.y})`); $('board-caption').textContent = 'ただいま到着'; } }, 160);
  });
  renderHistory(); setProvider();
  fetch(API + '/api/reaction/status', {signal:AbortSignal.timeout(8000)})
    .then(r => { if (!r.ok) throw new Error(); return r.json(); })
    .then(data => { provider = ['configured','luna'].includes(data.mode) ? 'ready' : 'unavailable'; setProvider(); })
    .catch(() => { provider = 'unavailable'; setProvider(); });
  // Narrow testable view helpers; the phonetic generator stays in engine.js.
  window.RailwayView = {lineName, officeMessage, pathData};
})();
