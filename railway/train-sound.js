/* Train sounds for the railway view, synthesized with Web Audio (no recordings are added).
   The sound follows the drawn rail itself: wheels click over rail joints at the train's real
   speed along the path (ガタンゴトン), the flanges squeal on tight curves and corners (キキッ),
   and the train hisses to a stop on arrival (プシュー). */
(() => {
  'use strict';
  const JOINT = 44;        // px between rail joints along the drawn track
  const BOGIE = 6;         // px from the car's center to each bogie (ガタン = front, ゴトン = rear)
  const AXLE = 3;          // px between the two axles of one bogie (the "ガ・タン" flam)
  const VREF = 260;        // px/s that counts as full speed for loudness and brightness
  const LOOKAHEAD = .12;   // s of joint clicks scheduled ahead of the animation frame
  const STEP = 4;          // px resolution of the curvature table
  const LEVEL = .4;        // whole train under the voice (rendered RMS about 10 dB below a spoken word)
  const DUCK = .5;         // further down while the word is still being spoken
  const CLACK = .7;        // rail-joint clicks relative to the rest (10-16 作者: ガタゴトをもう少しだけ小さく = -3 dB)
  const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
  const smooth = u => u * u * (3 - 2 * u);   // same easing as the train animation
  let noise = null;
  function noiseBuffer(ctx) {
    if (noise && noise.sampleRate === ctx.sampleRate) return noise;
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return noise;
  }
  // Turning rate (rad/px) along the polyline, sampled every STEP px over a ±8px window.
  function curvatureTable(points) {
    const cum = [0];
    for (let i = 1; i < points.length; i++)
      cum.push(cum[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
    const length = cum[cum.length - 1];
    let seg = 1;
    const headingAt = s => {
      s = clamp(s, 0, length);
      while (seg < points.length - 1 && cum[seg] < s) seg++;
      while (seg > 1 && cum[seg - 1] > s) seg--;
      // skip zero-length segments (repeated beads) so the heading never collapses to 0
      let a = seg - 1, b = seg;
      while (b < points.length - 1 && cum[b] - cum[a] < .5) b++;
      while (a > 0 && cum[b] - cum[a] < .5) a--;
      return Math.atan2(points[b][1] - points[a][1], points[b][0] - points[a][0]);
    };
    const n = Math.max(2, Math.ceil(length / STEP) + 1), table = new Float32Array(n);
    const heads = [];
    for (let i = 0; i < n; i++) heads.push(headingAt(i * STEP));
    for (let i = 0; i < n; i++) {
      let d = heads[Math.min(n - 1, i + 2)] - heads[Math.max(0, i - 2)];
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      table[i] = Math.abs(d) / (STEP * 4);
    }
    return {length, at: s => table[clamp(Math.round(s / STEP), 0, n - 1)]};
  }

  // One journey along one rail. tick(ms) is called from the animation frame with the ride time.
  function ride(ctx, {points, duration, voiceSec = 0}) {
    const {length, at: curvature} = curvatureTable(points);
    const out = ctx.createGain(), sources = new Set();
    out.gain.value = LEVEL * DUCK;
    out.connect(ctx.destination);
    const offline = typeof ctx.startRendering === 'function';
    let stopped = false, arrived = false, scheduledU = 0;
    function track(node, startAt, stopAt) {
      sources.add(node);
      node.onended = () => sources.delete(node);
      node.start(startAt);
      if (stopAt !== undefined) node.stop(stopAt);
      return node;
    }
    // continuous layers: rolling rumble, motor whine (ウィーン), flange squeal, brake squeal
    const rumble = ctx.createBufferSource();
    rumble.buffer = noiseBuffer(ctx); rumble.loop = true;
    const rumbleTone = ctx.createBiquadFilter(); rumbleTone.type = 'lowpass'; rumbleTone.frequency.value = 120; rumbleTone.Q.value = .8;
    const rumbleGain = ctx.createGain(); rumbleGain.gain.value = 0;
    rumble.connect(rumbleTone).connect(rumbleGain).connect(out);
    const motor = ctx.createOscillator(); motor.type = 'sawtooth'; motor.frequency.value = 220;
    const motorTone = ctx.createBiquadFilter(); motorTone.type = 'bandpass'; motorTone.frequency.value = 440; motorTone.Q.value = 5;
    const motorGain = ctx.createGain(); motorGain.gain.value = 0;
    motor.connect(motorTone).connect(motorGain).connect(out);
    const flange = ctx.createOscillator(); flange.type = 'sine'; flange.frequency.value = 3150;
    const wobble = ctx.createOscillator(); wobble.frequency.value = 7.3;
    const wobbleDepth = ctx.createGain(); wobbleDepth.gain.value = 38;
    wobble.connect(wobbleDepth).connect(flange.frequency);
    const flangeGain = ctx.createGain(); flangeGain.gain.value = 0;
    flange.connect(flangeGain).connect(out);
    const brake = ctx.createOscillator(); brake.type = 'triangle'; brake.frequency.value = 1700;
    const brakeGain = ctx.createGain(); brakeGain.gain.value = 0;
    brake.connect(brakeGain).connect(out);
    const t0 = ctx.currentTime;
    for (const node of [rumble, motor, flange, wobble, brake]) track(node, t0);

    function speedAt(u) { return length / (duration / 1000) * 6 * u * (1 - u); }
    // One bogie over a joint: two axles, each a low thump with a short metallic tick.
    function clack(t, speed, front) {
      const amp = CLACK * Math.pow(clamp(speed / VREF), .6) * (.85 + Math.random() * .3);
      if (amp < .02 * CLACK) return;
      const gap = clamp(AXLE / Math.max(speed, 1), .012, .085);
      for (const [k, at] of [[.75, t], [1, t + gap]]) {
        const thump = ctx.createOscillator(), tg = ctx.createGain();
        thump.frequency.setValueAtTime(front ? 118 : 92, at);
        thump.frequency.exponentialRampToValueAtTime(46, at + .07);
        tg.gain.setValueAtTime(0, at);
        tg.gain.linearRampToValueAtTime(.34 * amp * k, at + .003);
        tg.gain.exponentialRampToValueAtTime(.0001, at + .11);
        thump.connect(tg).connect(out);
        track(thump, at, at + .12);
        const tick = ctx.createBufferSource(), tone = ctx.createBiquadFilter(), ng = ctx.createGain();
        tick.buffer = noiseBuffer(ctx);
        tone.type = 'bandpass'; tone.frequency.value = (front ? 1900 : 1250) * (.92 + Math.random() * .16); tone.Q.value = 1.6;
        ng.gain.setValueAtTime(0, at);
        ng.gain.linearRampToValueAtTime(.2 * amp * k, at + .0015);
        ng.gain.exponentialRampToValueAtTime(.0001, at + .04);
        tick.connect(tone).connect(ng).connect(out);
        sources.add(tick); tick.onended = () => sources.delete(tick);
        tick.start(at, Math.random() * 1.8, .05);
      }
    }
    // the ride parameter u where a wheel at `offset` from the car's center reaches arc length `target`
    function crossing(target, offset, lo, hi) {
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        if (length * smooth(mid) + offset < target) lo = mid; else hi = mid;
      }
      return (lo + hi) / 2;
    }
    function tick(ms, audioNow = ctx.currentTime) {
      if (stopped || arrived) return;
      if (!offline && ctx.state !== 'running') { scheduledU = clamp(ms / duration); return; }
      const u = clamp(ms / duration), speed = speedAt(u), sn = clamp(speed / VREF), s = length * smooth(u);
      // the word is announced as the train departs: keep the train under the voice until it ends
      out.gain.setTargetAtTime(LEVEL * (ms / 1000 < voiceSec ? DUCK : 1), audioNow, .12);
      rumbleGain.gain.setTargetAtTime(.075 * Math.pow(sn, .8), audioNow, .06);
      rumbleTone.frequency.setTargetAtTime(110 + 520 * sn, audioNow, .08);
      const pull = u < .5 ? 1 : .55;   // the motor sings louder while accelerating
      motor.frequency.setTargetAtTime(150 + 900 * sn, audioNow, .05);
      motorTone.frequency.setTargetAtTime(300 + 1800 * sn, audioNow, .05);
      motorGain.gain.setTargetAtTime(.022 * sn * pull, audioNow, .08);
      const bend = clamp((curvature(s) - .03) / .05) * clamp((sn - .12) / .3);
      flangeGain.gain.setTargetAtTime(.02 * bend, audioNow, bend > 0 ? .025 : .07);
      const braking = clamp((u - .8) / .1) * clamp(sn / .1);
      brake.frequency.setTargetAtTime(1650 + 500 * (1 - sn), audioNow, .1);
      brakeGain.gain.setTargetAtTime(.007 * braking, audioNow, .06);
      const uEnd = clamp((ms + LOOKAHEAD * 1000) / duration);
      if (uEnd <= scheduledU) return;
      for (const [offset, front] of [[BOGIE, true], [-BOGIE, false]]) {
        const from = length * smooth(scheduledU) + offset, to = length * smooth(uEnd) + offset;
        for (let k = Math.floor(from / JOINT) + 1; k * JOINT <= to; k++) {
          if (k * JOINT >= length) break;
          const uc = crossing(k * JOINT, offset, scheduledU, uEnd);
          clack(Math.max(audioNow, audioNow + (uc * duration - ms) / 1000), speedAt(uc), front);
        }
      }
      scheduledU = uEnd;
    }
    function silenceLayers(at) {
      for (const g of [rumbleGain, motorGain, flangeGain, brakeGain]) {
        g.gain.cancelScheduledValues(at);
        g.gain.setTargetAtTime(0, at, .04);
      }
      for (const node of [rumble, motor, flange, wobble, brake]) { try { node.stop(at + .3); } catch (_) {} }
    }
    // Stop at the platform: the brakes let go of their air (プシュー). Returns when the hiss settles.
    function arrive(audioNow = ctx.currentTime) {
      if (stopped || arrived) return audioNow;
      arrived = true;
      silenceLayers(audioNow);
      out.gain.cancelScheduledValues(audioNow);
      out.gain.setTargetAtTime(LEVEL, audioNow, .05);
      const at = audioNow + .08;
      const hiss = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), bp = ctx.createBiquadFilter(), hg = ctx.createGain();
      hiss.buffer = noiseBuffer(ctx); hiss.loop = true;
      hp.type = 'highpass'; hp.frequency.value = 1100;
      bp.type = 'bandpass'; bp.Q.value = .7;
      bp.frequency.setValueAtTime(3600, at);
      bp.frequency.exponentialRampToValueAtTime(2400, at + 1);
      hg.gain.setValueAtTime(0, at);
      hg.gain.linearRampToValueAtTime(.06, at + .04);
      hg.gain.setValueAtTime(.06, at + .22);
      hg.gain.exponentialRampToValueAtTime(.0001, at + 1.05);
      hiss.connect(hp).connect(bp).connect(hg).connect(out);
      track(hiss, at, at + 1.1);
      if (!offline) setTimeout(() => stop(0), 1800);
      return at + .45;
    }
    function stop(fade = .05) {
      if (stopped) return;
      stopped = true;
      const now = ctx.currentTime;
      out.gain.cancelScheduledValues(now);
      out.gain.setTargetAtTime(0, now, Math.max(fade, .001) / 3);
      for (const node of sources) { try { node.stop(now + fade + .05); } catch (_) {} }
      setTimeout(() => { try { out.disconnect(); } catch (_) {} }, (fade + .2) * 1000);
    }
    return {tick, arrive, stop, length};
  }
  window.RailwaySound = {ride, curvatureTable};
})();
