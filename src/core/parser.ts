import untildify from "untildify"
import { createReadStream } from 'fs';
import type { Script, ScriptMetadata, ScriptPathInfo } from "../types"
import {
	getMetadata,
	isFile,
	kenvPath,
	kenvFromFilePath,
	shortcutNormalizer,
	friendlyShortcut
} from "./utils.js"
import { ProcessType } from "./enum.js"
import { slash } from "./resolvers.js"
import { path } from "../globals/path.js"

export let postprocessMetadata = (
	metadata: Metadata,
	fileContents: string
): ScriptMetadata => {
	const result: Partial<ScriptMetadata> = { ...metadata }

	if (metadata.shortcut) {
		result.shortcut = shortcutNormalizer(metadata.shortcut)
		result.friendlyShortcut = friendlyShortcut(result.shortcut)
	}

	if (metadata.shortcode) {
		result.shortcode = metadata.shortcode.trim().toLowerCase()
	}

	if (metadata.trigger) {
		result.trigger = metadata.trigger.trim().toLowerCase()
	}

	if (metadata.alias) {
		result.alias = metadata.alias.trim().toLowerCase()
	}

	if (metadata.image) {
		result.img = slash(untildify(metadata.image))
	}

	if (metadata.index) {
		if (typeof metadata.index === "string") {
			result.index = Number.parseInt(metadata.index, 10)
		} else {
			result.index = metadata.index
		}
	}

	result.type = metadata.schedule
		? ProcessType.Schedule
		: metadata.watch
			? ProcessType.Watch
			: metadata.system
				? ProcessType.System
				: metadata.background
					? ProcessType.Background
					: ProcessType.Prompt

	const tabsMatch = fileContents.match(/(?<=^onTab\(['"])(.+?)(?=['"])/gim)
	if (tabsMatch?.length) {
		result.tabs = tabsMatch
	}

	if (/preview(:|\s*=)/gi.test(fileContents)) {
		result.hasPreview = true
	}

	return result as ScriptMetadata
}

export let parseMetadata = (fileContents: string): ScriptMetadata => {
	let metadata: Metadata = getMetadata(fileContents)

	let processedMetadata = postprocessMetadata(metadata, fileContents)

	return processedMetadata
}

const shebangRegex = /^#!(.+)/m
export let getShebangFromContents = (contents: string): string | undefined => {
	let match = contents.match(shebangRegex)
	return match ? match[1].trim() : undefined
}

export let commandFromFilePath = (filePath: string) =>
	path.basename(filePath)?.replace(/\.(j|t)s$/, "") || ""

export let iconFromKenv = async (kenv: string) => {
	let iconPath = kenv ? kenvPath("kenvs", kenv, "icon.png") : ""

	return kenv && (await isFile(iconPath)) ? iconPath : ""
}

export let parseFilePath = async (
	filePath: string
): Promise<ScriptPathInfo> => {
	let command = commandFromFilePath(filePath)
	let kenv = kenvFromFilePath(filePath)
	let icon = await iconFromKenv(kenv)

	return {
		id: filePath,
		command,
		filePath,
		kenv,
		icon
	}
}

export let parseScript = async (filePath: string): Promise<Script> => {
    const parsedFilePath = await parseFilePath(filePath);
    const stream = createReadStream(filePath, { encoding: 'utf8' });

    let contents = '';
    return new Promise<Script>((resolve, reject) => {
        stream.on('data', chunk => {
            contents += chunk;
        });

        stream.on('end', () => {
            try {
                const metadata = parseMetadata(contents);
                const shebang = getShebangFromContents(contents);
                const needsDebugger = Boolean(contents.match(/^\s*debugger/gim));

                const result = {
                    shebang,
                    ...metadata,
                    ...parsedFilePath,
                    needsDebugger,
                    name: metadata.name || metadata.menu || parsedFilePath.command,
                    description: metadata.description || ""
                } as Script;

                resolve(result);
            } catch (error) {
                reject(error);
            }
        });

        stream.on('error', reject);
    });
};
