// DOM-only operations for Lightpanda. No rendered boxes or stale node handles.
({id, operation, data, maxNodes = 30, prepare = false}) => {
    const validId = value => /^[A-Za-z_][A-Za-z0-9_.:-]*$/.test(value);
    const matches = value => document.querySelectorAll('[id="' + value + '"]');
    const visible = el => {
        for (let cur = el; cur; cur = cur.parentElement) {
            if (cur.hidden || cur.getAttribute('aria-hidden') === 'true') return false;
            let style = cur.style;
            if (style && (style.display === 'none' || ['hidden', 'collapse'].includes(style.visibility))) return false;
            if (typeof getComputedStyle === 'function') {
                style = getComputedStyle(cur);
                if (style && (style.display === 'none' || ['hidden', 'collapse'].includes(style.visibility))) return false;
            }
        }
        return true;
    };
    const enabled = el => {
        if (el.disabled || (typeof el.matches === 'function' && el.matches(':disabled'))) return false;
        for (let cur = el; cur; cur = cur.parentElement) {
            if (cur.inert || cur.hasAttribute('inert') || cur.getAttribute('aria-disabled') === 'true') return false;
        }
        return true;
    };
    const failure = (error, retryable = false, state = {}) => ({error, retryable, ...state});
    const changed = el => {
        el.dispatchEvent(new Event('input', {bubbles: true}));
        el.dispatchEvent(new Event('change', {bubbles: true}));
    };
    const info = el => ({tag: el.tagName.toLowerCase(), visible: visible(el), enabled: enabled(el),
                         readonly: !!el.readOnly});

    let el;
    if (id) {
        if (!validId(id)) return failure('Invalid stable ID');
        const found = matches(id);
        if (found.length !== 1) return failure(`Expected unique ID ${id}; found ${found.length}`, found.length === 0, {count: found.length});
        el = found[0];
    }
    if (operation === 'snapshot') {
        const root = el || document;
        const candidates = root.querySelectorAll('[id],button,input,textarea,select,a,[role="button"],[contenteditable]');
        const nodes = [];
        const append = node => {
            const rawId = node.id || '';
            const usable = rawId.length <= 120 && validId(rawId);
            // Do not return input values, labels, page text, HTML or storage.
            nodes.push({id: rawId.slice(0, 120), selector: usable ? '#' + rawId : null,
                        duplicate_id: usable ? matches(rawId).length > 1 : false,
                        role: (node.getAttribute('role') || '').slice(0, 40), ...info(node)});
        };
        if (el) append(el);
        for (let i = 0; i < candidates.length && nodes.length < maxNodes; i++) append(candidates[i]);
        return {nodes, truncated: candidates.length + (el ? 1 : 0) > nodes.length};
    }
    if (['scroll', 'scroll_state'].includes(operation) && !el) el = document.scrollingElement || document.documentElement;
    if (!el) return failure('An element ID is required');
    const state = {count: 1, ...info(el)};
    if (operation === 'scroll_state') return {...state, x: Number(el.scrollLeft), y: Number(el.scrollTop)};
    if (operation === 'read') {
        if (data && data.assertion) {
            if (data.assertion === 'assert_text') {
                const text = el.textContent || '';
                return {...state, matches: data.exact ? text === data.text : text.includes(data.text)};
            }
            if (data.assertion === 'assert_value') return {...state, matches: String(el.value === undefined ? '' : el.value) === data.value};
            if (data.assertion === 'assert_checked') return {...state, checked: !!el.checked,
                checkable: ['checkbox', 'radio'].includes(el.type)};
            return state;
        }
        return {...state, text: el.textContent || '', value: el.value, checked: !!el.checked,
                checkable: ['checkbox', 'radio'].includes(el.type)};
    }
    if (!state.visible) return failure(`Element ${id || 'document'} is hidden`, true, state);
    if (!state.enabled) return failure(`Element ${id || 'document'} is disabled or inert`, true, state);

    // All checks before dispatch are safe to poll. After dispatch no retry is allowed.
    if (operation === 'click') {
        if (typeof el.click !== 'function') return failure('DOM click is unsupported', false, state);
        if (prepare) return {ok: true, ...state};
        el.click();
    } else if (operation === 'fill') {
        const editableContent = el.isContentEditable || el.getAttribute('contenteditable') === 'true';
        if (el.readOnly) return failure(`Element ${id} is readonly`, true, state);
        if (!editableContent && !['INPUT', 'TEXTAREA'].includes(el.tagName)) return failure('fill needs an input, textarea or contenteditable', false, state);
        if (el.tagName === 'INPUT' && ['file', 'checkbox', 'radio', 'button', 'submit', 'reset', 'image', 'hidden'].includes(el.type))
            return failure('Input type does not support fill', false, state);
        if (prepare) return {ok: true, ...state};
        if (typeof el.focus === 'function') el.focus();
        if (editableContent) el.textContent = String(data);
        else {
            const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
            if (descriptor && descriptor.set) descriptor.set.call(el, String(data));
            else el.value = String(data);
        }
        changed(el);
    } else if (operation === 'select') {
        if (el.tagName !== 'SELECT') return failure('select needs a native select', false, state);
        const values = Array.isArray(data) ? data.map(String) : [String(data)];
        if (!el.multiple && values.length !== 1) return failure('Single select needs exactly one value', false, state);
        for (const value of values) {
            const option = Array.from(el.options).find(item => item.value === value);
            if (!option) return failure('Select option not ready', true, state);
            if (option.disabled || (option.parentElement.tagName === 'OPTGROUP' && option.parentElement.disabled))
                return failure('Select option is disabled', true, state);
        }
        if (prepare) return {ok: true, ...state};
        for (const option of el.options) option.selected = values.includes(option.value);
        changed(el);
    } else if (operation === 'check') {
        if (!['checkbox', 'radio'].includes(el.type)) return failure('check needs a checkbox or radio', false, state);
        if (el.type === 'radio' && !data && el.checked) return failure('A checked radio cannot be unchecked by click', false, state);
        if (prepare) return {ok: true, ...state, checked: !!el.checked};
        if (el.checked !== data) el.click();
        if (el.checked !== data) return failure('Checked state did not change; action was dispatched', false, state);
    } else if (operation === 'press') {
        if (typeof KeyboardEvent !== 'function') return failure('KeyboardEvent is unsupported', false, state);
        if (prepare) return {ok: true, ...state};
        if (typeof el.focus === 'function') el.focus();
        el.dispatchEvent(new KeyboardEvent('keydown', {key: data, bubbles: true, cancelable: true}));
        el.dispatchEvent(new KeyboardEvent('keyup', {key: data, bubbles: true, cancelable: true}));
    } else if (operation === 'scroll') {
        // Lightpanda can have scroll stubs. Verify offsets instead of reporting success.
        const before = {x: Number(el.scrollLeft), y: Number(el.scrollTop)};
        if (!Number.isFinite(before.x) || !Number.isFinite(before.y)) return failure('Scroll offsets are unsupported', false, state);
        if (prepare) return {ok: true, ...state};
        const requested = {x: before.x + data.x, y: before.y + data.y};
        el.scrollLeft = requested.x;
        el.scrollTop = requested.y;
        const after = {x: Number(el.scrollLeft), y: Number(el.scrollTop)};
        const moved = after.x !== before.x || after.y !== before.y;
        if (!moved && (data.x || data.y)) return failure('Scroll did not move: boundary or unsupported layout; action was attempted', false, state);
        el.dispatchEvent(new Event('scroll', {bubbles: false}));
        return {ok: true, before, after, semantics: 'DOM offsets and scroll event; no visual or virtual-list guarantee'};
    } else return failure('Unsupported DOM operation');
    return {ok: true};
}
