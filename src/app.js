/* Одностраничный тренажёр: интерфейсный сценарий повторяет приложенный mainTask7.html. */
(() => {
  'use strict';
  const KEY = 'miniege-spelling-v1';
  const wordLookup = new Map(DEFAULT_WORDS.map(item => [item.word, item]));
  // Keep old IDs for unchanged rows; revised masks get fresh IDs so results for
  // a different letter of the same word are not silently carried across.
  const omittedExercises = new Set(OMITTED_EXERCISE_IDS);
  const revisedMasks = new Set(REVISED_MASK_IDS);
  // Each row is a separate exercise; several rows may train different letters of one word.
  const defaultExercises = DEFAULT_EXERCISES.map(([word, mask, wrong], index) => ({
    ...wordLookup.get(word), mask, wrong, id: revisedMasks.has(index) ? `pdf-${index}-v2` : `pdf-${index}`
  })).filter((_, index) => !omittedExercises.has(index));
  const SPECIAL = [
    ['Серия мероприятий перед выборами.', 'кампания', 'Мероприятие, серия действий.'],
    ['Группа друзей или фирма.', 'компания', 'Группа людей или фирма.'],
    ['Птица из семейства ласточек.', 'касатка', 'Птица.'],
    ['Морское млекопитающее из семейства дельфиновых.', 'косатка', 'Морское млекопитающее.']
  ];
  const $ = id => document.getElementById(id);
  function doubleConsonantGap(word, index) {
    const chars = [...word], letter = chars[index];
    return /^[бвгджзйклмнпрстфхцчшщ]$/u.test(letter) &&
      (chars[index - 1] === letter || chars[index + 1] === letter);
  }
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
  }
  const saved = load();
  const state = {
    custom: Array.isArray(saved.custom) ? saved.custom : [],
    hiddenExercises: Array.isArray(saved.hiddenExercises) ? saved.hiddenExercises : [],
    hiddenSections: Array.isArray(saved.hiddenSections) ? saved.hiddenSections : [],
    mode: ['choice', 'write', 'accent', 'plural', 'genitive'].includes(saved.mode) ? saved.mode : 'choice',
    stats: saved.stats && Number.isInteger(saved.stats.total) && Number.isInteger(saved.stats.correct) && saved.stats.total >= 0 && saved.stats.correct >= 0 && saved.stats.correct <= saved.stats.total ? saved.stats : { total: 0, correct: 0 },
    exerciseStats: saved.exerciseStats && typeof saved.exerciseStats === 'object' && !Array.isArray(saved.exerciseStats) ? saved.exerciseStats : {}
  };
  let filter = 'all', collapsed = false, deck = [], current = [], answers = [], checked = false, statsShown = 40, started = false;
  const allWords = () => DEFAULT_WORDS.concat(state.custom);
  const allExercises = () => defaultExercises.concat(state.custom.map(item => ({
    ...item, wrong: doubleConsonantGap(item.word, item.position) ? '!' : item.wrong,
    // Existing custom IDs retain their old suffix even if a saved wrong option changes to !.
    id: `custom-${item.word}-${item.position}-${item.wrong}`
  })));
  // Older versions hid a whole word; keep that choice by hiding each of its exercises.
  if (Array.isArray(saved.hidden)) {
    const hiddenWords = new Set(saved.hidden);
    state.hiddenExercises = [...new Set([...state.hiddenExercises, ...allExercises()
      .filter(item => hiddenWords.has(item.word)).map(item => item.id)])];
  }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* Storage can be disabled. The current session still works. */ } };
  const normalize = text => text.trim().toLocaleLowerCase('ru');
  function maskFor(item) {
    return item.mask || [...item.word].map((char, index) => index === item.position ? '_' : char).join('');
  }
  function exercise(item) {
    const mask = maskFor(item);
    const index = mask.indexOf('_');
    const chars = [...item.word];
    return { item, index, letter: chars[index], wrong: item.wrong, before: chars.slice(0, index).join(''), after: chars.slice(index + 1).join(''), writeMask: mask };
  }
  function shuffle(values) {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  function eligible() {
    const includeHidden = $('includeHiddenWords').checked;
    const includeCustom = $('includeCustomWords').checked;
    const includeStandard = $('includeStandardWords').checked;
    const includeSections = $('includeHiddenSections').checked;
    return allExercises().filter(item =>
      (includeHidden || !state.hiddenExercises.includes(item.id)) &&
      (includeSections || !state.hiddenSections.includes(item.section)) &&
      (item.custom ? includeCustom : includeStandard)
    );
  }
  function updateStats() {
    const { total, correct } = ['choice', 'write'].includes(state.mode) ? state.stats : ExtraModeApp.summary(state.mode);
    const percent = total ? Math.round(correct * 100 / total) : 0;
    $('score').textContent = `Решено: ${correct}/${total}`;
    $('percentage').textContent = `${percent}%`;
    $('progressBar').style.width = `${percent}%`;
    $('progressTrack').setAttribute('aria-valuenow', String(percent));
  }
  function element(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }
  function hideCurrentExercise(card) {
    const index = Number(card.dataset.index);
    const task = current[index];
    if (!task || state.hiddenExercises.includes(task.item.id)) return;
    state.hiddenExercises.push(task.item.id);
    // A swipe should actually remove the exercise from future rounds even if the user
    // previously opted into showing hidden exercises.
    $('includeHiddenWords').checked = false;
    save();
    if (checked) {
      card.classList.add('word-hidden');
      const button = card.querySelector('.hide-exercise-btn');
      button.textContent = 'Пропуск скрыт';
      button.disabled = true;
      return;
    }
    current.splice(index, 1);
    answers.splice(index, 1);
    card.remove();
    $('wordsContainer').querySelectorAll('.word').forEach((remaining, slot) => { remaining.dataset.index = slot; });
    if (!current.length) { showNext(); return; }
    $('checkBtn').disabled = !answers.every(answer => answer !== null && answer !== '');
    $('result').textContent = 'Пропуск скрыт. Остальные ответы сохранены.';
    $('result').className = 'result';
  }
  function showNext() {
    const available = eligible();
    const keys = new Set(available.map(item => item.id));
    deck = deck.filter(id => keys.has(id));
    if (!deck.length) deck = shuffle(available.map(item => item.id));
    const count = Math.min(4, new Set(available.map(item => item.word)).size);
    const lookup = new Map(available.map(item => [item.id, item]));
    const selected = [];
    const usedWords = new Set();
    for (let i = 0; i < deck.length && selected.length < count;) {
      const item = lookup.get(deck[i]);
      if (usedWords.has(item.word)) { i++; continue; }
      selected.push(deck.splice(i, 1)[0]);
      usedWords.add(item.word);
    }
    current = selected.map(id => exercise(lookup.get(id)));
    answers = Array(current.length).fill(null);
    checked = false;
    $('result').textContent = '';
    $('result').className = 'result';
    $('checkBtn').disabled = true;
    $('nextBtn').disabled = true;
    $('instructions').textContent = state.mode === 'choice'
      ? 'Выберите правильную букву в каждом слове. Затем нажмите «Проверить».'
      : 'Впишите слова целиком по показанным пропускам. Затем нажмите «Проверить».';
    const box = $('wordsContainer');
    box.replaceChildren();
    if (!current.length) {
      box.append(element('p', 'empty-state', 'Нет слов для тренировки. Измените фильтры или добавьте слово.'));
      return;
    }
    current.forEach((task, i) => {
      const card = element('div', 'word');
      card.dataset.index = i;
      if (state.mode === 'choice') {
        const line = element('div', 'word-line');
        line.append(element('span', '', task.before), element('span', '', '('));
        const choices = element('span', 'choices');
        const options = shuffle([task.letter, task.wrong]);
        options.forEach((letter, n) => {
          const button = element('button', 'ending', letter);
          button.type = 'button';
          button.dataset.value = letter;
          button.setAttribute('aria-label', `Слово ${i + 1}: выбрать ${letter === '!' ? 'без второй согласной' : letter}`);
          button.addEventListener('click', () => {
            if (checked) return;
            answers[Number(card.dataset.index)] = letter;
            choices.querySelectorAll('button').forEach(b => b.classList.toggle('selected', b === button));
            $('checkBtn').disabled = !answers.every(answer => answer !== null && answer !== '');
          });
          choices.append(button);
          if (n === 0) choices.append(element('span', 'separator', ' / '));
        });
        line.append(choices, element('span', '', ')' + task.after));
        card.append(line);
      } else {
        card.append(element('div', 'mask-prompt', task.writeMask));
        const input = element('input', 'answer-input');
        input.type = 'text'; input.spellcheck = false; input.autocomplete = 'off';
        input.setAttribute('aria-label', `Напишите слово ${i + 1}: ${task.writeMask}`);
        input.addEventListener('input', () => {
          answers[Number(card.dataset.index)] = normalize(input.value);
          $('checkBtn').disabled = !answers.every(answer => answer !== null && answer !== '');
        });
        card.append(input);
      }
      if (task.item.hint) card.append(element('p', 'word-hint', task.item.hint));
      const hideButton = element('button', 'hide-exercise-btn', 'Скрыть пропуск');
      hideButton.type = 'button';
      hideButton.setAttribute('aria-label', `Скрыть пропуск ${task.writeMask}`);
      hideButton.addEventListener('click', () => hideCurrentExercise(card));
      card.append(hideButton);
      let swipeStart = null;
      card.addEventListener('pointerdown', event => {
        if (event.button !== 0 || event.target.closest('button, input')) return;
        swipeStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
      });
      card.addEventListener('pointerup', event => {
        if (!swipeStart || event.pointerId !== swipeStart.id) return;
        const dx = event.clientX - swipeStart.x;
        const dy = event.clientY - swipeStart.y;
        swipeStart = null;
        if (dx < -65 && Math.abs(dx) > Math.abs(dy) * 1.3) hideCurrentExercise(card);
      });
      card.addEventListener('pointercancel', () => { swipeStart = null; });
      box.append(card);
    });
  }
  function checkAnswers() {
    if (checked || answers.length !== current.length || !current.length || answers.some(answer => answer === null || answer === '')) return;
    checked = true;
    let correct = 0;
    current.forEach((task, i) => {
      const card = $('wordsContainer').children[i];
      const right = state.mode === 'choice' ? answers[i] === task.letter : normalize(answers[i]) === normalize(task.item.word);
      if (right) correct++;
      const record = exerciseRecord(task.item.id);
      record[right ? 'correct' : 'wrong']++;
      state.exerciseStats[task.item.id] = record;
      card.classList.add(right ? 'word-correct' : 'word-incorrect');
      if (state.mode === 'choice') {
        card.querySelectorAll('.ending').forEach(button => {
          button.disabled = true;
          if (button.dataset.value === task.letter) button.classList.add('correct');
          else if (button.dataset.value === answers[i]) button.classList.add('incorrect');
        });
      } else card.querySelector('input').disabled = true;
      card.append(element('p', 'answer-feedback', right ? `Верно: ${task.item.word}` : `Правильно: ${task.item.word}`));
    });
    state.stats.total += current.length;
    state.stats.correct += correct;
    save(); updateStats();
    $('result').textContent = correct === current.length ? 'Отлично! Все слова написаны правильно!' : `Есть ошибки. Правильных ответов: ${correct} из ${current.length}.`;
    $('result').className = 'result ' + (correct === current.length ? 'correct-result' : 'incorrect-result');
    $('checkBtn').disabled = true;
    $('nextBtn').disabled = false;
  }
  function makeButton(text, callback, title) {
    const button = element('button', '', text);
    button.type = 'button';
    if (title) button.title = title;
    button.addEventListener('click', callback);
    return button;
  }
  function exerciseRecord(id) {
    const record = state.exerciseStats[id];
    const valid = value => Number.isSafeInteger(value) && value >= 0;
    return {
      correct: valid(record?.correct) ? record.correct : 0,
      wrong: valid(record?.wrong) ? record.wrong : 0
    };
  }
  function kd(record) {
    if (!record.correct && !record.wrong) return null;
    return record.wrong ? record.correct / record.wrong : Infinity;
  }
  function renderStatistics() {
    const { total, correct } = state.stats;
    const summary = $('statisticsSummary');
    summary.replaceChildren();
    for (const [label, value] of [
      ['Ответов', total], ['Верно', correct], ['Ошибок', total - correct],
      ['Точность', total ? `${Math.round(correct / total * 100)}%` : '—']
    ]) {
      const card = element('div', 'stat-card');
      card.append(element('strong', '', value), element('span', '', label));
      summary.append(card);
    }
    const exercises = allExercises().map(item => ({ item, record: exerciseRecord(item.id) }));
    const detailedTotal = Object.keys(state.exerciseStats).reduce((sum, id) => {
      const record = exerciseRecord(id);
      return sum + record.correct + record.wrong;
    }, 0);
    $('statisticsLegacyNote').hidden = total <= detailedTotal;
    const term = normalize($('statsSearch').value);
    const onlyPracticed = $('statsOnlyPracticed').checked;
    const sort = $('statsSort').value;
    const filtered = exercises.filter(({ item, record }) =>
      (!onlyPracticed || record.correct + record.wrong > 0) &&
      (!term || normalize(item.word).includes(term) || normalize(maskFor(item)).includes(term))
    );
    const alphabetical = (a, b) => a.item.word.localeCompare(b.item.word, 'ru') ||
      (a.item.mask || '').localeCompare(b.item.mask || '', 'ru');
    filtered.sort((a, b) => {
      if (sort === 'word') return alphabetical(a, b);
      const aKd = kd(a.record), bKd = kd(b.record);
      if (aKd === null || bKd === null) return aKd === null ? (bKd === null ? alphabetical(a, b) : 1) : -1;
      if (aKd !== bKd) return sort === 'kd-desc' ? (aKd > bKd ? -1 : 1) : (aKd < bKd ? -1 : 1);
      return alphabetical(a, b);
    });
    const list = $('exerciseStatsList');
    list.replaceChildren();
    filtered.slice(0, statsShown).forEach(({ item, record }) => {
      const row = element('div', 'exercise-stat');
      const name = element('div');
      name.append(element('strong', '', item.word));
      name.append(element('small', '', maskFor(item)));
      const values = element('div', 'exercise-stat-values');
      values.append(element('span', '', `Верно: ${record.correct}`), element('span', '', `Ошибки: ${record.wrong}`));
      const ratio = kd(record);
      values.append(element('strong', '', `КД: ${ratio === null ? '—' : ratio === Infinity ? '∞' : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(ratio)}`));
      row.append(name, values);
      list.append(row);
    });
    if (!filtered.length) list.append(element('p', 'empty-state', onlyPracticed && !term ? 'Пока нет ответов. Пройдите тренировку или покажите все слова.' : 'Ничего не найдено.'));
    $('statsResultsCount').textContent = `Показано: ${Math.min(statsShown, filtered.length)} из ${filtered.length}`;
    $('statsShowMore').hidden = statsShown >= filtered.length;
  }
  function renderDictionary() {
    const term = normalize($('dictionarySearch').value);
    const list = allExercises().filter(item => {
      if (filter === 'hidden' && !state.hiddenExercises.includes(item.id)) return false;
      if (filter === 'user' && !item.custom) return false;
      return !term || [item.word, maskFor(item), item.hint || '', item.section].some(s => normalize(s).includes(term));
    });
    const count = allExercises().length;
    const gapForm = count % 10 === 1 && count % 100 !== 11 ? 'пропуск' :
      [2, 3, 4].includes(count % 10) && (count % 100 < 12 || count % 100 > 14) ? 'пропуска' : 'пропусков';
    $('dictionaryCount').textContent = `${count} ${gapForm} · ${new Set(allExercises().map(item => item.word)).size} слов`;
    $('searchInfo').textContent = `Найдено: ${list.length}`;
    for (const [id, value] of [['showAllBtn', 'all'], ['showHiddenBtn', 'hidden'], ['showUserBtn', 'user']]) {
      $(id).classList.toggle('active', filter === value);
      $(id).setAttribute('aria-pressed', String(filter === value));
    }
    $('toggleSectionsBtn').textContent = collapsed ? 'Развернуть все разделы' : 'Свернуть все разделы';
    const root = $('dictionaryList'); root.replaceChildren();
    if (!list.length) { root.append(element('p', 'empty-state', 'Ничего не найдено.')); return; }
    const groups = new Map();
    list.forEach(item => { if (!groups.has(item.section)) groups.set(item.section, []); groups.get(item.section).push(item); });
    groups.forEach((entries, sectionName) => {
      const section = element('section', 'section');
      const header = element('div', 'section-header' + (state.hiddenSections.includes(sectionName) ? ' hidden-section' : ''));
      header.append(element('strong', '', `${sectionName} · ${entries.length}`));
      const content = element('div', 'section-content'); content.hidden = collapsed;
      header.append(makeButton(collapsed ? 'Развернуть' : 'Свернуть', event => {
        content.hidden = !content.hidden;
        event.currentTarget.textContent = content.hidden ? 'Развернуть' : 'Свернуть';
      }));
      header.append(makeButton(state.hiddenSections.includes(sectionName) ? 'Показать раздел' : 'Скрыть раздел', () => {
        state.hiddenSections = state.hiddenSections.includes(sectionName) ? state.hiddenSections.filter(x => x !== sectionName) : [...state.hiddenSections, sectionName];
        save(); renderDictionary();
      }));
      section.append(header);
      entries.forEach(item => {
        const hidden = state.hiddenExercises.includes(item.id);
        const row = element('div', 'dictionary-item' + (hidden ? ' hidden-word' : ''));
        const text = element('div');
        text.append(element('strong', '', item.word));
        text.append(element('small', '', `Пропуск: ${maskFor(item)} · неверный вариант: ${item.wrong}`));
        const details = [item.custom ? 'Пользовательское' : '', item.hint || ''].filter(Boolean).join(' · ');
        if (details) text.append(element('small', '', details));
        const actions = element('div', 'word-actions');
        actions.append(makeButton(hidden ? 'Показать' : 'Скрыть', () => {
          state.hiddenExercises = hidden ? state.hiddenExercises.filter(id => id !== item.id) : [...state.hiddenExercises, item.id];
          save(); renderDictionary();
        }, hidden ? 'Вернуть этот пропуск в тренировку' : 'Скрыть этот пропуск'));
        if (item.custom) actions.append(makeButton('Удалить', () => {
          if (!window.confirm(`Удалить слово «${item.word}»?`)) return;
          state.custom = state.custom.filter(x => x.word !== item.word);
          state.hiddenExercises = state.hiddenExercises.filter(id => id !== item.id);
          save(); renderDictionary();
        }));
        row.append(text, actions); content.append(row);
      });
      section.append(content); root.append(section);
    });
  }
  function addWord(event) {
    event.preventDefault();
    const word = normalize($('newWord').value), mask = normalize($('newMask').value), hint = $('newHint').value.trim();
    const index = [...mask].indexOf('_');
    const wrong = doubleConsonantGap(word, index) ? '!' : normalize($('newWrong').value);
    let error = '';
    if (!/^[а-яё]+$/u.test(word)) error = 'Слово должно состоять из русских букв.';
    else if (allWords().some(item => normalize(item.word) === word)) error = 'Это слово уже есть в словаре.';
    else if ((mask.match(/_/g) || []).length !== 1 || [...mask].length !== [...word].length || [...mask].some((ch, i) => i !== index && ch !== [...word][i])) error = 'Маска должна совпадать со словом, кроме одной буквы «_».';
    else if (!doubleConsonantGap(word, index) && (!/^[а-яё]$/u.test(wrong) || wrong === [...word][index])) error = 'Неверный вариант должен быть другой русской буквой.';
    else if (['кампания', 'компания', 'касатка', 'косатка'].includes(word) && !hint) error = 'Для этого слова нужен контекст, различающий значения.';
    $('formMessage').textContent = error || `Слово «${word}» добавлено.`;
    if (error) return;
    state.custom.push({ word, section: 'Мои слова', custom: true, position: index, wrong, ...(hint ? { hint } : {}) });
    save(); $('addWordForm').reset(); updateNewWrong(); renderDictionary();
  }
  function updateNewWrong() {
    const word = normalize($('newWord').value), mask = normalize($('newMask').value);
    const double = mask.indexOf('_') >= 0 && doubleConsonantGap(word, mask.indexOf('_'));
    const field = $('newWrong');
    if (double) field.value = '!';
    else if (field.readOnly) field.value = '';
    field.readOnly = double;
    field.placeholder = double ? '!' : 'Например: а';
  }
  function specialCases() {
    const grid = $('specialCasesGrid'); grid.replaceChildren();
    SPECIAL.forEach(([prompt, word, meaning]) => {
      const button = makeButton(prompt, () => {
        const revealed = button.getAttribute('aria-expanded') === 'true';
        button.setAttribute('aria-expanded', String(!revealed));
        answer.hidden = revealed;
      });
      button.className = 'special-card'; button.setAttribute('aria-expanded', 'false');
      const answer = element('span', '', `${word} — ${meaning}`); answer.hidden = true;
      button.append(answer); grid.append(button);
    });
  }
  const isSpelling = () => state.mode === 'choice' || state.mode === 'write';
  function showModeSelection() {
    $('mode-select-tab').hidden = false;
    $('appTabs').hidden = true;
    document.querySelectorAll('.tab-content').forEach(section => { section.hidden = true; });
    $('resumeTrainingBtn').hidden = !started;
    document.querySelectorAll('[data-mode]').forEach(button => button.classList.toggle('active', button.dataset.mode === state.mode && started));
    $('modeSelectionTitle').focus();
  }
  function activateTab(name) {
    $('mode-select-tab').hidden = true;
    $('appTabs').hidden = false;
    document.querySelectorAll('.tab').forEach(button => {
      const active = button.dataset.tab === name;
      button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll('.tab-content').forEach(section => { section.hidden = true; });
    const id = `${isSpelling() ? '' : 'extra-'}${name}-tab`;
    $(id).hidden = false;
    if (name === 'dictionary') (isSpelling() ? renderDictionary() : ExtraModeApp.dictionary());
    if (name === 'statistics') (isSpelling() ? renderStatistics() : ExtraModeApp.statistics());
  }
  function chooseMode(mode) {
    const resume = started && state.mode === mode;
    state.mode = mode;
    save();
    $('pageTitle').textContent = isSpelling() ? 'Правописание слов. Задание 9' :
      mode === 'accent' ? 'Тренировка ударений' : 'Тренировка окончаний';
    if (!resume) {
      if (isSpelling()) { deck = []; showNext(); }
      else ExtraModeApp.select(mode);
    }
    started = true;
    updateStats();
    activateTab('training');
  }
  ExtraModeApp.init({ updateHeader: updateStats, openSelection: showModeSelection });
  $('headerModeBtn').addEventListener('click', showModeSelection);
  $('resumeTrainingBtn').addEventListener('click', () => activateTab('training'));
  $('checkBtn').addEventListener('click', checkAnswers);
  $('nextBtn').addEventListener('click', showNext);
  $('specialCasesBtn').addEventListener('click', () => $('specialCasesModal').showModal());
  $('modeBtn').addEventListener('click', showModeSelection);
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.close).close()));
  document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); }));
  document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => chooseMode(button.dataset.mode)));
  document.querySelectorAll('.tab').forEach(button => button.addEventListener('click', () => activateTab(button.dataset.tab)));
  for (const id of ['statsSearch', 'statsSort', 'statsOnlyPracticed']) {
    $(id).addEventListener(id === 'statsSearch' ? 'input' : 'change', () => { statsShown = 40; renderStatistics(); });
  }
  $('statsShowMore').addEventListener('click', () => { statsShown += 40; renderStatistics(); });
  $('resetStatisticsBtn').addEventListener('click', () => {
    if (!window.confirm('Сбросить весь счёт и результаты по пропускам? Словарь и настройки останутся без изменений.')) return;
    state.stats = { total: 0, correct: 0 };
    state.exerciseStats = {};
    save(); updateStats(); renderStatistics();
  });
  ['includeHiddenWords', 'includeCustomWords', 'includeStandardWords', 'includeHiddenSections'].forEach(id => $(id).addEventListener('change', () => { deck = []; showNext(); }));
  $('dictionarySearch').addEventListener('input', renderDictionary);
  [['showAllBtn', 'all'], ['showHiddenBtn', 'hidden'], ['showUserBtn', 'user']].forEach(([id, name]) => $(id).addEventListener('click', () => { filter = name; renderDictionary(); }));
  $('toggleSectionsBtn').addEventListener('click', () => { collapsed = !collapsed; renderDictionary(); });
  $('addWordForm').addEventListener('submit', addWord);
  $('newWord').addEventListener('input', updateNewWrong);
  $('newMask').addEventListener('input', updateNewWrong);
  $('resetDictionaryBtn').addEventListener('click', () => {
    if (!window.confirm('Удалить пользовательские слова и вернуть скрытые пропуски и разделы? Статистика ответов сохранится.')) return;
    state.custom = []; state.hiddenExercises = []; state.hiddenSections = [];
    save(); deck = []; renderDictionary(); showNext();
  });
  $('copyDictionaryBtn').addEventListener('click', async () => {
    const text = allExercises().map(item => `${item.word} | ${maskFor(item)} | ${item.wrong}${item.hint ? ` | ${item.hint}` : ''}`).join('\n');
    try { await navigator.clipboard.writeText(text); $('searchInfo').textContent = 'Пропуски скопированы в буфер обмена.'; }
    catch { $('searchInfo').textContent = 'Не удалось скопировать. Разрешите доступ к буферу обмена в браузере.'; }
  });
  specialCases(); updateStats(); showModeSelection();
})();
