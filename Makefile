all: reactive.mjs reactive_bundle.mjs reactive_input.mjs

reactive.mjs: reactive.js reactive-export.js
	sed -e '/\/\/ END/d' reactive.js reactive-export.js > reactive.mjs
	echo // END >> reactive.mjs

reactive_bundle.mjs: reactive.js reactive_bundle.js reactive_bundle-export.js
	sed -e '/\/\/ END/d' reactive.js reactive_bundle.js reactive_bundle-export.js > reactive_bundle.mjs
	echo // END >> reactive_bundle.mjs

reactive_input.mjs: reactive.js reactive_bundle.js reactive_input.js reactive_input-export.js
	sed -e '/\/\/ END/d' reactive.js reactive_bundle.js reactive_input.js reactive_input-export.js > reactive_input.mjs
	echo // END >> reactive_input.mjs
