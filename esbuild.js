const esbuild = require("esbuild");

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
			console.log('[watch] build started');
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				console.error(`    ${location.file}:${location.line}:${location.column}:`);
			});
			console.log('[watch] build finished');
		});
	},
};

async function main() {
	const ctx = await esbuild.context({
		entryPoints: [
			'src/extension.ts'
		],
		bundle: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'node',
		outfile: 'dist/extension.js',
		external: ['vscode'],
		logLevel: 'silent',
		plugins: [
			/* add to the end of plugins array */
			esbuildProblemMatcherPlugin,
			{
				name: 'copy-swagger-ui',
				setup(build) {
					build.onEnd(async () => {
						const fs = require('fs');
						const path = require('path');
						const srcDir = path.resolve(__dirname, 'node_modules/swagger-ui-dist');
						const destDir = path.resolve(__dirname, 'dist/swagger-ui');

						if (!fs.existsSync(destDir)) {
							fs.mkdirSync(destDir, { recursive: true });
						}

						const filesToCopy = [
							'swagger-ui.css',
							'swagger-ui-bundle.js',
							'swagger-ui-standalone-preset.js'
						];

						for (const file of filesToCopy) {
							fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
						}
						console.log('[build] copied swagger-ui assets');
					});
				}
			}
		],
	});
	if (watch) {
		await ctx.watch();
	} else {
		await ctx.rebuild();
		await ctx.dispose();
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
