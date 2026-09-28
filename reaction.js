// Two ways to respond to a drawing. Results live only in this page's memory.
(() => {
  const ja = document.documentElement.lang !== 'en';
  const localPreview = ['127.0.0.1', 'localhost'].includes(location.hostname) && location.port === '8766';
  const API_BASE = localPreview ? '' : 'https://onomatoi-reaction.puppetwin.workers.dev';
  const modes = {
    impression: {title: ja ? '一筆へのひとこと' : 'An impression',
      hint: ja ? '線とことばを眺めて、ひとこと。' : 'A thought about the line and its word.'},
    conversation: {title: ja ? 'おのまといで話す' : 'Speak Onomatoi',
      hint: ja ? 'このことばが、日常のひとことに。' : 'Let this word join an everyday sentence.'}
  };
  const card = document.createElement('section');
  card.className = 'reaction-card luna-play';
  card.hidden = true;
  card.innerHTML = `
    <div class="reaction-heading"><span class="reaction-kicker">${ja ? 'ONE LINE / ことばのつづき' : 'ONE LINE / WORDS AT PLAY'}</span><span class="reaction-mode"></span></div>
    <p class="reaction-intro"><strong class="reaction-word"></strong>${ja ? ' から、どんなひとことが生まれる？' : ' — what comes next?'}</p>
    <div class="reaction-choices" role="group" aria-label="${ja ? '返答の遊び方' : 'Response style'}">
      ${Object.entries(modes).map(([key, mode]) => `<button type="button" class="reaction-choice" data-style="${key}" aria-pressed="${key === 'impression'}"><span>${mode.title}</span><small>${mode.hint}</small></button>`).join('')}
    </div>
    <label class="reaction-lens"><input type="checkbox" checked> ${ja ? '音の地図の視点を加える' : 'Add the sound map perspective'}</label>
    <div class="reaction-answer">
      <p class="reaction-text" role="status" aria-live="polite"></p>
      <button type="button" class="reaction-ask">${ja ? '聞いてみる ↗' : 'Ask Luna ↗'}</button>
    </div>
    <p class="reaction-note"></p>
    <p class="reaction-map-source" hidden></p>
    <p class="reaction-footnote">${ja ? 'ボタンを押すとLunaが返します。返答はこの画面の間だけ保持し、再読み込みで消えます。音声は聴いていません。' : 'Ask to get a Luna response. Responses stay here until you reload; Luna does not hear the voice.'}</p>`;
  document.querySelector('.listening-bar').after(card);
  const text = card.querySelector('.reaction-text');
  const ask = card.querySelector('.reaction-ask');
  const lens = card.querySelector('.reaction-lens input');
  const source = card.querySelector('.reaction-map-source');
  const note = card.querySelector('.reaction-note');
  const badge = card.querySelector('.reaction-mode');
  const answers = new Map();
  let style = 'impression';
  let current = null;
  let version = 0;
  let controller = null;
  let provider = 'configured';
  const cacheKey = () => `${style}/${lens.checked}`;
  function setProvider(value) {
    badge.textContent = value === 'luna' ? 'GPT-6 Luna'
      : value === 'example' ? (ja ? 'ローカル例文（Luna未接続）' : 'Local example · no Luna')
      : value === 'unavailable' ? (ja ? 'ただいま休止中' : 'Currently unavailable') : 'GPT-6 Luna';
  }
  setProvider(provider);
  fetch(API_BASE + '/api/reaction/status').then(r => r.json()).then(data => {
    provider = data.mode;
    if (!answers.has(cacheKey())) setProvider(provider);
  }).catch(() => { provider = 'unavailable'; if (!answers.has(cacheKey())) setProvider(provider); });
  function cancel() {
    controller?.abort();
    controller = null;
    version += 1;
    ask.disabled = false;
    card.setAttribute('aria-busy', 'false');
  }
  function showAnswer() {
    const data = answers.get(cacheKey());
    text.textContent = data?.text || (ja ? 'この一筆のつづきを、Lunaに聞いてみましょう。' : 'Ask Luna what follows this line.');
    text.classList.toggle('is-placeholder', !data);
    ask.textContent = data ? (ja ? 'もうひとこと ↗' : 'Another thought ↗') : (ja ? '聞いてみる ↗' : 'Ask Luna ↗');
    setProvider(data?.mode || provider);
    note.textContent = style === 'conversation'
      ? (ja ? '意味を決めずに、日常のことばとして使う遊びです。' : 'Play with this word without fixing its meaning.')
      : (ja ? '線の特徴と生まれたことばからの連想です。' : 'An impression from the line and its word.');
    source.hidden = !data || !lens.checked;
    if (data && lens.checked) source.textContent = data.lens === 'sound_map'
      ? (ja ? '音の地図の視点を添えています。' : 'With inspiration from the sound map.')
      : (ja ? '対応する音がないため、音の地図なしで返しました。' : 'No matching sound-map note for this word.');
  }
  for (const button of card.querySelectorAll('.reaction-choice')) {
    button.addEventListener('click', () => {
      if (style === button.dataset.style) return;
      cancel();
      style = button.dataset.style;
      for (const choice of card.querySelectorAll('.reaction-choice')) choice.setAttribute('aria-pressed', String(choice === button));
      showAnswer();
    });
  }
  lens.addEventListener('change', () => { cancel(); showAnswer(); });
  window.addEventListener('onomatoi-utterance', ({detail}) => {
    if (detail.src !== 'draw') return;
    cancel();
    answers.clear();
    const axes = detail.explanation?.axes || detail.event.axes || {};
    const shape = detail.explanation?.shape || {};
    current = {
      word: detail.event.displayWordOverride || namingKanaOf(detail.event.moras),
      lang: ja ? 'ja' : 'en',
      axes: Object.fromEntries(['size', 'sharp', 'tex', 'bright', 'round', 'open'].map(key => [key, axes[key] ?? 0])),
      shape: {corners: shape.corners ?? 0, loops: shape.loops ?? 0, isClosed: shape.isClosed === true}
    };
    card.querySelector('.reaction-word').textContent = current.word;
    card.hidden = false;
    showAnswer();
  });
  document.getElementById('btn-clear').addEventListener('click', () => {
    cancel(); answers.clear(); current = null; card.hidden = true;
  });
  ask.addEventListener('click', async () => {
    if (!current || ask.disabled) return;
    const token = version;
    const key = cacheKey();
    controller = new AbortController();
    ask.disabled = true;
    card.setAttribute('aria-busy', 'true');
    text.classList.remove('is-placeholder');
    text.textContent = ja ? 'ことばのつづきを考えています…' : 'Imagining what comes next…';
    source.hidden = true;
    try {
      const response = await fetch(API_BASE + '/api/reaction', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({...current, responseStyle: style, lens: lens.checked ? 'sound_map' : 'simple'}),
        signal: controller.signal
      });
      const data = await response.json();
      if (version !== token) return;
      if (!response.ok) {
        const errors = {
          invalid_api_key: ja ? 'APIキーが認証されませんでした。' : 'The API key was rejected.',
          luna_unavailable: ja ? 'ローカルのLunaキーが見つかりません。' : 'The local Luna key is unavailable.',
          sound_map_unavailable: ja ? '音の地図を読み取れません。チェックを外すと試せます。' : 'Sound map unavailable. Uncheck it to try without it.'
        };
        text.textContent = response.status === 429
          ? (ja ? '今日はここまで。また明日どうぞ。' : 'That is all for today. Please come back tomorrow.')
          : errors[data.code] || (ja ? '今は返答できません。少ししてからもう一度どうぞ。' : 'Please try again shortly.');
        return;
      }
      answers.set(key, data);
      showAnswer();
    } catch (error) {
      if (token !== version || error.name === 'AbortError') return;
      text.textContent = ja ? '接続できませんでした。もう一度お試しください。' : 'Could not connect. Please try again.';
    } finally {
      if (token === version) { ask.disabled = false; card.setAttribute('aria-busy', 'false'); }
    }
  });
})();
