// Картинки в комментариях (CommentImagesExtra.lsf) — ОВЕРЛЕЙ над базовыми comments.js / mentions.js,
// которые менять нельзя (код upstream и команды custom). Картинка хранится внутри RICHTEXT комментария
// как <img src="data:image/...;base64,...">, поэтому сервер ничего нового не знает.
//   1. Редактор: расширяем window.Quill (как commentMentions.js). В редакторе диалога комментария —
//      кнопка «картинка»; в нём и в строке быстрого ввода — сжатие скрина при Ctrl+V и перетаскивании.
//      Остальные поля RICHTEXT работают как в платформе.
//   2. Отображение: оборачиваем виды comments и mentionFeed — после базовой отрисовки сообщения с <img>
//      перерисовываются тем же фильтром HTML, но с разрешённой картинкой data:image (базовый её вырезает).
//   3. Клик по картинке в списке открывает её в полный размер.
(function () {
    var MAX_SIDE = 1600;                  // длинная сторона после сжатия, px
    var KEEP_BYTES = 200 * 1024;          // файл меньше и не больше MAX_SIDE вставляется как есть
    var MAX_DATA_URL = 1500 * 1024;       // предел картинки после сжатия (длина data URL, ~1.1 МБ)
    var QUALITY = 0.85;
    var MIMETYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp'];
    var SAFE_IMG = /^data:image\/(png|jpeg|gif|webp|bmp);base64,[A-Za-z0-9+\/=\s]+$/i;

    var RU = /^ru/i.test(document.documentElement.lang || navigator.language || '');
    var T = RU ? {
        insert: 'Вставить картинку',
        tooLarge: 'Картинка слишком большая даже после сжатия (больше ' + Math.round(MAX_DATA_URL / 1024 / 1024 * 10) / 10 + ' МБ).',
        failed: 'Не удалось прочитать картинку.'
    } : {
        insert: 'Insert image',
        tooLarge: 'The image is too large even after compression (over ' + Math.round(MAX_DATA_URL / 1024 / 1024 * 10) / 10 + ' MB).',
        failed: 'Could not read the image.'
    };

    // ---------------------------------------------------------------- сжатие

    function readAsDataUrl(blob) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () { resolve(reader.result); };
            reader.onerror = function () { reject(new Error(T.failed)); };
            reader.readAsDataURL(blob);
        });
    }

    function loadImage(url) {
        return new Promise(function (resolve, reject) {
            var img = new Image();
            img.onload = function () { resolve(img); };
            img.onerror = function () { reject(new Error(T.failed)); };
            img.src = url;
        });
    }

    function checkSize(dataUrl) {
        if (dataUrl.length > MAX_DATA_URL) throw new Error(T.tooLarge);
        return dataUrl;
    }

    // Уменьшаем до MAX_SIDE и пересжимаем в WebP (сохраняет прозрачность, мелкий текст скринов
    // читается лучше, чем в JPEG); браузер без кодировщика WebP вернёт PNG — тогда JPEG на белом фоне.
    // GIF оставляем как есть, чтобы не потерять анимацию.
    function prepare(file) {
        if (file.type === 'image/gif') return readAsDataUrl(file).then(checkSize);
        var url = URL.createObjectURL(file);
        return loadImage(url).then(function (img) {
            var w = img.naturalWidth, h = img.naturalHeight;
            var scale = Math.min(1, MAX_SIDE / Math.max(w, h));
            if (scale === 1 && file.size <= KEEP_BYTES && file.type !== 'image/bmp')
                return readAsDataUrl(file);
            var canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(w * scale));
            canvas.height = Math.max(1, Math.round(h * scale));
            var ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            var result = canvas.toDataURL('image/webp', QUALITY);
            if (result.indexOf('data:image/webp') !== 0) {
                ctx.fillStyle = '#fff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                result = canvas.toDataURL('image/jpeg', QUALITY);
            }
            return result;
        }).then(function (result) {
            URL.revokeObjectURL(url);
            return checkSize(result);
        }, function (err) {
            URL.revokeObjectURL(url);
            throw err;
        });
    }

    // ---------------------------------------------------------------- редактор

    var BaseQuill = window.Quill;

    // Поля комментария: редактор диалога (comments.js) и строка быстрого ввода над списком —
    // обычное поле RICHTEXT inputComment() из метакода, его платформа тоже строит на window.Quill.
    // Проверяем при вставке, а не в конструкторе: поле может создаваться ещё вне документа.
    function isCommentField(quill) {
        var root = quill.root;
        return !!(root && root.closest &&
            (root.closest('.comment-editor') || root.closest('[lsfusion-container="PROPERTY(inputComment())"]')));
    }

    // Вставка файлов со сжатием: так модуль uploader Quill вставляет Ctrl+V и перетаскивание,
    // так же работает кнопка «картинка».
    function uploadImages(quill, range, files) {
        files = Array.prototype.filter.call(files, function (file) { return file && MIMETYPES.indexOf(file.type) !== -1; });
        if (!files.length) return;
        Promise.all(files.map(prepare)).then(function (images) {
            var Delta = BaseQuill.import('delta');
            var delta = images.reduce(function (d, src) { return d.insert({ image: src }); },
                new Delta().retain(range.index).delete(range.length));
            quill.updateContents(delta, 'user');
            quill.setSelection(range.index + images.length, 'silent');
        }, function (err) {
            window.alert(err && err.message ? err.message : T.failed);
        });
    }

    function addImageButton(quill) {
        var toolbar = quill.getModule('toolbar');
        var container = toolbar && toolbar.container;
        if (!container || container.querySelector('button.ql-image')) return;

        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'ql-image';
        button.title = T.insert;
        button.setAttribute('aria-label', T.insert);
        var icons = BaseQuill.import('ui/icons');
        if (icons && icons.image) button.innerHTML = icons.image;
        // рядом со ссылкой; в Quill 2 кнопки лежат в группах <span class="ql-formats">
        var link = container.querySelector('button.ql-link');
        (link ? link.parentNode : container).appendChild(button);

        button.addEventListener('click', function (e) {
            e.preventDefault();
            var input = document.createElement('input');
            input.type = 'file';
            input.accept = MIMETYPES.join(',');
            input.multiple = true;
            input.addEventListener('change', function () {
                if (!input.files || !input.files.length) return;
                var range = quill.getSelection(true) || { index: Math.max(quill.getLength() - 1, 0), length: 0 };
                uploadImages(quill, range, input.files);
            });
            input.click();
        });
    }

    if (BaseQuill && typeof BaseQuill === 'function') {
        class QuillWithImages extends BaseQuill {
            constructor(container, options) {
                super(container, options);
                var quill = this;
                // редактор диалога комментария: comments.js создаёт его уже внутри .comment-editor
                this.commentImages = !!(this.container.closest && this.container.closest('.comment-editor'));
                if (this.commentImages) {
                    try { addImageButton(this); } catch (err) { /* кнопка — дополнение, редактор не ломаем */ }
                }
                // в полях комментария — своя вставка со сжатием, в остальных полях RICHTEXT — как в платформе
                var uploader = this.getModule('uploader');
                if (uploader && typeof uploader.upload === 'function') {
                    var baseUpload = uploader.upload.bind(uploader);
                    uploader.upload = function (range, files) {
                        if (isCommentField(quill)) uploadImages(quill, range, files);
                        else baseUpload(range, files);
                    };
                }
            }

            // comments.js сохраняет HTML, только если getText() не пустой, а картинка в текст Quill не входит:
            // комментарий из одной картинки сохранился бы пустым. Для этого вызова без аргументов добавляем
            // невидимый символ-заменитель объекта; вызовы с диапазоном (ими пользуется модуль упоминаний) не трогаем.
            getText(index, length) {
                var text = super.getText(index, length);
                if (this.commentImages && index === undefined && !text.trim() && this.root.querySelector('img'))
                    return text + '￼';
                return text;
            }
        }
        window.Quill = QuillWithImages;
    }

    // ---------------------------------------------------------------- отображение

    // Тот же разрешающий фильтр, что в comments.js / mentions.js, плюс <img> только с data:image.
    function sanitizeHtml(html) {
        var ALLOWED = { A: 1, B: 1, STRONG: 1, I: 1, EM: 1, U: 1, S: 1, P: 1, BR: 1, OL: 1, UL: 1, LI: 1, SPAN: 1, BLOCKQUOTE: 1, PRE: 1, CODE: 1, H1: 1, H2: 1, H3: 1, H4: 1 };
        var SAFE_HREF = /^(https?:|mailto:|tel:|#|\/)/i;
        var tpl = document.createElement('template');
        tpl.innerHTML = String(html == null ? '' : html);
        var clean = function (src, dst) {
            Array.prototype.forEach.call(src.childNodes, function (node) {
                if (node.nodeType === 3) {
                    dst.appendChild(document.createTextNode(node.nodeValue));
                } else if (node.nodeType === 1 && node.tagName === 'IMG') {
                    var srcAttr = (node.getAttribute('src') || '').trim();
                    if (SAFE_IMG.test(srcAttr)) {
                        var img = document.createElement('img');
                        img.className = 'cmt-img';
                        img.setAttribute('src', srcAttr);
                        img.setAttribute('alt', '');
                        dst.appendChild(img);
                    }
                } else if (node.nodeType === 1 && ALLOWED[node.tagName]) {
                    var el = document.createElement(node.tagName);
                    if (node.getAttribute('class')) el.setAttribute('class', node.getAttribute('class'));
                    if (node.tagName === 'A') {
                        var href = (node.getAttribute('href') || '').trim();
                        if (SAFE_HREF.test(href)) {
                            el.setAttribute('href', href);
                            el.setAttribute('target', '_blank');
                            el.setAttribute('rel', 'noopener noreferrer');
                        }
                    }
                    clean(node, el);
                    dst.appendChild(el);
                } else if (node.nodeType === 1) {
                    clean(node, dst);
                }
            });
        };
        var out = document.createElement('div');
        clean(tpl.content, out);
        return out.innerHTML;
    }

    // Базовый update строит по одному .cmt-message на строку списка в том же порядке, поэтому
    // сообщения сопоставляются со строками по индексу; при расхождении ничего не трогаем.
    function wrapView(name, rowSelector) {
        var base = window[name];
        if (typeof base !== 'function') return;
        window[name] = function () {
            var view = base.apply(this, arguments);
            var baseUpdate = view.update;
            view.update = function (element, controller, list) {
                baseUpdate.apply(this, arguments);
                if (!list || !list.length) return;
                var messages = element.querySelectorAll(rowSelector + ' .cmt-message');
                if (messages.length !== list.length) return;
                list.forEach(function (row, i) {
                    var html = row && row.text;
                    if (html && String(html).indexOf('<img') !== -1)
                        messages[i].innerHTML = sanitizeHtml(html);
                });
            };
            return view;
        };
    }

    wrapView('comments', '.cmt');
    wrapView('mentionFeed', '.mnt-row');

    // ---------------------------------------------------------------- просмотр

    function openViewer(src) {
        var overlay = document.createElement('div');
        overlay.className = 'cmt-img-viewer';
        var img = document.createElement('img');
        img.src = src;
        overlay.appendChild(img);

        function close() {
            document.removeEventListener('keydown', onKey, true);
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }
        // Esc закрывает только просмотр, а не форму под ним
        function onKey(e) {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
        }
        overlay.addEventListener('click', function (e) { e.stopPropagation(); close(); });
        document.addEventListener('keydown', onKey, true);
        document.body.appendChild(overlay);
    }

    // Фаза перехвата на document: клик по картинке не доходит до строки ленты упоминаний,
    // которая по клику открывает объект.
    document.addEventListener('click', function (e) {
        var img = e.target && e.target.closest && e.target.closest('.cmt-message img.cmt-img');
        if (!img) return;
        e.preventDefault();
        e.stopPropagation();
        openViewer(img.getAttribute('src'));
    }, true);
})();
