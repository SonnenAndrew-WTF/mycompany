// Диаграмма Ганта по производственным заказам (вкладка «Гант» формы workPlanning, модуль WorkGantt).
// Строка заказа — полоса от начала до планового завершения, раскрывается в строки людей с их распределениями.
// Общие помощники (тексты, даты, всплывающее окно) берутся из workboard.js — он загружается раньше (порядок 6).

const WG_DAY = 86400000;
const WG_LABEL_WIDTH = 280;
const WG_HEAD_HEIGHT = 40;

// дни считаются в UTC, чтобы переход на летнее время не сдвигал полосы
function workGanttDay(key) {
    return key ? Date.UTC(+key.substring(0, 4), +key.substring(5, 7) - 1, +key.substring(8, 10)) / WG_DAY : null;
}

function workGanttKey(day) {
    const d = new Date(day * WG_DAY);
    const p = (n) => (n < 10 ? "0" : "") + n;
    return d.getUTCFullYear() + "-" + p(d.getUTCMonth() + 1) + "-" + p(d.getUTCDate());
}

function workGanttWeekend(day) {
    const dow = new Date(day * WG_DAY).getUTCDay();
    return dow === 0 || dow === 6;
}

function workGanttDiv(cls, text) {
    const d = document.createElement("div");
    d.className = cls;
    if (text != null) d.textContent = text;
    return d;
}

function workGantt() {

    // шкала: months — всегда, ниже дни (если колонка достаточно широкая) или понедельники
    function header(st, g) {
        const head = workGanttDiv("wg-head");
        head.appendChild(workGanttDiv("wg-corner", workBoardText(st.options, "order", "")));
        const time = workGanttDiv("wg-time");
        time.style.width = g.days * g.px + "px";

        let monthStart = 0;
        for (let i = 0; i <= g.days; i++) {
            const day = g.from + i;
            const newMonth = i === g.days || new Date(day * WG_DAY).getUTCDate() === 1;
            if (i > 0 && newMonth) {
                const m = workGanttDiv("wg-month", new Date((g.from + monthStart) * WG_DAY)
                    .toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" }));
                m.style.left = monthStart * g.px + "px";
                m.style.width = (i - monthStart) * g.px + "px";
                time.appendChild(m);
                monthStart = i;
            }
        }

        for (let i = 0; i < g.days; i++) {
            const day = g.from + i;
            const date = new Date(day * WG_DAY);
            let text = null;
            if (g.px >= 18) text = String(date.getUTCDate());
            else if (date.getUTCDay() === 1 && g.px * 7 >= 36) text = workBoardDateShort(workGanttKey(day));
            if (text == null) continue;
            const c = workGanttDiv("wg-day" + (workGanttWeekend(day) ? " wg-weekend" : "") + (day === g.today ? " wg-today" : ""), text);
            c.style.left = i * g.px + "px";
            c.style.width = (g.px >= 18 ? g.px : g.px * 7) + "px";
            time.appendChild(c);
        }
        head.appendChild(time);
        return head;
    }

    // фон под строками: выходные и линия «сегодня» — одним слоем на всю высоту
    function background(g, height) {
        const bg = workGanttDiv("wg-bg");
        bg.style.width = g.days * g.px + "px";
        bg.style.height = height + "px";
        bg.style.setProperty("--wg-px", g.px + "px");
        if (g.px >= 10) bg.classList.add("wg-bg-lines");
        for (let i = 0; i < g.days; i++) {
            if (!workGanttWeekend(g.from + i)) continue;
            const w = workGanttDiv("wg-bg-weekend");
            w.style.left = i * g.px + "px";
            w.style.width = g.px + "px";
            bg.appendChild(w);
        }
        if (g.today >= g.from && g.today < g.from + g.days) {
            const t = workGanttDiv("wg-bg-today");
            t.style.left = Math.round((g.today - g.from + 0.5) * g.px) + "px";
            bg.appendChild(t);
        }
        return bg;
    }

    // положение полосы [start; end] на шкале; полоса вне диапазона — короткий «хвостик» у края
    function place(bar, start, end, g) {
        const last = g.from + g.days - 1;
        bar.classList.toggle("wg-clip-start", start < g.from);
        bar.classList.toggle("wg-clip-end", end > last);
        let s = Math.max(start, g.from), e = Math.min(end, last);
        if (end < g.from) { s = e = g.from; bar.classList.add("wg-out"); }
        if (start > last) { s = e = last; bar.classList.add("wg-out"); }
        bar.style.left = (s - g.from) * g.px + 1 + "px";
        bar.style.width = Math.max(4, (e - s + 1) * g.px - 2) + "px";
    }

    function bar(cls, text, title) {
        const b = workGanttDiv("wg-bar " + cls);
        const t = workGanttDiv("wg-bar-text", text);
        b.appendChild(t);
        b.title = title;
        b.appendChild(workGanttDiv("wg-handle wg-handle-start"));
        b.appendChild(workGanttDiv("wg-handle wg-handle-end"));
        return b;
    }

    // перетаскивание: середина — сдвиг, края — новая дата начала или окончания; без сдвига — щелчок
    function draggable(b, st, g, span, commit, click) {
        b.addEventListener("pointerdown", (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            const target = e.target.classList;
            const mode = target.contains("wg-handle-start") ? "start" : target.contains("wg-handle-end") ? "end" : "move";
            if (b.classList.contains("wg-locked") || b.classList.contains("wg-out")) {
                st.drag = { bar: b, x: e.clientX, locked: true };
            } else
                st.drag = { bar: b, x: e.clientX, mode: mode, delta: 0, moved: false };
            b.setPointerCapture(e.pointerId);
        });
        b.addEventListener("pointermove", (e) => {
            const d = st.drag;
            if (!d || d.bar !== b || d.locked) return;
            if (Math.abs(e.clientX - d.x) > 3) d.moved = true;
            if (!d.moved) return;
            d.delta = Math.round((e.clientX - d.x) / g.px);
            const r = shifted(span, d.mode, d.delta);
            place(b, r.start, r.end, g);
            b.classList.add("wg-dragging");
            b.title = workBoardDateFull(workGanttKey(r.start)) + " – " + workBoardDateFull(workGanttKey(r.end));
        });
        const finish = (e, canceled) => {
            const d = st.drag;
            if (!d || d.bar !== b) return;
            st.drag = null;
            const pending = st.pending;
            st.pending = false;
            if (!canceled && !d.locked && d.moved && d.delta !== 0) {
                // полоса остаётся на новом месте до ответа сервера; если он ничего не изменил — вернётся назад
                const done = () => draw(st);
                Promise.resolve(commit(d.mode, d.delta)).then(done, done);
                return;
            }
            if (!canceled && (d.locked || !d.moved))
                click(e.clientX + 8, e.clientY + 8);
            if (pending || d.moved) draw(st);
        };
        b.addEventListener("pointerup", (e) => finish(e, false));
        b.addEventListener("pointercancel", (e) => finish(e, true));
    }

    function shifted(span, mode, delta) {
        let start = span.start, end = span.end;
        if (mode === "move") { start += delta; end += delta; }
        else if (mode === "start") start = Math.min(start + delta, end);
        else end = Math.max(end + delta, start);
        return { start: start, end: end };
    }

    function cardInput(type, value) {
        const input = document.createElement("input");
        input.type = type;
        input.className = "wb-pop-input";
        if (value != null) input.value = value;
        input.addEventListener("input", () => input.classList.remove("wb-invalid"));
        return input;
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

    function cardText(pop, cls, text) {
        if (!text) return;
        pop.appendChild(workGanttDiv(cls, text));
    }

    // карточка заказа: сведения и сроки (если заказ не закрыт)
    function orderCard(order, st, x, y) {
        const o = st.options;
        const pop = workBoardPopup();
        cardText(pop, "wb-pop-title", [order.number, order.item].filter(Boolean).join(" "));
        if (order.status) {
            const s = workGanttDiv("wb-pop-meta");
            s.appendChild(workBoardStatus(order));
            pop.appendChild(s);
        }
        cardText(pop, "wb-pop-meta", [order.partner, order.responsible].filter(Boolean).join(" · "));
        if (order.locked) {
            cardText(pop, "wb-pop-meta", workBoardText(o, "startLabel", "") + ": " + workBoardDateFull(order.start));
            if (order.end) cardText(pop, "wb-pop-meta", workBoardText(o, "endLabel", "") + ": " + workBoardDateFull(order.end));
            cardText(pop, "wb-pop-hint", order.done ? workBoardText(o, "done", "") : workBoardText(o, "locked", ""));
            workBoardShowPopup(pop, x, y);
            return;
        }
        const start = cardField(pop, workBoardText(o, "startLabel", ""), cardInput("date", workBoardDateKey(order.start)));
        const end = cardField(pop, workBoardText(o, "endLabel", ""), cardInput("date", workBoardDateKey(order.end)));
        cardText(pop, "wb-pop-hint", workBoardText(o, "endHint", ""));
        const save = () => {
            let ok = true;
            if (!start.value) { start.classList.add("wb-invalid"); ok = false; }
            if (end.value && start.value && end.value < start.value) { end.classList.add("wb-invalid"); ok = false; }
            if (!ok) return;
            pop.style.display = "none";
            st.controller.form.exec("ganttSaveOrder", order.id, start.value, end.value || "");
        };
        [start, end].forEach((i) => i.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); }));
        const actions = workGanttDiv("wb-pop-row");
        actions.appendChild(workBoardButton(workBoardText(o, "save", "Сохранить"), "wb-btn-primary", save));
        pop.appendChild(actions);
        workBoardShowPopup(pop, x, y);
    }

    // карточка распределения — как на доске: период, часы в день, снять с заказа
    function allocCard(row, order, st, x, y) {
        const o = st.options;
        const pop = workBoardPopup();
        cardText(pop, "wb-pop-title", row.gName);
        if (order) cardText(pop, "wb-pop-meta", [order.number, order.item].filter(Boolean).join(" "));
        const from = cardField(pop, workBoardText(o, "fromDate", ""), cardInput("date", workBoardDateKey(row.gFrom)));
        const to = cardField(pop, workBoardText(o, "toDate", ""), cardInput("date", workBoardDateKey(row.gTo)));
        cardText(pop, "wb-pop-hint", workBoardText(o, "toDateHint", ""));
        const hours = cardField(pop, workBoardText(o, "hours", ""), cardInput("number", workBoardHours(row.gDayHours).replace(",", ".")));
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
            st.controller.form.exec("boardSaveAllocation", row.gid, from.value, to.value || "", h);
        };
        [from, to, hours].forEach((i) => i.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); }));
        const actions = workGanttDiv("wb-pop-row");
        actions.appendChild(workBoardButton(workBoardText(o, "save", "Сохранить"), "wb-btn-primary", save));
        actions.appendChild(workBoardButton(workBoardText(o, "release", "Снять с заказа"), "wb-btn-danger", () => {
            pop.style.display = "none";
            st.controller.form.exec("boardRelease", row.gid, workBoardDateKey(o.actionDate));
        }));
        pop.appendChild(actions);
        workBoardShowPopup(pop, x, y);
    }

    function orderTitle(order, o) {
        const lines = [[order.number, order.item].filter(Boolean).join(" ")];
        if (order.note) lines.push(order.note);
        if (order.status) lines.push(workBoardText(o, "statusLabel", "") + ": " + order.status);
        if (order.partner) lines.push(workBoardText(o, "partnerLabel", "") + ": " + order.partner);
        if (order.responsible) lines.push(workBoardText(o, "responsibleLabel", "") + ": " + order.responsible);
        lines.push(workBoardText(o, "startLabel", "") + ": " + workBoardDateFull(order.start));
        lines.push(workBoardText(o, "endLabel", "") + ": " + (order.end ? workBoardDateFull(order.end) : workBoardText(o, "noPlan", "")));
        if (order.done) lines.push(workBoardText(o, "done", ""));
        else if (order.daysLeft != null) {
            const days = Number(order.daysLeft), dn = workBoardText(o, "daysShort", "");
            lines.push(days < 0 ? workBoardText(o, "overdue", "") + " " + (-days) + " " + dn
                                : workBoardText(o, "leftLabel", "") + ": " + days + " " + dn);
        }
        return lines.join("\n");
    }

    function orderRow(order, people, st, g) {
        const o = st.options;
        const row = workGanttDiv("wg-row wg-row-order");
        const label = workGanttDiv("wg-label");
        const toggle = workGanttDiv("wg-toggle", people.length ? (st.collapsed.has(String(order.id)) ? "▸" : "▾") : "");
        label.appendChild(toggle);
        // статус — точкой цвета статуса перед номером, название — в подсказке строки
        const dot = workGanttDiv("wg-status-dot");
        const color = workBoardColor(order.statusColor);
        if (color) dot.style.background = color;
        label.appendChild(dot);
        label.appendChild(workGanttDiv("wg-label-text", [order.number, order.item].filter(Boolean).join(" ")));
        if (people.length) label.appendChild(workGanttDiv("wg-count", people.length + " " + workBoardText(o, "people", "")));
        label.title = orderTitle(order, o);
        if (people.length) label.addEventListener("click", () => {
            const id = String(order.id);
            if (st.collapsed.has(id)) st.collapsed.delete(id); else st.collapsed.add(id);
            draw(st);
        });
        row.appendChild(label);

        const track = workGanttDiv("wg-track");
        track.style.width = g.days * g.px + "px";
        const start = workGanttDay(workBoardDateKey(order.start));
        const end = order.end ? workGanttDay(workBoardDateKey(order.end)) : start;
        const overdue = !order.done && order.daysLeft != null && Number(order.daysLeft) < 0;
        let cls = "wg-bar-order";
        let text = [order.number, order.item].filter(Boolean).join(" ");
        if (order.done) { cls += " wg-done"; text = "✓ " + text; }
        if (overdue) cls += " wg-overdue";
        // у выполненного заказа отсутствие срока уже не важно
        if (!order.end && !order.done) { cls += " wg-noplan"; text = workBoardText(o, "noPlan", "") + " · " + text; }
        if (order.locked) cls += " wg-locked";

        // просрочка: от планового завершения до сегодня — красная штриховка
        if (overdue && order.end && end < g.today) {
            const late = workGanttDiv("wg-late");
            const s = Math.max(end + 1, g.from), e = Math.min(g.today, g.from + g.days - 1);
            if (e >= s) {
                late.style.left = (s - g.from) * g.px + "px";
                late.style.width = (e - s + 1) * g.px + "px";
                late.title = workBoardText(o, "overdue", "") + " " + (-Number(order.daysLeft)) + " " + workBoardText(o, "daysShort", "");
                track.appendChild(late);
            }
        }

        if (start != null) {
            const b = bar(cls, text, orderTitle(order, o));
            place(b, start, end, g);
            draggable(b, st, g, { start: start, end: end },
                (mode, delta) => {
                    const r = shifted({ start: start, end: end }, mode, delta);
                    // у заказа без срока полоса однодневная: срок появляется, только если тянуть правый край
                    const newEnd = order.end || mode === "end" ? workGanttKey(r.end) : "";
                    return st.controller.form.exec("ganttSaveOrder", order.id, workGanttKey(r.start), newEnd);
                },
                (x, y) => orderCard(order, st, x, y));
            track.appendChild(b);
        }
        row.appendChild(track);
        return row;
    }

    function personRow(order, rows, st, g) {
        const o = st.options;
        const first = rows[0];
        const row = workGanttDiv("wg-row wg-row-person");
        row.dataset.employee = first.gEmployee;
        row.style.setProperty("--wb-hue", workBoardHue(first.gPosition));
        if (rows.some((r) => r.gChild)) row.classList.add("wg-child");
        if (rows.some((r) => r.gSplit)) row.classList.add("wg-split");
        const label = workGanttDiv("wg-label");
        label.appendChild(workGanttDiv("wg-label-text", first.gName || ""));
        if (first.gPosition) label.appendChild(workGanttDiv("wg-label-pos", first.gPosition));
        label.title = first.gPosition ? first.gName + " — " + first.gPosition : first.gName;
        row.appendChild(label);

        const track = workGanttDiv("wg-track");
        track.style.width = g.days * g.px + "px";
        for (const r of rows) {
            const start = workGanttDay(workBoardDateKey(r.gFrom));
            const end = workGanttDay(workBoardDateKey(r.gEnd));
            const open = r.gTo == null;
            let cls = "wg-bar-person";
            if (open) cls += " wg-open";
            if (r.gChild) cls += " wg-bar-child";
            const hours = r.gHours != null ? workBoardHours(r.gHours) + " " + workBoardText(o, "hoursShort", "ч") : "";
            const title = [r.gName, workBoardDateFull(r.gFrom) + " – " + (open ? workBoardText(o, "openEnd", "") : workBoardDateFull(r.gTo)),
                           hours, r.gChild ? workBoardText(o, "child", "") : ""].filter(Boolean).join("\n");
            const b = bar(cls, hours, title);
            place(b, start, end, g);
            draggable(b, st, g, { start: start, end: end },
                (mode, delta) => {
                    const s = shifted({ start: start, end: end }, mode, delta);
                    // открытое распределение остаётся открытым, пока не потянули правый край
                    const to = open && mode !== "end" ? "" : workGanttKey(s.end);
                    return st.controller.form.exec("boardSaveAllocation", r.gid, workGanttKey(s.start), to, Number(r.gDayHours));
                },
                (x, y) => allocCard(r, order, st, x, y));
            track.appendChild(b);
        }
        row.appendChild(track);

        // наведение подсвечивает все строки этого сотрудника (основная и отделённые плашки)
        row.addEventListener("mouseenter", () => relate(st, first.gEmployee, true));
        row.addEventListener("mouseleave", () => relate(st, first.gEmployee, false));
        return row;
    }

    function relate(st, employee, on) {
        st.scroll.querySelectorAll('.wg-row-person[data-employee="' + employee + '"]').forEach((r) => r.classList.toggle("wg-related", on));
    }

    function draw(st) {
        const o = st.options;
        if (!o) return;
        if (st.drag) { st.pending = true; return; }
        const scroll = st.scroll;
        const left = scroll.scrollLeft, top = scroll.scrollTop;

        const from = workGanttDay(workBoardDateKey(o.from)), to = workGanttDay(workBoardDateKey(o.to));
        const days = Math.max(1, to - from + 1);
        const avail = scroll.clientWidth - WG_LABEL_WIDTH - 2;
        const px = Math.min(80, Math.max(days <= 62 ? 22 : 5, Math.floor(avail / days)));
        const g = { from: from, days: days, px: px, today: workGanttDay(workBoardDateKey(o.today)) };

        // люди разложены по заказам, внутри заказа — по сотруднику (порядок строк задан формой)
        const byOrder = {};
        for (const r of st.list) {
            const people = byOrder[r.gOrder] = byOrder[r.gOrder] || new Map();
            const key = String(r.gEmployee);
            if (!people.has(key)) people.set(key, []);
            people.get(key).push(r);
        }

        const content = workGanttDiv("wg-content");
        content.style.width = WG_LABEL_WIDTH + days * px + "px";
        content.appendChild(header(st, g));
        const rows = workGanttDiv("wg-rows");
        const orders = o.orders || [];
        for (const order of orders) {
            const people = byOrder[order.id] ? Array.from(byOrder[order.id].values()) : [];
            rows.appendChild(orderRow(order, people, st, g));
            if (st.collapsed.has(String(order.id))) continue;
            for (const p of people) rows.appendChild(personRow(order, p, st, g));
        }
        if (!orders.length) rows.appendChild(workGanttDiv("wg-empty", workBoardText(o, "emptyGantt", "")));
        content.appendChild(rows);

        scroll.innerHTML = "";
        scroll.appendChild(content);
        const bg = background(g, rows.offsetHeight);
        bg.style.top = WG_HEAD_HEIGHT + "px";
        bg.style.left = WG_LABEL_WIDTH + "px";
        content.insertBefore(bg, rows);

        st.width = scroll.clientWidth;
        scroll.scrollLeft = left;
        scroll.scrollTop = top;
    }

    return {
        render: function (element, controller) {
            const root = workGanttDiv("wg-root");
            const bar = workGanttDiv("wg-toolbar");
            const scroll = workGanttDiv("wg-scroll");
            root.appendChild(bar);
            root.appendChild(scroll);
            element.appendChild(root);

            const st = { controller: controller, options: null, list: [], collapsed: new Set(), scroll: scroll, drag: null };
            element.wgState = st;

            const expand = workBoardButton("", "wg-tool", () => { st.collapsed.clear(); draw(st); });
            const collapse = workBoardButton("", "wg-tool", () => {
                for (const order of (st.options && st.options.orders) || []) st.collapsed.add(String(order.id));
                draw(st);
            });
            const hint = workGanttDiv("wg-hint");
            bar.appendChild(expand);
            bar.appendChild(collapse);
            bar.appendChild(hint);
            st.toolbar = { expand: expand, collapse: collapse, hint: hint };

            // ширина колонки дня зависит от ширины вкладки: при её изменении шкала перестраивается
            if (window.ResizeObserver) {
                st.observer = new ResizeObserver(() => {
                    if (st.options && scroll.clientWidth !== st.width) draw(st);
                });
                st.observer.observe(scroll);
            }
        },
        update: function (element, controller, list, options) {
            const st = element.wgState;
            st.controller = controller;
            st.options = options;
            st.list = list;
            st.toolbar.expand.textContent = workBoardText(options, "expandAll", "");
            st.toolbar.collapse.textContent = workBoardText(options, "collapseAll", "");
            st.toolbar.hint.textContent = workBoardText(options, "hint", "");
            draw(st);
        },
        clear: function (element) {
            const st = element.wgState;
            if (st) {
                st.list = [];
                st.scroll.innerHTML = "";
            }
        }
    };
}
