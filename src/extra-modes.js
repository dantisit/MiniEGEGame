/* Три независимых набора из приложенных пользователем тренажёров: ударения и два падежа окончаний. */
(() => {
  'use strict';
  const KEY = 'miniege-extra-v1';
  const $ = id => document.getElementById(id);
  const VOWELS = 'аеёиоуыэюя';
  // In accent exercises ё is deliberately shown as е; do not alter the ending modes.
  const accentE = text => text.replace(/ё/g, 'е').replace(/Ё/g, 'Е');
  const names = {
    accent: 'Ударения',
    plural: 'Окончания: именительный падеж',
    genitive: 'Окончания: родительный падеж'
  };
  const base = Object.fromEntries(Object.entries(EXTRA_MODES).map(([mode, rows]) => [mode, rows.map((row, i) => {
    if (mode !== 'accent') return { ...row, id: `${mode}-${i}`, word: row.word.toLowerCase(), custom: false };
    const letters = [...row];
    const correct = letters.findIndex(letter => VOWELS.includes(letter.toLowerCase()) && letter !== letter.toLowerCase());
    if (correct < 0) throw new Error(`Не указано ударение: ${row}`);
    return { id: `accent-${i}`, word: row.toLowerCase(), correct, custom: false,
      hint: row === 'Отзыв' ? 'отклик, мнение' : row === 'отзЫв' ? 'возвращение, отозвать' : '' };
  })]));
  let stored;
  try { stored = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { stored = {}; }
  const state = {
    hidden: Array.isArray(stored.hidden) ? stored.hidden : [],
    custom: Array.isArray(stored.custom) ? stored.custom.map(item =>
      item.mode === 'accent' && typeof item.word === 'string'
        ? { ...item, word: accentE(item.word) }
        : item) : [],
    results: stored.results && typeof stored.results === 'object' ? stored.results : {}
  };
  let mode = 'accent', deck = [], current = [], answers = [], checked = false, onScore = () => {}, onSelect = () => {};
  const save = () => localStorage.setItem(KEY, JSON.stringify(state));
  const items = () => base[mode].concat(state.custom.filter(item => item.mode === mode));
  const cell = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  };
  const shuffle = list => {
    const result = [...list];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  };
  const fullEnding = item => item.word + (item.correct === '▢' ? '' : item.correct.toLowerCase());
  const display = item => mode === 'accent'
    ? [...item.word].map((letter, i) => i === item.correct ? letter.toUpperCase() : letter).join('')
    : `${item.word}(${item.correct.toLowerCase()}/${item.incorrect.toLowerCase()})`;
  const record = item => state.results[item.id] || { correct: 0, wrong: 0 };
  function summary(selectedMode = mode) {
    const ids = base[selectedMode].concat(state.custom.filter(item => item.mode === selectedMode)).map(item => item.id);
    return ids.reduce((sum, id) => {
      const result = state.results[id] || {};
      sum.total += (result.correct || 0) + (result.wrong || 0);
      sum.correct += result.correct || 0;
      return sum;
    }, { total: 0, correct: 0 });
  }
  function eligible() {
    return items().filter(item =>
      ($('extraIncludeHidden').checked || !state.hidden.includes(item.id)) &&
      (item.custom ? $('extraIncludeCustom').checked : $('extraIncludeStandard').checked));
  }
  function hideItem(card) {
    const slot = Number(card.dataset.index);
    const item = current[slot];
    if (!item || state.hidden.includes(item.id)) return;
    state.hidden.push(item.id);
    $('extraIncludeHidden').checked = false;
    save();
    if (checked) {
      card.classList.add('word-hidden');
      card.querySelector('.hide-exercise-btn').disabled = true;
      card.querySelector('.hide-exercise-btn').textContent = 'Скрыто';
    } else {
      current.splice(slot, 1);
      answers.splice(slot, 1);
      card.remove();
      $('extraWordsContainer').querySelectorAll('.word').forEach((other, i) => { other.dataset.index = i; });
      if (!current.length) { next(); return; }
      $('extraCheckBtn').disabled = answers.some(answer => answer === null);
      $('extraResult').textContent = 'Слово скрыто. Другие ответы сохранены.';
    }
  }
  function next() {
    const available = eligible();
    const lookup = new Map(available.map(item => [item.id, item]));
    deck = deck.filter(id => lookup.has(id));
    if (!deck.length) deck = shuffle(available.map(item => item.id));
    const wanted = Math.min(4, new Set(available.map(item => item.word)).size);
    current = [];
    const used = new Set();
    for (let i = 0; i < deck.length && current.length < wanted;) {
      const item = lookup.get(deck[i]);
      if (used.has(item.word)) { i++; continue; }
      current.push(item); used.add(item.word); deck.splice(i, 1);
    }
    answers = Array(current.length).fill(null);
    checked = false;
    $('extraCheckBtn').disabled = true;
    $('extraNextBtn').disabled = true;
    $('extraResult').textContent = '';
    $('extraResult').className = 'result';
    $('extraInstructions').textContent = mode === 'accent'
      ? 'Нажмите на ударную гласную в каждом слове. Затем нажмите «Проверить».'
      : 'Выберите правильное окончание в каждом слове. Пустое окончание обозначено «▢».';
    const root = $('extraWordsContainer'); root.replaceChildren();
    if (!current.length) { root.append(cell('p', 'empty-state', 'Нет слов для тренировки. Измените фильтры или добавьте слово в словарь.')); return; }
    current.forEach((item, index) => {
      const card = cell('div', 'word'); card.dataset.index = index;
      const line = cell('div', 'word-line');
      if (mode === 'accent') {
        [...item.word].forEach((letter, position) => {
          if (!VOWELS.includes(letter)) { line.append(cell('span', '', letter)); return; }
          const button = cell('button', 'ending accent-vowel', letter);
          button.type = 'button'; button.dataset.value = String(position);
          button.setAttribute('aria-label', `Слово ${index + 1}: ударение на ${letter}, позиция ${position + 1}`);
          button.addEventListener('click', () => {
            if (checked) return;
            answers[Number(card.dataset.index)] = position;
            card.querySelectorAll('.accent-vowel').forEach(vowel => vowel.classList.toggle('selected', vowel === button));
            $('extraCheckBtn').disabled = answers.some(answer => answer === null);
          });
          line.append(button);
        });
      } else {
        line.append(cell('span', '', `${item.word}(`));
        const choices = cell('span', 'choices');
        shuffle([item.correct, item.incorrect]).forEach((ending, n) => {
          if (n) choices.append(cell('span', 'separator', ' / '));
          const button = cell('button', 'ending', ending.toLowerCase());
          button.type = 'button'; button.dataset.value = ending;
          button.setAttribute('aria-label', `Слово ${index + 1}: окончание ${ending === '▢' ? 'пустое' : ending.toLowerCase()}`);
          button.addEventListener('click', () => {
            if (checked) return;
            answers[Number(card.dataset.index)] = ending;
            choices.querySelectorAll('button').forEach(option => option.classList.toggle('selected', option === button));
            $('extraCheckBtn').disabled = answers.some(answer => answer === null);
          });
          choices.append(button);
        });
        line.append(choices, cell('span', '', ')'));
      }
      card.append(line);
      if (item.hint || item.category) card.append(cell('p', 'word-hint', [item.hint, item.category].filter(Boolean).join(' · ')));
      const hide = cell('button', 'hide-exercise-btn', 'Скрыть слово'); hide.type = 'button';
      hide.addEventListener('click', () => hideItem(card)); card.append(hide);
      let swipe = null;
      card.addEventListener('pointerdown', event => {
        if (event.button !== 0 || event.target.closest('button, input')) return;
        swipe = { id: event.pointerId, x: event.clientX, y: event.clientY };
      });
      card.addEventListener('pointerup', event => {
        if (!swipe || event.pointerId !== swipe.id) return;
        const dx = event.clientX - swipe.x, dy = event.clientY - swipe.y;
        swipe = null;
        if (dx < -65 && Math.abs(dx) > Math.abs(dy) * 1.3) hideItem(card);
      });
      card.addEventListener('pointercancel', () => { swipe = null; });
      root.append(card);
    });
  }
  function check() {
    if (checked || !current.length || answers.some(answer => answer === null)) return;
    checked = true;
    let correct = 0;
    current.forEach((item, i) => {
      const right = answers[i] === item.correct;
      if (right) correct++;
      const old = record(item);
      state.results[item.id] = { ...old, [right ? 'correct' : 'wrong']: old[right ? 'correct' : 'wrong'] + 1 };
      const card = $('extraWordsContainer').children[i];
      card.classList.add(right ? 'word-correct' : 'word-incorrect');
      card.querySelectorAll('.ending').forEach(button => {
        button.disabled = true;
        if (button.dataset.value === String(item.correct)) button.classList.add('correct');
        else if (button.dataset.value === String(answers[i])) button.classList.add('incorrect');
      });
      card.append(cell('p', 'answer-feedback', `Правильно: ${mode === 'accent' ? display(item) : fullEnding(item)}`));
    });
    save(); onScore();
    $('extraResult').textContent = correct === current.length ? 'Отлично! Все ответы правильные!' : `Правильных ответов: ${correct} из ${current.length}.`;
    $('extraResult').className = 'result ' + (correct === current.length ? 'correct-result' : 'incorrect-result');
    $('extraCheckBtn').disabled = true;
    $('extraNextBtn').disabled = false;
  }
  function dictionary() {
    const term = mode === 'accent' ? accentE($('extraSearch').value.trim().toLowerCase()) : $('extraSearch').value.trim().toLowerCase();
    const filtered = items().filter(item =>
      (!term || [item.word, item.hint || '', item.category || ''].some(text => text.toLowerCase().includes(term))) &&
      (!$('extraOnlyHidden').checked || state.hidden.includes(item.id)));
    $('extraDictionaryCount').textContent = `${items().length} слов`;
    const root = $('extraDictionaryList'); root.replaceChildren();
    if (!filtered.length) { root.append(cell('p', 'empty-state', 'Ничего не найдено.')); return; }
    filtered.forEach(item => {
      const hidden = state.hidden.includes(item.id);
      const row = cell('div', 'dictionary-item' + (hidden ? ' hidden-word' : ''));
      const info = cell('div');
      info.append(cell('strong', '', display(item)));
      if (item.hint || item.category) info.append(cell('small', '', [item.hint, item.category].filter(Boolean).join(' · ')));
      if (mode !== 'accent') info.append(cell('small', '', `Правильно: ${fullEnding(item)} · неверно: ${item.incorrect.toLowerCase()}`));
      const actions = cell('div', 'word-actions');
      const toggle = cell('button', '', hidden ? 'Показать' : 'Скрыть');
      toggle.type = 'button'; toggle.addEventListener('click', () => {
        state.hidden = hidden ? state.hidden.filter(id => id !== item.id) : [...state.hidden, item.id];
        save(); deck = []; dictionary();
        if (!current.length) next();
      });
      actions.append(toggle);
      if (item.custom) {
        const remove = cell('button', '', 'Удалить'); remove.type = 'button';
        remove.addEventListener('click', () => {
          if (!window.confirm(`Удалить «${display(item)}»?`)) return;
          state.custom = state.custom.filter(entry => entry.id !== item.id);
          state.hidden = state.hidden.filter(id => id !== item.id);
          delete state.results[item.id];
          save(); dictionary(); onScore();
        });
        actions.append(remove);
      }
      row.append(info, actions); root.append(row);
    });
  }
  function statistics() {
    const list = items();
    const { total, correct } = summary();
    const root = $('extraStatsSummary'); root.replaceChildren();
    for (const [label, value] of [['Ответов', total], ['Верно', correct], ['Ошибок', total - correct], ['Точность', total ? `${Math.round(correct / total * 100)}%` : '—']]) {
      const tile = cell('div', 'stat-card');
      tile.append(cell('strong', '', value), cell('span', '', label)); root.append(tile);
    }
    const search = mode === 'accent' ? accentE($('extraStatsSearch').value.trim().toLowerCase()) : $('extraStatsSearch').value.trim().toLowerCase();
    const rows = $('extraStatsList'); rows.replaceChildren();
    const filtered = list.filter(item => {
      const result = record(item);
      return result.correct + result.wrong > 0 && (!search || item.word.includes(search));
    });
    filtered.forEach(item => {
      const result = record(item);
      const row = cell('div', 'exercise-stat');
      const name = cell('div'); name.append(cell('strong', '', display(item)));
      if (item.hint) name.append(cell('small', '', item.hint));
      const values = cell('div', 'exercise-stat-values');
      values.append(cell('span', '', `Верно: ${result.correct}`), cell('span', '', `Ошибки: ${result.wrong}`), cell('strong', '', `КД: ${result.wrong ? new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(result.correct / result.wrong) : '∞'}`));
      row.append(name, values); rows.append(row);
    });
    if (!filtered.length) rows.append(cell('p', 'empty-state', 'Пока нет ответов для этого режима.'));
  }
  function select(selected) {
    if (!base[selected]) return;
    mode = selected; deck = [];
    $('extraTrainingTitle').textContent = names[mode];
    $('extraDictionaryTitle').textContent = `Словарь · ${names[mode]}`;
    $('extraStatsTitle').textContent = `Статистика · ${names[mode]}`;
    $('extraFormHint').textContent = mode === 'accent'
      ? 'Укажите ровно одну ударную гласную заглавной: звонИт, бАнты. В этом режиме ё заменяется на е.'
      : 'Укажите основу без окончания и два разных варианта окончания; отсутствие окончания обозначьте символом ▢.';
    $('extraEndingFields').hidden = mode === 'accent';
    $('extraCorrect').required = mode !== 'accent';
    $('extraWrong').required = mode !== 'accent';
    $('extraNewWord').value = '';
    $('extraAddForm').reset();
    $('extraFormMessage').textContent = '';
    next(); onScore();
  }
  function add(event) {
    event.preventDefault();
    const raw = $('extraNewWord').value.trim();
    let item, error = '';
    if (mode === 'accent') {
      const normalized = accentE(raw);
      const letters = [...normalized];
      const indexes = letters.flatMap((letter, i) => VOWELS.includes(letter.toLowerCase()) && letter !== letter.toLowerCase() ? [i] : []);
      if (!/^[А-Яа-яЁё]+$/u.test(raw) || indexes.length !== 1) error = 'Нужно русское слово с одной заглавной ударной гласной.';
      else item = { word: normalized.toLowerCase(), correct: indexes[0] };
    } else {
      const correct = $('extraCorrect').value.trim().toLowerCase(), incorrect = $('extraWrong').value.trim().toLowerCase();
      if (!/^[а-яё]+$/u.test(raw.toLowerCase())) error = 'Основа должна состоять из русских букв.';
      else if (!/^(?:[а-яё]+|▢)$/u.test(correct) || !/^(?:[а-яё]+|▢)$/u.test(incorrect) || correct === incorrect) error = 'Укажите два разных окончания русскими буквами или ▢.';
      else item = { word: raw.toLowerCase(), correct, incorrect };
    }
    if (!error && items().some(existing => existing.word === item.word && existing.correct === item.correct)) error = 'Такое слово уже есть в словаре.';
    $('extraFormMessage').textContent = error || 'Слово добавлено.';
    if (error) return;
    state.custom.push({ ...item, mode, id: `user-${Date.now()}-${Math.random().toString(36).slice(2)}`, custom: true });
    save(); $('extraAddForm').reset(); dictionary(); deck = []; next();
  }
  function init({ updateHeader, openSelection }) {
    onScore = updateHeader; onSelect = openSelection;
    $('extraCheckBtn').addEventListener('click', check);
    $('extraNextBtn').addEventListener('click', next);
    $('extraModeBtn').addEventListener('click', () => onSelect());
    for (const id of ['extraIncludeHidden', 'extraIncludeCustom', 'extraIncludeStandard']) $(id).addEventListener('change', () => { deck = []; next(); });
    $('extraSearch').addEventListener('input', dictionary);
    $('extraOnlyHidden').addEventListener('change', dictionary);
    $('extraStatsSearch').addEventListener('input', statistics);
    $('extraAddForm').addEventListener('submit', add);
    $('extraResetStatsBtn').addEventListener('click', () => {
      if (!window.confirm('Сбросить статистику этого режима?')) return;
      items().forEach(item => { delete state.results[item.id]; });
      save(); statistics(); onScore();
    });
  }
  window.ExtraModeApp = { init, select, summary, dictionary, statistics };
})();
