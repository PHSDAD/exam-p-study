(function () {
  'use strict';
  const STORAGE_KEY = 'exam-p-cbt-v3';
  const LETTERS = 'ABCDE';
  const AREAS = ['G', 'U', 'M'];
  const AREA_LABEL = {G: '一般機率', U: '單變量', M: '多變量'};
  const QUOTAS = {10: {G: 3, U: 4, M: 3}, 20: {G: 5, U: 10, M: 5}, 30: {G: 8, U: 14, M: 8}};
  const app = document.getElementById('cbt-app');
  if (!app) return;
  const $ = id => document.getElementById('cbt-' + id);
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  let session = null;
  let tickHandle = null;
  let saveWarning = false;
  let confirmOpener = null;
  let exhibitReady = false;

  function bank() {
    return Array.isArray(window.EXAM_P_BANK) ? window.EXAM_P_BANK.filter(q => q && AREAS.includes(q.area) && Array.isArray(q.choices) && q.choices.length === 5 && LETTERS.includes(q.key) && q.key.length === 1) : [];
  }
  function code(q) { return String(q.bank || q.id || '').charAt(0).toUpperCase(); }
  function pool(source) {
    return bank().filter(q => source === 'all' || (source === 'new' ? code(q) === 'B' : ['A', 'B'].includes(code(q))));
  }
  function notice(message) { $('notice').textContent = message; $('notice').hidden = !message; }
  function quotas(count) { return QUOTAS[count] || QUOTAS[30]; }
  function shuffle(input) {
    const arr = input.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      let j;
      if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
        const max = 4294967296 - (4294967296 % (i + 1));
        const bytes = new Uint32Array(1);
        do { window.crypto.getRandomValues(bytes); } while (bytes[0] >= max);
        j = bytes[0] % (i + 1);
      } else j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  function poolInfo() {
    const chosen = pool($('source').value);
    const need = quotas(Number($('count').value));
    const parts = AREAS.map(a => `${AREA_LABEL[a]} ${chosen.filter(q => q.area === a).length} 題（抽 ${need[a]}）`);
    $('pool-info').textContent = `可用 ${chosen.length} 題 · ${parts.join(' · ')}。每次不放回隨機抽題。`;
  }
  function readStored() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return validSession(data) ? data : null;
  }
  function applyStored(data, message) {
    session = data;
    session.current = Math.max(0, Math.min(session.questions.length - 1, Math.trunc(Number(session.current) || 0)));
    session.view = session.view === 'review' ? 'review' : 'question';
    session.reviewFilter = ['all', 'marked', 'unanswered'].includes(session.reviewFilter) ? session.reviewFilter : 'all';
    session.questions.forEach((q, i) => { if (!LETTERS.includes(session.answers[i]) || String(session.answers[i]).length !== 1) delete session.answers[i]; });
    $('submit-confirm').hidden = true;
    clearInterval(tickHandle); tickHandle = null;
    if ($('exhibit').open) closeExhibit();
    if (message) notice(message);
    if (session.phase === 'submitted') renderResults();
    else { renderActive(); tick(); if (session.phase === 'active') startTicker(); }
  }
  function newerThanLocal(stored) {
    return stored && (!session || stored.sessionId !== session.sessionId || stored.revision > session.revision || (stored.phase === 'submitted' && session.phase !== 'submitted'));
  }
  function clearLocal(message) {
    clearInterval(tickHandle); tickHandle = null; session = null;
    $('submit-confirm').hidden = true;
    if ($('exhibit').open) closeExhibit();
    $('results').hidden = true; $('active').hidden = true; $('setup').hidden = false;
    notice(message); poolInfo();
  }
  function syncStored() {
    try {
      const stored = readStored();
      if (!stored && session && session.revision > 0 && !saveWarning) { clearLocal('練習已在另一個分頁清除，請重新設定。'); return true; }
      if (newerThanLocal(stored)) { applyStored(stored, '已同步另一個分頁的最新練習狀態。'); return true; }
    } catch (_) { /* The current attempt remains usable if storage becomes unavailable. */ }
    return false;
  }
  function persist() {
    try {
      const stored = readStored();
      if (!stored && session.revision > 0 && !saveWarning) { clearLocal('練習已在另一個分頁清除，本頁未重新寫入舊資料。'); return false; }
      // A stale tab must never overwrite another attempt or an already submitted attempt.
      if (newerThanLocal(stored) || (stored && stored.phase === 'submitted' && session.phase === 'submitted')) {
        applyStored(stored, '已同步另一個分頁的最新練習狀態；本頁未覆寫它。'); return false;
      }
      session.revision += 1;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      return true;
    }
    catch (_) { if (!saveWarning) { saveWarning = true; notice('此瀏覽器無法儲存練習狀態；請保持本頁開啟，重新載入可能遺失作答。'); } }
    return true;
  }
  function validSession(data) {
    return data && data.version === 3 && typeof data.sessionId === 'string' && data.sessionId.length > 0 && Number.isInteger(data.revision) && data.revision >= 0 && ['active', 'submitted'].includes(data.phase) &&
      Array.isArray(data.questions) && data.questions.length > 0 && data.questions.length <= 30 &&
      data.questions.every(q => q && typeof q.id === 'string' && Array.isArray(q.choices) && q.choices.length === 5 && typeof q.promptHtml === 'string' && AREAS.includes(q.area) && LETTERS.includes(q.key) && q.key.length === 1) &&
      Number.isFinite(data.startedAt) && Number.isFinite(data.deadline) && data.deadline > data.startedAt &&
      data.answers && typeof data.answers === 'object' && data.marked && typeof data.marked === 'object';
  }
  function restore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!validSession(data)) { notice('先前的機考儲存資料格式不相容，請重新建立練習。'); return; }
      applyStored(data, data.phase === 'active' ? '已恢復先前的限時練習，剩餘時間持續依原截止時間計算。' : '已恢復先前交卷結果。');
    } catch (_) { notice('無法讀取先前練習狀態，請重新建立練習。'); }
  }
  function start() {
    if (syncStored()) return;
    if (session && session.phase === 'active') return;
    const count = Number($('count').value);
    const minutes = Number($('minutes').value);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) { notice('請輸入 1 到 1440 之間的整數分鐘。'); $('minutes').focus(); return; }
    const source = $('source').value;
    const chosen = pool(source);
    const need = quotas(count);
    const short = AREAS.filter(a => chosen.filter(q => q.area === a).length < need[a]);
    if (short.length) { notice('題庫配額不足，尚未開始：' + short.map(a => `${AREA_LABEL[a]}需要 ${need[a]} 題，目前 ${chosen.filter(q => q.area === a).length} 題`).join('；') + '。請改選題庫或減少題數。'); return; }
    const selected = shuffle(AREAS.flatMap(a => shuffle(chosen.filter(q => q.area === a)).slice(0, need[a])));
    const now = Date.now();
    const sessionId = window.crypto && typeof window.crypto.randomUUID === 'function' ? window.crypto.randomUUID() : `${now}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    session = {version: 3, sessionId, revision: 0, phase: 'active', source, minutes, startedAt: now, deadline: now + minutes * 60000, submittedAt: null, submissionReason: null,
      questions: selected.map(q => ({id: q.id, area: q.area, bank: q.bank, topic: q.topic, level: q.level, promptHtml: q.promptHtml, chineseHtml: q.chineseHtml || '', explanationHtml: q.explanationHtml || '', choices: q.choices.map(String), key: q.key})),
      answers: {}, marked: {}, current: 0, view: 'question', reviewFilter: 'all', showChinese: false, warningShown: false};
    notice(''); if (!persist()) return; renderActive(); tick(); startTicker();
    $('question-title').focus({preventScroll: true});
  }
  function answeredCount() { return session.questions.reduce((n, _, i) => n + (LETTERS.includes(session.answers[i]) && String(session.answers[i]).length === 1 ? 1 : 0), 0); }
  function markedCount() { return session.questions.reduce((n, _, i) => n + (session.marked[i] ? 1 : 0), 0); }
  function renderActive() {
    $('setup').hidden = true; $('results').hidden = true; $('active').hidden = false;
    $('chinese').checked = !!session.showChinese;
    $('review-filter').value = session.reviewFilter;
    $('nav').innerHTML = session.questions.map((_, i) => `<button type="button" data-cbt-go="${i}">${i + 1}</button>`).join('');
    renderQuestion();
    const reviewing = session.view === 'review';
    $('question-view').hidden = reviewing;
    $('review-view').hidden = !reviewing;
    if (reviewing) renderReview();
    updateStatus();
  }
  function updateStatus() {
    if (!session || session.phase !== 'active') return;
    $('progress').textContent = `${session.questions.length} questions · 已答 ${answeredCount()} / ${session.questions.length} · 已標記 ${markedCount()}`;
    $('nav').querySelectorAll('[data-cbt-go]').forEach(button => {
      const i = Number(button.dataset.cbtGo);
      const answered = !!session.answers[i];
      button.classList.toggle('cbt-answered', answered);
      button.classList.toggle('cbt-marked', !!session.marked[i]);
      button.classList.toggle('cbt-current', i === session.current);
      button.setAttribute('aria-label', `第 ${i + 1} 題，${answered ? '已答' : '未答'}${session.marked[i] ? '，已標記' : ''}`);
      if (i === session.current) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current');
    });
    $('mark').setAttribute('aria-pressed', String(!!session.marked[session.current]));
    $('mark').textContent = session.marked[session.current] ? '⚑ 已標記 · 取消' : '⚑ 標記此題';
    $('prev').disabled = session.current === 0;
    $('next').textContent = session.current === session.questions.length - 1 ? 'Review 回看 →' : 'Next 下一題 →';
  }
  function renderQuestion() {
    const i = session.current;
    const q = session.questions[i];
    $('question-title').textContent = `Question ${i + 1} of ${session.questions.length}`;
    $('stem').innerHTML = q.promptHtml;
    $('translation').innerHTML = q.chineseHtml;
    $('translation').hidden = !session.showChinese || !q.chineseHtml;
    $('choices').innerHTML = '<legend>Choose one answer / 選擇一個答案</legend>' + q.choices.map((choice, index) => `<label class="cbt-choice"><input type="radio" name="cbt-answer" value="${LETTERS[index]}" aria-label="選項 ${LETTERS[index]}"${session.answers[i] === LETTERS[index] ? ' checked' : ''}><b>${LETTERS[index]}</b><span>${esc(choice)}</span></label>`).join('');
    updateStatus();
  }
  function go(index, focus = true) {
    if (!session || session.phase !== 'active') return;
    if (Date.now() >= session.deadline) { submit('timeout'); return; }
    if (!Number.isInteger(index) || index < 0 || index >= session.questions.length) return;
    session.current = index; session.view = 'question';
    $('question-view').hidden = false; $('review-view').hidden = true;
    renderQuestion(); persist();
    if (focus) $('question-title').focus({preventScroll: true});
  }
  function showReview(focus = true) {
    if (!session || session.phase !== 'active') return;
    session.view = 'review'; $('question-view').hidden = true; $('review-view').hidden = false;
    renderReview(); persist();
    if (focus) $('review-title').focus({preventScroll: true});
  }
  function renderReview() {
    const filter = session.reviewFilter;
    const items = session.questions.map((_, i) => i).filter(i => filter === 'all' || (filter === 'marked' ? session.marked[i] : !session.answers[i]));
    $('review-list').innerHTML = items.length ? items.map(i => `<button type="button" class="cbt-review-row" data-cbt-go="${i}"><span>Question ${i + 1}${session.marked[i] ? '　⚑' : ''}</span><small>${session.answers[i] ? '已答 ' + session.answers[i] : '○ 未答'}${session.marked[i] ? ' · 已標記' : ''}　→</small></button>`).join('') : '<p class="cbt-empty">這個篩選條件下沒有題目。</p>';
  }
  function formatTime(milliseconds) {
    const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
    return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(n => String(n).padStart(2, '0')).join(':');
  }
  function tick() {
    if (!session || session.phase !== 'active') return;
    const remaining = session.deadline - Date.now();
    $('clock').textContent = formatTime(remaining);
    $('clock').classList.toggle('cbt-clock-low', remaining <= 15 * 60000);
    if (remaining <= 0) { submit('timeout'); return; }
    if (remaining <= 15 * 60000 && !session.warningShown && session.minutes > 15) {
      session.warningShown = true; persist();
    }
    if (!session || session.phase !== 'active') return;
    $('time-warning').hidden = !session.warningShown;
  }
  function startTicker() { clearInterval(tickHandle); tickHandle = setInterval(tick, 500); }
  function requestSubmit() {
    if (!session || session.phase !== 'active') return;
    if (Date.now() >= session.deadline) { submit('timeout'); return; }
    confirmOpener = document.activeElement;
    $('confirm-message').textContent = `共 ${session.questions.length} 題，已答 ${answeredCount()} 題，未答 ${session.questions.length - answeredCount()} 題，標記 ${markedCount()} 題。`;
    $('submit-confirm').hidden = false; $('submit-cancel').focus({preventScroll: true});
  }
  function closeConfirm() {
    $('submit-confirm').hidden = true;
    if (confirmOpener && confirmOpener.isConnected) confirmOpener.focus({preventScroll: true});
  }
  function submit(reason) {
    // A timeout belonging to an old tab must not submit the newly synchronized attempt.
    if (syncStored()) return;
    if (!session || session.phase !== 'active') return;
    const now = Date.now();
    session.phase = 'submitted';
    session.submissionReason = reason === 'timeout' || now >= session.deadline ? 'timeout' : 'manual';
    session.submittedAt = Math.min(now, session.deadline);
    clearInterval(tickHandle); tickHandle = null;
    $('submit-confirm').hidden = true;
    if ($('exhibit').open) $('exhibit').close();
    persist();
    if (session && session.phase === 'submitted') renderResults();
  }
  function renderResults() {
    $('setup').hidden = true; $('active').hidden = true; $('results').hidden = false;
    const total = session.questions.length;
    const correct = session.questions.reduce((sum, q, i) => sum + (session.answers[i] === q.key ? 1 : 0), 0);
    const used = Math.max(0, Math.min(session.deadline, session.submittedAt || session.deadline) - session.startedAt);
    const missed = total - answeredCount();
    const rows = AREAS.map(area => {
      const indices = session.questions.map((q, i) => q.area === area ? i : -1).filter(i => i !== -1);
      const right = indices.filter(i => session.answers[i] === session.questions[i].key).length;
      const blanks = indices.filter(i => !session.answers[i]).length;
      return `<tr><td>${AREA_LABEL[area]}</td><td>${indices.length}</td><td>${right}</td><td>${blanks}</td><td>${indices.length ? Math.round(right / indices.length * 100) + '%' : '—'}</td></tr>`;
    }).join('');
    const detail = session.questions.map((q, i) => {
      const answer = session.answers[i];
      const result = answer === q.key ? '✓ 答對' : answer ? '✗ 答錯' : '○ 未答';
      const choiceHtml = q.choices.map((choice, j) => `<li class="${LETTERS[j] === q.key ? 'cbt-correct-choice' : answer === LETTERS[j] ? 'cbt-wrong-choice' : ''}"><b>${LETTERS[j]}</b>　${esc(choice)}${LETTERS[j] === q.key ? '　✓ 正確答案' : ''}${answer === LETTERS[j] ? '　← 你的選擇' : ''}</li>`).join('');
      return `<details class="cbt-result-question"><summary>${result} · 第 ${i + 1} 題 · ${esc(q.id)} · ${esc(q.topic)}${session.marked[i] ? ' · ⚑' : ''}</summary><p class="cbt-result-meta">${AREA_LABEL[q.area]} · 難度 ${esc(q.level)} · 你的答案 ${esc(answer || '未答')} · 正確答案 ${esc(q.key)}</p><div class="cbt-stem">${q.promptHtml}</div>${q.chineseHtml ? `<div class="cbt-translation">${q.chineseHtml}</div>` : ''}<ol class="cbt-result-choices">${choiceHtml}</ol><div class="cbt-result-explanation">${q.explanationHtml}</div></details>`;
    }).join('');
    $('results').innerHTML = `<div class="cbt-result-top"><h2 tabindex="-1" id="cbt-result-title">${session.submissionReason === 'timeout' ? '時間到 · 已自動交卷' : '已交卷 · 成績與回顧'}</h2><div class="cbt-score-number">${correct} / ${total}<span style="font-size:16px">　${Math.round(correct / total * 100)}%</span></div><p>未答 ${missed} 題 · 用時 ${formatTime(used)} · 所有答案已鎖定</p><p class="cbt-result-meta">此為原創題練習分數；不是 SOA 官方成績、分數換算或及格預測。題號按本次抽題順序列出。</p></div><div class="cbt-result-summary"><table><thead><tr><th>主題</th><th>題數</th><th>答對</th><th>未答</th><th>答對率</th></tr></thead><tbody>${rows}</tbody></table></div><button type="button" id="cbt-new-session" class="cbt-primary">建立下一場練習</button><div id="cbt-new-confirm" hidden><p>建立新練習會清除本場儲存的成績與作答。確定返回設定？</p><button type="button" id="cbt-new-cancel">保留本場</button><button type="button" id="cbt-new-confirmed" class="cbt-primary">確認，返回設定</button></div><h2 style="margin-top:30px">逐題結果與詳解</h2>${detail}`;
    $('result-title').focus({preventScroll: true});
  }
  function resetSession() {
    if (syncStored()) return;
    clearInterval(tickHandle); tickHandle = null; session = null;
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) { /* A fresh attempt can still run without persistence. */ }
    $('results').hidden = true; $('active').hidden = true; $('setup').hidden = false;
    notice(''); poolInfo(); $('source').focus({preventScroll: true});
  }
  function normalCdf(z) {
    const sign = z < 0 ? -1 : 1;
    const x = Math.abs(z) / Math.SQRT2;
    const t = 1 / (1 + 0.3275911 * x);
    const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return (1 + sign * erf) / 2;
  }
  function openExhibit() {
    if (!exhibitReady) {
      const head = Array.from({length: 10}, (_, j) => `<th scope="col">.${String(j).padStart(2, '0')}</th>`).join('');
      const body = Array.from({length: 40}, (_, i) => `<tr><th scope="row">${(i / 10).toFixed(1)}</th>${Array.from({length: 10}, (_, j) => `<td>${normalCdf(i / 10 + j / 100).toFixed(4)}</td>`).join('')}</tr>`).join('');
      $('normal-table').innerHTML = `<table><caption>Φ(z)：行加欄即為 z；例如 1.2 + .03 = 1.23</caption><thead><tr><th scope="col">z</th>${head}</tr></thead><tbody>${body}</tbody></table>`;
      exhibitReady = true;
    }
    if (typeof $('exhibit').showModal === 'function') $('exhibit').showModal();
    else { $('exhibit').setAttribute('open', ''); $('exhibit').style.position = 'fixed'; $('exhibit').style.inset = '5vh 2vw auto'; }
  }
  function closeExhibit() { if (typeof $('exhibit').close === 'function') $('exhibit').close(); else $('exhibit').removeAttribute('open'); }

  app.addEventListener('change', event => {
    if (syncStored()) return;
    const target = event.target;
    if (target.id === 'cbt-source' || target.id === 'cbt-count') {
      if (target.id === 'cbt-count') $('minutes').value = Number(target.value) * 6;
      poolInfo(); return;
    }
    if (!session || session.phase !== 'active') return;
    if (Date.now() >= session.deadline) { submit('timeout'); return; }
    if (target.name === 'cbt-answer' && LETTERS.includes(target.value)) {
      // Preserve the actual radio node and viewport: answering never re-renders the question.
      session.answers[session.current] = target.value; persist(); updateStatus();
    } else if (target.id === 'cbt-chinese') {
      session.showChinese = target.checked;
      $('translation').hidden = !session.showChinese || !session.questions[session.current].chineseHtml; persist();
    } else if (target.id === 'cbt-review-filter') {
      session.reviewFilter = target.value; renderReview(); persist();
    }
  });
  app.addEventListener('click', event => {
    if (syncStored()) return;
    const goButton = event.target.closest('[data-cbt-go]');
    if (goButton && app.contains(goButton)) { go(Number(goButton.dataset.cbtGo)); return; }
    const button = event.target.closest('button');
    if (!button || !app.contains(button)) return;
    const action = button.id;
    if (action === 'cbt-start') { start(); return; }
    if (action === 'cbt-exhibit-close') { closeExhibit(); return; }
    if (action === 'cbt-new-session') { $('new-confirm').hidden = false; $('new-cancel').focus({preventScroll: true}); return; }
    if (action === 'cbt-new-cancel') { $('new-confirm').hidden = true; $('new-session').focus({preventScroll: true}); return; }
    if (action === 'cbt-new-confirmed') { resetSession(); return; }
    if (!session || session.phase !== 'active') return;
    if (Date.now() >= session.deadline) { submit('timeout'); return; }
    if (action === 'cbt-prev') go(session.current - 1);
    else if (action === 'cbt-next') { if (session.current === session.questions.length - 1) showReview(); else go(session.current + 1); }
    else if (action === 'cbt-mark') { session.marked[session.current] = !session.marked[session.current]; persist(); updateStatus(); }
    else if (action === 'cbt-clear') { delete session.answers[session.current]; $('choices').querySelectorAll('input').forEach(input => { input.checked = false; }); persist(); updateStatus(); }
    else if (action === 'cbt-show-review') showReview();
    else if (action === 'cbt-review-back') go(session.current);
    else if (action === 'cbt-exhibit-open') openExhibit();
    else if (action === 'cbt-submit-request') requestSubmit();
    else if (action === 'cbt-submit-cancel') closeConfirm();
    else if (action === 'cbt-submit-confirmed') submit('manual');
  });
  app.addEventListener('keydown', event => {
    if (!$('submit-confirm').hidden) {
      if (event.key === 'Escape') { event.preventDefault(); closeConfirm(); }
      if (event.key === 'Tab') {
        const first = $('submit-cancel'); const last = $('submit-confirmed');
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }
  });
  document.addEventListener('visibilitychange', tick);
  window.addEventListener('pageshow', tick);
  window.addEventListener('storage', event => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    if (event.newValue == null) {
      // Re-read: a reset may already have been followed by a fresh attempt in the other tab.
      try {
        if (readStored()) syncStored();
        else clearLocal('另一個分頁已清除上一場練習，請重新設定。');
      } catch (_) { /* Ignore an unreadable external change rather than discard the active attempt. */ }
    } else syncStored();
  });
  poolInfo(); restore();
})();
