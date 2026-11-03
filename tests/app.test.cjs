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
    if (!['/src/app.js', '/src/data/words.js', '/src/data/exercises.js', '/src/styles.css'].includes(pathname)) return null;
    return Promise.resolve(readFileSync(path.join(root, pathname)));
  }
}
async function openApp(stored = null) {
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
    }
  });
  await new Promise(resolve => dom.window.addEventListener('load', resolve, { once: true }));
  assert.deepEqual(errors, []);
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
