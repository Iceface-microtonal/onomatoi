// A short response to a drawing. The API key stays in the server-side Worker.
(() => {
  const ja = document.documentElement.lang !== 'en';
  const localPreview = location.hostname === '127.0.0.1' && location.port === '8766';
  const API_BASE = localPreview ? '' : 'https://onomatoi-reaction.puppetwin.workers.dev';
  const card = document.createElement('section');
  card.className = 'reaction-card';
  card.hidden = true;
  card.innerHTML = `
    <div class="reaction-heading">
      <span class="reaction-kicker">${ja ? 'ONE LINE / 一筆へのひとこと' : 'ONE LINE / A LITTLE RESPONSE'}</span>
      <span class="reaction-mode"></span>
    </div>
    <div class="reaction-main">
      <button type="button" class="reaction-ask">${ja ? 'この一筆へのひとことを聞く ↗' : 'A thought on this line ↗'}</button>
      <p class="reaction-text" role="status" aria-live="polite"></p>
    </div>
    <p class="reaction-note">${ja ? '線の特徴と生まれたことばからの連想です。音声は聴いていません。' : 'An impression from the line and its word. The voice is not heard by the model.'}</p>`;
  document.querySelector('.listening-bar').after(card);

  const ask = card.querySelector('.reaction-ask');
  const text = card.querySelector('.reaction-text');
  const mode = card.querySelector('.reaction-mode');
  let current = null;
  let version = 0;
  let controller = null;
  let currentMode = 'example';

  function setMode(value) {
    currentMode = value;
    mode.textContent = value === 'luna' ? 'GPT-6 Luna'
      : value === 'configured' ? (ja ? 'Luna キー未検証' : 'Luna key unverified')
      : value === 'example' ? (ja ? 'ローカル見本' : 'Local example')
      : (ja ? 'ただいま休止中' : 'Currently unavailable');
  }
  setMode('configured');
  fetch(API_BASE + '/api/reaction/status').then(r => r.json()).then(data => setMode(data.mode))
    .catch(() => setMode('unavailable'));

  window.addEventListener('onomatoi-utterance', ({detail}) => {
    if (detail.src !== 'draw') return;
    controller?.abort();
    version += 1;
    const axes = detail.explanation?.axes || detail.event.axes || {};
    const shape = detail.explanation?.shape || {};
    current = {
      word: detail.event.displayWordOverride || namingKanaOf(detail.event.moras),
      lang: ja ? 'ja' : 'en',
      axes: Object.fromEntries(['size', 'sharp', 'tex', 'bright', 'round', 'open'].map(key => [key, axes[key] ?? 0])),
      shape: {corners: shape.corners ?? 0, loops: shape.loops ?? 0, isClosed: shape.isClosed === true}
    };
    text.textContent = '';
    ask.hidden = false;
    ask.disabled = false;
    card.hidden = false;
  });

  document.getElementById('btn-clear').addEventListener('click', () => {
    controller?.abort();
    version += 1;
    current = null;
    card.hidden = true;
  });

  ask.addEventListener('click', async () => {
    if (!current) return;
    const thisVersion = version;
    controller = new AbortController();
    ask.disabled = true;
    text.textContent = ja ? '一筆を眺めています…' : 'Looking at your line…';
    try {
      const response = await fetch(API_BASE + '/api/reaction', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(current),
        signal: controller.signal
      });
      const data = await response.json();
      if (thisVersion !== version) return;
      if (!response.ok) {
        text.textContent = response.status === 429
          ? (ja ? '今日はここまで。また明日どうぞ。' : 'That is all for today. Please come back tomorrow.')
          : data.code === 'invalid_api_key'
          ? (ja ? 'APIキーが認証されませんでした。キーを確認してください。' : 'The API key was rejected. Please check it.')
          : (ja ? 'いまは反応を返せません。もう一度お試しください。' : 'No response right now. Please try again.');
        ask.disabled = response.status === 429;
        return;
      }
      setMode(data.mode);
      text.textContent = data.text;
      ask.hidden = true;
    } catch (error) {
      if (thisVersion !== version || error.name === 'AbortError') return;
      text.textContent = ja ? 'いまは反応を返せません。もう一度お試しください。' : 'No response right now. Please try again.';
      ask.disabled = false;
    }
  });
})();
