import type * as ts from 'typescript/lib/tsserverlibrary';
import * as path from 'path';
import type { VueCompilerOptions, VueLanguagePlugin } from '../types';

export type ParsedCommandLine = ts.ParsedCommandLine & {
	vueOptions: Partial<VueCompilerOptions>;
};

export function createParsedCommandLineByJson(
	ts: typeof import('typescript/lib/tsserverlibrary'),
	parseConfigHost: ts.ParseConfigHost,
	rootDir: string,
	json: any,
	extraFileExtensions: ts.FileExtensionInfo[],
): ParsedCommandLine {

	const tsConfigPath = path.join(rootDir, 'jsconfig.json');
	const content = ts.parseJsonConfigFileContent(json, parseConfigHost, rootDir, {}, tsConfigPath, undefined, extraFileExtensions);

	return createParsedCommandLineBase(ts, parseConfigHost, content, tsConfigPath, extraFileExtensions, new Set());
}

export function createParsedCommandLine(
	ts: typeof import('typescript/lib/tsserverlibrary'),
	parseConfigHost: ts.ParseConfigHost,
	tsConfigPath: string,
	extraFileExtensions: ts.FileExtensionInfo[],
	extendsSet = new Set<string>(),
): ParsedCommandLine {
	try {
		const config = ts.readJsonConfigFile(tsConfigPath, parseConfigHost.readFile);
		const content = ts.parseJsonSourceFileConfigFileContent(config, parseConfigHost, path.dirname(tsConfigPath), {}, tsConfigPath, undefined, extraFileExtensions);
		// fix https://github.com/johnsoncodehk/volar/issues/1786
		// https://github.com/microsoft/TypeScript/issues/30457
		// patching ts server broke with outDir + rootDir + composite/incremental
		content.options.outDir = undefined;

		return createParsedCommandLineBase(ts, parseConfigHost, content, tsConfigPath, extraFileExtensions, extendsSet);
	}
	catch (err) {
		console.log('Failed to resolve tsconfig path:', tsConfigPath);
		return {
			fileNames: [],
			options: {},
			vueOptions: {},
			errors: [],
		};
	}
}

function createParsedCommandLineBase(
	ts: typeof import('typescript/lib/tsserverlibrary'),
	parseConfigHost: ts.ParseConfigHost,
	content: ts.ParsedCommandLine,
	tsConfigPath: string,
	extraFileExtensions: ts.FileExtensionInfo[],
	extendsSet: Set<string>,
): ParsedCommandLine {

	extendsSet.add(tsConfigPath);

	const folder = path.dirname(tsConfigPath);
	const extendsArr = Array.isArray(content.raw.extends)
		? content.raw.extends
		: (content.raw.extends ? [content.raw.extends] : []);

	let extendsVueOptions = {};

	for (let extendsPath of extendsArr) {
		try {
			 // Workaround: https://github.com/pnpm/pnpm/issues/5237
			if (process?.env?.npm_config_user_agent?.startsWith('pnpm/')) {
				extendsPath = `./node_modules/${extendsPath}/package.json`;
			}

			extendsPath = require.resolve(extendsPath, { paths: [folder] });
			if (!extendsSet.has(extendsPath)) {
				extendsVueOptions = {
					...extendsVueOptions,
					...createParsedCommandLine(ts, parseConfigHost, extendsPath, extraFileExtensions, extendsSet).vueOptions,
				};
			}
		}
		catch (error) {
			console.error(error);
		}
	}

	if (content.raw.vueCompilerOptions?.plugins) {

		const pluginPaths: string[] = content.raw.vueCompilerOptions.plugins;
		const plugins = pluginPaths
			.map<VueLanguagePlugin | undefined>((pluginPath: string) => {
				try {
					const resolvedPath = resolvePath(pluginPath);
					if (resolvedPath) {
						return require(resolvedPath);
					}
				}
				catch (error) {
					console.warn('Load plugin failed', pluginPath, error);
				}
			})
			.filter((plugin): plugin is NonNullable<typeof plugin> => !!plugin);

		content.raw.vueCompilerOptions.plugins = plugins;
	}

	const vueOptions: Partial<VueCompilerOptions> = {
		...extendsVueOptions,
		...content.raw.vueCompilerOptions,
	};

	vueOptions.hooks = vueOptions.hooks
		?.map(resolvePath)
		.filter((hook): hook is NonNullable<typeof hook> => !!hook);
	vueOptions.experimentalAdditionalLanguageModules = vueOptions.experimentalAdditionalLanguageModules
		?.map(resolvePath)
		.filter((module): module is NonNullable<typeof module> => !!module);

	return {
		...content,
		vueOptions,
	};

	function resolvePath(scriptPath: string): string | undefined {
		try {
			if (require?.resolve) {
				scriptPath = require.resolve(scriptPath, { paths: [folder] });
			}
			else {
				console.log('failed to resolve path:', scriptPath, 'require.resolve is not supported in web');
			}
		}
		catch (error) {
			console.warn(error);
		}
		return;
	}
}

// https://developer.mozilla.org/en-US/docs/Web/HTML/Element
const HTML_TAGS =
	'html,body,base,head,link,meta,style,title,address,article,aside,footer,' +
	'header,hgroup,h1,h2,h3,h4,h5,h6,nav,section,div,dd,dl,dt,figcaption,' +
	'figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,code,' +
	'data,dfn,em,i,kbd,mark,q,rp,rt,ruby,s,samp,small,span,strong,sub,sup,' +
	'time,u,var,wbr,area,audio,map,track,video,embed,object,param,source,' +
	'canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,tbody,td,' +
	'th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,' +
	'option,output,progress,select,textarea,details,dialog,menu,' +
	'summary,template,blockquote,iframe,tfoot';

// https://developer.mozilla.org/en-US/docs/Web/SVG/Element
const SVG_TAGS =
	'svg,animate,animateMotion,animateTransform,circle,clipPath,color-profile,' +
	'defs,desc,discard,ellipse,feBlend,feColorMatrix,feComponentTransfer,' +
	'feComposite,feConvolveMatrix,feDiffuseLighting,feDisplacementMap,' +
	'feDistanceLight,feDropShadow,feFlood,feFuncA,feFuncB,feFuncG,feFuncR,' +
	'feGaussianBlur,feImage,feMerge,feMergeNode,feMorphology,feOffset,' +
	'fePointLight,feSpecularLighting,feSpotLight,feTile,feTurbulence,filter,' +
	'foreignObject,g,hatch,hatchpath,image,line,linearGradient,marker,mask,' +
	'mesh,meshgradient,meshpatch,meshrow,metadata,mpath,path,pattern,' +
	'polygon,polyline,radialGradient,rect,set,solidcolor,stop,switch,symbol,' +
	'text,textPath,title,tspan,unknown,use,view';

export function resolveVueCompilerOptions(vueOptions: Partial<VueCompilerOptions>): VueCompilerOptions {
	const target = vueOptions.target ?? 3;
	return {
		...vueOptions,

		target,
		extensions: vueOptions.extensions ?? ['.vue'],
		jsxTemplates: vueOptions.jsxTemplates ?? false,
		strictTemplates: vueOptions.strictTemplates ?? false,
		skipTemplateCodegen: vueOptions.skipTemplateCodegen ?? false,
		nativeTags: vueOptions.nativeTags ?? [...new Set([
			...HTML_TAGS.split(','),
			...SVG_TAGS.split(','),
			// fix https://github.com/johnsoncodehk/volar/issues/1340
			'hgroup',
			'slot',
			'component',
		])],
		dataAttributes: vueOptions.dataAttributes ?? [],
		htmlAttributes: vueOptions.htmlAttributes ?? ['aria-*'],
		optionsWrapper: vueOptions.optionsWrapper ?? (
			target >= 2.7
				? [`(await import('vue')).defineComponent(`, `)`]
				: [`(await import('vue')).default.extend(`, `)`]
		),
		macros: vueOptions.macros ?? {
			defineProps: ['defineProps'],
			defineEmits: ['defineEmits'],
			defineExpose: ['defineExpose'],
			withDefaults: ['withDefaults'],
		},
		narrowingTypesInInlineHandlers: vueOptions.narrowingTypesInInlineHandlers ?? false,
		plugins: vueOptions.plugins ?? [],
		hooks: vueOptions.hooks ?? [],

		// experimental
		experimentalAdditionalLanguageModules: vueOptions.experimentalAdditionalLanguageModules ?? [],
		experimentalResolveStyleCssClasses: vueOptions.experimentalResolveStyleCssClasses ?? 'scoped',
		experimentalRfc436: vueOptions.experimentalRfc436 ?? false,
		// https://github.com/vuejs/vue-next/blob/master/packages/compiler-dom/src/transforms/vModel.ts#L49-L51
		// https://vuejs.org/guide/essentials/forms.html#form-input-bindings
		experimentalModelPropName: vueOptions.experimentalModelPropName ?? {
			'': {
				input: true
			},
			value: {
				input: { type: 'text' },
				textarea: true,
				select: true
			}
		},
		experimentalUseElementAccessInTemplate: vueOptions.experimentalUseElementAccessInTemplate ?? false,
	};
}
