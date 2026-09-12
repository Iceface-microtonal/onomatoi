// Public presentation only. Generation, safety filtering and recorded synthesis
// remain in iceface_onomatoi.html. No new persistence or analytics.
(() => {
  const $ = id => document.getElementById(id);
  const dev = new URLSearchParams(location.search).get('dev') === '1';
  document.body.classList.toggle('is-dev', dev);
  const ja = uiLang === 'ja';
  document.documentElement.lang = ja ? 'ja' : 'en';
  $('open-guide').setAttribute('aria-controls', 'guide-panel');
  $('open-guide').setAttribute('aria-expanded', 'false');
  const en = {
    guide:'How to play', iosLink:'iPhone / iPad ↗', eyebrow:'A little playground for shapes and sounds.',
    title:'A line becomes a voice.', intro:'Round, zigzag, or something unnamed. Draw a line.',
    workspace:'Your drawing', invitation:'Make a mark here.', resultCaption:'Lift your finger. Hear your line.',
    previous:'Previous', replay:'Hear it again', draw:'Draw', presets:'Voice samples', history:'Your voices',
    discovery:'One line, then another. Listen to the difference.', guideTitle:'Start with two little drawings.',
    guideOne:'Draw with your finger or mouse. Lift to hear a voice.',
    guideTwo:'Draw something else, then listen to the previous voice.',
    guideThree:'Round, short, or zigzag. There are no scores or wrong answers.',
    research:'Research feedback', historyHint:'Voices from this visit. Tap one to hear it again.',
    iosTitle:'Keep playing<br>with your voices.', iosIntro:'Save a voice you love. Put a few together.<br>Let your drawings become a little song.',
    comingSoon:'iPhone and iPad app — coming soon.', seedTitle:'Keep a little seed', seedDescription:'A voice you would like to meet again.',
    melodyTitle:'Give it a melody', melodyDescription:'The same word, a different expression.',
    poemTitle:'A gathering of songs', poemDescription:'Your words, woven into five–seven–five.',
    footer:'Created and voiced by PuppeTwin', about:'About Onomatoi'
  };
  if (!ja) document.querySelectorAll('[data-copy]').forEach(el => {
    const text = en[el.dataset.copy];
    if (text) {
      el.replaceChildren(...text.split('<br>').flatMap((part,i) => i ? [document.createElement('br'),document.createTextNode(part)] : [document.createTextNode(part)]));
    }
  });
  if (!ja) {
    document.querySelector('.wordmark').setAttribute('aria-label', 'Onomatoi home');
    document.querySelector('.site-header nav').setAttribute('aria-label', 'Main navigation');
    document.querySelector('.play-space').setAttribute('aria-label', 'Draw and play');
    document.querySelector('.play-dock').setAttribute('aria-label', 'Play menu');
    document.querySelector('[data-close-panel]').setAttribute('aria-label', 'Close');
  }
  $('language-toggle').textContent = ja ? 'English' : '日本語';
  $('language-toggle').setAttribute('aria-label', ja ? 'Switch to English' : '日本語に切り替える');
  $('language-toggle').onclick = () => {
    try { localStorage.setItem('onomatoi.lang', ja ? 'en' : 'ja'); } catch (_) { return; }
    location.reload();
  };
  $('play-stop').setAttribute('aria-label', ja ? '音を止める' : 'Stop sound');
  $('play-stop').title = ja ? '音を止める' : 'Stop sound';
  $('canvas').setAttribute('aria-label', ja ? '指やマウスで一筆描くキャンバス' : 'Draw a line with your finger or mouse');
  $('btn-log-clear').textContent = ja ? '履歴を消す' : 'Clear history';
  if (!dev) $('t-tune-title').textContent = ja ? '声の見本' : 'Voice samples';
  const sampleNote = document.createElement('p');
  sampleNote.className = 'hint';
  sampleNote.textContent = ja ? '名前のある声を試す見本です。自分で描いた線は、その形からことばになります。' : 'Try these named voice samples. Your own drawings find words through their shape.';
  $('preset-chips').before(sampleNote);
  const panels = ['guide-panel','preset-panel','history-panel'];
  function openPanel(id) {
    const opening = id && $(id).hidden;
    panels.forEach(key => { $(key).hidden = !(opening && key === id); });
    $('dock-draw').setAttribute('aria-pressed', String(!opening));
    $('dock-presets').setAttribute('aria-expanded', String(!!opening && id === 'preset-panel'));
    $('dock-history').setAttribute('aria-expanded', String(!!opening && id === 'history-panel'));
    $('open-guide').setAttribute('aria-expanded', String(!!opening && id === 'guide-panel'));
    if (opening) $(id).scrollIntoView({block:'nearest'});
  }
  $('dock-presets').onclick = () => openPanel('preset-panel');
  $('dock-history').onclick = () => openPanel('history-panel');
  $('open-guide').onclick = () => openPanel('guide-panel');
  $('dock-draw').onclick = () => { openPanel(null); $('canvas').scrollIntoView({block:'center'}); };
  document.querySelectorAll('[data-close-panel]').forEach(el => { el.onclick = () => { openPanel(null); $('open-guide').focus(); }; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') openPanel(null); });

  let currentDrawing = null, previousDrawing = null, selected = null, displayed = null, drawingCount = 0;
  const voices = [];
  const historyEl = document.createElement('div');
  historyEl.className = 'web-history';
  $('log').after(historyEl);
  const kana = event => event.displayWordOverride ?? namingKanaOf(event.moras);
  function result(event, caption) {
    if (dev) return;
    $('result-word').textContent = kana(event);
    $('result-meta').textContent = romajiOf(event);
    $('result-caption').textContent = caption || (ja ? 'あなたの線から、生まれた声。' : 'A voice from your drawing.');
  }
  function refresh() {
    if (!dev) $('log-count').textContent = voices.length;
    $('play-current').disabled = !selected;
    $('play-previous').disabled = !previousDrawing;
    $('previous-word').textContent = previousDrawing ? kana(previousDrawing.event) : '—';
    $('play-previous').setAttribute('aria-label', previousDrawing ? `${ja ? 'ひとつ前の声' : 'Previous voice'}: ${kana(previousDrawing.event)}` : (ja ? 'ひとつ前の声はまだありません' : 'No previous voice yet'));
  }
  function renderLine(entry) {
    displayed = entry;
    const rect = canvas.getBoundingClientRect();
    const targetAspect = rect.width / rect.height;
    const sx = Math.min(1, entry.aspect / targetAspect), sy = Math.min(1, targetAspect / entry.aspect);
    stroke = entry.points.map(p => ({x:(.5+(p[0]-.5)*sx)*rect.width,y:(.5+(p[1]-.5)*sy)*rect.height}));
    presetShapePts = entry.presetPoints || null;
    confirmedCorners = [];
    strokeHistoryInk = [];
    redraw();
  }
  function listen(entry, caption) {
    if (!entry) return;
    selected = entry;
    renderLine(entry);
    playEvent(entry.event);
    result(entry.event, caption);
    $('canvas-invitation').hidden = true;
    refresh();
  }
  function renderVoices() {
    historyEl.replaceChildren();
    if (!voices.length) {
      const note = document.createElement('p'); note.className = 'hint';
      note.textContent = ja ? '一筆描くと、ここに声が並びます。' : 'Your drawings will leave voices here.';
      historyEl.append(note);
    }
    voices.slice().reverse().forEach(entry => {
      const button = document.createElement('button'); button.className = 'history-voice';
      const label = document.createElement('span'); label.textContent = kana(entry.event);
      button.append(label);
      button.setAttribute('aria-label', `${kana(entry.event)} ${ja ? 'を聴く' : '— listen'}`);
      button.onclick = () => { listen(entry, ja ? 'これまでの声' : 'From your voices'); openPanel(null); $('canvas').scrollIntoView({block:'center'}); };
      historyEl.append(button);
    });
  }
  window.addEventListener('onomatoi-result', e => result(e.detail.event));
  window.addEventListener('onomatoi-utterance', e => {
    const {event,src,points,aspect,presetPoints} = e.detail;
    selected = {event:structuredClone(event),points,aspect,presetPoints};
    displayed = selected;
    if (src === 'draw') {
      previousDrawing = currentDrawing;
      currentDrawing = selected;
      voices.push(selected);
      if (voices.length > 100) voices.shift();
      drawingCount++;
      renderVoices();
      if (drawingCount >= 2) {
        const link = document.createElement('a'); link.href = '#ios';
        link.textContent = ja ? 'この声を残して、つないで、唄にする。iOS版へ ↗' : 'Keep your voices. Weave them into a song. Discover iOS ↗';
        $('discovery-note').replaceChildren(link);
      }
    } else if (src === 'preset') {
      result(event, ja ? '声の見本' : 'Voice sample');
    }
    $('canvas-invitation').hidden = true;
    refresh();
  });
  $('play-current').onclick = () => {
    if (!selected) return;
    renderLine(selected);
    playEvent(selected.event); result(selected.event, ja ? 'もう一度、同じ声。' : 'The same voice, once more.');
  };
  $('play-previous').onclick = () => {
    const current = selected;
    listen(previousDrawing, ja ? 'ひとつ前の声' : 'Previous voice');
    selected = current;
    refresh();
  };
  $('play-stop').onclick = () => { pendingEvent = null; stopAll(); };
  $('canvas').addEventListener('pointerdown', () => { displayed = null; $('canvas-invitation').hidden = true; });
  window.addEventListener('resize', () => { if (displayed && !drawing) renderLine(displayed); });
  $('btn-clear').addEventListener('click', () => {
    selected = null; displayed = null; currentDrawing = null; previousDrawing = null;
    $('canvas-invitation').hidden = false;
    $('result-word').textContent = '…';
    $('result-caption').textContent = ja ? '指を離すと、線が声になります。' : 'Lift your finger. Hear your line.';
    refresh();
  });
  $('btn-log-clear').addEventListener('click', () => { voices.length = 0; renderVoices(); refresh(); });
  $('loading-note').addEventListener('click', () => {
    if (audioCtx?.state === 'running') $('loading-note').dataset.started = 'true';
  });
  if (audioCtx) audioCtx.addEventListener('statechange', () => {
    if (audioCtx.state === 'running') $('loading-note').dataset.started = 'true';
  });
  refresh(); renderVoices();
  if (dev) openPanel('preset-panel');
})();
