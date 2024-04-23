/*
 * reactive_bundle - Reactive bundle manager
 * Returns a potentially-nested, reactive proxy object for the
 * mixed-array-and/or-object structure (bundle) supplied as the
 * initial value.
 *
 * Copyright 2023-2024 by Kappa Computer Solutions, LLC and Brian Katzung
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
function reactiveBundle (iv) {
    // Don't proxy reactive bundles or non-objects.
    if (typeof iv !== 'object' || iv?.$reactive) return iv;

    // The target object stores the reactives.
    const isArray = Array.isArray(iv);
    const t = isArray ? [] : {}, rbs = { r: reactive(), isArray };
    const rb = reactiveBundle, h = rb._handler;
    Object.defineProperty(t, rb.$rbs, { value: rbs });
    if (isArray) rbs.length = reactive({ v: iv.length });
    for (const key of Object.keys(iv)) h.set(t, key, iv[key]);
    return rbs.r.wv = new Proxy(t, h);
}
Object.defineProperties(reactiveBundle, {
    $rbs: { value: Symbol.for('rbs') },
    type: { value: 2 },			// Type 2: proxy
});

(function (rb) {
const indpat = /^(?:0|[1-9]\d*)$/;	// Index key pattern
const batch = reactive.batch, fv = reactive.fv;
const aBatchFn = (th, fnn, ...a) => batch(() => {
    const res = Array.prototype[fnn].apply(th, a);
    rb._handler._rbs(th).length.wv = th._.length;
    return Array.isArray(res) ? rb(res) : res;
});
const h = rb._handler = {
    /* BEGIN ARRAY-VERSION METHODS */
    _arrayMeth: {
	concat (...a) { return aBatchFn(this, 'concat', ...a); },
	filter (cb) { return aBatchFn(this, 'filter', cb); },
	flat (...a) { return aBatchFn(this, 'flat', ...a); },
	flatMap (...a) { return aBatchFn(this, 'flatMap', ...a); },
	join (sep = ',') { return this._values().join(sep); },
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
	toString () { return this._values().toString(); },
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

	// Handle array special-cases first
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
	case '_values': return h._values;
	default:			// Other values
	    return t[k]?.$reactive ? t[k].rv : t[k];
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

	    // Promote non-reactive values to reactive values
	    const rv = v?.$reactive ? v : ((typeof v === 'object') ? rb(v) : reactive({ v }));
	    if (!t[k]?.$reactive) {
		Object.defineProperty(t, k, { value: reactive({ v: rv }), enumerable: true, writable: true, configurable: true });
		batch(() => {
		    if (rbs.isArray) rbs.length.wv = t.length;
		    rbs.r.ripple();	// Ripple when adding new values
		});
	    } else t[k].wv = rv;
	    return true;
	  }
	}
    },
    _toString () { return '[Reactive Bundle]'; },
    _values () {			// Return underlying values
	return (this.__.rv, Object.values(this._).map(v => fv(v, true)));
    },
};
})(reactiveBundle);
