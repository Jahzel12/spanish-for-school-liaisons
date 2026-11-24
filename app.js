(function () {
  'use strict';

  var KEY = 'sls.v1';
  var data = { decks: [], cards: [], phrases: { school: [], parent: [] }, tips: { basics: [], regional: [] } };
  var store = load();
  var study = null;   // flashcard session
  var quiz = null;    // quiz session
  var phraseTab = 'school';
  var app = document.getElementById('app');

  function load() {
    var d = { progress: {}, slow: false, pron: true, hide: false, dir: 'en-es' };
    try { Object.assign(d, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
    return d;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  /* ---------- audio ---------- */
  var voices = [];
  function loadVoices() { if (window.speechSynthesis) voices = speechSynthesis.getVoices() || []; }
  if (window.speechSynthesis) {
    loadVoices();
    speechSynthesis.addEventListener && speechSynthesis.addEventListener('voiceschanged', loadVoices);
  }
  function lc(v) { return (v.lang || '').replace('_', '-').toLowerCase(); }
  function spanishVoices() {
    // Latin American voices first (Mexico, US, then others); Spain (es-ES) only as a last resort.
    var rank = function (v) {
      var l = lc(v);
      if (l === 'es-mx') return 0;
      if (l === 'es-us') return 1;
      if (l === 'es-419') return 2;
      if (l === 'es-es') return 9;
      return 3;
    };
    return voices.filter(function (v) { return lc(v).indexOf('es') === 0; })
      .sort(function (a, b) { return rank(a) - rank(b); });
  }
  function pickVoice() {
    var list = spanishVoices();
    if (store.voice) { var m = list.filter(function (v) { return v.name === store.voice; })[0]; if (m) return m; }
    return list[0];
  }
  var warned = false;
  function warnSpain(v) {
    if (v && lc(v) === 'es-es' && !warned) {
      warned = true;
      toast('Only a Spain voice is installed. Install a Mexican or US Spanish voice in your device settings (see Tips).');
    }
  }
  function speak(text) {
    if (!window.speechSynthesis) { toast('Audio is not supported on this device.'); return; }
    var clean = String(text).replace(/_+/g, ', ').replace(/\s*\/\s*/g, ', ');
    var u = new SpeechSynthesisUtterance(clean);
    var v = pickVoice();
    if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = 'es-MX'; if (!voices.length) loadVoices(); }
    u.rate = store.slow ? 0.6 : 0.95;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    warnSpain(v);
    if (!v && voices.length) toast('No Spanish voice found. Install one in your device settings.');
  }
  var toastT;
  function toast(msg) {
    var t = document.getElementById('toast');
    if (!t) {
      t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status');
      t.style.cssText = 'position:fixed;left:12px;right:12px;bottom:80px;background:#111827;color:#fff;padding:12px 16px;border-radius:12px;z-index:9;text-align:center';
      document.body.appendChild(t);
    }
    t.textContent = msg; t.style.display = 'block';
    clearTimeout(toastT); toastT = setTimeout(function () { t.style.display = 'none'; }, 3500);
  }
  function spk(text) { return '<button class="speak fit" data-act="speak" data-t="' + esc(text) + '" aria-label="Play audio">🔊</button>'; }

  /* ---------- routing ---------- */
  function route() {
    var h = location.hash.replace(/^#\/?/, '') || 'cards';
    var parts = h.split('/');
    var tab = parts[0];
    Array.prototype.forEach.call(document.querySelectorAll('.tabs a'), function (a) {
      a.classList.toggle('on', a.dataset.tab === tab);
    });
    if (speechSynthesis) speechSynthesis.cancel();
    if (tab === 'cards') parts[1] ? viewStudy(parts[1]) : viewDecks();
    else if (tab === 'quiz') viewQuiz();
    else if (tab === 'phrases') viewPhrases();
    else if (tab === 'lookup') viewLookup('');
    else if (tab === 'tips') viewTips();
    else viewDecks();
    window.scrollTo(0, 0);
  }

  /* ---------- cards ---------- */
  function viewDecks() {
    var html = '<h2>Flashcards</h2><p class="muted">Pick a situation deck.</p>';
    data.decks.forEach(function (d) {
      var cs = data.cards.filter(function (c) { return c.deck === d.id; });
      var got = cs.filter(function (c) { return store.progress[c.id] === 'got'; }).length;
      html += '<a class="deck" href="#/cards/' + d.id + '"><b>' + d.icon + ' ' + esc(d.name) + '</b>' +
        '<div class="stat"><span>' + got + ' of ' + cs.length + ' learned</span></div>' +
        '<div class="bar"><i style="width:' + (cs.length ? got / cs.length * 100 : 0) + '%"></i></div></a>';
    });
    html += '<div class="row"><button data-act="resetall">Reset all progress</button></div>';
    app.innerHTML = html;
  }

  function buildQueue(deckId) {
    var cs = data.cards.filter(function (c) { return c.deck === deckId; });
    var again = shuffle(cs.filter(function (c) { return store.progress[c.id] === 'again'; }));
    var fresh = shuffle(cs.filter(function (c) { return !store.progress[c.id]; }));
    var got = shuffle(cs.filter(function (c) { return store.progress[c.id] === 'got'; }));
    var q = again.concat(fresh);
    return q.length ? q : got;
  }

  function viewStudy(deckId, keep) {
    var deck = data.decks.filter(function (d) { return d.id === deckId; })[0];
    if (!deck) return viewDecks();
    if (!keep || !study || study.deck !== deckId) study = { deck: deckId, queue: buildQueue(deckId), i: 0, flip: false, done: false };
    var s = study;
    var head = '<p><a href="#/cards">← Decks</a></p><h2>' + deck.icon + ' ' + esc(deck.name) + '</h2>';
    if (s.i >= s.queue.length) {
      var cs = data.cards.filter(function (c) { return c.deck === deckId; });
      var got = cs.filter(function (c) { return store.progress[c.id] === 'got'; }).length;
      app.innerHTML = head + '<div class="card-box"><h3>Round finished</h3><p>' + got + ' of ' + cs.length + ' cards learned.</p></div>' +
        '<div class="row"><button class="primary" data-act="restart">' + (got < cs.length ? 'Study remaining cards' : 'Study again') + '</button>' +
        '<button data-act="resetdeck">Reset this deck</button></div>';
      return;
    }
    var c = s.queue[s.i];
    var h = head +
      '<div class="stat"><span>Card ' + (s.i + 1) + ' of ' + s.queue.length + '</span>' +
      '<label><input type="checkbox" data-act="pron" ' + (store.pron ? 'checked' : '') + '> Pronunciation hints</label></div>';
    if (!s.flip) {
      h += '<div class="flash" data-act="flip" role="button" tabindex="0" aria-label="Show Spanish"><div class="muted">English</div><div class="big">' + esc(c.en) + '</div><div class="muted">Tap to see Spanish</div></div>' +
        '<div class="row"><button class="primary" data-act="flip">Show Spanish</button></div>';
    } else {
      h += '<div class="flash" style="cursor:default"><div class="muted">' + esc(c.en) + '</div>' +
        '<div class="big">' + esc(c.es) + '</div>' +
        (store.pron ? '<div class="pron">' + esc(c.pron) + '</div>' : '') +
        '<div class="row"><button class="speak" data-act="speak" data-t="' + esc(c.es) + '" aria-label="Play audio">🔊 Hear it</button></div>' +
        '<div class="ex">' + esc(c.ex) + '<br><em>' + esc(c.exEn) + '</em></div>' +
        '<div class="row" style="margin:0"><button class="speak" data-act="speak" data-t="' + esc(c.ex) + '" aria-label="Play example audio">🔊 Example</button></div>' +
        (c.region ? '<div class="region"><b>Regional note:</b> ' + esc(c.region) + '</div>' : '') +
        (c.flag ? '<div class="verify">⚠ Verify: ' + esc(c.flag) + '</div>' : '') + '</div>' +
        '<div class="row sticky"><button class="bad" data-act="again">Again</button><button class="good" data-act="got">Got it</button></div>';
    }
    app.innerHTML = h;
  }

  /* ---------- quiz ---------- */
  function viewQuiz() {
    if (!quiz) {
      app.innerHTML = '<h2>Quiz</h2><p class="muted">10 multiple-choice questions from all decks.</p>' +
        '<div class="seg"><button data-act="qdir" data-v="en-es" class="' + (store.dir === 'en-es' ? 'on' : '') + '">English → Spanish</button>' +
        '<button data-act="qdir" data-v="es-en" class="' + (store.dir === 'es-en' ? 'on' : '') + '">Spanish → English</button></div>' +
        '<div class="row"><button class="primary" data-act="qstart">Start quiz</button></div>';
      return;
    }
    var q = quiz;
    if (q.i >= q.items.length) {
      var missed = q.items.filter(function (x) { return x.pick !== x.card.id; });
      app.innerHTML = '<h2>Quiz result</h2><div class="score">' + q.score + ' / ' + q.items.length + '</div>' +
        (missed.length ? '<h3>Review these</h3>' + missed.map(function (x) {
          return '<div class="card-box"><b>' + esc(x.card.en) + '</b><br>' + esc(x.card.es) + '</div>';
        }).join('') : '<p>Perfect score.</p>') +
        '<div class="row"><button class="primary" data-act="qstart">New quiz</button><button data-act="qquit">Change direction</button></div>';
      return;
    }
    var it = q.items[q.i];
    var toES = q.dir === 'en-es';
    var prompt = toES ? it.card.en : it.card.es;
    var h = '<div class="stat"><span>Question ' + (q.i + 1) + ' of ' + q.items.length + '</span><span>Score ' + q.score + '</span></div>' +
      '<div class="card-box"><div class="muted">' + (toES ? 'How do you say this in Spanish?' : 'What does this mean in English?') + '</div>' +
      '<div class="row" style="margin:6px 0"><div class="big">' + esc(prompt) + '</div>' + (toES ? '' : spk(it.card.es)) + '</div></div>';
    it.opts.forEach(function (o) {
      var cls = 'opt';
      if (it.pick) { if (o.id === it.card.id) cls += ' right'; else if (o.id === it.pick) cls += ' wrong'; }
      h += '<button class="' + cls + '" data-act="qpick" data-id="' + o.id + '" ' + (it.pick ? 'disabled' : '') + '>' + esc(toES ? o.es : o.en) + '</button>';
    });
    if (it.pick) {
      h += '<div class="card-box"><b>' + esc(it.card.en) + ' = ' + esc(it.card.es) + '</b>' +
        (store.pron ? '<div class="pron">' + esc(it.card.pron) + '</div>' : '') +
        '<div class="row" style="margin:6px 0">' + spk(it.card.es) + '</div>' +
        (it.card.region ? '<div class="region">' + esc(it.card.region) + '</div>' : '') + '</div>' +
        '<div class="row"><button class="primary" data-act="qnext">' + (q.i + 1 >= q.items.length ? 'See result' : 'Next') + '</button></div>';
    }
    app.innerHTML = h;
  }
  function startQuiz() {
    var picks = shuffle(data.cards).slice(0, 10);
    var items = picks.map(function (c) {
      var same = shuffle(data.cards.filter(function (x) { return x.deck === c.deck && x.id !== c.id; }));
      var others = shuffle(data.cards.filter(function (x) { return x.deck !== c.deck; }));
      var wrong = same.concat(others).filter(function (x) { return x.es !== c.es && x.en !== c.en; }).slice(0, 3);
      return { card: c, opts: shuffle(wrong.concat([c])), pick: null };
    });
    quiz = { dir: store.dir, items: items, i: 0, score: 0 };
  }

  /* ---------- phrases ---------- */
  function viewPhrases() {
    var school = phraseTab === 'school';
    var list = data.phrases[phraseTab];
    var h = '<h2>Phrases</h2><div class="seg">' +
      '<button data-act="ptab" data-v="school" class="' + (school ? 'on' : '') + '">School says (EN→ES)</button>' +
      '<button data-act="ptab" data-v="parent" class="' + (!school ? 'on' : '') + '">Parents say (ES→EN)</button></div>' +
      '<div class="stat"><label><input type="checkbox" data-act="hide" ' + (store.hide ? 'checked' : '') + '> Hide the translation</label>' +
      (school ? '<label><input type="checkbox" data-act="pron" ' + (store.pron ? 'checked' : '') + '> Pronunciation</label>' : '') + '</div>';
    list.forEach(function (p) {
      var prompt = school ? p.en : p.es;
      var trans = school ? p.es : p.en;
      var hid = store.hide ? ' hidden-t" data-act="reveal" tabindex="0' : '';
      h += '<div class="card-box"><div class="phrase"><div class="txt">' +
        '<div class="big" style="font-size:1.15rem">' + esc(prompt) + '</div>' +
        '<div class="trans' + hid + '" style="margin-top:8px"><b>' + esc(trans) + '</b>' +
        (school && store.pron && p.pron ? '<div class="pron">' + esc(p.pron) + '</div>' : '') + '</div>' +
        (p.flag ? '<div class="verify">⚠ Verify: ' + esc(p.flag) + '</div>' : '') +
        '</div>' + spk(p.es) + '</div></div>';
    });
    app.innerHTML = h;
  }

  /* ---------- lookup ---------- */
  var lastQ = '';
  function viewLookup(q) {
    app.innerHTML = '<h2>Lookup</h2><input type="search" id="q" placeholder="Search English or Spanish (accents optional)" autocomplete="off" autocapitalize="off" value="' + esc(q) + '"><div id="res"></div>';
    var el = document.getElementById('q');
    el.addEventListener('input', function () { lastQ = el.value; renderResults(el.value); });
    if (lastQ) { el.value = lastQ; renderResults(lastQ); }
  }
  function renderResults(q) {
    var n = norm(q).trim(), out = document.getElementById('res'), h = '';
    if (n.length < 2) { out.innerHTML = '<p class="muted">Type at least 2 letters.</p>'; return; }
    var cards = data.cards.filter(function (c) { return norm([c.en, c.es, c.ex, c.exEn, c.region].join(' ')).indexOf(n) > -1; });
    var phr = [];
    ['school', 'parent'].forEach(function (k) {
      data.phrases[k].forEach(function (p) { if (norm(p.en + ' ' + p.es).indexOf(n) > -1) phr.push(p); });
    });
    cards.slice(0, 40).forEach(function (c) {
      h += '<div class="card-box"><div class="phrase"><div class="txt"><b>' + esc(c.en) + '</b><div class="big" style="font-size:1.25rem">' + esc(c.es) + '</div>' +
        '<div class="pron">' + esc(c.pron) + '</div>' +
        (c.region ? '<div class="region">' + esc(c.region) + '</div>' : '') +
        (c.flag ? '<div class="verify">⚠ Verify: ' + esc(c.flag) + '</div>' : '') + '</div>' + spk(c.es) + '</div></div>';
    });
    phr.slice(0, 40).forEach(function (p) {
      h += '<div class="card-box"><div class="phrase"><div class="txt">' + esc(p.en) + '<div class="big" style="font-size:1.1rem">' + esc(p.es) + '</div></div>' + spk(p.es) + '</div></div>';
    });
    out.innerHTML = h || '<p>No matches.</p>';
  }

  /* ---------- tips ---------- */
  function viewTips() {
    var vs = spanishVoices(), cur = pickVoice();
    var h = '<h2>Audio voice</h2><div class="card-box"><p class="muted">The accent comes from your device\'s voices. Pick a Mexican (es-MX) or US Spanish (es-US) voice; avoid Spain (es-ES).</p>' +
      (vs.length ? '<select id="voice" aria-label="Spanish voice">' + vs.map(function (v) {
        return '<option value="' + esc(v.name) + '"' + (cur && cur.name === v.name ? ' selected' : '') + '>' + esc(v.name) + ' (' + esc(v.lang) + ')</option>';
      }).join('') + '</select><div class="row"><button data-act="vtest">🔊 Test voice</button></div>' :
        '<p>No Spanish voice found. Windows: Settings, Time & language, Speech, Add voices (Spanish, Mexico). iPhone: Settings, Accessibility, Spoken Content, Voices, Spanish (Mexico). Android: Settings, Text-to-speech, install Spanish (Mexico or US) data.</p>') +
      (cur && lc(cur) === 'es-es' ? '<div class="verify">⚠ Current voice is from Spain. Install a Mexican or US voice for a Latin American accent.</div>' : '') +
      '</div><h2>Interpreter basics</h2>';
    data.tips.basics.forEach(function (t) { h += '<div class="card-box"><h3>' + esc(t.title) + '</h3><p>' + esc(t.body) + '</p></div>'; });
    h += '<h2>Regional word differences</h2><p class="muted">Default in this app: Mexican / Central American. Ask the family which word they use.</p>';
    data.tips.regional.forEach(function (r) {
      h += '<div class="card-box"><h3>' + esc(r.concept) + '</h3><div class="words">' + r.words.map(function (w) {
        var avoid = /avoid/i.test(w[1]);
        return '<span class="chip' + (avoid ? ' avoid' : '') + '"><b>' + esc(w[0]) + '</b> · ' + esc(w[1]) + '</span>';
      }).join('') + '</div>' + (r.flag ? '<div class="verify">⚠ Verify: ' + esc(r.flag) + '</div>' : '') + '</div>';
    });
    app.innerHTML = h;
  }

  /* ---------- events ---------- */
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[role=button],.hidden-t')) { e.preventDefault(); e.target.click(); }
  });
  document.getElementById('slow').checked = store.slow;
  document.getElementById('slow').addEventListener('change', function (e) { store.slow = e.target.checked; save(); });

  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-act]');
    if (!el) return;
    var act = el.dataset.act;
    if (el.tagName === 'INPUT') return; // handled by change
    if (act === 'vtest') return speak('Buenos días, soy su intérprete. Gracias por venir hoy.');
    if (act === 'speak') { e.stopPropagation(); return speak(el.dataset.t); }
    if (act === 'flip') { study.flip = true; return viewStudy(study.deck, true); }
    if (act === 'got' || act === 'again') {
      store.progress[study.queue[study.i].id] = act; save();
      study.i++; study.flip = false; return viewStudy(study.deck, true);
    }
    if (act === 'restart') { study = null; return viewStudy(location.hash.split('/')[2]); }
    if (act === 'resetdeck') {
      var d = location.hash.split('/')[2];
      data.cards.forEach(function (c) { if (c.deck === d) delete store.progress[c.id]; });
      save(); study = null; return viewStudy(d);
    }
    if (act === 'resetall') { if (confirm('Reset all flashcard progress?')) { store.progress = {}; save(); viewDecks(); } return; }
    if (act === 'qdir') { store.dir = el.dataset.v; save(); return viewQuiz(); }
    if (act === 'qstart') { startQuiz(); return viewQuiz(); }
    if (act === 'qquit') { quiz = null; return viewQuiz(); }
    if (act === 'qpick') {
      var it = quiz.items[quiz.i]; if (it.pick) return;
      it.pick = el.dataset.id; if (it.pick === it.card.id) quiz.score++;
      return viewQuiz();
    }
    if (act === 'qnext') { quiz.i++; return viewQuiz(); }
    if (act === 'ptab') { phraseTab = el.dataset.v; return viewPhrases(); }
    if (act === 'reveal') { el.classList.remove('hidden-t'); el.removeAttribute('data-act'); return; }
  });
  document.addEventListener('change', function (e) {
    var el = e.target, act = el.dataset && el.dataset.act;
    if (el.id === 'voice') { store.voice = el.value; save(); return speak('Buenos días, soy su intérprete.'); }
    if (act === 'pron') { store.pron = el.checked; save(); return route2(); }
    if (act === 'hide') { store.hide = el.checked; save(); return viewPhrases(); }
  });
  function route2() {
    var tab = location.hash.split('/')[1];
    if (tab === 'phrases') viewPhrases(); else if (tab === 'cards' && study) viewStudy(study.deck, true);
  }
  window.addEventListener('hashchange', route);

  /* ---------- boot ---------- */
  function getJSON(u) { return fetch(u).then(function (r) { if (!r.ok) throw new Error(u); return r.json(); }); }
  Promise.all([getJSON('data/cards.json'), getJSON('data/phrases.json'), getJSON('data/tips.json')])
    .then(function (r) {
      data.decks = r[0].decks; data.cards = r[0].cards; data.phrases = r[1]; data.tips = r[2];
      route();
    })
    .catch(function (err) {
      app.innerHTML = '<div class="card-box"><h3>Could not load content</h3><p>' + esc(err.message) + '</p><p class="muted">Open the app through a web server (not by double-clicking the file) and check the JSON files for typos.</p></div>';
    });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
})();
