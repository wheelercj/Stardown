import { TurndownService } from './turndown.js';
import { turndownPluginGfm } from './turndown-plugin-gfm.js';

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
 * newTurndownService creates a new TurndownService instance. The instance has been
 * customized in a way that depends on the `location` object.
 * @param {string} bulletPoint - the Stardown setting for the bullet point character.
 * @param {string} subBrackets - the Stardown setting for what to substitute square
 * brackets with.
 * @param {string} selectionFormat - the Stardown setting for the selection format.
 * @param {Function(string): string} turndownEscape - the markdown escape function for
 * the Turndown service instance to use.
 * @returns {TurndownService}
 */
export function newTurndownService(bulletPoint, subBrackets, selectionFormat, turndownEscape) {
    // https://github.com/mixmark-io/turndown
    const t = new TurndownService({
        bulletListMarker: bulletPoint,
        headingStyle: 'atx',
        emDelimiter: '*',
        codeBlockStyle: 'fenced',
        defaultReplacement: defaultReplacement,
    });

    // Turndown rules have precedence. For added rules specifically, for each HTML
    // element, the first encountered rule that has a matching filter is used. However,
    // it appears that using Turndown's addRule method with an existing rule's name
    // replaces the existing rule. That is why Stardown's addRules function is called
    // after `t.use(turndownPluginGfm.gfm);`, which adds some rules that Stardown
    // overwrites. More details about Turndown rule precedence here:
    // https://github.com/mixmark-io/turndown?tab=readme-ov-file#rule-precedence

    t.use(turndownPluginGfm.gfm); // GitHub Flavored Markdown

    addRules(t, subBrackets);
    if (selectionFormat === 'blockquote with link') {
        addBlockquoteRules(t);
    }

    t.escape = turndownEscape;

    t.keep(['u', 'dl', 'dt', 'dd']);

    // Keep subscript and superscript nodes as HTML if and only if they don't contain
    // HTML anchor elements because they are not clickable at least in Obsidian. Also,
    // if URLs aren't processed, they can't be made absolute.
    t.keep((node) => {
        return (
            (node.nodeName === 'SUB' || node.nodeName === 'SUP') &&
            !node.querySelectorAll('a').length
        );
    });

    t.remove(['style', 'script', 'noscript', 'link']);

    return t;
}

/**
 * defaultReplacement handles conversion to markdown for any and all nodes which are not
 * recognized by any other rule.
 * @param {string} content - the page's content within the unrecognized element.
 * @param {*} node - the HTML element node.
 * @returns {string}
 */
function defaultReplacement(content, node) {
    // Escape square brackets that are around markdown links because at least
    // some markdown renderers including Obsidian don't allow links to be within
    // unescaped square brackets.
    const pattern = /\[((?:[^\[\]]*(?<!!)\[[^\[\]]*\]\([^\(\)]+\)[^\[\]]*)+)\]/g;
    content = content.replaceAll(pattern, '\\[$1\\]');

    return node.isBlock ? '\n\n' + content + '\n\n' : content
}

/**
 * addRules adds custom Turndown rules to a Turndown service instance.
 * @param {TurndownService} t - the Turndown service instance.
 * @param {string} subBrackets - the Stardown setting for what to substitute square
 * brackets with.
 * @returns {void}
 */
function addRules(t, subBrackets) {
    // Each Turndown rule runs on each yet-unreplaced HTML element. If the element
    // matches the rule's filter, the rule's replacement function runs on it.

    t.addRule('inlineLink', {
        filter: isInlineLink,
        replacement: newConvertLinkToMarkdown(subBrackets),
    });

    t.addRule('img', {
        filter: 'img',
        replacement: convertImageToMarkdown,
    });

    t.addRule('strikethrough', {
        filter: ['del', 's', 'strike'],
        replacement: function (content) {
            return '~~' + content + '~~';
        },
    });

    t.addRule('highlight', {
        filter: 'mark',
        replacement: function (content) {
            return '==' + content + '==';
        },
    });

    // The following rules are for tables, and they apply to both source-formatted
    // markdown and markdown in a block quote. Even though most or all markdown
    // renderers don't render tables within block quotes, Stardown puts into block
    // quotes not just the content of tables but also their markdown syntax because the
    // output will (at least usually) not look good either way, keeping table syntax is
    // more intuitive and easier for the user to edit into a table that's outside a
    // block quote, and maybe some markdown renderers do allow tables to be in block
    // quotes.

    t.addRule('tableCell', {
        filter: ['th', 'td'],
        replacement: function (content, node) {
            return ' | ' + content.replaceAll('\n', ' ').replaceAll(/\s+/g, ' ');
        },
    });

    t.addRule('tableRow', {
        filter: 'tr',
        replacement: function (content, node) {
            return content.trim() + ' |\n';
        },
    });

    t.addRule('tableHeader', {
        filter: 'thead',
        replacement: function (content, node) {
            let columnCount = 0;
            const headTRs = node.childNodes;
            if (headTRs && headTRs.length > 0) {
                const headTHs = headTRs[0].childNodes;
                if (headTHs) {
                    columnCount = headTHs.length;
                }
            }

            if (columnCount === 0) {
                return content + '\n';
            } else {
                content = content + '\n';
                for (let i = 0; i < columnCount; i++) {
                    content += '| --- ';
                }
                return content + '|\n';
            }
        },
    });
}

/**
 * addBlockquoteRules adds to a Turndown service instance custom Turndown rules for
 * handling markdown that will be put into a block quote.
 * @param {TurndownService} t - the Turndown service instance.
 * @returns {void}
 */
function addBlockquoteRules(t) {
    t.addRule('heading', {
        filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
        replacement: function (content, node, options) {
            return '\n\n**' + content + '**\n\n'
        },
    });
}

/**
 * isInlineLink reports whether the given node is a link and should be inlined.
 * @param {*} node - the HTML element node.
 * @param {*} options - the Turndown options.
 * @returns {boolean}
 */
function isInlineLink(node, options) {
    return (
        options.linkStyle === 'inlined' &&
        node.nodeName === 'A' &&
        node.getAttribute('href')
    )
}

/**
 * newConvertLinkToMarkdown returns a function that converts an HTML link to a markdown
 * link.
 * @param {string} subBrackets - the Stardown setting for what to substitute square
 * brackets with.
 * @returns {Function(string, any): string}
 */
function newConvertLinkToMarkdown(subBrackets) {
    /**
     * @param {string} content - the page's content within the HTML anchor. If the
     * anchor contains some elements like inline SVGs, this variable will be falsy.
     * @param {*} node - the HTML element node.
     * @returns {string}
     */
    return function (content, node) {
        if (!content) { // if the link's title would be empty
            return ''; // don't create the link
        }

        // replace square brackets in the anchor element's content if and only if it
        // isn't an image
        const mdImagePattern = /^!\[[^\]]*\]\([^\)]*\)$/;
        if (!content.match(mdImagePattern)) {
            content = replaceBrackets(content, subBrackets);
        }

        let href = node.getAttribute('href') || '';
        if (href) {
            href = href.replaceAll(' ', '%20').replaceAll('(', '%28').replaceAll(')', '%29');

            // make the URL absolute
            if (href.startsWith('/')) {
                const url = new URL(location.href);
                const base = url.origin;
                href = base + href;
            } else if (href.startsWith('#')) {
                href = location.href + href;
            }
        }

        return '[' + content + '](' + href + ')';
    };
}

/**
 * convertImageToMarkdown converts an HTML image to a markdown image.
 * @param {*} content - the page's content within the HTML image.
 * @param {*} node - the HTML element node.
 * @returns {string}
 */
function convertImageToMarkdown(content, node) {
    let src = node.getAttribute('src') || '';
    if (!src) {
        return '';
    }

    // remove excess whitespace
    let alt = cleanAttribute(node.getAttribute('alt') || '');

    // make the URL absolute
    if (src.startsWith('//')) {
        src = 'https:' + src.replaceAll(' ', '%20');
    } else if (src.startsWith('/')) {
        const url = new URL(location.href);
        const base = url.origin;
        src = base + src;
    }

    // remove excess whitespace
    let title = cleanAttribute(node.getAttribute('title') || '');
    let titlePart = title ? ' "' + title + '"' : '';

    return '![' + alt + '](' + src + titlePart + ')';
}

/**
 * cleanAttribute replaces each group of whitespace characters containing at least
 * one newline character with one newline character. If the input is falsy, an empty
 * string is returned.
 * @param {string} attribute - the attribute to clean.
 * @returns {string}
 */
function cleanAttribute(attribute) {
    return attribute ? attribute.replace(/(\n+\s*)+/g, '\n') : ''
}
