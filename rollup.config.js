import terser from "npm:@rollup/plugin-terser";

export default [
{
    input: 'src/reactive.esm.js',
    output: [
	{
	    file: 'dist/reactive.min.esm.js',
	    format: 'es',
	    plugins: [terser()],
	    sourcemap: true,
	},
	{
	    file: 'dist/reactive.umd.js',
	    exports: 'named',
	    format: 'umd',
	    name: 'reactive',
	},
	{
	    file: 'dist/reactive.min.umd.js',
	    exports: 'named',
	    format: 'umd',
	    name: 'reactive',
	    plugins: [terser()],
	    sourcemap: true,
	},
    ],
},
{
    input: 'src/reactive_bundle.esm.js',
    output: [
	{
	    file: 'dist/reactive_bundle.min.esm.js',
	    format: 'es',
	    plugins: [terser()],
	    sourcemap: true,
	},
	{
	    file: 'dist/reactive_bundle.umd.js',
	    exports: 'named',
	    format: 'umd',
	    name: 'reactive',
	},
	{
	    file: 'dist/reactive_bundle.min.umd.js',
	    exports: 'named',
	    format: 'umd',
	    name: 'reactive',
	    plugins: [terser()],
	    sourcemap: true,
	},
    ],
},
];
