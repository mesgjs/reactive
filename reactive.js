/*
 * reactive
 * A reactive value library supporting memoization and per-value
 * selection of lazy or eager, chain-less dependency evaluation.
 *
 * Copyright 2023 by Kappa Computer Solutions, LLC and Brian Katzung
 * Author: Brian Katzung <briank@kappacs.com>
 */

function reactive (opts = {}) {
    const r = Object.setPrototypeOf({
	_v: opts.v,			// Current value
	_cmp: opts.cmp,			// Comparison function/value
	_rdy: true,			// Ready?
	_eager: opts.eager,		// Eager function eval
	_pros: [],			// Providers
	_cons: [],			// Consumers
	// _busy: false,		// Currently evaluating definition
	// _def: undefined,		// Reactive definition/memo/effect
	// _g: undefined,		// Getter function
	// _rov: undefined,		// Read-only view
	// _sched: false,		// Currently scheduled for eval
	// _s: undefined,		// Setter function

    }, reactive._prototype);

    if (opts.cmp === undefined) r._cmp = r._defcmp;
    if (opts.def) r.def = opts.def;

    return r;
}

(r => {
    r._prototype = {
	/* PUBLIC ATTRIBUTES */
	get cmp () { return this._cmp; },
	get def () { return this._defMeth; },
	set def (d) {			// Set/change/clear definition
	    if (d === undefined) {	// Clear
		if (this._def) {
		    this.provider(null);
		    delete this._def;
		    this._rdy = true;
		}
	    } else if (typeof d === 'function') {
		// Set/change
		this.provider(null);
		this._def = d;
		this._rdy = false;
		this._schedule();
	    } else if (d?.$reactive === reactive.type) {
		// Clone a reactive value using its getter function
		this.def = d.gf;
	    }
	},
	get eager () { return this._eagerMeth; },
	set eager (e) {			// Change def eval eagerness
	    this._eager = e;
	    this._schedule();
	},
	get gf () {			// Return getter function
	    if (!this._g) this._g = (function () { return this.rv; }).bind(this);
	    return this._g;
	},
	// Return [getter, setter] pair
	get gsp () { return [this.gf, this.sf]; },
	get $reactive () { return r.type; },
	get readonly () { return false; },
	get rov () {			// Get read-only view
	    if (!this._rov) {
		const r = this;
		r._rov = Object.freeze({
		    get gf () { return r.gf; },
		    get $reactive () { return r.type; },
		    get readonly () { return true; },
		    get rv () { return r.rv; },
		    toString () { return r.rv.toString(); },
		    valueOf () { return r.rv; },
		});
	    }
	    return this._rov;
	},
	get rv () {			// Current value (readable)
	    if (this._sched) {
		// We're evaluating now, so remove from queue
		this._sched = false;
		r._queueEval(this, false);
	    }
	    if (r._consumer && !r._untrack) {
		// Producer-consumer tracking
		this.consumer(r._consumer);
		r._consumer.provider(this);
	    }
	    if (!this._checkReady()) {	// Recompute defined value?
		// Croak if trying to recursively reference our reactive
		// in order to define our value
		if (this._busy) throw new ReferenceError('Self-referential reactive definition');
		// Providers can change every iteration; start fresh
		this.provider(null);
		const pc = r._consumer;	// Save previous consumer
		r._consumer = this;	// We're the consumer now
		this._busy = true;	// For recursive def detection
					// Evaluate definition
		try {
		    const res = this._def(this._v);
		    this._busy = false;
		    r._consumer = pc;	// Restore previous consumer
		    this._setNotify(res);
		} catch (e) {		// Try to clean up, unwind on error
		    this._busy = false;
		    r._consumer = pc;
		    throw e;
		}
	    }
	    return this._v;
	},
	get sf () {			// Return setter function
	    if (!this._s) this._s = (function (vvf) { return this._set(vvf); }).bind(this);
	    return this._s;
	},
	get wv () { return this.rv; },	// Writable value
	set wv (v) {
	    // Setting a static value clears any existing definition.
	    // Unlike the setter function, a functional v is not special.
	    if (this._def) this.def = undefined;
	    this._setNotify(v);
	},
	/* PUBLIC METHODS */
	consumer (c, add = true) {	// Add/remove consumer
	    if (!add) this._cons = this._cons.filter(i => i !== c);
	    else if (!this._cons.includes(c)) this._cons.push(c);
	},
	provider (p, add = true) {	// Add/remove/remove all provider(s)
	    if (p === null) {
		// Unsub from, and clear, all current providers
		for (const cp of this._pros) cp.consumer(this, false);
		this._pros = [];
	    }
	    else if (!add) this._pros = this._pros.filter(i => i !== p);
	    else if (!this._pros.includes(p)) this._pros.push(p);
	},
	// Ripple ready-state changes through consumers
	ripple (dis = 0) {
	    // Distance 0: our value changed
	    // Distance 1: an adjacent value changed
	    // Distance >1: a more distant value changed; our recalc may or
	    //   may not be required depending on intermediate results
	    const wasReady = this._rdy;
	    if (dis === 1) this._rdy = false;
	    if (dis > 1 && this._rdy) this._rdy = undefined;
	    // Ripple if local or transitioning from ready
	    if (!dis || (wasReady && !this._rdy)) {
		++r._evalWait;
		const nxt = dis + 1;
		for (const con of this._cons) con.ripple(nxt);
		--r._evalWait;
	    }
	    this._schedule();		// Call me, maybe!
	},
	set (vvf) {			// Chainable set
	    // e.g. .eager(0).set(v0).def(v => f(v)).eager(1)
	    // Accepts a value or a mapping function (like sf(vvf)).
	    this._set(vvf);
	    return this;
	},
	toString () { return this.rv.toString(); },
	unready () {			// Force unready
	    if (this._def) this._rdy = false;
	    this._schedule();
	    return this;
	},
	valueOf () { return this.rv; },
	/* PRIVATE METHODS */
	_checkReady () {		// Determine boolean readiness
	    if (this._rdy !== undefined) return this._rdy;
	    /*
	     * When the readiness is undefined, check providers for ripple
	     * changes. If any provider has changed, we must recalculate too.
	     */
	    for (const pro of this._pros) {
		// Provider changes will be rippled to us (d=1)
		pro.rv;
		if (this._rdy === false) return false;
	    }
	    /*
	     * No providers rippled a change to us during (recursive)
	     * dependency checking, so we're actually still ready!
	     */
	    return (this._rdy = true);
	},
	_defcmp (a, b) { return a !== b; },// Default comparison function
	_defMeth (...d) {		// def method
	    if (!d.length) return this._def;
	    this.def = d[0];
	    return this;
	},
	_eagerMeth (...e) {		// eager method
	    if (!e.length) return this._eager;
	    this.eager = e[0];
	    return this;
	},
	_schedule () {			// Schedule for eval if needed
	    if (!this._rdy && !this._sched && (this._eager || this._cons.length)) {
		this._sched = true;
		r._queueEval(this);
	    }
	    r.run();
	},
	_set (vvf) {			// Prototype setter
	    // Setting a static value clears any existing definition.
	    // Accepts a value or an old-to-new-value mapping function.
	    if (this._def) this.def = undefined;
	    if (typeof vvf === 'function') this._setNotify(vvf(this._v));
	    else this._setNotify(vvf);
	    return this._v;
	},
	// Set value; ripple-notify consumers of changes
	_setNotify (v) {
	    const chg = (typeof this._cmp === 'function') ? this._cmp(this._v, v) : this._cmp;
	    this._v = v;
	    this._rdy = true;
	    if (chg) this.ripple();
	},
    };

    Object.assign(r, {
	_evalWait: 0,			// Suspend evaluation
	_untrack: 0,			// Suspend tracking
	_evalQ: [],			// Reactive eval queue
	// _curEval: undefined,		// Most recently dequeued reactive
	/* PUBLIC METHODS */
	batch (cb) {			// Execute callback as a batch
	    ++r._evalWait;
	    const res = cb();
	    --r._evalWait;
	    r.run();
	    return res;
	},
	run () {			// Run the eval queue (maybe)
	    if (!r._evalWait) {
		++r._evalWait;
		for (let i; i = r._curEval = r._evalQ.shift(); i.rv);
		--r._evalWait;
	    }
	},
	get type () { return 1; },	// Type 1: basic direct
	typeOf (v) { return v?.$reactive; },// Reactive type, if any
	untracked (cb) {		// Execute callback untracked
	    ++r._untrack;
	    const res = cb();
	    --r._untrack;
	    return res;
	},
	/* PRIVATE METHODS */
	_queueEval (ro, add = true) {	// (De)queue reactive evaluation
	    // false: remove; true: unconditional add; other: conditional add
	    if (!add) {
		// No need to filter if we *just* dequeued it
		if (ro !== r._curEval) r._evalQ = r._evalQ.filter(i => i !== ro);
	    }
	    else if (typeof add !== 'boolean') r._evalQ.push(ro);
	    else if (!r._evalQ.includes(ro)) r._evalQ.push(ro);
	},
    });
})(reactive);

// END
