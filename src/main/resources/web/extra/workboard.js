// Доска распределения работ (форма workPlanning, модуль WorkPlanning).
// Три представления объектных групп: вкладки досок (workBoardTabs), «Свободные» (workBoardFree)
// и сама доска с колонками заказов (workBoard). Плашки перетаскиваются между представлениями,
// поэтому состояние перетаскивания общее для всего файла.

var workBoardDrag = null; // { kind: 'employee', employeeId } | { kind: 'alloc', row, allocId, orderId, dayHours }

function workBoardText(options, key, fallback) {
    const t = (options && options.i18n) || {};
    return t[key] != null ? t[key] : fallback;
}

// DATE приходит строкой 'YYYY-MM-DD' (из JSON) или объектом Date (из строки группы)
function workBoardDateKey(v) {
    if (v == null) return null;
    if (typeof v === "string") return v.substring(0, 10);
    const d = new Date(v);
    const p = (n) => (n < 10 ? "0" : "") + n;
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

function workBoardDateShort(v) {
    const k = workBoardDateKey(v);
    return k ? k.substring(8, 10) + "." + k.substring(5, 7) : "";
}

function workBoardDateFull(v) {
    const k = workBoardDateKey(v);
    return k ? k.substring(8, 10) + "." + k.substring(5, 7) + "." + k.substring(0, 4) : "";
}

function workBoardHours(n) {
    if (n == null) return "";
    return String(Math.round(Number(n) * 100) / 100).replace(".", ",");
}

// COLOR приходит из JSON числом ARGB (часто отрицательным) — в CSS нужен #RRGGBB
function workBoardColor(c) {
    if (c == null) return null;
    return "#" + ((Number(c) >>> 0) & 0xFFFFFF).toString(16).padStart(6, "0");
}

// бейдж статуса заказа цветом статуса
function workBoardStatus(order, cls) {
    const s = document.createElement("span");
    s.className = "wb-status" + (cls ? " " + cls : "");
    s.textContent = order.status || "";
    const color = workBoardColor(order.statusColor);
    if (color) s.style.background = color;
    return s;
}

// тот же цвет для одной и той же строки (должности) во всех представлениях
function workBoardHue(str) {
    let h = 0;
    str = str || "?";
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
    return h;
}

// подсветка всех плашек одного сотрудника при наведении (основная и отделённые)
function workBoardRelate(employeeId, on) {
    document.querySelectorAll('.wb-chip[data-employee="' + employeeId + '"]').forEach((c) => c.classList.toggle("wb-related", on));
}

function workBoardChip(name, position, employeeId) {
    const chip = document.createElement("div");
    chip.className = "wb-chip";
    chip.setAttribute("draggable", "true");
    chip.dataset.employee = employeeId;
    chip.style.setProperty("--wb-hue", workBoardHue(position));
    const nm = document.createElement("span");
    nm.className = "wb-chip-name";
    nm.textContent = name || "";
    chip.appendChild(nm);
    if (position) {
        const ps = document.createElement("span");
        ps.className = "wb-chip-pos";
        ps.textContent = position;
        chip.appendChild(ps);
    }
    chip.title = position ? name + " — " + position : name;
    chip.addEventListener("mouseenter", () => workBoardRelate(employeeId, true));
    chip.addEventListener("mouseleave", () => workBoardRelate(employeeId, false));
    return chip;
}

function workBoardBadge(chip, text, cls) {
    const b = document.createElement("span");
    b.className = "wb-chip-badge" + (cls ? " " + cls : "");
    b.textContent = text;
    chip.appendChild(b);
}

// небольшое всплывающее окно на <body>: подтверждение отделения и карточка плашки
function workBoardPopup() {
    let pop = document.querySelector(".wb-pop");
    if (!pop) {
        pop = document.createElement("div");
        pop.className = "wb-pop";
        pop.style.display = "none";
        document.body.appendChild(pop);
        document.addEventListener("mousedown", (e) => {
            if (pop.style.display !== "none" && !pop.contains(e.target)) pop.style.display = "none";
        });
        document.addEventListener("keydown", (e) => { if (e.key === "Escape") pop.style.display = "none"; });
    }
    pop.innerHTML = "";
    return pop;
}

function workBoardShowPopup(pop, x, y) {
    pop.style.display = "block";
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    pop.style.left = Math.round(Math.max(6, Math.min(x, window.innerWidth - pw - 6))) + "px";
    pop.style.top = Math.round(Math.max(6, Math.min(y, window.innerHeight - ph - 6))) + "px";
    const input = pop.querySelector("input");
    if (input) {
        input.focus();
        if (input.type === "number") input.select();
    }
}

function workBoardButton(text, cls, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "wb-btn " + (cls || "");
    b.textContent = text;
    b.addEventListener("click", onClick);
    return b;
}

// поле часов с кнопкой: Enter — подтвердить
function workBoardHoursInput(pop, title, value, okText, cancelText, onOk) {
    const head = document.createElement("div");
    head.className = "wb-pop-title";
    head.textContent = title;
    pop.appendChild(head);
    const row = document.createElement("div");
    row.className = "wb-pop-row";
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0.5";
    input.step = "0.5";
    input.value = value;
    input.className = "wb-pop-input";
    const ok = () => {
        const h = parseFloat(String(input.value).replace(",", "."));
        if (!(h > 0)) { input.classList.add("wb-invalid"); return; }
        pop.style.display = "none";
        onOk(h);
    };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") ok(); });
    input.addEventListener("input", () => input.classList.remove("wb-invalid"));
    row.appendChild(input);
    row.appendChild(workBoardButton(okText, "wb-btn-primary", ok));
    if (cancelText) row.appendChild(workBoardButton(cancelText, "", () => { pop.style.display = "none"; }));
    pop.appendChild(row);
}

function workBoardTabs() {
    return {
        render: function (element) {
            const root = document.createElement("div");
            root.className = "wb-tabs";
            element.appendChild(root);
            element.wbRoot = root;
        },
        update: function (element, controller, list) {
            const root = element.wbRoot;
            root.innerHTML = "";
            for (const row of list) {
                const tab = document.createElement("button");
                tab.type = "button";
                tab.className = "wb-tab" + (controller.isCurrent(row) ? " wb-tab-current" : "");
                tab.textContent = row.name || "";
                tab.addEventListener("click", () => { if (!controller.isCurrent(row)) controller.changeObject(row); });
                root.appendChild(tab);
            }
        }
    };
}

function workBoardFree() {
    return {
        render: function (element) {
            const root = document.createElement("div");
            root.className = "wb-free";
            const head = document.createElement("div");
            head.className = "wb-free-head";
            root.appendChild(head);
            const body = document.createElement("div");
            body.className = "wb-free-body";
            root.appendChild(body);
            element.appendChild(root);
            element.wbRoot = root;
            element.wbHead = head;
            element.wbBody = body;

            // сюда бросают плашку с доски, чтобы снять сотрудника с заказа
            root.addEventListener("dragover", (e) => {
                if (workBoardDrag && workBoardDrag.kind === "alloc") { e.preventDefault(); root.classList.add("wb-over"); }
            });
            root.addEventListener("dragleave", (e) => { if (!root.contains(e.relatedTarget)) root.classList.remove("wb-over"); });
            root.addEventListener("drop", (e) => {
                e.preventDefault();
                root.classList.remove("wb-over");
                const drag = workBoardDrag;
                workBoardDrag = null;
                if (drag && drag.kind === "alloc" && element.wbOptions)
                    element.wbController.form.exec("boardRelease", drag.allocId, workBoardDateKey(element.wbOptions.actionDate));
            });
        },
        update: function (element, controller, list, options) {
            element.wbController = controller;
            element.wbOptions = options;
            const dayHours = options && options.dayHours;

            element.wbHead.textContent = workBoardText(options, "free", "Свободные") + " (" + list.length + ")";
            element.wbHead.title = workBoardText(options, "freeHint", "");

            const body = element.wbBody;
            body.innerHTML = "";
            for (const row of list) {
                const chip = workBoardChip(row.name, row.namePosition, row.eid);
                if (row.free != null && dayHours != null && Number(row.free) < Number(dayHours))
                    workBoardBadge(chip, workBoardHours(row.free) + " " + workBoardText(options, "hoursShort", "ч") + " " +
                                         workBoardText(options, "freeShort", "своб."), "wb-badge-free");
                chip.addEventListener("dragstart", (e) => {
                    e.dataTransfer.effectAllowed = "copyMove";
                    e.dataTransfer.setData("text/plain", String(row.eid));
                    workBoardDrag = { kind: "employee", employeeId: row.eid };
                    chip.classList.add("wb-dragging");
                });
                chip.addEventListener("dragend", () => { chip.classList.remove("wb-dragging"); workBoardDrag = null; });
                body.appendChild(chip);
            }
        },
        clear: function (element) {
            if (element.wbBody) element.wbBody.innerHTML = "";
        }
    };
}

function workBoard() {

    function orderHeader(order, options) {
        const head = document.createElement("div");
        head.className = "wb-col-head";

        // заголовок — номер заказа (в МК это описательный текст), до двух строк
        const title = document.createElement("div");
        title.className = "wb-col-title";
        title.textContent = [order.number, order.item].filter(Boolean).join(" ");
        title.title = title.textContent + (order.note ? "\n" + order.note : "");
        head.appendChild(title);

        // остальное — строки «подпись: значение»
        const fields = document.createElement("div");
        fields.className = "wb-col-fields";
        head.appendChild(fields);
        const field = (label, value, cls) => {
            if (!value) return;
            const l = document.createElement("span");
            l.className = "wb-col-label";
            l.textContent = label;
            const v = document.createElement("span");
            v.className = "wb-col-value" + (cls ? " " + cls : "");
            v.textContent = value;
            v.title = value;
            if (label) fields.appendChild(l);
            else v.classList.add("wb-col-wide");
            fields.appendChild(v);
        };
        if (order.status) {
            const l = document.createElement("span");
            l.className = "wb-col-label";
            l.textContent = workBoardText(options, "statusLabel", "Статус");
            fields.appendChild(l);
            const v = document.createElement("span");
            v.className = "wb-col-value";
            v.appendChild(workBoardStatus(order));
            fields.appendChild(v);
        }
        field(workBoardText(options, "partnerLabel", "Контрагент"), order.partner);
        field(workBoardText(options, "responsibleLabel", "Ответственный"), order.responsible);
        field(workBoardText(options, "startLabel", "Начало"), workBoardDateFull(order.start));
        field(workBoardText(options, "endLabel", "Окончание"), workBoardDateFull(order.end));

        if (order.done) {
            head.classList.add("wb-col-done");
        } else if (order.daysLeft != null) {
            const days = Number(order.daysLeft);
            const dn = workBoardText(options, "daysShort", "дн.");
            if (days < 0)
                field("", workBoardText(options, "overdue", "просрочен на") + " " + (-days) + " " + dn, "wb-overdue");
            else
                field(workBoardText(options, "leftLabel", "Осталось"), days + " " + dn);
        }
        return head;
    }

    function allocChip(row, options, st) {
        const chip = workBoardChip(row.nameEmployee, row.namePosition, row.employee);
        if (row.child) {
            chip.classList.add("wb-chip-child");
            chip.title += "\n" + workBoardText(options, "child", "Отделённая плашка");
        }
        if (row.split) chip.classList.add("wb-chip-split");
        if (row.hours != null)
            workBoardBadge(chip, workBoardHours(row.hours) + " " + workBoardText(options, "hoursShort", "ч"));

        chip.addEventListener("dragstart", (e) => {
            e.dataTransfer.effectAllowed = "copyMove";
            e.dataTransfer.setData("text/plain", String(row.aid));
            workBoardDrag = { kind: "alloc", row: row, allocId: row.aid, orderId: row.order, dayHours: row.dayHours };
            chip.classList.add("wb-dragging");
        });
        chip.addEventListener("dragend", () => { chip.classList.remove("wb-dragging"); workBoardDrag = null; });
        chip.addEventListener("click", (e) => showCard(row, options, st, e.clientX + 8, e.clientY + 8));
        return chip;
    }

    function cardField(pop, label, input) {
        const row = document.createElement("label");
        row.className = "wb-pop-field";
        const cap = document.createElement("span");
        cap.textContent = label;
        row.appendChild(cap);
        row.appendChild(input);
        pop.appendChild(row);
        return input;
    }

    function cardInput(type, value) {
        const input = document.createElement("input");
        input.type = type;
        input.className = "wb-pop-input";
        if (value != null) input.value = value;
        input.addEventListener("input", () => input.classList.remove("wb-invalid"));
        return input;
    }

    // карточка плашки прямо на доске: период, часы в день, снять с заказа
    function showCard(row, options, st, x, y) {
        const pop = workBoardPopup();
        const head = document.createElement("div");
        head.className = "wb-pop-title";
        head.textContent = row.nameEmployee || "";
        pop.appendChild(head);
        const order = ((options && options.orders) || []).find((o) => String(o.id) === String(row.order));
        if (order) {
            const meta = document.createElement("div");
            meta.className = "wb-pop-meta";
            meta.textContent = [order.number, order.item].filter(Boolean).join(" ");
            pop.appendChild(meta);
        }

        const from = cardField(pop, workBoardText(options, "fromDate", "Дата с"), cardInput("date", workBoardDateKey(row.fromDate)));
        const to = cardField(pop, workBoardText(options, "toDate", "Дата по"), cardInput("date", workBoardDateKey(row.toDate)));
        const hint = document.createElement("div");
        hint.className = "wb-pop-hint";
        hint.textContent = workBoardText(options, "toDateHint", "Пусто — до перевода на другой заказ");
        pop.appendChild(hint);
        const hours = cardField(pop, workBoardText(options, "hours", "Часов в день"), cardInput("number", workBoardHours(row.dayHours).replace(",", ".")));
        hours.min = "0.5";
        hours.step = "0.5";

        const save = () => {
            const h = parseFloat(String(hours.value).replace(",", "."));
            let ok = true;
            if (!from.value) { from.classList.add("wb-invalid"); ok = false; }
            if (to.value && from.value && to.value < from.value) { to.classList.add("wb-invalid"); ok = false; }
            if (!(h > 0)) { hours.classList.add("wb-invalid"); ok = false; }
            if (!ok) return;
            pop.style.display = "none";
            st.controller.form.exec("boardSaveAllocation", row.aid, from.value, to.value || "", h);
        };
        [from, to, hours].forEach((i) => i.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); }));

        const actions = document.createElement("div");
        actions.className = "wb-pop-row";
        actions.appendChild(workBoardButton(workBoardText(options, "save", "Сохранить"), "wb-btn-primary", save));
        actions.appendChild(workBoardButton(workBoardText(options, "release", "Снять с заказа"), "wb-btn-danger", () => {
            pop.style.display = "none";
            st.controller.form.exec("boardRelease", row.aid, workBoardDateKey(st.options.actionDate));
        }));
        pop.appendChild(actions);
        workBoardShowPopup(pop, x, y);
    }

    // бросок в колонку заказа: из «Свободных» — назначить, плашку — перевести, с Ctrl — отделить часть часов
    function drop(e, order, st) {
        const drag = workBoardDrag;
        workBoardDrag = null;
        if (!drag || !st.options) return;
        // действия выполняются с actionDate: сегодня внутри периода, иначе его первый день
        const from = workBoardDateKey(st.options.actionDate), to = workBoardDateKey(st.options.to);
        if (drag.kind === "employee") {
            st.controller.form.exec("boardAllocate", drag.employeeId, order.id, from, to);
        } else if (drag.kind === "alloc" && String(drag.orderId) !== String(order.id)) {
            if (e.ctrlKey) {
                const pop = workBoardPopup();
                const half = Math.max(0.5, Math.round(Number(drag.dayHours) || 2) / 2);
                workBoardHoursInput(pop, workBoardText(st.options, "splitTitle", "Сколько часов отделить") + " " + (order.number || ""),
                    half, workBoardText(st.options, "splitOk", "Отделить"), workBoardText(st.options, "cancel", "Отмена"),
                    (h) => st.controller.form.exec("boardSplit", drag.allocId, order.id, h, from));
                workBoardShowPopup(pop, e.clientX + 8, e.clientY + 8);
            } else
                st.controller.form.exec("boardMove", drag.allocId, order.id, from);
        }
    }

    return {
        render: function (element, controller) {
            const root = document.createElement("div");
            root.className = "wb-board";
            const hint = document.createElement("div");
            hint.className = "wb-hint";
            root.appendChild(hint);
            const cols = document.createElement("div");
            cols.className = "wb-cols";
            root.appendChild(cols);
            element.appendChild(root);
            element.wbHint = hint;
            element.wbCols = cols;
            element.wbState = { controller: controller, options: null };
        },
        update: function (element, controller, list, opts) {
            const st = element.wbState;
            st.controller = controller;
            st.options = opts;
            element.wbHint.textContent = workBoardText(opts, "dragHint", "");

            const byOrder = {};
            for (const row of list) (byOrder[row.order] = byOrder[row.order] || []).push(row);

            const scroll = element.wbCols.scrollLeft;
            const cols = element.wbCols;
            cols.innerHTML = "";
            const orders = (opts && opts.orders) || [];
            if (!orders.length) {
                const empty = document.createElement("div");
                empty.className = "wb-empty";
                empty.textContent = workBoardText(opts, "emptyBoard", "");
                cols.appendChild(empty);
            }
            for (const order of orders) {
                const col = document.createElement("div");
                col.className = "wb-col";
                col.appendChild(orderHeader(order, opts));
                const body = document.createElement("div");
                body.className = "wb-col-body";
                for (const row of byOrder[order.id] || []) body.appendChild(allocChip(row, opts, st));
                col.appendChild(body);

                col.addEventListener("dragover", (e) => {
                    if (!workBoardDrag) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = e.ctrlKey && workBoardDrag.kind === "alloc" ? "copy" : "move";
                    col.classList.add("wb-over");
                    col.classList.toggle("wb-over-copy", e.ctrlKey && workBoardDrag.kind === "alloc");
                });
                col.addEventListener("dragleave", (e) => {
                    if (!col.contains(e.relatedTarget)) col.classList.remove("wb-over", "wb-over-copy");
                });
                col.addEventListener("drop", (e) => {
                    e.preventDefault();
                    col.classList.remove("wb-over", "wb-over-copy");
                    drop(e, order, st);
                });
                cols.appendChild(col);
            }
            cols.scrollLeft = scroll;
        },
        clear: function (element) {
            if (element.wbCols) element.wbCols.innerHTML = "";
        }
    };
}
