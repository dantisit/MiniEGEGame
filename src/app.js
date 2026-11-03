/* Одностраничный тренажёр: интерфейсный сценарий повторяет приложенный mainTask7.html. */
(() => {
  'use strict';
  const KEY = 'miniege-spelling-v1';
  const wordLookup = new Map(DEFAULT_WORDS.map(item => [item.word, item]));
  // Each row is a separate exercise; several rows may train different letters of one word.
  const defaultExercises = DEFAULT_EXERCISES.map(([word, mask, wrong], index) => ({
    ...wordLookup.get(word), mask, wrong, id: `pdf-${index}`
  }));
  const masksByWord = new Map();
  defaultExercises.forEach(item => {
    if (!masksByWord.has(item.word)) masksByWord.set(item.word, []);
    masksByWord.get(item.word).push(item.mask);
  });
  const SPECIAL = [
    ['Серия мероприятий перед выборами.', 'кампания', 'Мероприятие, серия действий.'],
    ['Группа друзей или фирма.', 'компания', 'Группа людей или фирма.'],
    ['Птица из семейства ласточек.', 'касатка', 'Птица.'],
    ['Морское млекопитающее из семейства дельфиновых.', 'косатка', 'Морское млекопитающее.']
  ];
  const $ = id => document.getElementById(id);
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
  }
  const saved = load();
  const state = {
    custom: Array.isArray(saved.custom) ? saved.custom : [],
    hidden: Array.isArray(saved.hidden) ? saved.hidden : [],
    hiddenSections: Array.isArray(saved.hiddenSections) ? saved.hiddenSections : [],
    mode: saved.mode === 'write' ? 'write' : 'choice',
    stats: saved.stats && Number.isInteger(saved.stats.total) && Number.isInteger(saved.stats.correct) && saved.stats.total >= 0 && saved.stats.correct >= 0 && saved.stats.correct <= saved.stats.total ? saved.stats : { total: 0, correct: 0 }
  };
  let filter = 'all', collapsed = false, deck = [], current = [], answers = [], checked = false;
  const allWords = () => DEFAULT_WORDS.concat(state.custom);
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* Storage can be disabled. The current session still works. */ } };
  const normalize = text => text.trim().toLocaleLowerCase('ru');
  function exercise(item) {
    const mask = item.mask || [...item.word].map((char, index) => index === item.position ? '_' : char).join('');
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
    return defaultExercises.concat(state.custom.map(item => ({ ...item, id: `custom-${item.word}` }))).filter(item =>
      (includeHidden || !state.hidden.includes(item.word)) &&
      (includeSections || !state.hiddenSections.includes(item.section)) &&
      (item.custom ? includeCustom : includeStandard)
    );
  }
  function updateStats() {
    const { total, correct } = state.stats;
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
          button.setAttribute('aria-label', `Слово ${i + 1}: выбрать ${letter}`);
          button.addEventListener('click', () => {
            if (checked) return;
            answers[i] = letter;
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
          answers[i] = normalize(input.value);
          $('checkBtn').disabled = !answers.every(answer => answer !== null && answer !== '');
        });
        card.append(input);
      }
      if (task.item.hint) card.append(element('p', 'word-hint', task.item.hint));
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
  function renderDictionary() {
    const term = normalize($('dictionarySearch').value);
    const list = allWords().filter(item => {
      if (filter === 'hidden' && !state.hidden.includes(item.word)) return false;
      if (filter === 'user' && !item.custom) return false;
      return !term || [item.word, item.hint || '', item.section].some(s => normalize(s).includes(term));
    });
    $('dictionaryCount').textContent = `${allWords().length} слов`;
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
        const row = element('div', 'dictionary-item' + (state.hidden.includes(item.word) ? ' hidden-word' : ''));
        const text = element('div');
        text.append(element('strong', '', item.word));
        const masks = item.custom ? [[...item.word].map((char, index) => index === item.position ? '_' : char).join('')] : masksByWord.get(item.word);
        text.append(element('small', '', `Пропуски: ${masks.join(', ')}`));
        const details = [item.custom ? 'Пользовательское' : '', item.hint || ''].filter(Boolean).join(' · ');
        if (details) text.append(element('small', '', details));
        const actions = element('div', 'word-actions');
        actions.append(makeButton(state.hidden.includes(item.word) ? 'Показать' : 'Скрыть', () => {
          state.hidden = state.hidden.includes(item.word) ? state.hidden.filter(x => x !== item.word) : [...state.hidden, item.word];
          save(); renderDictionary();
        }, state.hidden.includes(item.word) ? 'Вернуть слово в тренировку' : 'Скрыть слово'));
        if (item.custom) actions.append(makeButton('Удалить', () => {
          if (!window.confirm(`Удалить слово «${item.word}»?`)) return;
          state.custom = state.custom.filter(x => x.word !== item.word);
          state.hidden = state.hidden.filter(x => x !== item.word);
          save(); renderDictionary();
        }));
        row.append(text, actions); content.append(row);
      });
      section.append(content); root.append(section);
    });
  }
  function addWord(event) {
    event.preventDefault();
    const word = normalize($('newWord').value), mask = normalize($('newMask').value), wrong = normalize($('newWrong').value), hint = $('newHint').value.trim();
    const index = [...mask].indexOf('_');
    let error = '';
    if (!/^[а-яё]+$/u.test(word)) error = 'Слово должно состоять из русских букв.';
    else if (allWords().some(item => normalize(item.word) === word)) error = 'Это слово уже есть в словаре.';
    else if ((mask.match(/_/g) || []).length !== 1 || [...mask].length !== [...word].length || [...mask].some((ch, i) => i !== index && ch !== [...word][i])) error = 'Маска должна совпадать со словом, кроме одной буквы «_».';
    else if (!/^[а-яё]$/u.test(wrong) || wrong === [...word][index]) error = 'Неверный вариант должен быть другой русской буквой.';
    else if (['кампания', 'компания', 'касатка', 'косатка'].includes(word) && !hint) error = 'Для этого слова нужен контекст, различающий значения.';
    $('formMessage').textContent = error || `Слово «${word}» добавлено.`;
    if (error) return;
    state.custom.push({ word, section: 'Мои слова', custom: true, position: index, wrong, ...(hint ? { hint } : {}) });
    save(); $('addWordForm').reset(); renderDictionary();
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
  function updateModes() {
    document.querySelectorAll('[data-mode]').forEach(button => button.classList.toggle('active', button.dataset.mode === state.mode));
  }
  function activateTab(name) {
    document.querySelectorAll('.tab').forEach(button => {
      const active = button.dataset.tab === name;
      button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active));
    });
    for (const tab of ['training', 'dictionary']) $(tab + '-tab').hidden = tab !== name;
    if (name === 'dictionary') renderDictionary();
  }
  $('checkBtn').addEventListener('click', checkAnswers);
  $('nextBtn').addEventListener('click', showNext);
  $('specialCasesBtn').addEventListener('click', () => $('specialCasesModal').showModal());
  $('modeBtn').addEventListener('click', () => { updateModes(); $('modeModal').showModal(); });
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.close).close()));
  document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); }));
  document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
    state.mode = button.dataset.mode; save(); showNext(); $('modeModal').close();
  }));
  document.querySelectorAll('.tab').forEach(button => button.addEventListener('click', () => activateTab(button.dataset.tab)));
  ['includeHiddenWords', 'includeCustomWords', 'includeStandardWords', 'includeHiddenSections'].forEach(id => $(id).addEventListener('change', () => { deck = []; showNext(); }));
  $('dictionarySearch').addEventListener('input', renderDictionary);
  [['showAllBtn', 'all'], ['showHiddenBtn', 'hidden'], ['showUserBtn', 'user']].forEach(([id, name]) => $(id).addEventListener('click', () => { filter = name; renderDictionary(); }));
  $('toggleSectionsBtn').addEventListener('click', () => { collapsed = !collapsed; renderDictionary(); });
  $('addWordForm').addEventListener('submit', addWord);
  $('resetDictionaryBtn').addEventListener('click', () => {
    if (!window.confirm('Удалить пользовательские слова и вернуть скрытые слова и разделы? Статистика ответов сохранится.')) return;
    state.custom = []; state.hidden = []; state.hiddenSections = [];
    save(); deck = []; renderDictionary(); showNext();
  });
  $('copyDictionaryBtn').addEventListener('click', async () => {
    const text = allWords().map(item => item.word + (item.hint ? ` — ${item.hint}` : '')).join('\n');
    try { await navigator.clipboard.writeText(text); $('searchInfo').textContent = 'Словарь скопирован в буфер обмена.'; }
    catch { $('searchInfo').textContent = 'Не удалось скопировать. Разрешите доступ к буферу обмена в браузере.'; }
  });
  specialCases(); updateStats(); showNext();
})();
