all: reactive.esm.js reactive_bundle.esm.js reactive_input.esm.js

reactive.esm.js: reactive.js reactive-export.js
	sed -e '/\/\/ END/d' reactive.js reactive-export.js > reactive.esm.js
	echo // END >> reactive.esm.js

reactive_bundle.esm.js: reactive.js reactive_bundle.js reactive_bundle-export.js
	sed -e '/\/\/ END/d' reactive.js reactive_bundle.js reactive_bundle-export.js > reactive_bundle.esm.js
	echo // END >> reactive_bundle.esm.js

reactive_input.esm.js: reactive.js reactive_bundle.js reactive_input.js reactive_input-export.js
	sed -e '/\/\/ END/d' reactive.js reactive_bundle.js reactive_input.js reactive_input-export.js > reactive_input.esm.js
	echo // END >> reactive_input.esm.js
