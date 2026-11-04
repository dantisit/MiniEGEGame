const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM, ResourceLoader, VirtualConsole } = require('jsdom');

const root = path.resolve(__dirname, '..');
class LocalResources extends ResourceLoader {
  fetch(url) {
    const pathname = new URL(url).pathname;
    if (!['/src/app.js', '/src/data/words.js', '/src/data/exercises.js', '/src/data/extra-modes.js', '/src/extra-modes.js', '/src/styles.css'].includes(pathname)) return null;
    return Promise.resolve(readFileSync(path.join(root, pathname)));
  }
}
async function openApp(stored = null, startMode = null, extraStored = null) {
  const errors = [];
  const console = new VirtualConsole();
  console.on('jsdomError', error => errors.push(error.message));
  const dom = await JSDOM.fromFile(path.join(root, 'index.html'), {
    url: 'https://mini.test/',
    resources: new LocalResources(),
    runScripts: 'dangerously',
    virtualConsole: console,
    beforeParse(window) {
      window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
      window.HTMLDialogElement.prototype.close = function () { this.open = false; };
      window.confirm = () => true;
      if (stored) window.localStorage.setItem('miniege-spelling-v1', stored);
      if (extraStored) window.localStorage.setItem('miniege-extra-v1', extraStored);
    }
  });
  await new Promise(resolve => dom.window.addEventListener('load', resolve, { once: true }));
  assert.deepEqual(errors, []);
  if (startMode !== false) {
    const mode = startMode || (stored && JSON.parse(stored).mode) || 'choice';
    dom.window.document.querySelector(`[data-mode="${mode}"]`).click();
  }
  return dom;
}

test('словарь содержит уникальные русские словоформы из PDF', () => {
  const data = readFileSync(path.join(root, 'src/data/words.js'), 'utf8');
  const words = vm.runInNewContext(`${data}\nDEFAULT_WORDS`);
  assert.equal(words.length, 538);
  assert.equal(new Set(words.map(item => item.word)).size, words.length);
  for (const item of words) assert.match(item.word, /^[а-яё]+$/u);
  for (const word of ['кампания', 'компания', 'касатка', 'косатка']) {
    const entry = words.find(item => item.word === word);
    assert.ok(entry.hint, `${word}: нет контекста`);
    assert.ok(!entry.hint.toLowerCase().includes(word), `${word}: ответ показан в подсказке`);
  }
});

test('размеченные пропуски и неверные варианты сверены с каждым исходным словом', () => {
  const context = vm.createContext({});
  vm.runInContext(readFileSync(path.join(root, 'src/data/words.js'), 'utf8'), context);
  vm.runInContext(readFileSync(path.join(root, 'src/data/exercises.js'), 'utf8'), context);
  const words = vm.runInContext('DEFAULT_WORDS', context);
  const exercises = vm.runInContext('DEFAULT_EXERCISES', context);
  assert.equal(exercises.length, 802);
  assert.deepEqual(new Set(exercises.map(([word]) => word)), new Set(words.map(item => item.word)));
  for (const [word, mask, wrong] of exercises) {
    assert.equal(mask.length, word.length, word);
    assert.equal([...mask].filter(letter => letter === '_').length, 1, word);
    const position = mask.indexOf('_');
    assert.equal(mask.replace('_', word[position]), word, word);
    assert.match(wrong, /^[а-яё]$/u, word);
    assert.notEqual(wrong, word[position], word);
  }
  assert.ok(exercises.some(([word, mask, wrong]) => word === 'бюллетень' && mask === 'бюл_етень' && wrong === 'р'));
  assert.ok(exercises.some(([word, mask, wrong]) => word === 'шоссе' && mask === 'шос_е' && wrong === 'з'));
});

test('выбор буквы, проверка без повторного начисления, ввод слова и сохранение результата', async () => {
  const dom = await openApp();
  try {
    const d = dom.window.document;
    assert.equal(d.querySelectorAll('.word').length, 4);
    assert.equal(d.querySelector('#checkBtn').disabled, true);
    d.querySelectorAll('.word').forEach(card => card.querySelector('.ending').click());
    d.querySelector('#checkBtn').click();
    assert.equal(d.querySelector('#score').textContent.split('/')[1], '4');
    assert.equal(d.querySelectorAll('.answer-feedback').length, 4);
    d.querySelector('#checkBtn').click();
    assert.equal(d.querySelector('#score').textContent.split('/')[1], '4');
    d.querySelector('#modeBtn').click();
    d.querySelector('[data-mode="write"]').click();
    assert.equal(d.querySelectorAll('.answer-input').length, 4);
    d.querySelectorAll('.answer-input').forEach(input => {
      input.value = 'тест';
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
    d.querySelector('#checkBtn').click();
    assert.equal(d.querySelector('#score').textContent.split('/')[1], '8');
    const saved = dom.window.localStorage.getItem('miniege-spelling-v1');
    const restored = await openApp(saved);
    try {
      assert.equal(restored.window.document.querySelectorAll('.answer-input').length, 4);
      assert.equal(restored.window.document.querySelector('#score').textContent.split('/')[1], '8');
    } finally { restored.window.close(); }
  } finally { dom.window.close(); }
});

test('для одного слова по очереди встречаются все размеченные пропуски, в том числе согласные', async () => {
  const words = vm.runInNewContext(`${readFileSync(path.join(root, 'src/data/words.js'), 'utf8')}\nDEFAULT_WORDS`);
  const hidden = words.filter(item => item.word !== 'апелляция').map(item => item.word);
  const onlyOneWord = await openApp(JSON.stringify({ hidden }));
  try {
    const d = onlyOneWord.window.document;
    d.querySelector('#includeHiddenWords').checked = false;
    d.querySelector('#includeHiddenWords').dispatchEvent(new onlyOneWord.window.Event('change', { bubbles: true }));
    const seen = new Set();
    for (let n = 0; n < 3; n++) {
      const card = d.querySelector('.word');
      assert.equal(d.querySelectorAll('.word').length, 1);
      const options = [...card.querySelectorAll('.ending')].map(b => b.dataset.value);
      const line = card.querySelector('.word-line');
      seen.add(line.firstElementChild.textContent + '_' + line.lastElementChild.textContent.slice(1));
      assert.equal(options.length, 2);
      card.querySelector('.ending').click();
      d.querySelector('#checkBtn').click();
      d.querySelector('#nextBtn').click();
    }
    assert.deepEqual(seen, new Set(['_пелляция', 'ап_лляция', 'апел_яция']));
  } finally { onlyOneWord.window.close(); }
});

test('словарь показывает каждый пропуск отдельной строкой и скрывает только выбранный', async () => {
  const dom = await openApp();
  try {
    const d = dom.window.document;
    d.querySelector('[data-tab="dictionary"]').click();
    assert.equal(d.querySelectorAll('.dictionary-item').length, 802);
    assert.match(d.querySelector('#dictionaryCount').textContent, /802 пропусков/);
    d.querySelector('#dictionarySearch').value = 'апелляция';
    d.querySelector('#dictionarySearch').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    const masks = [...d.querySelectorAll('.dictionary-item small')].map(node => node.textContent);
    assert.deepEqual(masks, ['Пропуск: _пелляция · неверная буква: о', 'Пропуск: ап_лляция · неверная буква: и', 'Пропуск: апел_яция · неверная буква: р']);
    d.querySelector('.dictionary-item .word-actions button').click();
    d.querySelector('#showHiddenBtn').click();
    assert.equal(d.querySelectorAll('.dictionary-item').length, 1);
    assert.equal(JSON.parse(dom.window.localStorage.getItem('miniege-spelling-v1')).hiddenExercises.length, 1);
    d.querySelector('.dictionary-item .word-actions button').click();
    assert.equal(d.querySelectorAll('.dictionary-item').length, 0);
  } finally { dom.window.close(); }
});

test('свайп в тренировке скрывает один пропуск и не стирает остальные ответы', async () => {
  const words = vm.runInNewContext(`${readFileSync(path.join(root, 'src/data/words.js'), 'utf8')}\nDEFAULT_WORDS`);
  const hidden = words.filter(item => !['абонемент', 'апелляция'].includes(item.word)).map(item => item.word);
  const dom = await openApp(JSON.stringify({ hidden }));
  try {
    const d = dom.window.document;
    assert.equal(d.querySelectorAll('.word').length, 2);
    const cards = [...d.querySelectorAll('.word')];
    cards[1].querySelector('.ending').click();
    const fire = (type, x) => cards[0].querySelector('.word-line').dispatchEvent(
      new dom.window.MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: 100 }));
    fire('pointerdown', 220);
    fire('pointerup', 100);
    assert.equal(d.querySelectorAll('.word').length, 1);
    assert.equal(d.querySelector('#checkBtn').disabled, false);
    const exercises = vm.runInNewContext(`${readFileSync(path.join(root, 'src/data/exercises.js'), 'utf8')}\nDEFAULT_EXERCISES`);
    const migrated = exercises.filter(([word]) => hidden.includes(word)).length;
    assert.equal(JSON.parse(dom.window.localStorage.getItem('miniege-spelling-v1')).hiddenExercises.length, migrated + 1);
    d.querySelector('#checkBtn').click();
    assert.match(d.querySelector('#score').textContent, /\/1$/);
    d.querySelector('.hide-exercise-btn').click();
    assert.equal(d.querySelectorAll('.word').length, 1); // после проверки карточка остаётся до «Продолжить»
    d.querySelector('#nextBtn').click();
    assert.equal(d.querySelectorAll('.word').length, 2);
  } finally { dom.window.close(); }
});

test('КД по отдельным пропускам, сортировка и прежний общий счёт', async () => {
  const context = vm.createContext({});
  vm.runInContext(readFileSync(path.join(root, 'src/data/words.js'), 'utf8'), context);
  vm.runInContext(readFileSync(path.join(root, 'src/data/exercises.js'), 'utf8'), context);
  const exercises = vm.runInContext('DEFAULT_EXERCISES', context);
  const ids = ['_бонемент', 'аб_немент', 'абон_мент'].map(mask =>
    `pdf-${exercises.findIndex(([word, value]) => word === 'абонемент' && value === mask)}`);
  const initial = {
    stats: { total: 10, correct: 7 },
    exerciseStats: {
      [ids[0]]: { correct: 3, wrong: 1 },
      [ids[1]]: { correct: 0, wrong: 2 },
      [ids[2]]: { correct: 2, wrong: 0 }
    }
  };
  const dom = await openApp(JSON.stringify(initial));
  try {
    const d = dom.window.document;
    d.querySelector('[data-tab="statistics"]').click();
    assert.equal(d.querySelector('#statisticsLegacyNote').hidden, false);
    assert.match(d.querySelector('#statisticsSummary').textContent, /10Ответов7Верно3Ошибок70%Точность/);
    d.querySelector('#statsSearch').value = 'абонемент';
    d.querySelector('#statsSearch').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    const rows = () => [...d.querySelectorAll('.exercise-stat')];
    assert.deepEqual(rows().map(row => row.querySelector('small').textContent), ['аб_немент', '_бонемент', 'абон_мент']);
    assert.deepEqual(rows().map(row => row.querySelector('.exercise-stat-values strong').textContent), ['КД: 0', 'КД: 3', 'КД: ∞']);
    d.querySelector('#statsSort').value = 'kd-desc';
    d.querySelector('#statsSort').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    assert.deepEqual(rows().map(row => row.querySelector('small').textContent), ['абон_мент', '_бонемент', 'аб_немент']);
    d.querySelector('#statsOnlyPracticed').checked = false;
    d.querySelector('#statsOnlyPracticed').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    assert.equal(d.querySelector('#statsResultsCount').textContent, 'Показано: 3 из 3');
    d.querySelector('#statsSearch').value = '';
    d.querySelector('#statsSearch').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    assert.equal(d.querySelector('#statsResultsCount').textContent, 'Показано: 40 из 802');
    d.querySelector('#statsShowMore').click();
    assert.equal(d.querySelector('#statsResultsCount').textContent, 'Показано: 80 из 802');
  } finally { dom.window.close(); }
});

test('результаты сохраняются на устройстве в обоих режимах и сбрасываются отдельно от словаря', async () => {
  const custom = { word: 'балл', section: 'Мои слова', custom: true, position: 3, wrong: 'р' };
  const dom = await openApp(JSON.stringify({ custom: [custom] }));
  try {
    const d = dom.window.document;
    d.querySelector('#includeStandardWords').checked = false;
    d.querySelector('#includeStandardWords').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    d.querySelector('.word .ending[data-value="л"]').click();
    d.querySelector('#checkBtn').click();
    d.querySelector('#checkBtn').click(); // повторная проверка не начисляет ответ
    d.querySelector('#modeBtn').click();
    d.querySelector('[data-mode="write"]').click();
    const input = d.querySelector('.answer-input');
    input.value = 'барр';
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    d.querySelector('#checkBtn').click();
    const key = 'custom-балл-3-р';
    const stored = dom.window.localStorage.getItem('miniege-spelling-v1');
    assert.deepEqual(JSON.parse(stored).exerciseStats[key], { correct: 1, wrong: 1 });
    const restored = await openApp(stored);
    try {
      const page = restored.window.document;
      page.querySelector('[data-tab="statistics"]').click();
      assert.equal(page.querySelector('#score').textContent, 'Решено: 1/2');
      assert.equal(page.querySelector('.exercise-stat strong').textContent, 'балл');
      assert.match(page.querySelector('.exercise-stat').textContent, /Верно: 1Ошибки: 1КД: 1/);
      page.querySelector('#resetStatisticsBtn').click();
      const reset = JSON.parse(restored.window.localStorage.getItem('miniege-spelling-v1'));
      assert.deepEqual(reset.stats, { total: 0, correct: 0 });
      assert.deepEqual(reset.exerciseStats, {});
      assert.equal(reset.custom.length, 1);
      assert.equal(page.querySelector('#score').textContent, 'Решено: 0/0');
      assert.equal(page.querySelectorAll('.exercise-stat').length, 0);
    } finally { restored.window.close(); }
  } finally { dom.window.close(); }
});

test('пустая выборка, добавление и фильтрация пользовательского слова, сброс', async () => {
  const dom = await openApp();
  try {
    const d = dom.window.document;
    for (const id of ['includeStandardWords', 'includeCustomWords']) {
      d.getElementById(id).checked = false;
      d.getElementById(id).dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    }
    assert.equal(d.querySelectorAll('.word').length, 0);
    assert.ok(d.querySelector('.empty-state'));
    d.querySelector('[data-tab="dictionary"]').click();
    d.querySelector('#newWord').value = 'балл';
    d.querySelector('#newMask').value = 'бал_';
    d.querySelector('#newWrong').value = 'р';
    d.querySelector('#addWordForm').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    assert.match(d.querySelector('#formMessage').textContent, /добавлено/);
    d.querySelector('#showUserBtn').click();
    assert.equal(d.querySelectorAll('.dictionary-item').length, 1);
    d.getElementById('includeCustomWords').checked = true;
    d.getElementById('includeCustomWords').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    assert.equal(d.querySelectorAll('.word').length, 1);
    assert.deepEqual(new Set([...d.querySelectorAll('.word .ending')].map(button => button.dataset.value)), new Set(['л', 'р']));
    d.querySelector('#resetDictionaryBtn').click();
    assert.equal(d.querySelectorAll('.dictionary-item').length, 0);
    assert.equal(d.querySelectorAll('.word').length, 0);
  } finally { dom.window.close(); }
});

test('при каждом открытии стартует выбор режима, шапка возвращает на него без потери ответа', async () => {
  const dom = await openApp(JSON.stringify({ mode: 'write', stats: { total: 2, correct: 1 } }), false);
  try {
    const d = dom.window.document;
    assert.equal(d.querySelector('#mode-select-tab').hidden, false);
    assert.equal(d.querySelector('#appTabs').hidden, true);
    assert.equal(d.querySelector('#training-tab').hidden, true);
    assert.equal(d.querySelectorAll('#modesGrid [data-mode]').length, 5);
    d.querySelector('[data-mode="write"]').click();
    const input = d.querySelector('.answer-input');
    input.value = 'тест';
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    d.querySelector('#headerModeBtn').click();
    assert.equal(d.querySelector('#mode-select-tab').hidden, false);
    d.querySelector('#resumeTrainingBtn').click();
    assert.equal(d.querySelector('.answer-input'), input);
    assert.equal(input.value, 'тест');
    assert.equal(d.querySelector('#score').textContent, 'Решено: 1/2');
  } finally { dom.window.close(); }
});

test('источники новых режимов сохранены: ударные прописные гласные и оба набора окончаний', () => {
  const data = readFileSync(path.join(root, 'src/data/extra-modes.js'), 'utf8');
  const extra = vm.runInNewContext(`${data}\nEXTRA_MODES`);
  assert.equal(extra.accent.length, 201); // одно повторное «красИвее» удалено
  assert.equal(extra.plural.length, 83);
  assert.equal(extra.genitive.length, 163);
  assert.ok(extra.accent.includes('аэропОрты'));
  assert.ok(extra.accent.includes('отзЫв'));
  assert.ok(extra.plural.some(item => item.word === 'Бухгалтер' && item.correct === 'Ы'));
  assert.ok(extra.genitive.some(item => item.word === 'Яблок' && item.correct === '▢'));
  for (const word of extra.accent) assert.equal([...word].filter(char => 'АЕЁИОУЫЭЮЯ'.includes(char)).length, 1, word);
});

test('ударения: выбор гласной, проверка, словарь, скрытие и сохранённый КД', async () => {
  const dom = await openApp(null, 'accent');
  try {
    const d = dom.window.document;
    assert.equal(d.querySelector('#extra-training-tab').hidden, false);
    assert.equal(d.querySelectorAll('#extraWordsContainer .word').length, 4);
    d.querySelectorAll('#extraWordsContainer .word').forEach(card => card.querySelector('.accent-vowel').click());
    d.querySelector('#extraCheckBtn').click();
    assert.equal(d.querySelector('#score').textContent.split('/')[1], '4');
    d.querySelector('#extraCheckBtn').click();
    assert.equal(d.querySelector('#score').textContent.split('/')[1], '4');
    const ids = Object.keys(JSON.parse(dom.window.localStorage.getItem('miniege-extra-v1')).results);
    assert.equal(ids.length, 4);
    d.querySelector('[data-tab="dictionary"]').click();
    assert.equal(d.querySelector('#extraDictionaryCount').textContent, '201 слов');
    d.querySelector('#extraSearch').value = 'отзыв';
    d.querySelector('#extraSearch').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    assert.equal(d.querySelectorAll('#extraDictionaryList .dictionary-item').length, 2);
    d.querySelector('#extraDictionaryList .word-actions button').click();
    d.querySelector('#extraOnlyHidden').checked = true;
    d.querySelector('#extraOnlyHidden').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    assert.equal(d.querySelectorAll('#extraDictionaryList .dictionary-item').length, 1);
    d.querySelector('[data-tab="statistics"]').click();
    assert.match(d.querySelector('#extraStatsSummary').textContent, /4Ответов/);
    const stored = dom.window.localStorage.getItem('miniege-extra-v1');
    const restored = await openApp(null, false, stored);
    try {
      assert.equal(restored.window.document.querySelector('#mode-select-tab').hidden, false);
      restored.window.document.querySelector('[data-mode="accent"]').click();
      assert.equal(restored.window.document.querySelector('#score').textContent.split('/')[1], '4');
    } finally { restored.window.close(); }
  } finally { dom.window.close(); }
});

test('оба режима окончаний работают отдельно, в том числе пустое окончание', async () => {
  const dom = await openApp(null, 'plural');
  try {
    const d = dom.window.document;
    assert.equal(d.querySelectorAll('#extraWordsContainer .word').length, 4);
    d.querySelectorAll('#extraWordsContainer .word').forEach(card => card.querySelector('.ending').click());
    d.querySelector('#extraCheckBtn').click();
    assert.equal(d.querySelector('#score').textContent.split('/')[1], '4');
    d.querySelector('#headerModeBtn').click();
    d.querySelector('[data-mode="genitive"]').click();
    assert.equal(d.querySelector('#score').textContent, 'Решено: 0/0');
    d.querySelector('[data-tab="dictionary"]').click();
    assert.equal(d.querySelector('#extraDictionaryCount').textContent, '163 слов');
    d.querySelector('#extraSearch').value = 'яблок';
    d.querySelector('#extraSearch').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    assert.equal(d.querySelectorAll('#extraDictionaryList .dictionary-item').length, 1);
    assert.match(d.querySelector('#extraDictionaryList').textContent, /Правильно: яблок/);
    assert.match(d.querySelector('#extraDictionaryList').textContent, /неверно: ов/);
  } finally { dom.window.close(); }
});

test('своё ударение можно добавить, проверить, скрыть и вернуть из словаря', async () => {
  const dom = await openApp(null, 'accent');
  try {
    const d = dom.window.document;
    d.querySelector('[data-tab="dictionary"]').click();
    d.querySelector('#extraNewWord').value = 'тест';
    d.querySelector('#extraAddForm').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    assert.match(d.querySelector('#extraFormMessage').textContent, /одной заглавной/);
    d.querySelector('#extraNewWord').value = 'тЕст';
    d.querySelector('#extraAddForm').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    assert.equal(d.querySelector('#extraDictionaryCount').textContent, '202 слов');
    d.querySelector('#extraIncludeStandard').checked = false;
    d.querySelector('#extraIncludeStandard').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    d.querySelector('[data-tab="training"]').click();
    const card = d.querySelector('#extraWordsContainer .word');
    assert.equal(d.querySelectorAll('#extraWordsContainer .word').length, 1);
    card.querySelectorAll('.accent-vowel')[0].click();
    d.querySelector('#extraCheckBtn').click();
    assert.match(card.textContent, /Правильно: тЕст/);
    assert.equal(d.querySelector('#score').textContent, 'Решено: 1/1');
    card.querySelector('.hide-exercise-btn').click();
    d.querySelector('#extraNextBtn').click();
    assert.equal(d.querySelectorAll('#extraWordsContainer .word').length, 0);
    d.querySelector('[data-tab="dictionary"]').click();
    d.querySelector('#extraSearch').value = 'тест';
    d.querySelector('#extraSearch').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    d.querySelector('#extraDictionaryList .word-actions button').click();
    d.querySelector('[data-tab="training"]').click();
    assert.equal(d.querySelectorAll('#extraWordsContainer .word').length, 1);
  } finally { dom.window.close(); }
});
