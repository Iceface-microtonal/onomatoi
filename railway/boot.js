// Load the one authoritative engine and its supporting DOM from the original page.
// The railway only changes presentation; voice assets and word rules stay shared.
(() => {
  const slot = document.getElementById('canvas-slot');
  const status = document.getElementById('travel-status');
  let loading = false;
  async function start() {
    if (loading) return;
    loading = true;
    status.textContent = '線路と声を準備しています…';
    try {
      const response = await fetch('/iceface_onomatoi.html');
      if (!response.ok) throw new Error('Onomatoi engine could not be loaded');
      const original = new DOMParser().parseFromString(await response.text(), 'text/html');
      const engine = Array.from(original.querySelectorAll('script')).find(script =>
        !script.hasAttribute('src') && script.textContent.includes('const SAMPLE_BASE ='));
      if (!engine || !original.getElementById('canvas')) throw new Error('Onomatoi engine is missing');
      const code = engine.textContent;
      original.querySelectorAll('script').forEach(script => script.remove());
      const legacy = document.createElement('div');
      legacy.id = 'legacy'; legacy.hidden = true; legacy.setAttribute('aria-hidden', 'true');
      while (original.body.firstChild) legacy.appendChild(document.adoptNode(original.body.firstChild));
      document.body.appendChild(legacy);
      const canvas = legacy.querySelector('#canvas');
      canvas.setAttribute('aria-label', '次の駅への線路を、指やマウスで一筆描く');
      slot.replaceChildren(canvas);
      const script = document.createElement('script');
      script.textContent = code;
      document.body.appendChild(script);
      const view = document.createElement('script');
      view.src = '/railway/railway.js';
      view.onload = () => { slot.setAttribute('aria-busy', 'false'); status.textContent = '次の駅は、まだ誰も知りません。'; };
      view.onerror = () => { slot.setAttribute('aria-busy', 'false'); status.textContent = '画面の読込に失敗しました。ページを再読み込みしてください。'; };
      document.body.appendChild(view);
    } catch (error) {
      slot.setAttribute('aria-busy', 'false');
      status.textContent = '準備できませんでした。通信を確認して、再読み込みしてください。';
      console.error('Railway startup failed:', error);
    }
  }
  start();
})();
