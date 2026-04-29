(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ModalRuntime = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function populateModalFields(fieldsEl, fields, options = {}, documentRef = globalThis.document) {
    fieldsEl.innerHTML = '';
    if (options.message) {
      const message = documentRef.createElement('div');
      message.className = 'modal-message';
      message.textContent = options.message;
      fieldsEl.appendChild(message);
    }
    for (const field of fields) {
      const label = documentRef.createElement('label');
      label.textContent = field.label;
      label.style.cssText = 'display:block;margin-bottom:2px';
      fieldsEl.appendChild(label);
      let el;
      if (field.type === 'textarea') {
        el = documentRef.createElement('textarea');
      } else if (field.type === 'select') {
        el = documentRef.createElement('select');
        (field.options || []).forEach(option => {
          const opt = documentRef.createElement('option');
          if (option && typeof option === 'object') {
            opt.value = option.value;
            opt.textContent = option.label ?? option.value;
          } else {
            opt.value = String(option);
            opt.textContent = String(option);
          }
          el.appendChild(opt);
        });
      } else {
        el = documentRef.createElement('input');
        el.type = field.type || 'text';
      }
      el.placeholder = field.placeholder || '';
      el.id = field.id;
      el.style.marginBottom = '6px';
      el.value = field.value || '';
      fieldsEl.appendChild(el);
    }
  }

  function createModalRuntime(deps = {}) {
    const documentRef = deps.document || globalThis.document;

    function requestModal(title, fields, options = {}) {
      const overlay = documentRef.getElementById('modal-overlay');
      const titleEl = documentRef.getElementById('modal-title');
      const fieldsEl = documentRef.getElementById('modal-fields');
      const cancelBtn = documentRef.getElementById('modal-cancel');
      const okBtn = documentRef.getElementById('modal-ok');

      titleEl.textContent = title;
      okBtn.textContent = options.okLabel || 'OK';
      cancelBtn.textContent = options.cancelLabel || 'Cancel';
      populateModalFields(fieldsEl, fields, options, documentRef);

      overlay.classList.add('visible');
      const firstField = fields.length ? documentRef.getElementById(fields[0].id) : null;
      if (firstField) {
        firstField.focus();
        firstField.select?.();
      } else {
        okBtn.focus();
      }

      return new Promise(resolve => {
        let settled = false;
        const cleanup = result => {
          if (settled) return;
          settled = true;
          overlay.classList.remove('visible');
          documentRef.removeEventListener('keydown', onKey, true);
          cancelBtn.onclick = null;
          okBtn.onclick = null;
          resolve(result);
        };
        const collectValues = () => {
          const values = {};
          for (const field of fields) {
            values[field.id] = documentRef.getElementById(field.id)?.value ?? '';
          }
          return values;
        };
        const submit = () => cleanup(collectValues());
        const onKey = event => {
          if (!overlay.classList.contains('visible')) return;
          if (event.key === 'Escape') {
            event.preventDefault();
            cleanup(null);
            return;
          }
          if (event.key === 'Enter') {
            const active = documentRef.activeElement;
            const isTextarea = active && active.tagName === 'TEXTAREA';
            if ((isTextarea && (event.ctrlKey || event.metaKey)) || !isTextarea) {
              event.preventDefault();
              submit();
            }
          }
        };
        documentRef.addEventListener('keydown', onKey, true);
        cancelBtn.onclick = () => cleanup(null);
        okBtn.onclick = submit;
      });
    }

    function openModal(title, fields, onOk, options = {}) {
      const overlay = documentRef.getElementById('modal-overlay');
      const titleEl = documentRef.getElementById('modal-title');
      const fieldsEl = documentRef.getElementById('modal-fields');
      const cancelBtn = documentRef.getElementById('modal-cancel');
      const okBtn = documentRef.getElementById('modal-ok');

      titleEl.textContent = title;
      okBtn.textContent = options.okLabel || 'OK';
      cancelBtn.textContent = options.cancelLabel || 'Cancel';
      populateModalFields(fieldsEl, fields, options, documentRef);

      overlay.classList.add('visible');
      const firstField = fields.length ? documentRef.getElementById(fields[0].id) : null;
      if (firstField) {
        firstField.focus();
        firstField.select?.();
      } else {
        okBtn.focus();
      }

      const cleanup = () => {
        overlay.classList.remove('visible');
        documentRef.removeEventListener('keydown', onKey, true);
        cancelBtn.onclick = null;
        okBtn.onclick = null;
      };
      const collectValues = () => {
        const values = {};
        for (const field of fields) {
          values[field.id] = documentRef.getElementById(field.id)?.value ?? '';
        }
        return values;
      };
      const submit = async () => {
        try {
          await onOk(collectValues());
          cleanup();
        } catch (error) {
          deps.setStatus?.(false, 'Error: ' + error.message);
        }
      };
      const onKey = event => {
        if (!overlay.classList.contains('visible')) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          cleanup();
          return;
        }
        if (event.key === 'Enter') {
          const active = documentRef.activeElement;
          const isTextarea = active && active.tagName === 'TEXTAREA';
          if ((isTextarea && (event.ctrlKey || event.metaKey)) || !isTextarea) {
            event.preventDefault();
            submit();
          }
        }
      };

      documentRef.addEventListener('keydown', onKey, true);
      cancelBtn.onclick = cleanup;
      okBtn.onclick = submit;
    }

    async function requestTextModal(title, label, value = '', placeholder = '', options = {}) {
      const values = await requestModal(title, [{
        label,
        id: 'modal-value',
        type: 'input',
        placeholder,
        value,
      }], options);
      return values ? String(values['modal-value'] || '').trim() : '';
    }

    async function requestSelectModal(title, label, optionsList, value = '', options = {}) {
      const values = await requestModal(title, [{
        label,
        id: 'modal-value',
        type: 'select',
        options: optionsList,
        value,
      }], options);
      return values ? String(values['modal-value'] || '').trim() : '';
    }

    async function requestConfirmModal(title, message, options = {}) {
      return !!(await requestModal(title, [], {
        okLabel: 'OK',
        cancelLabel: 'Cancel',
        ...options,
        message,
      }));
    }

    return {
      requestModal,
      openModal,
      requestTextModal,
      requestSelectModal,
      requestConfirmModal,
    };
  }

  return {
    populateModalFields,
    createModalRuntime,
  };
});
