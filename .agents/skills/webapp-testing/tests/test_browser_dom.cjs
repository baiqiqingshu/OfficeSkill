// Development tests with jsdom; these are not Lightpanda compatibility results.
const {JSDOM} = require('jsdom');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const script = fs.readFileSync(path.join(__dirname, '../scripts/browser_dom.js'), 'utf8');
const dom = new JSDOM(`<!doctype html><html><body>
  <input id="name" value="private-input"><button id="submit" disabled>Save</button>
  <span id="result">private-page-text</span><input id="agree" type="checkbox">
  <select id="status"><option value="draft">Draft</option><option value="ready">Ready</option><option value="blocked" disabled>Blocked</option></select>
  <div hidden><button id="hidden-button">hidden</button></div>
  <fieldset disabled><input id="disabled-child"></fieldset>
  <div aria-disabled="true"><button id="disabled-widget">Save</button></div>
  <button id="dup">A</button><button id="dup">B</button>
  <input id="order.1:search"><div id="list"></div><div id="editable" contenteditable="true"></div>
  <input id="radio" type="radio" checked><button>no id</button>
</body></html>`, {runScripts: 'outside-only', url: 'http://app.test/'});
const win = dom.window;
const run = win.eval('(' + script + ')');
const call = (id, operation, data, maxNodes) => JSON.parse(JSON.stringify(run({id, operation, data, maxNodes})));
const prepare = (id, operation, data) => JSON.parse(JSON.stringify(run({id, operation, data, prepare: true})));
let clicks = 0;
const submit = win.document.getElementById('submit');
submit.addEventListener('click', () => clicks++);

assert.equal(call('submit', 'click').retryable, true);
assert.equal(clicks, 0);
submit.disabled = false;
assert.equal(call('submit', 'click').ok, true);
assert.equal(clicks, 1);
assert.equal(call('hidden-button', 'click').retryable, true);
assert.equal(call('disabled-child', 'fill', 'x').retryable, true);
assert.equal(call('disabled-widget', 'click').retryable, true);
assert.equal(call('dup', 'click').count, 2);
assert.equal(call('missing', 'read').count, 0);
assert.equal(call('order.1:search', 'fill', 'literal-id').ok, true);
assert.equal(call('order.1:search', 'read').value, 'literal-id');

let inputEvents = 0, changes = 0;
const name = win.document.getElementById('name');
name.addEventListener('input', () => inputEvents++);
name.addEventListener('change', () => changes++);
assert.equal(call('name', 'fill', 'webtest-value').ok, true);
assert.equal(name.value, 'webtest-value');
assert.equal(inputEvents, 1);
assert.equal(changes, 1);
name.readOnly = true;
assert.equal(call('name', 'fill', 'rejected').retryable, true);
assert.equal(name.value, 'webtest-value');
name.readOnly = false;
// Native MCP polls preparation, then dispatches through a native tool once.
const beforePrepare = {value: name.value, inputEvents, changes, clicks};
for (let i = 0; i < 20; i++) {
    assert.equal(prepare('name', 'fill', 'never-written').ok, true);
    assert.equal(prepare('submit', 'click').ok, true);
    assert.equal(prepare('status', 'select', 'ready').ok, true);
    assert.equal(prepare('agree', 'check', true).checked, false);
    assert.equal(prepare('name', 'press', 'Enter').ok, true);
    assert.equal(prepare('list', 'scroll', {x: 0, y: 100}).ok, true);
}
assert.deepEqual({value: name.value, inputEvents, changes, clicks}, beforePrepare);
assert.equal(win.document.getElementById('status').value, 'draft');
assert.equal(win.document.getElementById('agree').checked, false);
assert.equal(win.document.getElementById('list').scrollTop, 0);
assert.equal(call('editable', 'fill', 'editable-text').ok, true);
assert.equal(win.document.getElementById('editable').textContent, 'editable-text');

assert.equal(call('status', 'select', 'ready').ok, true);
assert.equal(call('status', 'read').value, 'ready');
assert.equal(call('status', 'select', 'not-loaded').retryable, true);
assert.equal(call('status', 'select', 'blocked').retryable, true);
assert.equal(call('status', 'select', ['draft', 'ready']).retryable, false);
assert.equal(call('agree', 'check', true).ok, true);
assert.equal(call('agree', 'read').checked, true);
let checkClicks = 0;
win.document.getElementById('agree').addEventListener('click', () => checkClicks++);
call('agree', 'check', true);
assert.equal(checkClicks, 0);
assert.equal(call('radio', 'check', false).retryable, false);

let enter = 0;
name.addEventListener('keyup', event => { if (event.key === 'Enter') enter++; });
assert.equal(call('name', 'press', 'Enter').ok, true);
assert.equal(enter, 1);

let scrollEvents = 0;
const list = win.document.getElementById('list');
list.addEventListener('scroll', () => scrollEvents++);
assert.equal(call('list', 'scroll', {x: 0, y: 200}).after.y, 200);
assert.equal(scrollEvents, 1);
Object.defineProperty(list, 'scrollTop', {get: () => 0, set: () => {}});
assert.match(call('list', 'scroll', {x: 0, y: 200}).error, /boundary or unsupported/);
assert.equal(scrollEvents, 1);

const snapshot = call('', 'snapshot', null, 5);
assert.equal(snapshot.nodes.length, 5);
assert.equal(snapshot.truncated, true);
assert.ok(!JSON.stringify(snapshot).includes('private-'));
assert.ok(!JSON.stringify(snapshot).includes('webtest-value'));
assert.ok(call('', 'snapshot', null, 80).nodes.some(node => node.id === 'dup' && node.duplicate_id));
assert.ok(call('', 'snapshot', null, 80).nodes.some(node => node.selector === null));
const textMatch = call('result', 'read', {assertion: 'assert_text', text: 'private-page-text', exact: true});
assert.equal(textMatch.matches, true);
assert.ok(!JSON.stringify(textMatch).includes('private-'));
assert.equal(call('name', 'read', {assertion: 'assert_value', value: 'webtest-value'}).matches, true);
assert.ok(!Object.hasOwn(call('name', 'read', {assertion: 'wait_for'}), 'value'));

// Repeated form actions use fresh IDs and preserve application event state.
for (let i = 0; i < 100; i++) {
    call('name', 'fill', String(i));
    call('submit', 'click');
}
assert.equal(name.value, '99');
assert.equal(clicks, 101);
dom.window.close();
console.log('DOM tests passed: mutation-free preparation, events, uniqueness, privacy, scroll stubs and 200-action batch');
