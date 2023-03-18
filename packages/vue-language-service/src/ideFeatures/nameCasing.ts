import { hyphenate } from '@vue/shared';
import { LanguageServicePluginContext, VirtualFile } from '@volar/language-service';
import { checkComponentNames, getTemplateTagsAndAttrs, checkPropsOfTag } from '../helpers';
import * as vue from '@volar/vue-language-core';
import * as vscode from 'vscode-languageserver-protocol';
import { AttrNameCasing, TagNameCasing, VueCompilerOptions } from '../types';

export async function convertTagName(
	context: LanguageServicePluginContext,
	_ts: NonNullable<LanguageServicePluginContext['typescript']>,
	uri: string,
	casing: TagNameCasing,
) {

	const rootFile = context.documents.getSourceByUri(uri)?.root;
	if (!(rootFile instanceof vue.VueFile))
		return;

	const desc = rootFile.sfc;
	if (!desc.template)
		return;

	const template = desc.template;
	const document = context.documents.getDocumentByFileName(rootFile.snapshot, rootFile.fileName);
	const edits: vscode.TextEdit[] = [];
	const components = checkComponentNames(_ts.module, _ts.languageService, rootFile);
	const tags = getTemplateTagsAndAttrs(rootFile);

	for (const [tagName, { offsets }] of tags) {
		const componentName = components.find(component => component === tagName || hyphenate(component) === tagName);
		if (componentName) {
			for (const offset of offsets) {
				const start = document.positionAt(template.startTagEnd + offset);
				const end = document.positionAt(template.startTagEnd + offset + tagName.length);
				const range = vscode.Range.create(start, end);
				if (casing === TagNameCasing.Kebab && tagName !== hyphenate(componentName)) {
					edits.push(vscode.TextEdit.replace(range, hyphenate(componentName)));
				}
				if (casing === TagNameCasing.Pascal && tagName !== componentName) {
					edits.push(vscode.TextEdit.replace(range, componentName));
				}
			}
		}
	}

	return edits;
}

export async function convertAttrName(
	context: LanguageServicePluginContext,
	_ts: NonNullable<LanguageServicePluginContext['typescript']>,
	uri: string,
	casing: AttrNameCasing,
	vueCompilerOptions: VueCompilerOptions,
) {

	const rootFile = context.documents.getSourceByUri(uri)?.root;
	if (!(rootFile instanceof vue.VueFile))
		return;

	const desc = rootFile.sfc;
	if (!desc.template)
		return;

	const template = desc.template;
	const document = context.documents.getDocumentByFileName(rootFile.snapshot, rootFile.fileName);
	const edits: vscode.TextEdit[] = [];
	const components = checkComponentNames(_ts.module, _ts.languageService, rootFile);
	const tags = getTemplateTagsAndAttrs(rootFile);

	for (const [tagName, { attrs }] of tags) {
		const componentName = components.find(component => component === tagName || hyphenate(component) === tagName);
		if (componentName) {
			const props = checkPropsOfTag(_ts.module, _ts.languageService, rootFile, componentName, vueCompilerOptions);
			for (const [attrName, { offsets }] of attrs) {
				const propName = props.find(prop => prop === attrName || hyphenate(prop) === attrName);
				if (propName) {
					for (const offset of offsets) {
						const start = document.positionAt(template.startTagEnd + offset);
						const end = document.positionAt(template.startTagEnd + offset + attrName.length);
						const range = vscode.Range.create(start, end);
						if (casing === AttrNameCasing.Kebab && attrName !== hyphenate(propName)) {
							edits.push(vscode.TextEdit.replace(range, hyphenate(propName)));
						}
						if (casing === AttrNameCasing.Camel && attrName !== propName) {
							edits.push(vscode.TextEdit.replace(range, propName));
						}
					}
				}
			}
		}
	}

	return edits;
}

export async function getNameCasing(
	context: LanguageServicePluginContext,
	_ts: NonNullable<LanguageServicePluginContext['typescript']>,
	uri: string,
) {

	const detected = detect(context, _ts, uri);
	const [attr, tag] = await Promise.all([
		context.configurationHost?.getConfiguration<'auto-kebab' | 'auto-camel' | 'kebab' | 'camel'>('volar.completion.preferredAttrNameCase', uri),
		context.configurationHost?.getConfiguration<'auto-kebab' | 'auto-pascal' | 'kebab' | 'pascal'>('volar.completion.preferredTagNameCase', uri),
	]);
	const tagNameCasing = detected.tag.length === 1 && (tag === 'auto-pascal' || tag === 'auto-kebab') ? detected.tag[0] : (tag === 'auto-kebab' || tag === 'kebab') ? TagNameCasing.Kebab : TagNameCasing.Pascal;
	const attrNameCasing = detected.attr.length === 1 && (attr === 'auto-camel' || attr === 'auto-kebab') ? detected.attr[0] : (attr === 'auto-camel' || attr === 'camel') ? AttrNameCasing.Camel : AttrNameCasing.Kebab;

	return {
		tag: tagNameCasing,
		attr: attrNameCasing,
	};
}

export function detect(
	context: LanguageServicePluginContext,
	_ts: NonNullable<LanguageServicePluginContext['typescript']>,
	uri: string,
): {
	tag: TagNameCasing[],
	attr: AttrNameCasing[],
} {

	const rootFile = context.documents.getSourceByUri(uri)?.root;
	if (!(rootFile instanceof vue.VueFile)) {
		return {
			tag: [],
			attr: [],
		};
	}

	return {
		tag: getTagNameCase(rootFile),
		attr: getAttrNameCase(rootFile),
	};

	function getAttrNameCase(file: VirtualFile): AttrNameCasing[] {

		const tags = getTemplateTagsAndAttrs(file);
		const result: AttrNameCasing[] = [];

		for (const [_, { attrs }] of tags) {
			for (const [tagName] of attrs) {
				// attrName
				if (tagName !== hyphenate(tagName)) {
					result.push(AttrNameCasing.Camel);
					break;
				}
			}
			for (const [tagName] of attrs) {
				// attr-name
				if (tagName.indexOf('-') >= 0) {
					result.push(AttrNameCasing.Kebab);
					break;
				}
			}
		}

		return result;
	}
	function getTagNameCase(file: VirtualFile): TagNameCasing[] {

		const components = checkComponentNames(_ts.module, _ts.languageService, file);
		const tagNames = getTemplateTagsAndAttrs(file);
		const result: TagNameCasing[] = [];

		let anyComponentUsed = false;

		for (const component of components) {
			if (tagNames.has(component) || tagNames.has(hyphenate(component))) {
				anyComponentUsed = true;
				break;
			}
		}
		if (!anyComponentUsed) {
			return []; // not sure component style, because do not have any component using in <template> for check
		}

		for (const [tagName] of tagNames) {
			// TagName
			if (tagName !== hyphenate(tagName)) {
				result.push(TagNameCasing.Pascal);
				break;
			}
		}
		for (const component of components) {
			// Tagname -> tagname
			// TagName -> tag-name
			if (component !== hyphenate(component) && tagNames.has(hyphenate(component))) {
				result.push(TagNameCasing.Kebab);
				break;
			}
		}

		return result;
	}
}
