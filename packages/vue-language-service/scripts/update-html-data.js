/**
 * @type {import('axios').AxiosInstance}
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const OpenCC = require('opencc');
const converter = new OpenCC('s2tw.json');
const langs = [
	{
		name: 'en',
		url: 'https://vuejs.org/',
		repoUrl: 'https://raw.githubusercontent.com/vuejs/docs/',
		supported: true,
	},
	{
		name: 'zh-cn',
		url: 'https://cn.vuejs.org/',
		repoUrl: 'https://raw.githubusercontent.com/vuejs-translations/docs-zh-cn/',
		supported: true,
	},
	{
		name: 'ja',
		url: 'https://ja.vuejs.org/',
		repoUrl: 'https://raw.githubusercontent.com/vuejs-translations/docs-ja/',
		supported: true,
	},
	{
		name: 'ua',
		url: 'https://ua.vuejs.org/',
		repoUrl: 'https://raw.githubusercontent.com/vuejs-translations/docs-ua/',
		supported: false,
	},
	{
		name: 'fr',
		url: 'https://fr.vuejs.org/',
		repoUrl: 'https://raw.githubusercontent.com/vuejs-translations/docs-fr/',
		supported: true,
	},
];

for (const lang of langs) {
	if (lang.supported) {
		templateWorker(lang);
		sfcWorker(lang);
		modelWorker(lang);
	}
}

async function sfcWorker(lang) {

	const sfcDoc = await fetch(lang.repoUrl + 'HEAD/src/api/sfc-spec.md', lang.url);
	const cssFeaturesDoc = await fetch(lang.repoUrl + 'HEAD/src/api/sfc-css-features.md', lang.url);

	/**
	 * @type {import('vscode-html-languageservice').IAttributeData}
	 */
	const langAttr = {
		name: 'lang',
		description: {
			kind: 'markdown',
			value: sfcDoc.split('\n## ')[4].split('\n').slice(1).join('\n'),
		},
		values: [
			// // custom block
			// { name: 'md' },
			// { name: 'json' },
			// { name: 'jsonc' },
			// { name: 'json5' },
			// { name: 'yaml' },
			// { name: 'toml' },
			// { name: 'gql' },
			// { name: 'graphql' },
		],
		references: langs.map(lang => ({
			name: lang.name,
			url: `${lang.url}api/sfc-spec.html#pre-processors`,
		})),
	};
	/**
	 * @type {import('vscode-html-languageservice').IAttributeData}
	 */
	const srcAttr = {
		name: 'src',
		description: {
			kind: 'markdown',
			value: sfcDoc.split('\n## ')[5].split('\n').slice(1).join('\n'),
		},
		references: langs.map(lang => ({
			name: lang.name,
			url: `${lang.url}api/sfc-spec.html#src-imports`,
		})),
	};
	const languageBlocks = sfcDoc
		.split('\n## ')[2]
		.split('\n### ')
		.slice(1)
		.map((section) => {
			const lines = section.split('\n');
			let name = lines[0].trim();
			if (name.startsWith('`<')) {
				name = name.split('`<')[1].split('>`')[0];
			}
			/**
			 * @type {import('vscode-html-languageservice').ITagData}
			 */
			const data = {
				name,
				attributes: name === 'script setup' ? [] : [srcAttr],
				description: {
					kind: 'markdown',
					value: lines.slice(1).join('\n'),
				},
				references: langs.map(lang => ({
					name: lang.name,
					url: `${lang.url}api/sfc-spec.html#${normalizeHash(name)}`,
				})),
			};
			if (name === 'template') {
				data.attributes.push({
					...langAttr,
					values: [
						{ name: 'html' },
						{ name: 'pug' },
					],
				});
			}
			if (name === 'script') {
				data.attributes.push({
					...langAttr,
					values: [
						{ name: 'ts' },
						{ name: 'js' },
						{ name: 'tsx' },
						{ name: 'jsx' },
					],
				});
				data.attributes.push({ name: 'generic' });
			}
			if (name === 'style') {
				data.attributes.push({
					...langAttr,
					values: [
						{ name: 'css' },
						{ name: 'scss' },
						{ name: 'less' },
						{ name: 'stylus' },
						{ name: 'postcss' },
						{ name: 'sass' },
					],
				});
				data.attributes.push({
					name: 'scoped',
					valueSet: 'v',
					description: {
						kind: 'markdown',
						value: cssFeaturesDoc.split('\n## ')[1].split('\n').slice(1).join('\n'),
					},
					references: langs.map(lang => ({
						name: lang.name,
						url: `${lang.url}api/sfc-css-features.html#scoped-css`,
					})),
				});
				data.attributes.push({
					name: 'module',
					valueSet: 'v',
					description: {
						kind: 'markdown',
						value: cssFeaturesDoc.split('\n## ')[2].split('\n').slice(1).join('\n'),
					},
					references: langs.map(lang => ({
						name: lang.name,
						url: `${lang.url}api/sfc-css-features.html#css-modules`,
					})),
				});
			}
			return data;
		});

	const scriptBlock = languageBlocks.find(b => b.name === 'script');
	const scriptSetupBlock = languageBlocks.find(b => b.name === 'script setup');

	scriptBlock.attributes.push({
		name: 'setup',
		valueSet: 'v',
		description: scriptSetupBlock.description,
		references: scriptSetupBlock.references,
	});

	/**
	 * @type {import('vscode-html-languageservice').HTMLDataV1}
	 */
	const data = {
		version: 1.1,
		tags: languageBlocks,
		globalAttributes: [langAttr, srcAttr],
	};

	const writePath = path.resolve(__dirname, '../data/language-blocks/' + lang.name + '.json');
	fs.writeFileSync(writePath, JSON.stringify(data, null, 2));
	console.log(writePath);

	if (lang.name === 'zh-cn') {
		converter.convertPromise(JSON.stringify(data, null, 2)).then(converted => {
			const writePath = path.resolve(__dirname, '../data/language-blocks/zh-tw.json');
			fs.writeFileSync(writePath, converted);
			console.log(writePath);
		});
	}
}

async function modelWorker(lang) {

	const formsDoc = await fetch(lang.repoUrl + 'HEAD/src/guide/essentials/forms.md', lang.url);
	const modifiers = formsDoc
		.split('\n## ')[3]
		.split('\n### ')
		.slice(1)
		.map((section) => {
			const lines = section.split('\n');
			let name = lines[0].trim();
			name = name.split('`.')[1].split('`')[0];
			/**
			 * @type {import('vscode-html-languageservice').IAttributeData}
			 */
			const data = {
				name,
				description: {
					kind: 'markdown',
					value: lines.slice(1).join('\n'),
				},
				references: langs.map(lang => ({
					name: lang.name,
					url: `${lang.url}guide/essentials/forms.html#${normalizeHash(name)}`,
				})),
			};
			return data;
		});

	/**
	 * @type {import('vscode-html-languageservice').HTMLDataV1}
	 */
	const data = {
		version: 1.1,
		globalAttributes: modifiers,
	};

	const writePath = path.resolve(__dirname, '../data/model-modifiers/' + lang.name + '.json');
	fs.writeFileSync(writePath, JSON.stringify(data, null, 2));
	console.log(writePath);

	if (lang.name === 'zh-cn') {
		converter.convertPromise(JSON.stringify(data, null, 2)).then(converted => {
			const writePath = path.resolve(__dirname, '../data/model-modifiers/zh-tw.json');
			fs.writeFileSync(writePath, converted);
			console.log(writePath);
		});
	}
}

async function templateWorker(lang) {

	const directivesDoc = await fetch(lang.repoUrl + 'HEAD/src/api/built-in-directives.md', lang.url);
	const attributesDoc = await fetch(lang.repoUrl + 'HEAD/src/api/built-in-special-attributes.md', lang.url);
	const componentsDoc = await fetch(lang.repoUrl + 'HEAD/src/api/built-in-components.md', lang.url);
	const elementsDoc = await fetch(lang.repoUrl + 'HEAD/src/api/built-in-special-elements.md', lang.url);

	const directives = directivesDoc
		.split('\n## ')
		.slice(1)
		.map((section) => {
			const lines = section.split('\n');
			const name = lines[0].trim().split(' ')[0];
			/**
			 * @type {import('vscode-html-languageservice').IAttributeData}
			 */
			const data = {
				name,
				valueSet: name === 'v-else' ? 'v' : undefined,
				description: {
					kind: 'markdown',
					value: lines.slice(1).join('\n'),
				},
				references: langs.map(lang => ({
					name: lang.name,
					url: `${lang.url}api/built-in-directives.html#${normalizeHash(name)}`,
				})),
			};
			return data;
		});
	const attributes = attributesDoc
		.split('\n## ')
		.slice(1)
		.map((section) => {
			const lines = section.split('\n');
			const name = lines[0].trim().split(' ')[0];
			/**
			 * @type {import('vscode-html-languageservice').IAttributeData}
			 */
			const data = {
				name,
				description: {
					kind: 'markdown',
					value: lines.slice(1).join('\n'),
				},
				references: langs.map(lang => ({
					name: lang.name,
					url: `${lang.url}api/built-in-special-attributes.html#${normalizeHash(name)}`,
				})),
			};
			return data;
		});
	const components = componentsDoc
		.split('\n## ')
		.slice(1)
		.map((section) => {
			const lines = section.split('\n');
			let name = lines[0].trim();
			if (name.startsWith('`<')) {
				name = name.split('`<')[1].split('>`')[0];
			}
			/**
			 * @type {import('vscode-html-languageservice').ITagData}
			 */
			const data = {
				name,
				description: {
					kind: 'markdown',
					value: lines.slice(1).join('\n'),
				},
				references: langs.map(lang => ({
					name: lang.name,
					url: `${lang.url}api/built-in-components.html#${normalizeHash(name)}`,
				})),
			};
			return data;
		});
	const elements = elementsDoc
		.split('\n## ')
		.slice(1)
		.map((section) => {
			const lines = section.split('\n');
			let name = lines[0].trim();
			if (name.startsWith('`<')) {
				name = name.split('`<')[1].split('>`')[0];
			}
			/**
			 * @type {import('vscode-html-languageservice').ITagData}
			 */
			const data = {
				name,
				description: {
					kind: 'markdown',
					value: lines.slice(1).join('\n'),
				},
				references: langs.map(lang => ({
					name: lang.name,
					url: `${lang.url}api/built-in-special-elements.html#${normalizeHash(name)}`,
				})),
			};
			return data;
		});

	/**
	 * @type {import('vscode-html-languageservice').HTMLDataV1}
	 */
	const data = {
		version: 1.1,
		tags: [
			...components,
			...elements,
		],
		globalAttributes: [
			...directives,
			...attributes
		],
	};

	const writePath = path.resolve(__dirname, '../data/template/' + lang.name + '.json');
	fs.writeFileSync(writePath, JSON.stringify(data, null, 2));
	console.log(writePath);

	if (lang.name === 'zh-cn') {
		converter.convertPromise(JSON.stringify(data, null, 2)).then(converted => {
			const writePath = path.resolve(__dirname, '../data/template/zh-tw.json');
			fs.writeFileSync(writePath, converted);
			console.log(writePath);
		});
	}
}

async function fetch(url, baseUrl) {
	/**
	 * @type {string}
	 */
	let text = (await axios.get(url)).data;
	text = text.replace(/```vue-html/g, '```html');
	text = text.replace(/\{\#.*?\}/g, '')
	text = resolveMarkdownLinks(text, baseUrl);
	return text;
}

function resolveMarkdownLinks(text, url) {
	return text.replace(/\[(.*?)\]\(\/(.*?)\)/g, (match, p1, p2) => {
		const p2Parts = p2.split('#');
		if (!p2Parts[0].endsWith('.html')) {
			p2Parts[0] += '.html';
		}
		p2 = p2Parts.join('#');
		return `[${p1}](${url}${p2})`;
	});
}

function normalizeHash(str) {
	return str.replace(/ /g, '-').toLowerCase();
}
