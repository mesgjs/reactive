/*
 * ReactiveInput(Group) - Manage a collection of reactive input bindings
 *
 * Copyright 2024-2025 by Kappa Computer Solutions, LLC and Brian Katzung
 * Author: Brian Katzung <briank@kappacs.com>
 */
class ReactiveInputGroup {
    constructor () {
	this._inputs = [];
	this._idMap = {};
	this._nameMap = {};
    }

    // Add inputs to the group
    add (...inputs) {
	const bundle = this._bundle;
	for (let input of inputs) {
	    if (input?.length !== undefined) this.add(...input);
	    else {
		// Accept either a ReactiveInput or options for one
		if (!input.isReactiveInput) input = new ReactiveInput(input);
		this._inputs.push(input);
		input.bindGroup(this);
		const name = input.name, key = input.key;
		if (name) this._nameMap[name] = input;
		for (const id of input.ids) this._idMap[id] = input;
	    }
	}
	return this;
    }

    // Bind to storage (a supplied or JIT-allocated bundle)
    bindStorage (bundle = undefined) {
	this._bundle = bundle || reactiveBundle({});
	return this;
    }

    // Bind HTML elements to associated reactive inputs
    bindHTML (...elements) {
	const ris = new Set;
	for (const el of elements) {
	    if (el.length && !el.tagName) this.bindHTML(...el);
	    else if (el.id && this._idMap[el.id]) {
		const inp = this._idMap[el.id];
		ris.add(inp);
		inp.bindHTML(el);
	    } else if (el.name && this._nameMap[el.name]) {
		const inp = this._nameMap[el.name];
		ris.add(inp);
		inp.bindHTML(el);
	    }
	}
	// Also activate the newly-bound inputs
	for (const ri of ris) ri.init();
    }

    get inputs () { return this._inputs; }

    get storage () {
	if (!this._bundle) this.bindStorage();
	return this._bundle;
    }

}

class ReactiveInput {
    static _textEvents = [ 'blur', 'input', 'keydown', 'paste' ];

    /*
     * Options:
     *   bubble - if the 'code' event should also bubble
     *   defaultValue - used when stored value is undefined
     *   filter - text input filtering ("live validation") callback
     *   id or ids[] - member element ids
     *   key - storage key
     *   multiple - multi-valued input (boolean)
     *   name - input [name] attribute
     *   notify - dispatch input 'code' event upon programmatic change
     *   onKeyDown - key-down event hook
     *   validate - validation callback
     */
    constructor (opts = {}) {
	this._opts = opts;
	this._ids = opts.ids || (opts.id ? [ opts.id ] : []);
	this._elements = [];
	this._textMode = opts.textMode; // change or input
	this._onEvent = Object.getPrototypeOf(this)._onEvent.bind(this);
	// ._cancelValue - revert-to value when cancelling a text edit
	// .group - the associated reactive input group
	// ._isActive - this is a textual input with focus
	// ._textValue - tracks the input value in input textmode
    }

    get elements () { return this._elements; }
    get ids () { return this._ids; }
    get isReactiveInput () { return true; }
    get key () { return this._opts.key || this._opts.name; }
    get name () { return this._opts.name; }
    get multiple () { return this._opts.multiple; }

    // Bind input to group
    bindGroup (group) {
	this.group = group;
	const sto = group.storage, key = this.key, dv = this._opts.defaultValue;
	if (sto[key] === undefined) sto[key] = (dv !== undefined) ? dv : (this._opts.multiple ? [] : '');
	reactive({ eager: true, def: () => this._setHTML(reactive.fv(sto[key], true)) });
    }

    // Bind HTML elements
    bindHTML (...elements) {
	for (const el of elements) if (!this._elements.includes(el)) {
	    this._elements.push(el);
	    el.addEventListener('change', this._onEvent);
	    if (this._textMode) el.addEventListener('focus', this._onEvent);
	}
    }

    _cancel () {
	this._set(this._cancelValue);
	this._setHTML(this._cancelValue, true);
    }

    // Get value(s) from associated HTML inputs
    _getHTML () {
	let value = new Set;
	for (const el of this._elements) switch (el.tagName) {
	case 'INPUT':		// <input>
	    switch (el.type) {
	    case 'button':	// Non-input <input>
	    case 'reset':
	    case 'submit':
		break;
	    case 'checkbox':	// Fixed-value <input>
	    case 'radio':
		if (el.checked) value.add(el.value);
		break;
	    default:		// Text(-like) <input>
		value.add(el.value);
		break;
	    }
	    break;
	case 'SELECT':		// Drop-down
	    [...el.selectedOptions].forEach(opt => value.add(opt.value));
	    break;
	case 'TEXTAREA':	// Multi-line
	    value.add(el.value);
	    break;
	}
	value = [...value.values()];
	return (this._opts.multiple ? value : value[0]);
    }

    init () { this._setHTML(reactive.fv(this.group.storage[this.key], true)); }

    // Unified HTML event handler
    _onEvent (e) {
	switch (e.type) {
	case 'blur':
	    if (this._textMode) {
		for (const ev of ReactiveInput._textEvents) e.target.removeEventListener(ev, this._onEvent);
		this._isActive = false;
	    }
	    break;

	case 'change':
	    if (this._textMode && this._validate && !this._validate()) {
		// Revert change on failed validation
		this._cancel();
		return;
	    }
	    this._set(this._getHTML());
	    break;

	case 'focus':
	    if (this._textMode) {
		this._textValue = this._cancelValue = e.target.value;
		this._isActive = true;
		for (const ev of ReactiveInput._textEvents) e.target.addEventListener(ev, this._onEvent);
	    }
	    break;

	case 'input':
	case 'paste':
	    // Filter content if filter supplied
	    this._filter?.(e);
	    if (this._opts.textMode === 'input') this._set(this._textValue = this._getHTML());
	    break;

	case 'keydown':
	    if (this._isActive && e.key === 'Escape' && !e.ctrlKey && !e.shiftKey) {
		this._cancel();
		return;
	    }
	    this._onKeyDown?.(e);
	    break;
	}
    }

    // Set value in group storage
    _set (value) {
	const sto = this.group?.storage;
	if (sto) {
	    const key = this.key;
	    if (sto[key]?.$reactive === reactiveBundle.type) reactiveBundle.update(sto[key], value);
	    else sto[key] = value;
	}
    }

    // Update HTML inputs from value(s)
    _setHTML (value, force = false) {
	if (!force && this._isActive) {
	    /*
	     * Unless actually cancelling, just save the value for
	     * potential cancellation if actively editing (assuming
	     * this is not simply an input-mode reaction to the text
	     * value changing).
	     */
	    if (value !== this._textValue) this._cancelValue = value;
	    return;
	}

	if (!Array.isArray(value)) value = [ value ];
	const changed = [];
	let nv, incrChg;
	for (const el of this._elements) switch (el.tagName) {
	case 'INPUT':
	    switch (el.type) {
	    case 'button':	// Non-input <input>
	    case 'reset':
	    case 'submit':
		continue;
	    case 'checkbox':	// Fixed-value <input>
	    case 'radio':
		nv = value.includes(el.value);
		if (nv !== el.checked) {
		    if (nv) el.checked = true;
		    else el.checked = false;
		    changed.push(el);
		}
		break;
	    default:		// Text(-like) input
		nv = value[0].toString();
		if (el.value !== nv) {
		    el.value = nv;
		    changed.push(el);
		}
		break;
	    }
	    break;
	case 'SELECT':		// Drop-down
	    incrChg = false;
	    for (const opt of el.options) {
		nv = value.includes(opt.value);
		if (nv !== opt.selected) {
		    if (nv) opt.selected = true;
		    else opt.selected = false;
		    incrChg = true;
		}
	    }
	    if (incrChg) changed.push(el);
	    break;
	case 'TEXTAREA':	// Multi-line
	    nv = value[0].toString();
	    if (el.value !== nv) {
		el.value = nv;
		changed.push(el);
	    }
	    break;
	}
	if (this._opts.notify && changed.length) {
	    const cev = new Event('code', { bubbles: this._opts.bubble });
	    for (const el of changed) el.dispatchEvent(cev);
	}
    }

}

// END
