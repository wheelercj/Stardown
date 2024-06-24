/*
   Copyright 2024 Chris Wheeler

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/

import { getSetting } from './common.js';
import { TurndownService } from './turndown.js';
import { turndownPluginGfm } from './turndown-plugin-gfm.js';

/**
 * turndownService is a TurndownService instance used to convert HTML to markdown. Use
 * the exported htmlToMarkdown async function to convert HTML to markdown.
 * @type {TurndownService|null}
 */
let turndownService = null;

/**
 * currentBulletPoint is used by the htmlToMarkdown function to detect changes to the
 * bullet point setting to update the TurndownService instance when needed.
 * @type {string}
 */
let currentBulletPoint = '-';

/**
 * currentSubBrackets is used by the htmlToMarkdown function to detect changes to the
 * bracket substitution setting to update the TurndownService instance when needed.
 */
let currentSubBrackets = 'underlined';

/**
 * replaceBrackets replaces any square brackets in text with the character or escape
 * sequence chosen in settings.
 * @param {string} text - the text.
 * @param {string} subBrackets - the setting for what to substitute any square brackets
 * with.
 * @returns {string}
 */
export function replaceBrackets(text, subBrackets) {
    if (subBrackets === 'underlined') {
        return text.replaceAll('[', '⦋').replaceAll(']', '⦌');
    } else if (subBrackets === 'escaped') {
        return text.replaceAll('[', '\\[').replaceAll(']', '\\]');
    } else {
        return text;
    }
}

/**
 * escape escapes many markdown patterns, but not square brackets.
 * @param {string} text - the text to escape markdown characters in.
 * @returns {string}
 */
export function escape(text) {
    return text
        .replaceAll('\\', '\\\\')
        .replaceAll('#', '\\#')
        .replaceAll('_', '\\_')
        .replaceAll('*', '\\*')
        .replaceAll('`', '\\`')
        .replaceAll(/^>/g, '\\>')
        .replaceAll(/^-/g, '\\-')
        .replaceAll(/^\+ /g, '\\+ ')
        .replaceAll(/^(=+)/g, '\\$1')
        .replaceAll(/^~~~/g, '\\~~~')
        .replaceAll(/^(\d+)\. /g, '$1\\. ')
}

/**
 * htmlToMarkdown converts HTML to markdown.
 * @param {string|HTMLElement} html - the HTML to convert to markdown.
 * @returns {Promise<string>}
 */
export async function htmlToMarkdown(html) {
    const newBulletPoint = await getSetting('bulletPoint');
    const newSubBrackets = await getSetting('subBrackets');

    if (
        !turndownService ||
        newBulletPoint !== currentBulletPoint ||
        newSubBrackets !== currentSubBrackets
    ) {
        currentBulletPoint = newBulletPoint;
        currentSubBrackets = newSubBrackets
        turndownService = newTurndownService(currentBulletPoint, currentSubBrackets);
    }

    return turndownService.turndown(html);
}

/**
 * newTurndownService creates a new TurndownService instance.
 * @param {string} bulletPoint - the setting for the bullet point character.
 * @param {string} subBrackets - the setting for what to substitute square brackets
 * with.
 * @returns {TurndownService}
 */
function newTurndownService(bulletPoint, subBrackets) {
    // https://github.com/mixmark-io/turndown
    const t = new TurndownService({
        bulletListMarker: bulletPoint,
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
    }).remove('style').remove('script').remove('noscript').remove('link');

    t.use(turndownPluginGfm.gfm); // GitHub Flavored Markdown

    // Making Turndown's escape function async results in Turndown giving the error
    // `TypeError: string.replace is not a function`.
    t.escape = function (text) {
        return replaceBrackets(escape(text), subBrackets);
    };

    return t;
}

/**
 * createLink creates a markdown link.
 * @param {string} title - the title of the link. Square brackets are replaced, escaped,
 * or unchanged depending on the settings. Some other markdown characters are escaped.
 * @param {string} url - the URL of the link. Parentheses are URL-encoded.
 * @param {string|null} subBrackets - the setting for what to substitute any square
 * brackets with. If not given, the setting is read from storage.
 * @returns {Promise<string>}
 */
export async function createLink(title, url, subBrackets = null) {
    if (subBrackets === null) {
        subBrackets = await getSetting('subBrackets');
    }

    title = replaceBrackets(title, subBrackets);
    title = title
        .replaceAll('\\', '\\\\')
        .replaceAll('#', '\\#')
        .replaceAll('_', '\\_')
        .replaceAll('*', '\\*')
        .replaceAll('`', '\\`')
        .replaceAll('>', '\\>')
        .replaceAll(' ', '')

    url = url.replaceAll('(', '%28').replaceAll(')', '%29');

    return `[${title}](${url})`;
}

/**
 * createAlert creates a markdown alert. GitHub and Obsidian use the same format, but
 * GitHub supports only specific alert types: note, tip, important, warning, and
 * caution. More details here: https://github.com/orgs/community/discussions/16925.
 * @param {string} type - the alert's type.
 * @param {string} text - the alert's text.
 * @returns {Promise<string>}
 */
export async function createAlert(type, text) {
    let alert = '> [!' + type + ']';
    if (text) {
        alert += '\n> ' + text.replaceAll('\n', '\n> ');
    }

    return alert;
}

/**
 * createBlockquote creates a markdown blockquote with a link at the end.
 * @param {string} text - the text of the blockquote. Many markdown patterns are
 * escaped.
 * @param {string} title - the title of the link.
 * @param {string} url - the URL of the link.
 * @returns {Promise<string>}
 */
export async function createBlockquote(text, title, url) {
    text = escape(text)
        .replaceAll('[', '\\[')
        .replaceAll(']', '\\]')
        .replaceAll('\n', '\n> ');

    const link = await createLink(title, url);

    return `> ${text}\n> \n> — ${link}`;
}

/**
 * createImage creates markdown of an image.
 * @param {string} url - the URL of the image.
 * @returns {Promise<string>}
 */
export async function createImage(url) {
    const fileName = url.split('/').pop() || 'image';
    const link = await createLink(fileName, url);
    return '!' + link;
}

/**
 * createVideo creates markdown of a video. The source URL is used if and only if it's
 * truthy and does not start with `blob:`. For rendering purposes, the resulting
 * markdown will only start with an exclamation mark if the page URL is used.
 * @param {string} srcUrl - the URL of the video.
 * @param {string} pageUrl - the URL of the page the video is on.
 * @returns {Promise<string>}
 */
export async function createVideo(srcUrl, pageUrl) {
    const usingSrcUrl = srcUrl && !srcUrl.startsWith('blob:');
    const url = usingSrcUrl ? srcUrl : pageUrl;

    let youtubeId; // TODO
    let isYoutube = false; // TODO
    const youtubeMd = await getSetting('youtubeMd');

    if (isYoutube && youtubeMd === 'GitHub') {
        // TODO: use fwd-microservice
    } else {
        const link = await createLink('video', url);
        if (usingSrcUrl) {
            return link;
        } else {
            return '!' + link;
        }
    }
}

/**
 * createAudio creates markdown of audio. The source URL is used if and only if it's
 * truthy and does not start with `blob:`.
 * @param {string} srcUrl - the URL of the audio.
 * @param {string} pageUrl - the URL of the page the audio is on.
 * @returns {Promise<string>}
 */
export async function createAudio(srcUrl, pageUrl) {
    const usingSrcUrl = srcUrl && !srcUrl.startsWith('blob:');
    const url = usingSrcUrl ? srcUrl : pageUrl;
    return await createLink('audio', url);
}

/**
 * createTabLink creates a markdown link for a tab. Stardown does not add to, or remove
 * from, the link any HTML element ID or text fragment. The tab title is used as the
 * link title.
 * @param {any} tab - the tab to create the link from.
 * @param {string} subBrackets - the setting for what to substitute any square brackets
 * with.
 * @returns {Promise<string>} - a Promise that resolves to the markdown link.
 */
export async function createTabLink(tab, subBrackets) {
    if (tab.title === undefined) {
        console.error('tab.title is undefined');
        throw new Error('tab.title is undefined');
        // Were the necessary permissions granted?
    }

    return await createLink(tab.title, tab.url, subBrackets);
}
