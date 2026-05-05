/**
 * eslint-rules/no-cyrillic.js
 *
 * Custom ESLint rule that flags any Cyrillic character in source
 * comments and string literals. Triggered by user feedback that the
 * codebase should be English-only (no Russian comments or commits).
 *
 * Data files that legitimately ship Russian strings (i18n
 * dictionary, the restriction-enzyme description map, etc.) are
 * excluded via the flat-config `files` glob — this module just
 * implements the rule logic.
 *
 * The rule has TWO message ids so callers can downgrade the
 * string-literal flavour to a warning while keeping comments at
 * error level (comments must stay English; strings are sometimes
 * legitimate test fixtures or i18n keys that need translation
 * later).
 */

const CYRILLIC = /[Ѐ-ӿԀ-ԯ]/;

const noCyrillic = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow Cyrillic characters in source comments and string literals.',
    },
    schema: [],
    messages: {
      cyrillicInComment:
        'Cyrillic characters are not allowed in code comments. Use English.',
      cyrillicInString:
        'Cyrillic characters are not allowed in string literals. Move to the i18n dictionary or translate.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode || context.getSourceCode();
    return {
      Program() {
        for (const comment of sourceCode.getAllComments()) {
          if (CYRILLIC.test(comment.value)) {
            context.report({ node: comment, messageId: 'cyrillicInComment' });
          }
        }
      },
      Literal(node) {
        if (typeof node.value === 'string' && CYRILLIC.test(node.value)) {
          context.report({ node, messageId: 'cyrillicInString' });
        }
      },
      TemplateElement(node) {
        const cooked = node.value && node.value.cooked;
        if (typeof cooked === 'string' && CYRILLIC.test(cooked)) {
          context.report({ node, messageId: 'cyrillicInString' });
        }
      },
    };
  },
};

const plugin = {
  meta: { name: 'bodgegene-local' },
  rules: { 'no-cyrillic': noCyrillic },
};

export default plugin;
