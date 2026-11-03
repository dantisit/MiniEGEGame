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
    if (!['/src/app.js', '/src/data/words.js', '/src/styles.css'].includes(pathname)) return null;
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
    d.querySelector('#newWord').value = 'кот';
    d.querySelector('#newMask').value = 'к_т';
    d.querySelector('#newWrong').value = 'а';
    d.querySelector('#addWordForm').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    assert.match(d.querySelector('#formMessage').textContent, /добавлено/);
    d.querySelector('#showUserBtn').click();
    assert.equal(d.querySelectorAll('.dictionary-item').length, 1);
    d.getElementById('includeCustomWords').checked = true;
    d.getElementById('includeCustomWords').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    assert.equal(d.querySelectorAll('.word').length, 1);
    d.querySelector('#resetDictionaryBtn').click();
    assert.equal(d.querySelectorAll('.dictionary-item').length, 0);
    assert.equal(d.querySelectorAll('.word').length, 0);
  } finally { dom.window.close(); }
});
