import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { watch } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'js/development');
const target = join(root, 'js/build');

// transform, not bundle: the manifest and both pages load these as separate
// files, so each source file has to keep its own name.
const options = {
	loader: 'js',
	minify: true,
	target: 'chrome100',
	legalComments: 'none',
};

async function build() {
	await mkdir(target, { recursive: true });
	const files = (await readdir(source)).filter((name) => name.endsWith('.js'));
	for (const name of files) {
		const code = await readFile(join(source, name), 'utf8');
		const result = await transform(code, options);
		await writeFile(join(target, name), result.code);
	}
	console.log(`built ${files.length} file(s) into js/build/`);
}

await build();

if (process.argv.includes('--watch')) {
	let pending = null;
	watch(source, () => {
		clearTimeout(pending);
		pending = setTimeout(() => {
			build().catch((error) => console.error(error.message));
		}, 100);
	});
	console.log('watching js/development/');
}
