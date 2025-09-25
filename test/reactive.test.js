import { reactive } from '../src/reactive.esm.js';
import {
	assert,
	assertEquals,
	assertThrows,
} from "https://deno.land/std@0.122.0/testing/asserts.ts";

Deno.test("Core Functionality", async (t) => {
	await t.step("Basic value setting and getting", () => {
		const a = reactive({ v: 1 });
		assertEquals(a.rv, 1, "a.rv returns initial value");
		a.wv = 2;
		assertEquals(a.rv, 2, "a.rv returns value set by wv");
	});

	await t.step("Definition and dependency tracking", () => {
		const a = reactive({ v: 2 });
		const b = reactive({ def: () => a.rv + 1 });
		assertEquals(b.rv, 3, "b.rv is calculated from a.rv");
		a.wv = 3;
		assertEquals(b.rv, 4, "b.rv is recalculated when a.rv changes");
	});

	await t.step("Setter function", () => {
		const c = reactive({ v: 10 });
		c.setter(v => v * 2);
		assertEquals(c.rv, 20, "setter modifies value with a function");
		c.setter(30);
		assertEquals(c.rv, 30, "setter sets a direct value");
	});

	await t.step("Chainable methods", () => {
		const d = reactive({ v: 0 });
		assertEquals(d.set(1), d, "set is chainable");
		d.set(1).setDef(() => d.rv + 10);
		assertEquals(d.setDef(() => 1), d, "setDef is chainable");
	});
});

Deno.test("Reactive Error Handling", () => {
	const a = reactive({ def: () => { throw new Error("fail A"); } });
	const b = reactive({ def: () => a.rv + 1 });
	const c = reactive({ def: () => b.rv + 1 });

	assertThrows(() => a.rv, Error, "fail A", "a.rv throws expected error");
	assertThrows(() => b.rv, Error, "fail A", "b.rv propagates error from a");
	assertThrows(() => c.rv, Error, "fail A", "c.rv propagates error from b/a");

	assert(a.error && a.error.message.includes("fail A"), "error property exists on a");

	assert(a._rdy, "a is ready after exception");

	assert(a._error, "a._error is not cleared until def changes");

	a.def = () => 42; // Should clear error and re-evaluate
	assertEquals(a.rv, 42, "changing def clears error and value is accessible");

	assertEquals(b.rv, 43, "b.rv recomputes after a's error is cleared");

	assertEquals(c.rv, 44, "c.rv recomputes after b's error is cleared");
});

Deno.test("Lazy and Eager Evaluation", async (t) => {
	await t.step("Lazy evaluation (default behavior)", () => {
		let callCount = 0;
		const a = reactive({ v: 1 });
		const b = reactive({
			def: () => {
				callCount++;
				return a.rv + 1;
			}
		});

		assertEquals(callCount, 0, "b is not evaluated until its value is requested");
		assertEquals(b.rv, 2, "b.rv is calculated on first access");
		assertEquals(callCount, 1, "b definition was called once");
		a.wv = 2;
		assertEquals(callCount, 1, "b is not re-evaluated immediately when a changes");
		assertEquals(b.rv, 3, "b is re-evaluated on next access");
		assertEquals(callCount, 2, "b definition was called a second time");
	});

	await t.step("Eager evaluation", async () => {
		let callCount = 0;
		const a = reactive({ v: 1 });
		const b = reactive({
			eager: true,
			def: () => {
				callCount++;
				return a.rv + 1;
			}
		});

		await reactive.wait();
		assertEquals(callCount, 1, "b is evaluated immediately");
		assertEquals(b.rv, 2, "b.rv has the initial calculated value");
		a.wv = 2;
		await reactive.wait();
		assertEquals(callCount, 2, "b is re-evaluated immediately when a changes");
		assertEquals(b.rv, 3, "b.rv has the new value");
	});
});

Deno.test("Read-only Views", async (t) => {
	await t.step("Read-only view reflects changes", () => {
		const a = reactive({ v: 1 });
		const a_ro = a.readonlyView;

		assertEquals(a_ro.rv, 1, "Read-only view has the correct initial value");
		a.wv = 2;
		assertEquals(a_ro.rv, 2, "Read-only view is updated when the original value changes");
	});

	await t.step("Read-only view cannot be modified", () => {
		const a = reactive({ v: 1 });
		const a_ro = a.readonlyView;

		assert(a_ro.readonly, "Read-only view has the readonly property set to true");
		assertThrows(() => { a_ro.wv = 2; }, TypeError, undefined, "Attempting to set wv on a read-only view throws an error");
		assertEquals(a.rv, 1, "Original value is unchanged after attempting to modify the read-only view");
	});
});

Deno.test("Batching", async (t) => {
	await t.step("batch() delays re-evaluation", async () => {
		let callCount = 0;
		const a = reactive({ v: 1 });
		const b = reactive({ v: 2 });
		const c = reactive({
			def: () => {
				callCount++;
				return a.rv + b.rv;
			}
		});

		assertEquals(c.rv, 3, "c has correct initial value");
		assertEquals(callCount, 1, "c was evaluated once");

		reactive.batch(() => {
			a.wv = 2;
			b.wv = 3;
			assertEquals(c._rdy, false, "c is marked as not ready within a batch");
		});

		assertEquals(c.rv, 5, "c has the correct value after batch update");
		assertEquals(callCount, 2, "c was re-evaluated only once for the entire batch");
	});
});

Deno.test("Untracked Execution", async (t) => {
	await t.step("untracked() prevents dependency tracking", () => {
		const a = reactive({ v: 1 });
		const b = reactive({ v: 2 });
		let callCount = 0;
		const c = reactive({
			def: () => {
				callCount++;
				return a.rv + reactive.untracked(() => b.rv);
			}
		});

		assertEquals(c.rv, 3, "c has correct initial value");
		assertEquals(callCount, 1, "c was evaluated once");
		a.wv = 2; // This should trigger a re-evaluation
		assertEquals(c.rv, 4, "c is re-evaluated when a changes");
		assertEquals(callCount, 2, "c was re-evaluated");

		b.wv = 3; // This should NOT trigger a re-evaluation
		assertEquals(c.rv, 4, "c's value remains the same when b changes");
		assertEquals(callCount, 2, "c was not re-evaluated");
	});
});

Deno.test("Custom Comparison Function", async (t) => {
	await t.step("Custom comparison function prevents unnecessary re-evaluations", () => {
		let callCount = 0;
		const a = reactive({
			v: { value: 1 },
			compare: (v1, v2) => v1?.value !== v2?.value
		});
		const b = reactive({
			def: () => {
				callCount++;
				return a.rv;
			}
		});

		assertEquals(b.rv.value, 1, "b has the correct initial value");
		assertEquals(callCount, 1, "b was evaluated once");

		a.wv = { value: 1 }; // Same value, different object
		assertEquals(b.rv.value, 1, "b's value is unchanged");
		assertEquals(callCount, 1, "b was not re-evaluated because of custom comparison function");

		a.wv = { value: 2 }; // New value
		assertEquals(b.rv.value, 2, "b's value is updated");
		assertEquals(callCount, 2, "b was re-evaluated because the value changed");
	});
});

Deno.test("Getters and Accessors", async (t) => {
	await t.step("Verifies instance equality for getter, setter, and accessors", () => {
		const a = reactive({ v: 1 });
		const getter = a.getter;
		const setter = a.setter;
		const accessors = a.accessors;

		assertEquals(getter, a.getter, "Getter instance is stable");
		assertEquals(setter, a.setter, "Setter instance is stable");
		assertEquals(accessors[0], getter, "Accessors getter is the same instance");
		assertEquals(accessors[1], setter, "Accessors setter is the same instance");
	});

	await t.step("Verifies instance equality for read-only view getter", () => {
		const a = reactive({ v: 1 });
		const a_ro = a.readonlyView;
		const getter = a.getter;
		const ro_getter = a_ro.getter;

		assertEquals(getter, ro_getter, "Read-only view getter is the same instance as the original");
	});
});
