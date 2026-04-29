const test = require('node:test');
const assert = require('node:assert/strict');

const runtime = require('../../static/js/modal_runtime.js');

function createElement(tagName) {
  return {
    tagName: String(tagName).toUpperCase(),
    children: [],
    style: {},
    className: '',
    textContent: '',
    value: '',
    placeholder: '',
    id: '',
    appendChild(child) {
      this.children.push(child);
      return child;
    },
  };
}

test('modal runtime populates message, text, and select fields', () => {
  const documentRef = {
    createElement,
  };
  const fieldsEl = createElement('div');

  runtime.populateModalFields(fieldsEl, [
    {
      label: 'Class Name',
      id: 'class-name',
      value: 'Behavior',
    },
    {
      label: 'Scope',
      id: 'scope',
      type: 'select',
      value: 'all',
      options: [
        { value: 'all', label: 'All' },
        { value: 'local', label: 'Local' },
      ],
    },
  ], { message: 'Choose search scope' }, documentRef);

  assert.equal(fieldsEl.children[0].className, 'modal-message');
  assert.equal(fieldsEl.children[0].textContent, 'Choose search scope');
  assert.equal(fieldsEl.children[1].textContent, 'Class Name');
  assert.equal(fieldsEl.children[2].id, 'class-name');
  assert.equal(fieldsEl.children[2].value, 'Behavior');
  assert.equal(fieldsEl.children[4].tagName, 'SELECT');
  assert.equal(fieldsEl.children[4].children.length, 2);
  assert.equal(fieldsEl.children[4].children[0].value, 'all');
  assert.equal(fieldsEl.children[4].children[0].textContent, 'All');
});
