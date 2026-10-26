(() => {
  'use strict';

  /* ============ Konfigurācija ============ */

  const LEVELS = {
    1: { name: 'Iesācējs', tables: [1, 2, 3], count: 10, color: 'var(--blue)' },
    2: { name: 'Pratējs', tables: [1, 2, 3, 4, 5], count: 12, color: 'var(--yellow)' },
    3: { name: 'Meistars', tables: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], count: 15, color: 'var(--pink)' },
  };
  const MODES = { choice: 'Izvēlies atbildi', input: 'Ieraksti atbildi' };
  const PRAISE = ['Pareizi!', 'Malacis!', 'Lieliski!', 'Tieši tā!', 'Super!', 'Precīzi!', 'Forši!'];
  const STORE_KEY = 'reizrekins.v1';
  const MAX_GAMES = 300;
  const DELAY_OK = 750;
  const DELAY_BAD = 2600;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(pointer: fine)').matches;

  /* ============ Palīgi ============ */

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const rand = (min, max) => Math.random() * (max - min) + min;
  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  const factKey = (a, b) => `${Math.min(a, b)}x${Math.max(a, b)}`;
  const plural = (n, one, many) => (n % 10 === 1 && n % 100 !== 11 ? one : many);
  const fmtSec = (ms) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
  const fmtClock = (ms) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  const fmtMistakes = (n) => (n === 0 ? 'bez kļūdām' : `${n} ${plural(n, 'kļūda', 'kļūdas')}`);
  const fmtDate = (t) => {
    const d = new Date(t);
    const today = new Date();
    const yest = new Date(Date.now() - 864e5);
    const time = d.toLocaleTimeString('lv-LV', { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === today.toDateString()) return `šodien ${time}`;
    if (d.toDateString() === yest.toDateString()) return `vakar ${time}`;
    return `${d.toLocaleDateString('lv-LV', { day: 'numeric', month: 'short' })} ${time}`;
  };
  const starsHtml = (n) => '★'.repeat(n) + `<span class="off">${'★'.repeat(3 - n)}</span>`;

  /* ============ Krātuve ============ */

  const defaults = () => ({
    v: 1,
    games: [],
    facts: {},
    best: {},
    prefs: { level: 1, mode: 'choice', sound: true },
  });

  const store = (() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return defaults();
      const d = JSON.parse(raw);
      const base = defaults();
      return {
        ...base,
        ...d,
        prefs: { ...base.prefs, ...(d.prefs || {}) },
      };
    } catch (e) {
      return defaults();
    }
  })();

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch (e) { /* privātais režīms vai pilna krātuve */ }
  }

  /* ============ Skaņa ============ */

  const Sound = (() => {
    let ctx = null;
    function ac() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    function tone(freq, start, dur, type = 'sine', vol = 0.12) {
      const c = ac();
      if (!c) return;
      const t = c.currentTime + start;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(c.destination);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    const sounds = {
      tap: () => tone(620, 0, 0.05, 'triangle', 0.04),
      select: () => { tone(520, 0, 0.07, 'triangle', 0.06); tone(780, 0.04, 0.09, 'triangle', 0.05); },
      ok: () => { tone(784, 0, 0.12, 'sine', 0.13); tone(1175, 0.08, 0.2, 'sine', 0.11); },
      bad: () => { tone(220, 0, 0.2, 'triangle', 0.14); tone(165, 0.11, 0.28, 'triangle', 0.12); },
      streak: () => [880, 1109, 1319].forEach((f, i) => tone(f, i * 0.06, 0.14, 'sine', 0.08)),
      star: (i = 0) => tone([1047, 1319, 1568][i] || 1568, 0, 0.22, 'sine', 0.1),
      win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.1, 0.32, 'sine', 0.1)),
    };
    return {
      play(name, arg) {
        if (!store.prefs.sound) return;
        try { sounds[name] && sounds[name](arg); } catch (e) { /* nav audio */ }
      },
    };
  })();

  /* ============ Krīta putekļi un konfeti ============ */

  const FX = (() => {
    const cv = $('#fx');
    const cx = cv.getContext('2d');
    const COLORS = ['#f3efe4', '#f7d774', '#f5a6c6', '#96cff5', '#a8e6a1'];
    let parts = [];
    let raf = 0;
    let w = 0;
    let h = 0;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      cv.width = w * dpr;
      cv.height = h * dpr;
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function tick() {
      cx.clearRect(0, 0, w, h);
      parts = parts.filter((p) => p.life > 0 && p.y < h + 40);
      for (const p of parts) {
        p.vx *= p.drag;
        p.vy = p.vy * p.drag + p.g;
        p.x += p.vx;
        p.y += p.vy;
        p.life -= p.decay;
        p.rot += p.vr;
        cx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.4));
        cx.fillStyle = p.color;
        if (p.kind === 'dot') {
          cx.beginPath();
          cx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          cx.fill();
        } else {
          cx.save();
          cx.translate(p.x, p.y);
          cx.rotate(p.rot);
          cx.fillRect(-p.size, -p.size * 0.35, p.size * 2, p.size * 0.7);
          cx.restore();
        }
      }
      cx.globalAlpha = 1;
      raf = parts.length ? requestAnimationFrame(tick) : 0;
    }

    function start() {
      if (!raf) raf = requestAnimationFrame(tick);
    }

    return {
      resize,
      dust(x, y, count = 28, palette = COLORS) {
        if (reducedMotion) return;
        for (let i = 0; i < count; i++) {
          const ang = rand(0, Math.PI * 2);
          const sp = rand(1.5, 6.5);
          parts.push({
            kind: Math.random() < 0.7 ? 'dot' : 'bit',
            x, y,
            vx: Math.cos(ang) * sp,
            vy: Math.sin(ang) * sp - 2,
            g: 0.16, drag: 0.95,
            size: rand(1.6, 4.2),
            rot: rand(0, 6), vr: rand(-0.2, 0.2),
            life: 1, decay: rand(0.014, 0.03),
            color: palette[Math.floor(Math.random() * palette.length)],
          });
        }
        start();
      },
      confetti(count = 140) {
        if (reducedMotion) return;
        for (let i = 0; i < count; i++) {
          parts.push({
            kind: 'bit',
            x: rand(0, w),
            y: rand(-h * 0.5, -10),
            vx: rand(-1.2, 1.2),
            vy: rand(1.5, 4),
            g: 0.035, drag: 0.995,
            size: rand(4, 8),
            rot: rand(0, 6), vr: rand(-0.15, 0.15),
            life: rand(1.2, 1.8), decay: rand(0.004, 0.007),
            color: COLORS[Math.floor(Math.random() * COLORS.length)],
          });
        }
        start();
      },
    };
  })();

  function centerOf(el) {
    const r = el.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  }

  /* ============ Ekrāni ============ */

  let current = 'menu';
  const wipe = $('#wipe');

  function prepareAnim(screen) {
    screen.querySelectorAll('[data-anim]').forEach((el, i) => el.style.setProperty('--d', `${i * 70}ms`));
  }

  function show(name, onShown) {
    const from = $(`#screen-${current}`);
    const to = $(`#screen-${name}`);
    const swap = () => {
      from.classList.remove('active');
      prepareAnim(to);
      to.classList.add('active');
      to.scrollTop = 0;
      current = name;
      onShown && onShown();
    };
    if (reducedMotion || from === to) return swap();
    wipe.classList.remove('run');
    void wipe.offsetWidth;
    wipe.classList.add('run');
    setTimeout(swap, 340);
  }

  /* ============ Dialogs ============ */

  const dialog = $('#dialog');
  // no = null → tikai viena poga (paziņojums); body — papildu HTML zem virsraksta
  function confirmBox(text, yes = 'Jā', no = 'Nē', body = '') {
    return new Promise((resolve) => {
      $('#dialog-text').textContent = text;
      $('#dialog-body').innerHTML = body;
      $('#dialog-body').hidden = !body;
      $('#dialog-yes').textContent = yes;
      $('#dialog-no').textContent = no || '';
      $('#dialog-no').hidden = !no;
      dialog.returnValue = '';
      dialog.addEventListener('close', () => resolve(dialog.returnValue === 'yes'), { once: true });
      dialog.showModal();
      $(no ? '#dialog-no' : '#dialog-yes').focus();
    });
  }

  /* ============ Izvēlne ============ */

  function renderMenu() {
    const { level, mode, sound } = store.prefs;
    $$('.level-card').forEach((b) => b.setAttribute('aria-checked', String(+b.dataset.level === level)));
    $$('.mode-card').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === mode)));
    $('#btn-sound').classList.toggle('muted', !sound);
    $('#btn-sound').setAttribute('aria-label', sound ? 'Skaņa ieslēgta' : 'Skaņa izslēgta');

    const best = store.best[`${level}-${mode}`];
    const count = LEVELS[level].count;
    $('#best-line').innerHTML = best
      ? `${count} piemēri · rekords: <b>${fmtMistakes(best.mistakes)}, ${fmtClock(best.time)}</b>`
      : `${count} piemēri · rekorda vēl nav — uzstādi pirmo!`;
  }

  $$('.level-card').forEach((b) => b.addEventListener('click', () => {
    store.prefs.level = +b.dataset.level;
    save();
    renderMenu();
    Sound.play('select');
  }));
  $$('.mode-card').forEach((b) => b.addEventListener('click', () => {
    store.prefs.mode = b.dataset.mode;
    save();
    renderMenu();
    Sound.play('select');
  }));
  $('#btn-sound').addEventListener('click', () => {
    store.prefs.sound = !store.prefs.sound;
    save();
    renderMenu();
    Sound.play('select');
  });
  $('#btn-start').addEventListener('click', () => startGame());
  $('#btn-stats').addEventListener('click', () => { renderStats(); show('stats', renderCharts); Sound.play('tap'); });

  /* ============ Uzdevumu ģenerēšana ============ */

  // Svars: vienkāršie piemēri (×1, ×10) parādās retāk, piemēri ar pagātnes kļūdām — biežāk.
  function weightOf(lo, hi) {
    let w = lo === 1 ? 0.35 : hi === 10 ? 0.6 : 1;
    const f = store.facts[factKey(lo, hi)];
    if (!f) return w + 0.3;
    w += Math.min(4, f.wrong * 1.2);
    if (f.n && f.ms / f.n > 6000) w += 0.6;
    return w;
  }

  function buildQueue(level) {
    const { tables, count } = LEVELS[level];
    const facts = new Map();
    for (const a of tables) {
      for (let b = 1; b <= 10; b++) {
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        facts.set(factKey(lo, hi), { lo, hi, w: weightOf(lo, hi) });
      }
    }
    const pool = [...facts.values()];
    const picked = [];
    while (picked.length < count && pool.length) {
      const total = pool.reduce((s, f) => s + f.w, 0);
      let r = Math.random() * total;
      let i = 0;
      while (r > pool[i].w && i < pool.length - 1) r -= pool[i++].w;
      const [f] = pool.splice(i, 1);
      const swap = f.lo !== f.hi && Math.random() < 0.5;
      picked.push({ a: swap ? f.hi : f.lo, b: swap ? f.lo : f.hi });
    }
    return picked;
  }

  // Ticami nepareizi varianti: blakus reizinājumi un tipiskas kļūdas.
  function buildOptions(a, b) {
    const c = a * b;
    const near = shuffle([a * (b + 1), a * (b - 1), (a + 1) * b, (a - 1) * b, c + 1, c - 1, c + 2, c - 2]);
    const far = shuffle([c + 10, c - 10, a + b, (a + 1) * (b + 1), (a - 1) * (b - 1)]);
    const opts = new Set([c]);
    for (const v of [...near.slice(0, 5), ...far]) {
      if (opts.size >= 4) break;
      if (v > 0 && v !== c) opts.add(v);
    }
    let k = 1;
    while (opts.size < 4) {
      const v = c + (k % 2 ? k : -k) + 2;
      if (v > 0) opts.add(v);
      k++;
    }
    return shuffle([...opts]);
  }

  /* ============ Spēle ============ */

  const els = {
    screen: $('#screen-game'),
    question: $('#question'),
    qa: $('#qa'),
    qb: $('#qb'),
    slot: $('#slot'),
    field: $('#field'),
    feedback: $('#feedback'),
    choices: $('#answers-choice'),
    check: $('#btn-check'),
    fill: $('#progress-fill'),
    progress: $('#progress-text'),
    timer: $('#hud-timer'),
    streak: $('#hud-streak'),
    streakNum: $('#streak-num'),
  };

  const game = {
    active: false,
    level: 1,
    mode: 'choice',
    queue: [],
    idx: 0,
    results: [],
    qStart: 0,
    thinking: 0,
    locked: true,
    waiting: false,
    streak: 0,
    bestStreak: 0,
    timerId: 0,
    advanceId: 0,
  };

  function startGame() {
    Sound.play('select');
    Object.assign(game, {
      active: true,
      level: store.prefs.level,
      mode: store.prefs.mode,
      queue: buildQueue(store.prefs.level),
      idx: 0,
      results: [],
      thinking: 0,
      locked: true,
      waiting: false,
      streak: 0,
      bestStreak: 0,
    });
    els.screen.classList.toggle('mode-input', game.mode === 'input');
    els.screen.classList.toggle('mode-choice', game.mode === 'choice');
    renderStreak(false);
    els.timer.textContent = '0:00';
    els.feedback.innerHTML = '';
    els.feedback.className = 'feedback';
    show('game', () => {
      nextQuestion();
      clearInterval(game.timerId);
      game.timerId = setInterval(tickTimer, 200);
    });
  }

  function tickTimer() {
    const running = game.locked ? 0 : performance.now() - game.qStart;
    els.timer.textContent = fmtClock(game.thinking + running);
  }

  function renderStreak(bump) {
    els.streakNum.textContent = game.streak;
    els.streak.classList.toggle('hot', game.streak >= 3);
    if (bump) {
      els.streak.classList.remove('bump');
      void els.streak.offsetWidth;
      els.streak.classList.add('bump');
    }
  }

  function nextQuestion() {
    const q = game.queue[game.idx];
    const total = game.queue.length;
    els.progress.textContent = `${game.idx + 1} / ${total}`;
    els.fill.style.width = `${(game.idx / total) * 100}%`;

    els.qa.textContent = q.a;
    els.qb.textContent = q.b;
    els.slot.textContent = '?';
    els.slot.className = 'slot';
    els.feedback.innerHTML = '';
    els.feedback.className = 'feedback';
    els.question.classList.remove('in', 'shake');
    void els.question.offsetWidth;
    els.question.classList.add('in');

    if (game.mode === 'choice') {
      els.choices.classList.remove('locked');
      els.choices.innerHTML = buildOptions(q.a, q.b)
        .map((v, i) => `<button class="choice" data-v="${v}" style="--i:${i}" aria-label="${'ABCD'[i]}: ${v}"><span class="letter">${'ABCD'[i]}</span><span class="val">${v}</span></button>`)
        .join('');
    } else {
      els.field.value = '';
      els.field.className = 'field';
      els.field.readOnly = false;
      updateCheck();
      if (finePointer) els.field.focus({ preventScroll: true });
    }

    game.locked = false;
    game.waiting = false;
    game.qStart = performance.now();
  }

  function answer(value, btn) {
    if (game.locked || !game.active) return;
    game.locked = true;
    const q = game.queue[game.idx];
    const c = q.a * q.b;
    const ms = Math.round(performance.now() - game.qStart);
    const ok = value === c;
    game.thinking += ms;
    game.results.push({ a: q.a, b: q.b, answer: value, ok, ms });
    tickTimer();

    if (game.mode === 'choice') {
      els.choices.classList.add('locked');
      els.choices.querySelectorAll('.choice').forEach((b) => {
        const v = +b.dataset.v;
        if (v === c) b.classList.add(ok ? 'correct' : 'reveal');
        else if (b === btn) b.classList.add('wrong');
        else b.classList.add('dim');
      });
    } else {
      els.field.readOnly = true;
      els.check.disabled = true;
    }

    if (ok) {
      game.streak++;
      game.bestStreak = Math.max(game.bestStreak, game.streak);
      renderStreak(true);
      if (game.mode === 'choice') {
        els.slot.textContent = c;
        els.slot.className = 'slot ok';
      } else {
        els.field.classList.add('ok');
      }
      const isStreak = game.streak >= 3 && game.streak % 3 === 0;
      const msg = isStreak ? `${game.streak} pēc kārtas!` : PRAISE[Math.floor(Math.random() * PRAISE.length)];
      els.feedback.className = 'feedback ok';
      els.feedback.innerHTML = `<span class="msg">${msg}</span>`;
      const [x, y] = centerOf(game.mode === 'choice' ? els.slot : els.field);
      FX.dust(x, y, isStreak ? 50 : 28);
      if (btn) FX.dust(...centerOf(btn), 14, ['#a8e6a1', '#f3efe4']);
      Sound.play(isStreak ? 'streak' : 'ok');
      game.advanceId = setTimeout(advance, DELAY_OK);
    } else {
      game.streak = 0;
      renderStreak(false);
      if (game.mode === 'choice') {
        els.slot.textContent = c;
        els.slot.className = 'slot fix';
      } else {
        els.field.classList.add('bad');
      }
      els.question.classList.remove('in', 'shake');
      void els.question.offsetWidth;
      els.question.classList.add('shake');
      els.feedback.className = 'feedback bad';
      els.feedback.innerHTML = `<span class="msg">Pareizi būtu <span class="fix">${q.a} × ${q.b} = ${c}</span></span><button class="next-btn" id="btn-next">Tālāk →</button>`;
      $('#btn-next').addEventListener('click', advance);
      Sound.play('bad');
      game.waiting = true;
      game.advanceId = setTimeout(advance, DELAY_BAD);
    }
  }

  function advance() {
    if (!game.active || !game.locked) return;
    clearTimeout(game.advanceId);
    game.waiting = false;
    game.idx++;
    if (game.idx >= game.queue.length) finishGame();
    else nextQuestion();
  }

  function stopGame() {
    game.active = false;
    game.locked = true;
    clearTimeout(game.advanceId);
    clearInterval(game.timerId);
    els.field.blur();
  }

  async function askQuit() {
    if (!game.active) return;
    const wasLocked = game.locked;
    const pausedAt = performance.now();
    game.locked = true;
    clearTimeout(game.advanceId);
    const yes = await confirmBox('Pārtraukt spēli? Rezultāts netiks saglabāts.', 'Pārtraukt', 'Turpināt');
    if (yes) {
      stopGame();
      renderMenu();
      show('menu');
      return;
    }
    if (wasLocked) {
      game.advanceId = setTimeout(advance, 300);
    } else {
      game.qStart += performance.now() - pausedAt;
      game.locked = false;
      if (game.mode === 'input' && finePointer) els.field.focus({ preventScroll: true });
    }
  }

  els.choices.addEventListener('click', (e) => {
    const btn = e.target.closest('.choice');
    if (btn) answer(+btn.dataset.v, btn);
  });
  $('#btn-quit').addEventListener('click', askQuit);

  /* --- Ievades režīms --- */

  function updateCheck() {
    els.check.disabled = els.field.value === '' || game.locked;
  }

  function setField(v) {
    els.field.value = v;
    els.field.classList.remove('nudge');
    void els.field.offsetWidth;
    els.field.classList.add('nudge');
    updateCheck();
  }

  function doStep(step) {
    if (game.locked) return;
    const cur = parseInt(els.field.value || '0', 10);
    setField(String(Math.max(0, Math.min(999, cur + step))));
    Sound.play('tap');
  }

  function submitInput() {
    if (game.locked) return;
    if (els.field.value === '') {
      els.field.classList.remove('nudge');
      void els.field.offsetWidth;
      els.field.classList.add('nudge');
      return;
    }
    answer(parseInt(els.field.value, 10));
  }

  els.field.addEventListener('input', () => {
    const clean = els.field.value.replace(/\D/g, '').slice(0, 3);
    if (clean !== els.field.value) els.field.value = clean;
    updateCheck();
  });
  els.check.addEventListener('click', submitInput);

  $$('.step').forEach((btn) => {
    const step = +btn.dataset.step;
    let delayId = 0;
    let repeatId = 0;
    const stop = () => { clearTimeout(delayId); clearInterval(repeatId); };
    btn.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); // neņem fokusu no ievades lauka
      doStep(step);
      delayId = setTimeout(() => { repeatId = setInterval(() => doStep(step), 110); }, 450);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => btn.addEventListener(ev, stop));
    btn.addEventListener('click', (e) => { if (e.detail === 0) doStep(step); }); // klaviatūra
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  /* ============ Rezultāts ============ */

  function calcStars(mistakes, n, avg, level) {
    const ratio = mistakes / n;
    let s = mistakes === 0 ? 3 : ratio <= 0.15 ? 2 : ratio <= 0.4 ? 1 : 0;
    const slowLimit = [0, 6000, 7000, 8000][level];
    if (s > 1 && avg > slowLimit) s--;
    return s;
  }

  function finishGame() {
    stopGame();
    const res = game.results;
    const n = res.length;
    const correct = res.filter((r) => r.ok).length;
    const mistakes = n - correct;
    const time = game.thinking;
    const avg = Math.round(time / n);
    const stars = calcStars(mistakes, n, avg, game.level);

    for (const r of res) {
      const key = factKey(r.a, r.b);
      const f = store.facts[key] || (store.facts[key] = { n: 0, wrong: 0, ms: 0 });
      f.n++;
      f.ms += r.ms;
      if (!r.ok) f.wrong++;
    }

    const record = { t: Date.now(), level: game.level, mode: game.mode, n, correct, mistakes, time, avg, stars, streak: game.bestStreak };
    store.games.push(record);
    if (store.games.length > MAX_GAMES) store.games.splice(0, store.games.length - MAX_GAMES);

    const bestKey = `${game.level}-${game.mode}`;
    const prev = store.best[bestKey];
    const isRecord = !prev || mistakes < prev.mistakes || (mistakes === prev.mistakes && time < prev.time);
    if (isRecord) store.best[bestKey] = { mistakes, time, avg, stars, t: record.t };
    save();

    els.fill.style.width = '100%';
    renderResult(record, res, isRecord && !!prev, isRecord && !prev);
  }

  function renderResult(rec, res, beatRecord, firstRecord) {
    const titles = ['Pamēģini vēlreiz!', 'Ir progress!', 'Labi padarīts!', 'Izcili!'];
    $('#r-meta').textContent = `${rec.level}. līmenis · ${LEVELS[rec.level].name} · ${MODES[rec.mode]}`;
    $('#r-title').textContent = titles[rec.stars];
    const badge = $('#r-record');
    badge.hidden = !(beatRecord || (firstRecord && rec.stars >= 2));
    badge.textContent = beatRecord ? 'Jauns rekords!' : 'Pirmais rekords!';

    const starEls = $$('#stars .star');
    starEls.forEach((s) => s.classList.remove('earned'));

    $('#r-correct').innerHTML = `<span class="good">${rec.correct}</span>/${rec.n}`;
    $('#r-mistakes').innerHTML = `<span class="${rec.mistakes ? 'bad' : 'good'}">${rec.mistakes}</span>`;
    $('#r-time').textContent = fmtClock(rec.time);
    $('#r-avg').textContent = fmtSec(rec.avg);

    const wrong = res.filter((r) => !r.ok);
    const slowest = res.reduce((m, r) => (r.ms > m.ms ? r : m), res[0]);
    let html = '';
    if (wrong.length) {
      html += `<h3>Vēl jāpatrenē</h3><ul>${wrong
        .map((r) => `<li>${r.a} × ${r.b} = <b>${r.a * r.b}</b><s>${r.answer}</s></li>`)
        .join('')}</ul>`;
    }
    if (slowest && res.length > 1) {
      html += `<p class="slowest">Visilgāk domāji: <b>${slowest.a} × ${slowest.b}</b> — ${fmtSec(slowest.ms)}</p>`;
    }
    $('#r-review').innerHTML = html;

    show('result', () => {
      const base = reducedMotion ? 0 : 500;
      starEls.forEach((s, i) => {
        if (i >= rec.stars) return;
        setTimeout(() => {
          s.classList.add('earned');
          Sound.play('star', i);
          FX.dust(...centerOf(s), 22, ['#f7d774', '#fff3c4', '#f3efe4']);
        }, base + i * 280);
      });
      setTimeout(() => {
        if (rec.stars >= 2) {
          FX.confetti(rec.stars === 3 ? 160 : 80);
          Sound.play('win');
        }
      }, base + rec.stars * 280 + 100);
      $('#btn-again').focus({ preventScroll: true });
    });
  }

  $('#btn-again').addEventListener('click', () => startGame());
  $('#btn-menu').addEventListener('click', () => { renderMenu(); show('menu'); Sound.play('tap'); });

  /* ============ Statistika ============ */

  const statCard = (val, lbl, cls = '') => `<div class="stat"><span class="stat-val ${cls}">${val}</span><span class="stat-lbl">${lbl}</span></div>`;

  function renderStats() {
    renderProgress();
    const games = store.games;
    const totalQ = games.reduce((s, g) => s + g.n, 0);
    const totalOk = games.reduce((s, g) => s + g.correct, 0);
    const totalMs = games.reduce((s, g) => s + g.time, 0);
    $('#s-summary').innerHTML = [
      statCard(games.length, plural(games.length, 'spēle', 'spēles')),
      statCard(totalQ, 'atrisināti piemēri'),
      statCard(totalQ ? `${Math.round((totalOk / totalQ) * 100)}%` : '—', 'pareizi'),
      statCard(totalQ ? fmtSec(totalMs / totalQ) : '—', 'vid. domāšanas laiks'),
    ].join('');

    // Rekordi
    let rec = '<span></span><span class="rh">Izvēlies</span><span class="rh">Ieraksti</span>';
    for (const lvl of [1, 2, 3]) {
      rec += `<span class="rl" style="--c:${LEVELS[lvl].color}"><i></i>${LEVELS[lvl].name}</span>`;
      for (const mode of ['choice', 'input']) {
        const b = store.best[`${lvl}-${mode}`];
        rec += b
          ? `<span class="rc"><span class="st">${starsHtml(b.stars)}</span><span>${fmtClock(b.time)} · ${b.mistakes} kļ.</span></span>`
          : '<span class="rc empty">—</span>';
      }
    }
    $('#s-records').innerHTML = rec;

    // Piemēru karte
    let heat = '<span class="hh">×</span>';
    for (let j = 1; j <= 10; j++) heat += `<span class="hh">${j}</span>`;
    for (let i = 1; i <= 10; i++) {
      heat += `<span class="hh">${i}</span>`;
      for (let j = 1; j <= 10; j++) {
        const f = store.facts[factKey(i, j)];
        let cls = 'h-none';
        if (f && f.n) {
          const err = f.wrong / f.n;
          const avg = f.ms / f.n;
          cls = err >= 0.34 ? 'h-bad' : err > 0 || avg > 6000 ? 'h-slow' : 'h-good';
        }
        heat += `<button class="hc ${cls}" data-a="${i}" data-b="${j}" aria-label="${i} reiz ${j}">${i * j}</button>`;
      }
    }
    $('#s-heatmap').innerHTML = heat;
    $('#s-heat-info').innerHTML = '&nbsp;';

    // Pēdējās spēles
    const recent = games.slice(-10).reverse();
    $('#s-recent').innerHTML = recent.length
      ? recent.map((g) => `
        <div class="recent-row">
          <span class="when">${fmtDate(g.t)}</span>
          <span class="what" style="--c:${LEVELS[g.level].color}"><i></i>${g.level}. līm. · ${g.mode === 'choice' ? 'izvēle' : 'ievade'}</span>
          <span class="num ${g.mistakes ? 'bad' : 'good'}">${g.correct}/${g.n}</span>
          <span class="num">${fmtClock(g.time)} · ${fmtSec(g.avg)}</span>
        </div>`).join('')
      : '<p class="empty-note">Vēl nav nospēlēta neviena spēle.</p>';
  }

  $('#s-heatmap').addEventListener('click', (e) => {
    const cell = e.target.closest('.hc');
    if (!cell) return;
    $$('#s-heatmap .hc.sel').forEach((c) => c.classList.remove('sel'));
    cell.classList.add('sel');
    const a = +cell.dataset.a;
    const b = +cell.dataset.b;
    const f = store.facts[factKey(a, b)];
    $('#s-heat-info').innerHTML = f && f.n
      ? `<b>${a} × ${b} = ${a * b}</b> · ${f.n} ${plural(f.n, 'reize', 'reizes')} · ${fmtMistakes(f.wrong)} · vid. ${fmtSec(f.ms / f.n)}`
      : `<b>${a} × ${b} = ${a * b}</b> · vēl nav mēģināts`;
  });

  /* --- Progress pa dienām --- */

  const MONTHS = ['janvāris', 'februāris', 'marts', 'aprīlis', 'maijs', 'jūnijs', 'jūlijs', 'augusts', 'septembris', 'oktobris', 'novembris', 'decembris'];
  const MONTHS_SHORT = ['janv.', 'febr.', 'marts', 'apr.', 'maijs', 'jūn.', 'jūl.', 'aug.', 'sept.', 'okt.', 'nov.', 'dec.'];
  const prog = { tab: 'progress', level: 0, range: 30, month: null, selDay: null };

  const startOfDay = (t) => new Date(t).setHours(0, 0, 0, 0);
  const addDays = (t, n) => { const d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); };
  const monthStart = (t) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); };
  const fmtDay = (t) => { const d = new Date(t); return `${d.getDate()}. ${MONTHS[d.getMonth()]}`; };
  const fmtDayShort = (t) => { const d = new Date(t); return `${d.getDate()}. ${MONTHS_SHORT[d.getMonth()]}`; };
  const fmtNum = (v) => String(Math.round(v * 10) / 10).replace('.', ',');

  // Spēles sagrupētas pa kalendāra dienām (vietējā laikā)
  function dailyStats(level) {
    const days = new Map();
    for (const g of store.games) {
      if (level && g.level !== level) continue;
      const t = startOfDay(g.t);
      const d = days.get(t) || { t, games: 0, n: 0, correct: 0, time: 0, perfect: false };
      d.games++;
      d.n += g.n;
      d.correct += g.correct;
      d.time += g.time;
      if (g.mistakes === 0) d.perfect = true;
      days.set(t, d);
    }
    return days;
  }

  // Sērija skaitās arī tad, ja šodien vēl nav spēlēts, bet vakar bija
  function streaks(days) {
    const today = startOfDay(Date.now());
    let cur = 0;
    for (let t = days.has(today) ? today : addDays(today, -1); days.has(t); t = addDays(t, -1)) cur++;
    let best = 0;
    let run = 0;
    let prev = null;
    for (const t of [...days.keys()].sort((a, b) => a - b)) {
      run = prev !== null && addDays(prev, 1) === t ? run + 1 : 1;
      best = Math.max(best, run);
      prev = t;
    }
    return { cur, best };
  }

  function renderProgress() {
    $$('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === prog.tab)));
    $('#tab-progress').hidden = prog.tab !== 'progress';
    $('#tab-details').hidden = prog.tab !== 'details';
    $$('#p-level .chip').forEach((b) => b.setAttribute('aria-checked', String(+b.dataset.level === prog.level)));
    $$('#p-range .chip').forEach((b) => b.setAttribute('aria-checked', String(+b.dataset.range === prog.range)));

    const days = dailyStats(prog.level);
    const { cur, best } = streaks(days);
    const today = startOfDay(Date.now());
    const weekStart = addDays(today, -((new Date(today).getDay() + 6) % 7));
    let weekN = 0;
    for (const d of days.values()) if (d.t >= weekStart) weekN += d.n;

    $('#p-tiles').innerHTML = [
      statCard(cur, `${plural(cur, 'diena', 'dienas')} pēc kārtas`, cur ? 'hot' : ''),
      statCard(best, 'garākā sērija (dienas)'),
      statCard(days.size, `${plural(days.size, 'trenēta diena', 'trenētas dienas')}`),
      statCard(weekN, 'piemēri šonedēļ'),
    ].join('');

    renderCalendar(days);
  }

  function renderCalendar(days) {
    const today = startOfDay(Date.now());
    const thisMonth = monthStart(today);
    if (!prog.month) prog.month = thisMonth;
    const m = new Date(prog.month);
    const y = m.getFullYear();
    const mo = m.getMonth();
    const firstMonth = days.size ? monthStart(Math.min(...days.keys())) : thisMonth;

    $('#cal-month').textContent = `${MONTHS[mo][0].toUpperCase()}${MONTHS[mo].slice(1)} ${y}`;
    $('#cal-prev').disabled = prog.month <= firstMonth;
    $('#cal-next').disabled = prog.month >= thisMonth;

    let html = '<span></span>'.repeat((m.getDay() + 6) % 7);
    const len = new Date(y, mo + 1, 0).getDate();
    for (let i = 1; i <= len; i++) {
      const t = new Date(y, mo, i).getTime();
      const d = days.get(t);
      const lvl = !d ? 0 : d.n < 10 ? 1 : d.n < 30 ? 2 : d.n < 60 ? 3 : 4;
      const cls = ['cal-day', lvl && `cl${lvl}`, t === today && 'today', t > today && 'future', t === prog.selDay && 'sel']
        .filter(Boolean).join(' ');
      const label = d ? `${fmtDay(t)}: ${d.n} ${plural(d.n, 'piemērs', 'piemēri')}` : fmtDay(t);
      html += `<button class="${cls}" data-t="${t}" aria-label="${label}"${t > today ? ' disabled' : ''}>${i}${d && d.perfect ? '<b class="cal-star">★</b>' : ''}</button>`;
    }
    $('#p-cal').innerHTML = html;
    renderDayInfo(days);
  }

  function renderDayInfo(days) {
    const el = $('#p-day-info');
    const t = prog.selDay;
    if (t == null) {
      el.innerHTML = 'Pieskaries dienai, lai redzētu sīkāk.';
      return;
    }
    const d = days.get(t);
    el.innerHTML = d
      ? `<b>${fmtDay(t)}</b> · ${d.games} ${plural(d.games, 'spēle', 'spēles')} · ${d.n} ${plural(d.n, 'piemērs', 'piemēri')} · ${Math.round((d.correct / d.n) * 100)}% pareizi · vid. ${fmtSec(d.time / d.n)}`
      : `<b>${fmtDay(t)}</b> · šajā dienā nav spēlēts`;
  }

  function deltaText(cur, prev, kind) {
    const n = prog.range;
    if (!n) return 'visā laikā';
    if (cur == null) return '';
    if (prev == null) return `pēdējās ${n} dienās`;
    if (kind === 'acc') {
      const diff = Math.round(cur - prev);
      if (diff === 0) return `tikpat, cik iepriekšējās ${n} dienās`;
      return `<span class="${diff > 0 ? 'up' : 'down'}">${diff > 0 ? '▲' : '▼'} ${Math.abs(diff)}%</span> ${diff > 0 ? 'labāk' : 'sliktāk'} nekā iepriekšējās ${n} dienās`;
    }
    const diff = cur - prev;
    if (Math.abs(diff) < 50) return `tikpat ātri kā iepriekšējās ${n} dienās`;
    return `<span class="${diff < 0 ? 'up' : 'down'}">${diff < 0 ? '▼' : '▲'} ${fmtSec(Math.abs(diff))}</span> ${diff < 0 ? 'ātrāk' : 'lēnāk'} nekā iepriekšējās ${n} dienās`;
  }

  function renderCharts() {
    if (prog.tab !== 'progress') return;
    const today = startOfDay(Date.now());
    const all = [...dailyStats(prog.level).values()].sort((a, b) => a.t - b.t);
    const from = prog.range ? addDays(today, -(prog.range - 1)) : (all.length ? all[0].t : today);
    const pts = all.filter((d) => d.t >= from);
    const prev = prog.range ? all.filter((d) => d.t >= addDays(from, -prog.range) && d.t < from) : [];

    const total = (arr, k) => arr.reduce((s, d) => s + d[k], 0);
    const accOf = (arr) => (total(arr, 'n') ? (total(arr, 'correct') / total(arr, 'n')) * 100 : null);
    const timeOf = (arr) => (total(arr, 'n') ? total(arr, 'time') / total(arr, 'n') : null);

    const acc = accOf(pts);
    const time = timeOf(pts);
    $('#c-acc-val').textContent = acc == null ? '—' : `${Math.round(acc)}%`;
    $('#c-time-val').textContent = time == null ? '—' : fmtSec(time);
    $('#c-acc-delta').innerHTML = deltaText(acc, accOf(prev), 'acc');
    $('#c-time-delta').innerHTML = deltaText(time, timeOf(prev), 'time');

    lineChart($('#c-acc'), pts.map((d) => ({ t: d.t, v: (d.correct / d.n) * 100, d })), { from, to: today, kind: 'acc' });
    lineChart($('#c-time'), pts.map((d) => ({ t: d.t, v: d.time / d.n / 1000, d })), { from, to: today, kind: 'time' });
  }

  function lineChart(el, pts, { from, to, kind }) {
    if (!pts.length) {
      el.innerHTML = `<div class="chart-empty">${prog.range ? `Pēdējās ${prog.range} dienās vēl nav spēlēts.` : 'Vēl nav nospēlēta neviena spēle.'}</div>`;
      return;
    }
    const W = el.clientWidth || 320;
    const H = el.clientHeight || 160;
    const m = { l: 40, r: 12, t: 12, b: 26 };
    const iw = W - m.l - m.r;
    const ih = H - m.t - m.b;
    const vals = pts.map((p) => p.v);

    let y0 = 0;
    let y1;
    let step;
    if (kind === 'acc') {
      y0 = Math.max(0, Math.min(50, Math.floor((Math.min(...vals) - 5) / 10) * 10));
      y1 = 100;
      step = (y1 - y0) / 2;
    } else {
      step = [0.5, 1, 2, 5, 10, 20, 30, 60].find((s) => s * 3 >= Math.max(...vals)) || 60;
      y1 = Math.max(step, Math.ceil(Math.max(...vals) / step) * step);
    }
    const span = to - from;
    const x = (t) => (span ? m.l + ((t - from) / span) * iw : m.l + iw / 2);
    const y = (v) => m.t + ih - ((v - y0) / (y1 - y0)) * ih;
    const fmtV = (v) => (kind === 'acc' ? `${Math.round(v)}%` : `${fmtNum(v)} s`);

    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${kind === 'acc' ? 'Pareizo atbilžu procents' : 'Vidējais domāšanas laiks'} pa dienām, pēdējā vērtība ${fmtV(vals[vals.length - 1])}">`;
    for (let v = y0; v <= y1 + 1e-9; v += step) {
      svg += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/>`;
      svg += `<text class="axis-label" x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${fmtV(v)}</text>`;
    }
    const xTicks = span ? (iw > 280 ? [from, from + span / 2, to] : [from, to]) : [from];
    xTicks.forEach((t, i) => {
      const anchor = !span ? 'middle' : i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle';
      svg += `<text class="axis-label" x="${x(t)}" y="${H - 6}" text-anchor="${anchor}">${fmtDayShort(startOfDay(t + 432e5))}</text>`;
    });

    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
    if (pts.length > 1) {
      svg += `<path class="area" d="${line}L${x(pts[pts.length - 1].t).toFixed(1)},${y(y0)}L${x(pts[0].t).toFixed(1)},${y(y0)}Z"/>`;
      svg += `<path class="line" pathLength="1" d="${line}"/>`;
    }
    svg += `<line class="cross" x1="0" x2="0" y1="${m.t}" y2="${m.t + ih}"/>`;
    if (pts.length <= 31) pts.forEach((p) => { svg += `<circle class="dot" cx="${x(p.t)}" cy="${y(p.v)}" r="4"/>`; });
    svg += `<circle class="dot on" r="6.5" cx="-20" cy="-20"/>`;
    svg += `<rect x="${m.l - 10}" y="0" width="${iw + 20}" height="${H}" fill="transparent"/>`;
    svg += '</svg>';
    el.innerHTML = `${svg}<div class="chart-tip"></div>`;

    const svgEl = el.querySelector('svg');
    const cross = el.querySelector('.cross');
    const hot = el.querySelector('.dot.on');
    const tip = el.querySelector('.chart-tip');

    function pick(e) {
      const r = svgEl.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * W;
      let best = pts[0];
      for (const p of pts) if (Math.abs(x(p.t) - px) < Math.abs(x(best.t) - px)) best = p;
      const cx = x(best.t);
      const cy = y(best.v);
      cross.setAttribute('x1', cx);
      cross.setAttribute('x2', cx);
      hot.setAttribute('cx', cx);
      hot.setAttribute('cy', cy);
      const d = best.d;
      tip.innerHTML = `<b>${fmtV(best.v)}</b><br><span>${fmtDay(best.t)} · ${d.n} ${plural(d.n, 'piemērs', 'piemēri')}</span>`;
      el.classList.add('hover');
      const tw = tip.offsetWidth;
      const th = tip.offsetHeight;
      const sx = r.width / W;
      const left = Math.max(0, Math.min(el.clientWidth - tw, cx * sx - tw / 2));
      const top = cy * sx - th - 14 < 0 ? cy * sx + 14 : cy * sx - th - 14;
      tip.style.transform = `translate(${left}px, ${top}px)`;
    }
    svgEl.addEventListener('pointermove', pick);
    svgEl.addEventListener('pointerdown', pick);
    svgEl.addEventListener('pointerleave', () => el.classList.remove('hover'));
  }

  $$('.tab').forEach((b) => b.addEventListener('click', () => {
    if (prog.tab === b.dataset.tab) return;
    prog.tab = b.dataset.tab;
    renderProgress();
    const panel = $(`#tab-${prog.tab}`);
    panel.classList.remove('enter');
    void panel.offsetWidth;
    panel.classList.add('enter');
    renderCharts();
    Sound.play('tap');
  }));
  $('#p-level').addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    prog.level = +b.dataset.level;
    renderProgress();
    renderCharts();
    Sound.play('tap');
  });
  $('#p-range').addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    prog.range = +b.dataset.range;
    $$('#p-range .chip').forEach((c) => c.setAttribute('aria-checked', String(c === b)));
    renderCharts();
    Sound.play('tap');
  });
  ['prev', 'next'].forEach((dir) => $(`#cal-${dir}`).addEventListener('click', () => {
    const m = new Date(prog.month);
    prog.month = new Date(m.getFullYear(), m.getMonth() + (dir === 'next' ? 1 : -1), 1).getTime();
    renderCalendar(dailyStats(prog.level));
    Sound.play('tap');
  }));
  $('#p-cal').addEventListener('click', (e) => {
    const b = e.target.closest('.cal-day');
    if (!b || b.disabled) return;
    prog.selDay = +b.dataset.t;
    $$('#p-cal .cal-day.sel').forEach((c) => c.classList.remove('sel'));
    b.classList.add('sel');
    renderDayInfo(dailyStats(prog.level));
  });

  let chartResizeId = 0;
  window.addEventListener('resize', () => {
    clearTimeout(chartResizeId);
    chartResizeId = setTimeout(() => { if (current === 'stats') renderCharts(); }, 150);
  });

  $('#btn-back').addEventListener('click', () => { renderMenu(); show('menu'); Sound.play('tap'); });
  $('#btn-reset').addEventListener('click', async () => {
    const yes = await confirmBox('Dzēst visu statistiku un rekordus?', 'Dzēst', 'Atcelt');
    if (!yes) return;
    const prefs = store.prefs;
    Object.assign(store, defaults(), { prefs });
    save();
    renderStats();
    renderCharts();
  });

  /* ============ Klaviatūra ============ */

  document.addEventListener('keydown', (e) => {
    if (dialog.open || e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key;

    if (current === 'menu') {
      if (key === 'Enter' && !(document.activeElement && document.activeElement.closest('button'))) {
        e.preventDefault();
        startGame();
      } else if (['1', '2', '3'].includes(key)) {
        $(`.level-card[data-level="${key}"]`).click();
      }
      return;
    }

    if (current === 'result') {
      if (key === 'Enter' && !(document.activeElement && document.activeElement.closest('button'))) startGame();
      else if (key === 'Escape') $('#btn-menu').click();
      return;
    }

    if (current === 'stats') {
      if (key === 'Escape') $('#btn-back').click();
      return;
    }

    if (current !== 'game' || !game.active) return;

    if (key === 'Escape') { e.preventDefault(); askQuit(); return; }

    if (game.locked) {
      if ((key === 'Enter' || key === ' ') && game.waiting) { e.preventDefault(); advance(); }
      return;
    }

    if (game.mode === 'choice') {
      const idx = { 1: 0, 2: 1, 3: 2, 4: 3, a: 0, b: 1, c: 2, d: 3 }[key.toLowerCase()];
      if (idx !== undefined) {
        e.preventDefault();
        const btn = els.choices.children[idx];
        if (btn) answer(+btn.dataset.v, btn);
      }
      return;
    }

    // Ievades režīms
    if (key === 'Enter') { e.preventDefault(); submitInput(); return; }
    if (key === 'ArrowUp') { e.preventDefault(); doStep(e.shiftKey ? 10 : 1); return; }
    if (key === 'ArrowDown') { e.preventDefault(); doStep(e.shiftKey ? -10 : -1); return; }
    if (key === 'PageUp') { e.preventDefault(); doStep(10); return; }
    if (key === 'PageDown') { e.preventDefault(); doStep(-10); return; }
    if (e.target === els.field) return; // laukā rakstīšanu apstrādā pārlūks
    if (/^\d$/.test(key)) {
      e.preventDefault();
      if (els.field.value.length < 3) setField(els.field.value + key);
    } else if (key === 'Backspace') {
      e.preventDefault();
      setField(els.field.value.slice(0, -1));
    }
  });

  /* ============ Instalēšana (PWA) ============ */

  const Install = (() => {
    const btn = $('#btn-install');
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isMacSafari = !isIOS && /Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS/.test(ua);
    const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    let deferred = null;

    const SHARE_ICO = '<svg viewBox="0 0 24 24" class="inline-ico" aria-label="Kopīgot"><path d="M12 3v12M8 7l4-4 4 4M6 11H5v10h14V11h-1"/></svg>';

    function update() {
      btn.hidden = standalone() || !(deferred || isIOS || isMacSafari);
    }

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault(); // parādām savu pogu pārlūka mini-joslas vietā
      deferred = e;
      update();
    });
    window.addEventListener('appinstalled', () => {
      deferred = null;
      btn.hidden = true;
    });

    btn.addEventListener('click', async () => {
      Sound.play('tap');
      if (deferred) {
        deferred.prompt();
        const { outcome } = await deferred.userChoice;
        deferred = null; // notikumu var izmantot tikai vienreiz
        if (outcome === 'accepted') btn.hidden = true;
        else update();
        return;
      }
      if (isIOS) {
        const browser = /CriOS|FxiOS|EdgiOS/.test(ua) ? '' : '<li>Atver šo lapu <b>Safari</b> pārlūkā.</li>';
        confirmBox('Pievieno sākuma ekrānam', 'Skaidrs', null, `<ol class="steps-list">
          ${browser}
          <li>Spied <b>Kopīgot</b> ${SHARE_ICO}</li>
          <li>Izvēlies <b>Pievienot sākuma ekrānam</b></li>
          <li>Spied <b>Pievienot</b></li>
        </ol>`);
      } else if (isMacSafari) {
        confirmBox('Pievieno Dock joslai', 'Skaidrs', null, `<ol class="steps-list">
          <li>Izvēlnē atver <b>File</b> (Fails)</li>
          <li>Izvēlies <b>Add to Dock</b> (Pievienot Dock)</li>
        </ol>`);
      }
    });

    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
    }

    return { update };
  })();

  /* ============ Starts ============ */

  window.addEventListener('resize', FX.resize);
  document.addEventListener('visibilitychange', () => {
    // Laiks neskaitās, kamēr cilne nav redzama
    if (document.hidden && current === 'game' && game.active && !game.locked) {
      game.hiddenAt = performance.now();
    } else if (!document.hidden && game.hiddenAt) {
      game.qStart += performance.now() - game.hiddenAt;
      game.hiddenAt = 0;
    }
  });

  FX.resize();
  prepareAnim($('#screen-menu'));
  renderMenu();
  Install.update();
})();
