// Mentions feed (#5280) — CUSTOM 'mentionFeed' on the mentions form.
// Renders the Kaiten-style list of all comments the current user is @-mentioned in:
// one row per mention — author, object the comment lives on, date and time, comment
// body and a read/unread envelope. Clicking a row (or the object chip) opens the
// object and marks the mention read; the envelope toggles the read mark alone.
// Helpers mirror comments.js on purpose: same avatars, same sanitizer, same look.

function mentionFeed() {

    // deterministic hue from a string, matching the comment list avatars
    function hueOf(str) {
        let h = 0;
        str = str || "?";
        for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
        return h;
    }

    // up to two initials from the author name
    function initialsOf(str) {
        let parts = (str || "").trim().split(/\s+/).filter(Boolean);
        if (!parts.length) return "?";
        let s = parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "");
        return s.toUpperCase();
    }

    // paint the base64 photo synchronously (see comments.js for the flicker rationale)
    function applyPhoto(el, b64, fallback) {
        let url = b64 || null;
        el.__avUrl = url;
        if (!url) {
            el.classList.remove("has-photo");
            el.style.backgroundImage = "";
            el.style.backgroundColor = "";
            fallback();
            return;
        }
        el.textContent = "";
        el.classList.add("has-photo");
        el.style.backgroundImage = "url('" + url + "')";
        el.style.backgroundSize = "cover";
        el.style.backgroundPosition = "center";
        el.style.backgroundColor = "transparent";
        let img = new Image();
        img.onerror = function () {
            if (el.__avUrl !== url) return;
            el.classList.remove("has-photo");
            el.style.backgroundImage = "";
            el.style.backgroundColor = "";
            fallback();
        };
        img.src = url;
    }

    // allowlist sanitizer, identical to the comment list's (the stored rich text is
    // the same Quill markup — mention chips are spans with a class, kept by it)
    function sanitizeHtml(html) {
        const ALLOWED = { A: 1, B: 1, STRONG: 1, I: 1, EM: 1, U: 1, S: 1, P: 1, BR: 1, OL: 1, UL: 1, LI: 1, SPAN: 1, BLOCKQUOTE: 1, PRE: 1, CODE: 1, H1: 1, H2: 1, H3: 1, H4: 1 };
        const SAFE_HREF = /^(https?:|mailto:|tel:|#|\/)/i;
        const tpl = document.createElement("template");
        tpl.innerHTML = String(html == null ? "" : html);
        const clean = (src, dst) => {
            for (const node of Array.from(src.childNodes)) {
                if (node.nodeType === 3) {
                    dst.appendChild(document.createTextNode(node.nodeValue));
                } else if (node.nodeType === 1 && ALLOWED[node.tagName]) {
                    const el = document.createElement(node.tagName);
                    if (node.getAttribute("class")) el.setAttribute("class", node.getAttribute("class"));
                    if (node.tagName === "A") {
                        const href = (node.getAttribute("href") || "").trim();
                        if (SAFE_HREF.test(href)) {
                            el.setAttribute("href", href);
                            el.setAttribute("target", "_blank");
                            el.setAttribute("rel", "noopener noreferrer");
                        }
                    }
                    clean(node, el);
                    dst.appendChild(el);
                } else if (node.nodeType === 1) {
                    clean(node, dst);
                }
            }
        };
        const out = document.createElement("div");
        clean(tpl.content, out);
        return out.innerHTML;
    }

    return {
        render: function (element, controller) {
            let feed = document.createElement("div");
            feed.classList.add("mnt-feed");
            element.appendChild(feed);
            element.feed = feed;
        },
        update: function (element, controller, list, options) {
            let root = element.feed;
            const i18n = (options && options.i18n) || {};
            const txt = (key, fallback) => (i18n[key] != null ? i18n[key] : fallback);
            // the row actions change read marks, so the toolbar badge needs a nudge to catch up
            function touchBadge() { if (window.mntBadgeRefresh) setTimeout(window.mntBadgeRefresh, 1500); }
            while (root.lastElementChild) root.removeChild(root.lastElementChild);

            if (!list || !list.length) {
                let empty = document.createElement("div");
                empty.className = "mnt-empty";
                let emptyIcon = document.createElement("i");
                emptyIcon.className = "bi " + (i18n.emptyIcon || "bi-at");
                let emptyText = document.createElement("span");
                emptyText.textContent = txt("empty", "No mentions");
                empty.appendChild(emptyIcon);
                empty.appendChild(emptyText);
                root.appendChild(empty);
                return;
            }

            for (const item of list) {
                let row = document.createElement("div");
                row.className = "mnt-row" + (item.unread ? " mnt-unread" : "");
                row.title = txt("openHint", "Open");

                let avatar = document.createElement("div");
                avatar.className = "cmt-avatar";
                applyPhoto(avatar, item.avatar, function () {
                    avatar.style.setProperty("--ahue", hueOf(item.author));
                    avatar.textContent = initialsOf(item.author);
                });
                row.appendChild(avatar);

                let main = document.createElement("div");
                main.className = "mnt-main";
                row.appendChild(main);

                let head = document.createElement("div");
                head.className = "mnt-head";
                main.appendChild(head);

                let author = document.createElement("span");
                author.className = "mnt-author";
                author.textContent = item.author || "";
                head.appendChild(author);

                let time = document.createElement("span");
                time.className = "mnt-time";
                time.textContent = item.date || "";
                time.setAttribute("title", item.ago || "");
                head.appendChild(time);

                // the object the comment was left on — Kaiten's card link
                if (item.target) {
                    let target = document.createElement("a");
                    target.className = "mnt-target";
                    target.textContent = item.target;
                    target.title = txt("openHint", "Open");
                    target.addEventListener("click", function (e) {
                        e.stopPropagation();
                        controller.changeProperty("c.open", item);
                        touchBadge();
                    });
                    main.appendChild(target);
                }

                let message = document.createElement("div");
                message.className = "cmt-message ql-editor ql-bubble";
                message.innerHTML = sanitizeHtml(item.text);
                main.appendChild(message);

                // the read mark (Kaiten's envelope): click toggles, row click opens
                let env = document.createElement("button");
                env.type = "button";
                env.className = "mnt-env";
                env.innerHTML = '<i class="bi ' + (item.unread ? "bi-envelope-fill" : "bi-envelope-open") + '"></i>';
                env.title = txt(item.unread ? "markRead" : "markUnread", item.unread ? "Mark read" : "Mark unread");
                env.addEventListener("click", function (e) {
                    e.stopPropagation();
                    controller.changeProperty("c.toggle", item);
                    touchBadge();
                });
                row.appendChild(env);

                row.addEventListener("click", function () {
                    controller.changeProperty("c.open", item);
                    touchBadge();
                });

                root.appendChild(row);
            }
        },
        clear: function (element) {
        }
    }
}

// Live toolbar badge: the web client reads navigator captions once per page load, so the
// unread count is polled over the API and patched into the badge span (found by the
// "Упоминания" caption text around it, matching the badged() caption in MentionsFeed.lsf).
// The API is at the site root (/exec/...), same origin the client itself is served from.
(function () {
    function refresh() {
        fetch("/exec/MentionsFeed.getUnreadMentionsCount")
            .then(function (r) {
                if (!r.ok) console.warn("mentions badge: HTTP " + r.status);
                return r.ok ? r.json() : null;
            })
            .then(function (d) {
                if (!d) return;
                let n = (Array.isArray(d) ? d[0] : d) || {};
                n = n.count || 0;
                document.querySelectorAll(".badge").forEach(function (b) {
                    let wrap = b.parentElement;
                    if (wrap && wrap.textContent.indexOf("Упоминания") !== -1) {
                        if (n > 0) {
                            b.textContent = n;
                            b.style.display = "";
                        } else {
                            b.style.display = "none";
                        }
                    }
                });
            })
            .catch(function (e) {
                console.warn("mentions badge: " + e);
            });
    }
    window.mntBadgeRefresh = refresh;
    setInterval(refresh, 20000);
    window.addEventListener("focus", refresh);
    refresh();
})();
