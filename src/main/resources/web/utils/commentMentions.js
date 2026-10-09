// The '@' (mention) button for the comment editor toolbar (#5279), as an OVERLAY:
// comments.js is a base file and must not be modified, so this script wraps
// window.Quill instead. commentEditor() reads window.Quill fresh on every call,
// and this file is loaded after the base editor scripts (see CommentMentions.lsf),
// so every editor opened after page load gets the button; nothing else changes.
(function () {
    var BaseQuill = window.Quill;
    if (!BaseQuill || typeof BaseQuill !== 'function') return;

    class QuillWithAtButton extends BaseQuill {
        constructor() {
            super(...arguments);
            try {
                var toolbar = this.getModule('toolbar');
                var container = toolbar && toolbar.container;
                if (!container || container.querySelector('button.ql-at')) return;

                var button = document.createElement('button');
                button.type = 'button';
                button.className = 'ql-at';
                button.textContent = '@';
                // commentEditor's i18n JSON comes from the base module and has no key for
                // this button, so the tooltip is the English fallback
                button.title = 'Mention user';
                button.setAttribute('aria-label', button.title);
                // Quill 2 wraps toolbar buttons in <span class="ql-formats"> groups, so the
                // button must go into the clean button's PARENT — inserting into the
                // container itself throws (the reference node is not a child of it)
                var clean = container.querySelector('button.ql-clean');
                (clean ? clean.parentNode : container).insertBefore(button, clean);

                // Insert the mention trigger at the caret and open the same user dropdown
                // as typing '@' with the keyboard: quill-mention's own openMenu() does both
                // (its blur/focus re-runs the module's text scanner); the plain insert with
                // the 'user' source is the fallback that kicks the scanner 50ms later.
                var quill = this;
                button.addEventListener('click', function (e) {
                    e.preventDefault();
                    quill.focus();
                    var mention = quill.getModule('mention');
                    var range = quill.getSelection(true);
                    if (!range) {
                        range = { index: Math.max(quill.getLength() - 1, 0), length: 0 };
                        quill.setSelection(range.index);
                    }
                    if (mention && typeof mention.openMenu === 'function') {
                        mention.openMenu('@');
                    } else {
                        quill.insertText(range.index, '@', 'user');
                        quill.setSelection(range.index + 1);
                    }
                });
            } catch (err) {
                // the button is an addition — never break the editor because of it
            }
        }
    }

    window.Quill = QuillWithAtButton;
})();
