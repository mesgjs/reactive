/*
 * reactive_bundle - Reactive bundle manager
 * Returns a potentially-nested, reactive proxy object for the
 * mixed-array-and/or-object structure (bundle) supplied as the
 * initial value.
 *
 * Copyright 2023-2025 by Kappa Computer Solutions, LLC and Brian Katzung
 * Author: Brian Katzung <briank@kappacs.com>
 *
 *
 * proxy.member = value		// Set a member to a value. Non-reactive
 * 				// values are promoted.
 * proxy.member			// Get the member's reactive
 * proxy.member.rv		// Get the member's current value if basic
 * proxy._			// A collection of member reactives
 * proxy.__			// A reactive for the bundle itself
 */
function reactiveBundle (iv, opts = {}) {
    // Don't proxy reactive bundles or non-objects.
    if (typeof iv !== 'object' || iv?.$reactive) return iv;
    const sym = Symbol.for('reactiveBundle');
    if (iv[sym]) return iv[sym];

    // The target object stores the reactives.
    const isArray = Array.isArray(iv);
    const t = isArray ? [] : {}, rbs = { r: reactive(), isArray, opts };
    const rb = reactiveBundle, h = rb._handler;
    Object.defineProperty(t, rb.$rbs, { value: rbs });
    if (isArray) rbs.length = reactive({ v: iv.length });
    for (const key of Object.keys(iv)) h.set(t, key, iv[key]);
    const p = rbs.r.wv = new Proxy(t, h);
    Object.defineProperty(iv, sym, { value: p });
    return p;
}
Object.defineProperties(reactiveBundle, {
    $rbs: { value: Symbol.for('rbs') },	// Reactive Bundle Symbol
    type: { value: 2 },			// Type 2: bundle proxy
});

(function (rb) {
const indpat = /^(?:0|[1-9]\d*)$/;	// Index key pattern
const batch = reactive.batch, fv = reactive.fv;
const aBatchFn = (th, fnn, ...a) => batch(() => {
    const res = Array.prototype[fnn].apply(th, a);
    rb._handler._rbs(th).length.wv = th._.length;
    return Array.isArray(res) ? rb(res) : res;
});
// deno-lint-ignore no-unused-vars
const h = rb._handler = {
    /* BEGIN ARRAY-VERSION METHODS */
    _arrayMeth: {
	concat (...a) { return aBatchFn(this, 'concat', ...a); },
	filter (cb) { return aBatchFn(this, 'filter', cb); },
	flat (...a) { return aBatchFn(this, 'flat', ...a); },
	flatMap (...a) { return aBatchFn(this, 'flatMap', ...a); },
	join (sep = ',') { return this._bundle().join(sep); },
	map (cb) { return aBatchFn(this, 'map', cb); },
	pop () { return aBatchFn(this, 'pop'); },
	push (...a) { return aBatchFn(this, 'push', ...a); },
	shift () { return aBatchFn(this, 'shift'); },
	slice (...a) { return aBatchFn(this, 'slice', ...a); },
	sort (...a) { return aBatchFn(this, 'sort', ...a); },
	splice (...a) { return aBatchFn(this, 'splice', ...a); },
	toReversed () { return aBatchFn(this, 'toReversed'); },
	toSorted (...a) { return aBatchFn(this, 'toSorted', ...a); },
	toSpliced (...a) { return aBatchFn(this, 'toSpliced', ...a); },
	toString () { return this._bundle().toString(); },
	unshift (...a) { return aBatchFn(this, 'unshift', ...a); },
    },
    /* END ARRAY-VERSION METHODS */

    _bundle () {                        // Non-reactive underlying bundle
        const res = Array.isArray(this._) ? [] : {};
        for (const key of Object.keys(this._)) res[key] = fv(this._[key], true);
        return (this.__.rv, res);
    },

    // Delete an item from the object
    deleteProperty (t, k) {
	const rbs = h._rbs(t), ho = Object.hasOwn(t, k);
	const adp = ho || (rbs.isArray && indpat.test(k) && k >= 0 && k < t.length);
	if (ho) {
	    delete t[k];
	    rbs.r.ripple();
	}
	return adp;
    },
    get (t, k) {			// Get an item in the object
	const rbs = h._rbs(t);
	rbs.r.rv;			// Add bundle dependency
	if (typeof k === 'symbol') return t[k];

	// Handle array special-cases next
	if (rbs.isArray) switch (k) {
	case 'length': return rbs.length;

	case 'concat':
	case 'filter':
	case 'flat':
	case 'flatMap':
	case 'join':
	case 'map':
	case 'pop':
	case 'push':
	case 'shift':
	case 'slice':
	case 'sort':
	case 'splice':
	case 'toReversed':
	case 'toSorted':
	case 'toSpliced':
	case 'toString':
	case 'unshift':
	    return h._arrayMeth[k];
	}

	switch (k) {
	// proxy._ returns the target.
	// (proxy._.member is that member's reactive.)
	case '_': return t;
	// proxy.__ returns the proxy's reactive.
	case '__': return rbs.r;
	// Infrastructure-related functions
	case '_bundle': return h._bundle;
	case '$reactive': return rb.type;
	case 'toString': return h._toString;
	default:			// Other values
	    return ((t[k]?.rv?.$reactive === reactiveBundle.type) ? t[k].rv : t[k]);
	}
    },
    has (t, k) {			// Item present in object?
	h._rbs(t).r.rv;
	switch (k) {
	case '_': // Fall through...
	case '__': return true;
	default: return k in t;
	}
    },
    _rbs (t) { return t[rb.$rbs]; },	// Return target's reactive proxy state
    set (t, k, v) {			// Set an item in the object
	const rbs = h._rbs(t);
	switch (k) {
	case '_':			// These are unwritable
	case '__':
	    return false;
	case 'length':
	    if (rbs.isArray) {		// Track array length changes
		t.length = v?.$reactive ? v.rv : v;
		rbs.length.wv = t.length;
		return true;
	    }
	    // Fall through...
	default:
	  {
	    // Store (method) functions and symbol-keyed values as-is
	    if (typeof v === 'function' || typeof k === 'symbol') {
		Object.defineProperty(t, k, { value: v, writable: true, configurable: true });
		return true;
	    }

	    // Reactive member
	    const oldTK = t[k];
	    if (!t[k]?.$reactive) {
		Object.defineProperty(t, k, { value: reactive(), enumerable: true, writable: true, configurable: true });
		t[k].bundle = rbs;
	    }
	    const mr = t[k];
	    reactive.batch(() => {
		if (v?.bundle === rbs) {	// Internal copy
		    if (v.def()) mr.def = v.def(); // Reactive tracking
		    else mr.wv = v.rv;		// Static value
		} else if (v?.$reactive) {	// External reactive(Bundle?)
		    if (v.$reactive === reactive.type) mr.def = v;
		    else mr.wv = v;
		} else if (typeof v === 'object' && !rbs.opts?.shallow) mr.wv = rb(v);
		else mr.wv = v;
		if (!oldTK) {
		    if (rbs.isArray) rbs.length.wv = t.length;
		    rbs.r.ripple();	// Ripple when adding new values
		}
	    });
	    return true;
	  }
	}
    },
    _toString () { return '[Reactive Bundle]'; },
};

/*
 * Update values in-place in the destination bundle from the source
 * object or array.
 */
rb.update = function update(bundle, src) {
    reactive.batch(() => {
	if (Array.isArray(bundle)) {	// Array mode
	    if (typeof src?._bundle === 'function') src = src._bundle();
	    // Splice bundle values not in src
	    for (const key of Object.keys(bundle).reverse()) if (!src.includes(fv(bundle[key]))) bundle.splice(key, 1);
	    // Push src values not in bundle
	    const has = bundle._bundle();
	    for (const val of Object.values(src)) if (!has.includes(val)) {
		bundle.push(val);
		has.push(val);
	    }
	} else {			// Object mode
	    // Delete bundle keys not in src
	    for (const key of Object.keys(bundle)) if (!Object.hasOwn(src, key)) delete bundle[key];
	    // Add or overwrite bundle key/values from src
	    Object.assign(bundle, src);
	}
    });
    return bundle;
}
})(reactiveBundle);
