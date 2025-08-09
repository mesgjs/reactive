# Reactive

A reactive value library supporting memoization and per-value selection of lazy or eager, chain-less dependency evaluation.

## Overview

Reactive values in this implementation work similarly to spreadsheet cells. Each reactive value can either:
- Hold a direct value
- Contain a definition (formula) that calculates its value based on other reactive values

When a reactive value changes (through direct assignment or recalculation of its definition), any other reactive values that depend on it are automatically updated. This creates a dependency graph where changes propagate automatically.

By default, recalculations are performed lazily (only when the value is accessed). However, you can enable eager evaluation for reactives that need to trigger side effects immediately when their dependencies change.

## Creating a Reactive Value

```javascript
const r = reactive({ options })
```

Options:
- `compare`: Comparison function to determine if value changed. Default: `(old, new) => old !== new`
- `def`: Definition function `old => new` or another reactive value to track
- `eager`: If truthy, enables eager recalculation (default: undefined for lazy)
- `v`: Initial value (default: undefined)

## Core Concepts

### Lazy vs Eager Evaluation

- **Lazy** (default): Values are only recalculated when accessed through `.rv`, `.wv`, or `.getter()`
- **Eager**: Values are recalculated immediately when dependencies change

### Value Access

- `.rv` - Read the current value (read-only)
- `.wv` - Read/write the current value (assignment clears any definition)
- `.getter()` - Get a function that returns the current value
- `.setter()` - Get a function that sets a new value

### Definitions

Definitions are functions that compute a reactive's value based on other values:

```javascript
// Direct definition
r.def = oldValue => newValue;

// Track another reactive
r.def = otherReactive;  // Shorthand for r.def = otherReactive.getter
```

## API Reference

### Static Methods

#### `reactive.batch(callback)`
Execute changes as a batch, deferring updates until completion.
- Returns: Callback return value

#### `reactive.fv(v, bundle = false)`
Get the final non-reactive value.
- `bundle`: If true, returns `_bundle()` value for bundles
- Returns: The unwrapped value

#### `reactive.typeOf(v)`
Get the reactive type of a value.
- Returns: `reactive.type`, `reactiveBundle.type`, or `undefined`

#### `reactive.untracked(callback)`
Execute callback without tracking dependencies.
- Returns: Callback return value

#### `reactive.wait()`
Used to wait for reactive recalculations to settle.
- Returns: A promise that resolves when reactive recalculations have settled.

### Instance Properties

#### Value Access
- `rv` - Read current value (computed if defined)
- `wv` - Read/write current value (clears definition on write)
- `getter` - Returns function to get current value
- `setter` - Returns function to set new value
- `accessors` - Returns `[getter, setter]` pair

#### Definition Control
- `def` - Get/set the definition function
- `eager` - Get/set eager evaluation mode
- `compare` - Get the comparison function

#### Read-only Views
- `readonly` - False for main reactive, true for read-only view
- `readonlyView` - Get a read-only view of this reactive
- `$reactive` - The reactive type (reactive.type)

### Instance Methods

#### Value Manipulation
- `set(value | oldValue => newValue)` - Set value (chainable)
- `setDef(def)` - Set definition (chainable)
- `setEager(eager)` - Set eager mode (chainable)
- `unready()` - Force recalculation on next access (chainable)

#### Internal Methods
- `consumer(c, add = true)` - Register/unregister consumer
- `provider(p, add = true)` - Register/unregister provider
- `ripple(distance = 0)` - Propagate changes through dependency graph

## Examples

```javascript
// Basic value tracking
const r1 = reactive({ v: 1 });
r1.rv;  // 1

// Track another reactive
const r2 = reactive({ def: r1 });  // r2.rv === r1.rv

// Compute based on another reactive
const r3 = reactive({ def: () => r1.rv });  // Also tracks r1
const r4 = reactive({ def: () => r3.rv * 2 });  // Double r3's value

// Updating values
++r1.wv;  // r1.rv, r2.rv, r3.rv are now 2
r4.rv;    // 4

// Breaking dependency
r3.set(5);  // r3 no longer tracks r1
r4.rv;      // 10 (double r3's new value)

// Using accessors
const s3 = r3.setter;
const g4 = r4.getter;
s3(v => v + 1);  // Increment using setter function
g4();            // 12 (get r4's value using getter)

// Enable eager evaluation
r4.setEager(1);  // Now recalculates immediately when dependencies change
```

## Best Practices

1. Use `.rv` for read-only access and `.wv` for write access to clarify intent
2. Make reactives with side effects "terminal nodes" (not used in other definitions)
3. Use eager evaluation only when immediate side effects are needed
4. Use the chainable methods (`set`, `setDef`, `setEager`) for fluent configuration
5. Use `batch()` when making multiple related changes to optimize performance
