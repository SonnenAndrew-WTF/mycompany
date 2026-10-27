// Доска распределения работ (форма workPlanning, модуль WorkPlanning).
// Три представления объектных групп: вкладки досок (workBoardTabs), «Свободные» (workBoardFree)
// и сама доска с колонками заказов (workBoard). Плашки перетаскиваются между представлениями,
// поэтому состояние перетаскивания общее для всего файла. Звенья (модуль WorkTeamPlanning): список звеньев
// над «Свободными» (workBoardTeams) и плашки звеньев в колонках — члены звена с одним звеном на заказе.

// { kind: 'employee', employeeId } | { kind: 'alloc', row, allocId, orderId, dayHours }
// | { kind: 'teamPool', teamId } | { kind: 'team', teamId, orderId, dayHours } | { kind: 'absent', absenceId }
// Колонка «Недоступные» (модуль WorkAbsence, workBoardAbsent): болеет, отпросился и т. п.
var workBoardDrag = null;

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

// мини-календарь месяца в блоке периода: подсвечены дни периода и сегодня, стрелки листают месяц,
// щелчок по дню выбирает дату доски
function workBoardCalendar() {
    const dows = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
    return {
        render: function (element) {
            const root = document.createElement("div");
            root.className = "wb-cal";
            element.appendChild(root);
            element.wbRoot = root;
        },
        update: function (element, controller, list, options) {
            const root = element.wbRoot;
            root.innerHTML = "";
            const head = document.createElement("div");
            head.className = "wb-cal-head";
            const arrow = (text, n) => {
                const b = document.createElement("button");
                b.type = "button";
                b.className = "wb-cal-arrow";
                b.textContent = text;
                b.addEventListener("click", () => controller.form.exec("boardCalendarShift", n));
                return b;
            };
            const title = document.createElement("span");
            title.className = "wb-cal-title";
            title.textContent = (options && options.caption) || "";
            head.appendChild(arrow("‹", -1));
            head.appendChild(title);
            head.appendChild(arrow("›", 1));
            root.appendChild(head);

            const grid = document.createElement("div");
            grid.className = "wb-cal-grid";
            for (const d of dows) {
                const h = document.createElement("span");
                h.className = "wb-cal-dow";
                h.textContent = d;
                grid.appendChild(h);
            }
            for (const row of list) {
                const cell = document.createElement("span");
                cell.className = "wb-cal-day";
                if (row.calOther) cell.classList.add("wb-cal-other");
                if (row.calWeekend) cell.classList.add("wb-cal-weekend");
                if (row.calInPeriod) cell.classList.add("wb-cal-period");
                if (row.calBoardDate) cell.classList.add("wb-cal-current");
                if (row.calToday) cell.classList.add("wb-cal-today");
                cell.textContent = row.calDay;
                cell.addEventListener("click", () => controller.changeProperty("calPick", row));
                grid.appendChild(cell);
            }
            root.appendChild(grid);
        },
        clear: function (element) {
            if (element.wbRoot) element.wbRoot.innerHTML = "";
        }
    };
}

// звенья, у которых есть свободные люди: перетаскивание на заказ ставит всё звено
function workBoardTeams() {
    return {
        render: function (element) {
            const root = document.createElement("div");
            root.className = "wb-free wb-teams";
            const head = document.createElement("div");
            head.className = "wb-free-head";
            root.appendChild(head);
            const body = document.createElement("div");
            body.className = "wb-free-body";
            root.appendChild(body);
            element.appendChild(root);
            element.wbHead = head;
            element.wbBody = body;
        },
        update: function (element, controller, list, options) {
            element.wbHead.textContent = workBoardText(options, "teams", "Звенья") + " (" + list.length + ")";
            const body = element.wbBody;
            body.innerHTML = "";
            for (const row of list) {
                const chip = document.createElement("div");
                chip.className = "wb-chip wb-team-chip";
                chip.setAttribute("draggable", "true");
                const nm = document.createElement("span");
                nm.className = "wb-chip-name";
                nm.textContent = row.tmName || "";
                chip.appendChild(nm);
                if (row.tmForeman) {
                    const ps = document.createElement("span");
                    ps.className = "wb-chip-pos";
                    ps.textContent = "★ " + row.tmForeman;
                    chip.appendChild(ps);
                }
                workBoardBadge(chip, row.tmFree + " " + workBoardText(options, "freeShort", "своб."), "wb-badge-free");
                chip.title = row.tmMembers || "";
                chip.addEventListener("dragstart", (e) => {
                    e.dataTransfer.effectAllowed = "copyMove";
                    e.dataTransfer.setData("text/plain", String(row.tid));
                    workBoardDrag = { kind: "teamPool", teamId: row.tid };
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

// окно недоступности: причина, с даты, по дату (пусто — до возвращения)
function workBoardAbsenceForm(pop, options, title, value, okText, onOk, extra) {
    const head = document.createElement("div");
    head.className = "wb-pop-title";
    head.textContent = title;
    pop.appendChild(head);
    const reasons = (options && options.reasons) || [];
    const list = document.createElement("div");
    list.className = "wb-pop-list";
    const radios = reasons.map((r, i) => {
        const line = document.createElement("label");
        line.className = "wb-pop-check";
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = "wb-absence-reason";
        radio.checked = value.reason != null ? String(value.reason) === String(r.id) : i === 0;
        const text = document.createElement("span");
        text.textContent = r.caption;
        line.appendChild(radio);
        line.appendChild(text);
        list.appendChild(line);
        return { id: r.id, radio: radio };
    });
    pop.appendChild(list);
    const field = (label, v) => {
        const row = document.createElement("label");
        row.className = "wb-pop-field";
        const cap = document.createElement("span");
        cap.textContent = label;
        const input = document.createElement("input");
        input.type = "date";
        input.className = "wb-pop-input";
        if (v) input.value = v;
        input.addEventListener("input", () => input.classList.remove("wb-invalid"));
        row.appendChild(cap);
        row.appendChild(input);
        pop.appendChild(row);
        return input;
    };
    const from = field(workBoardText(options, "fromDate", "Дата с"), value.from);
    const to = field(workBoardText(options, "toDate", "Дата по"), value.to);
    const hint = document.createElement("div");
    hint.className = "wb-pop-hint";
    hint.textContent = workBoardText(options, "untilReturn", "Пусто — до возвращения");
    pop.appendChild(hint);
    const ok = () => {
        if (!from.value) { from.classList.add("wb-invalid"); return; }
        if (to.value && to.value < from.value) { to.classList.add("wb-invalid"); return; }
        const picked = radios.find((r) => r.radio.checked);
        pop.style.display = "none";
        onOk(picked ? picked.id : null, from.value, to.value || "");
    };
    const actions = document.createElement("div");
    actions.className = "wb-pop-row";
    actions.appendChild(workBoardButton(okText, "wb-btn-primary", ok));
    if (extra) actions.appendChild(extra);
    actions.appendChild(workBoardButton(workBoardText(options, "cancel", "Отмена"), "", () => { pop.style.display = "none"; }));
    pop.appendChild(actions);
}

// «Недоступные»: сюда бросают человека с доски или из «Свободных»; обратно — в «Свободные» или на заказ
function workBoardAbsent() {
    return {
        render: function (element) {
            const root = document.createElement("div");
            root.className = "wb-free wb-absent";
            const head = document.createElement("div");
            head.className = "wb-free-head";
            root.appendChild(head);
            const body = document.createElement("div");
            body.className = "wb-free-body";
            root.appendChild(body);
            element.appendChild(root);
            element.wbHead = head;
            element.wbBody = body;

            const accepts = () => workBoardDrag && (workBoardDrag.kind === "employee" || workBoardDrag.kind === "alloc");
            root.addEventListener("dragover", (e) => { if (accepts()) { e.preventDefault(); root.classList.add("wb-over"); } });
            root.addEventListener("dragleave", (e) => { if (!root.contains(e.relatedTarget)) root.classList.remove("wb-over"); });
            root.addEventListener("drop", (e) => {
                e.preventDefault();
                root.classList.remove("wb-over");
                const drag = workBoardDrag;
                workBoardDrag = null;
                const options = element.wbOptions;
                if (!drag || !options || !(drag.kind === "employee" || drag.kind === "alloc")) return;
                const employeeId = drag.kind === "employee" ? drag.employeeId : drag.row.employee;
                const name = drag.kind === "employee" ? drag.name : drag.row.nameEmployee;
                const pop = workBoardPopup();
                workBoardAbsenceForm(pop, options, workBoardText(options, "absentTitle", "Недоступен") + ": " + (name || ""),
                    { from: workBoardDateKey(options.actionDate) }, workBoardText(options, "mark", "Отметить"),
                    (reason, from, to) => element.wbController.form.exec("boardMarkAbsent", employeeId, reason, from, to));
                workBoardShowPopup(pop, e.clientX + 8, e.clientY + 8);
            });
        },
        update: function (element, controller, list, options) {
            element.wbController = controller;
            element.wbOptions = options;
            element.wbHead.textContent = workBoardText(options, "absent", "Недоступные") + " (" + list.length + ")";
            element.wbHead.title = workBoardText(options, "absentHint", "");
            const body = element.wbBody;
            body.innerHTML = "";
            for (const row of list) {
                const chip = workBoardChip(row.abName, row.abPosition, row.abEmployee);
                chip.classList.add("wb-chip-absent");
                const period = workBoardDateShort(row.abFrom) + " – " + (row.abTo ? workBoardDateShort(row.abTo) : "…");
                workBoardBadge(chip, (row.abReason || "") + ", " + period, "wb-badge-absent");
                chip.addEventListener("dragstart", (e) => {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", String(row.abid));
                    workBoardDrag = { kind: "absent", absenceId: row.abid };
                    chip.classList.add("wb-dragging");
                });
                chip.addEventListener("dragend", () => { chip.classList.remove("wb-dragging"); workBoardDrag = null; });
                // карточка: исправить причину и даты или вернуть
                chip.addEventListener("click", (e) => {
                    const pop = workBoardPopup();
                    const back = workBoardButton(workBoardText(options, "returnBack", "Вернуть"), "", () => {
                        pop.style.display = "none";
                        controller.form.exec("boardReturnAbsent", row.abid, workBoardDateKey(options.actionDate));
                    });
                    workBoardAbsenceForm(pop, options, row.abName || "",
                        { reason: row.abReasonId, from: workBoardDateKey(row.abFrom), to: workBoardDateKey(row.abTo) },
                        workBoardText(options, "save", "Сохранить"),
                        (reason, from, to) => controller.form.exec("boardSaveAbsence", row.abid, reason, from, to), back);
                    workBoardShowPopup(pop, e.clientX + 8, e.clientY + 8);
                });
                body.appendChild(chip);
            }
        },
        clear: function (element) {
            if (element.wbBody) element.wbBody.innerHTML = "";
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
                if (workBoardDrag && ["alloc", "team", "absent"].includes(workBoardDrag.kind)) { e.preventDefault(); root.classList.add("wb-over"); }
            });
            root.addEventListener("dragleave", (e) => { if (!root.contains(e.relatedTarget)) root.classList.remove("wb-over"); });
            root.addEventListener("drop", (e) => {
                e.preventDefault();
                root.classList.remove("wb-over");
                const drag = workBoardDrag;
                workBoardDrag = null;
                if (!drag || !element.wbOptions) return;
                const from = workBoardDateKey(element.wbOptions.actionDate);
                if (drag.kind === "alloc")
                    element.wbController.form.exec("boardRelease", drag.allocId, from);
                else if (drag.kind === "team")
                    element.wbController.form.exec("boardReleaseTeam", drag.teamId, drag.orderId, from, workBoardDateKey(element.wbOptions.to));
                else if (drag.kind === "absent")
                    element.wbController.form.exec("boardReturnAbsent", drag.absenceId, from);
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
                    workBoardDrag = { kind: "employee", employeeId: row.eid, name: row.name };
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
        if (row.foreman) {
            chip.classList.add("wb-chip-foreman");
            chip.title += "\n" + workBoardText(options, "foremanLabel", "Бригадир");
        }
        if (row.hours != null)
            workBoardBadge(chip, workBoardHours(row.hours) + " " + workBoardText(options, "hoursShort", "ч"));
        if (row.note) {
            const note = document.createElement("span");
            note.className = "wb-chip-note";
            note.textContent = row.note;
            chip.appendChild(note);
            chip.title += "\n" + workBoardText(options, "note", "Примечание") + ": " + row.note;
        }

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
        const note = document.createElement("textarea");
        note.className = "wb-pop-input wb-pop-note";
        note.rows = 2;
        note.maxLength = 200;
        note.placeholder = workBoardText(options, "noteHint", "");
        note.value = row.note || "";
        // примечание — подпись над полем, поле растягивается вниз и вбок
        cardField(pop, workBoardText(options, "note", "Примечание"), note).parentNode.classList.add("wb-pop-field-wide");

        const save = () => {
            const h = parseFloat(String(hours.value).replace(",", "."));
            let ok = true;
            if (!from.value) { from.classList.add("wb-invalid"); ok = false; }
            if (to.value && from.value && to.value < from.value) { to.classList.add("wb-invalid"); ok = false; }
            if (!(h > 0)) { hours.classList.add("wb-invalid"); ok = false; }
            if (!ok) return;
            pop.style.display = "none";
            st.controller.form.exec("boardSaveAllocation", row.aid, from.value, to.value || "", h);
            if ((row.note || "") !== note.value.trim())
                st.controller.form.exec("boardSaveNote", row.aid, note.value);
        };
        [from, to, hours].forEach((i) => i.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); }));

        if (row.team) {
            const team = document.createElement("div");
            team.className = "wb-pop-meta";
            team.textContent = workBoardText(options, "teamLabel", "Звено") + ": " + (row.nameTeam || "");
            pop.insertBefore(team, from.parentNode);
        }

        const actions = document.createElement("div");
        actions.className = "wb-pop-row";
        actions.appendChild(workBoardButton(workBoardText(options, "save", "Сохранить"), "wb-btn-primary", save));
        if (row.team)
            actions.appendChild(workBoardButton(workBoardText(options, "leaveTeam", "Вывести из звена"), "", () => {
                pop.style.display = "none";
                st.controller.form.exec("boardLeaveTeam", row.aid, workBoardDateKey(st.options.actionDate));
            }));
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
        } else if (drag.kind === "teamPool") {
            st.controller.form.exec("boardAllocateTeam", drag.teamId, order.id, from, to);
        } else if (drag.kind === "absent") {
            st.controller.form.exec("boardReturnToOrder", drag.absenceId, order.id, from, to);
        } else if (drag.kind === "team" && String(drag.orderId) !== String(order.id)) {
            if (e.ctrlKey) {
                const pop = workBoardPopup();
                const half = Math.max(0.5, Math.round(Number(drag.dayHours) || 2) / 2);
                workBoardHoursInput(pop, workBoardText(st.options, "teamSplitTitle", "Сколько часов отделить") + " " + (order.number || ""),
                    half, workBoardText(st.options, "splitOk", "Отделить"), workBoardText(st.options, "cancel", "Отмена"),
                    (h) => st.controller.form.exec("boardSplitTeam", drag.teamId, drag.orderId, order.id, h, from, to));
                workBoardShowPopup(pop, e.clientX + 8, e.clientY + 8);
            } else
                st.controller.form.exec("boardMoveTeam", drag.teamId, drag.orderId, order.id, from, to);
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

    // человек брошен на плашку звена: работает на этом заказе в этом звене (с Ctrl — часть дня)
    function dropOnTeam(e, team, order, st) {
        const drag = workBoardDrag;
        workBoardDrag = null;
        const from = workBoardDateKey(st.options.actionDate);
        if (e.ctrlKey && String(drag.orderId) !== String(order.id)) {
            const pop = workBoardPopup();
            const half = Math.max(0.5, Math.round(Number(drag.dayHours) || 2) / 2);
            workBoardHoursInput(pop, workBoardText(st.options, "splitTitle", "Сколько часов отделить") + " " + (order.number || ""),
                half, workBoardText(st.options, "splitOk", "Отделить"), workBoardText(st.options, "cancel", "Отмена"),
                (h) => st.controller.form.exec("boardJoinTeam", drag.allocId, team.id, order.id, h, from));
            workBoardShowPopup(pop, e.clientX + 8, e.clientY + 8);
        } else
            st.controller.form.exec("boardJoinTeam", drag.allocId, team.id, order.id, null, from);
    }

    // плашка звена: заголовок (тащится — всё звено) и члены звена обычными плашками
    function teamPlate(team, order, options, st) {
        const plate = document.createElement("div");
        plate.className = "wb-team";
        const head = document.createElement("div");
        head.className = "wb-team-head";
        head.setAttribute("draggable", "true");
        const nm = document.createElement("span");
        nm.className = "wb-team-name";
        nm.textContent = team.name || "";
        head.appendChild(nm);
        const cnt = document.createElement("span");
        cnt.className = "wb-team-count";
        cnt.textContent = (team.count || team.rows.length) + " " + workBoardText(options, "people", "чел.");
        head.appendChild(cnt);
        head.title = workBoardText(options, "dragHint", "");
        plate.appendChild(head);
        // часы для деления по умолчанию — от самого длинного дня в звене
        const dayHours = Math.max.apply(null, team.rows.map((r) => Number(r.dayHours) || 0));
        head.addEventListener("dragstart", (e) => {
            e.dataTransfer.effectAllowed = "copyMove";
            e.dataTransfer.setData("text/plain", String(team.id));
            workBoardDrag = { kind: "team", teamId: team.id, orderId: order.id, dayHours: dayHours };
            plate.classList.add("wb-dragging");
        });
        head.addEventListener("dragend", () => { plate.classList.remove("wb-dragging"); workBoardDrag = null; });
        for (const row of team.rows) plate.appendChild(allocChip(row, options, st));

        // на плашку звена бросают человека (не из этого же звена)
        const joinable = () => workBoardDrag && workBoardDrag.kind === "alloc" && String(workBoardDrag.row.team) !== String(team.id);
        plate.addEventListener("dragover", (e) => {
            if (!joinable()) return;
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = e.ctrlKey ? "copy" : "move";
            plate.classList.add("wb-over");
        });
        plate.addEventListener("dragleave", (e) => { if (!plate.contains(e.relatedTarget)) plate.classList.remove("wb-over"); });
        plate.addEventListener("drop", (e) => {
            plate.classList.remove("wb-over");
            if (!joinable()) return;
            e.preventDefault();
            e.stopPropagation();
            dropOnTeam(e, team, order, st);
        });
        return plate;
    }

    // «Собрать звено»: отметить людей на заказе без звена и выбрать бригадира
    function showFormTeam(order, rows, options, st, x, y) {
        const pop = workBoardPopup();
        const head = document.createElement("div");
        head.className = "wb-pop-title";
        head.textContent = workBoardText(options, "formTeamTitle", "Новое звено");
        pop.appendChild(head);
        const meta = document.createElement("div");
        meta.className = "wb-pop-meta";
        meta.textContent = [order.number, order.item].filter(Boolean).join(" ");
        pop.appendChild(meta);
        const name = cardField(pop, workBoardText(options, "teamName", "Наименование звена"), cardInput("text", ""));
        const list = document.createElement("div");
        list.className = "wb-pop-list";
        const marks = [];
        for (const row of rows) {
            const line = document.createElement("label");
            line.className = "wb-pop-check";
            const check = document.createElement("input");
            check.type = "checkbox";
            check.checked = true;
            const text = document.createElement("span");
            text.textContent = row.nameEmployee + (row.namePosition ? " — " + row.namePosition : "");
            const radio = document.createElement("input");
            radio.type = "radio";
            radio.name = "wb-foreman";
            const small = document.createElement("small");
            small.textContent = workBoardText(options, "markForeman", "бригадир");
            line.appendChild(check);
            line.appendChild(text);
            line.appendChild(radio);
            line.appendChild(small);
            list.appendChild(line);
            marks.push({ row: row, check: check, radio: radio });
        }
        if (marks.length) marks[0].radio.checked = true;
        pop.appendChild(list);

        const create = () => {
            const n = name.value.trim();
            const checked = marks.filter((m) => m.check.checked);
            if (!n) { name.classList.add("wb-invalid"); return; }
            if (!checked.length) return;
            const foreman = checked.find((m) => m.radio.checked) || checked[0];
            pop.style.display = "none";
            // отметки — свойство формы teamMark: звено собирается из отмеченных
            st.controller.batch(() => {
                for (const m of marks) st.controller.changeProperty("teamMark", m.row, m.check.checked ? true : null);
            });
            st.controller.form.exec("boardFormTeam", order.id, n, foreman.row.aid, workBoardDateKey(st.options.actionDate));
        };
        name.addEventListener("keydown", (e) => { if (e.key === "Enter") create(); });
        const actions = document.createElement("div");
        actions.className = "wb-pop-row";
        actions.appendChild(workBoardButton(workBoardText(options, "create", "Создать"), "wb-btn-primary", create));
        actions.appendChild(workBoardButton(workBoardText(options, "cancel", "Отмена"), "", () => { pop.style.display = "none"; }));
        pop.appendChild(actions);
        workBoardShowPopup(pop, x, y);
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
                // члены одного звена — в одну плашку звена на месте первого из них, остальные — по одному
                const teams = {};
                const singles = [];
                for (const row of byOrder[order.id] || []) {
                    if (row.team == null) {
                        singles.push(row);
                        body.appendChild(allocChip(row, opts, st));
                    } else if (teams[row.team]) {
                        teams[row.team].rows.push(row);
                    } else {
                        const team = { id: row.team, name: row.nameTeam, count: row.teamCount, rows: [row] };
                        team.placeholder = body.appendChild(document.createElement("div"));
                        teams[row.team] = team;
                    }
                }
                for (const id in teams) body.replaceChild(teamPlate(teams[id], order, opts, st), teams[id].placeholder);
                col.appendChild(body);
                if (singles.length > 1) {
                    const btn = workBoardButton(workBoardText(opts, "formTeam", "Собрать звено"), "wb-btn-team",
                        (e) => showFormTeam(order, singles, opts, st, e.clientX + 8, e.clientY + 8));
                    col.querySelector(".wb-col-head").appendChild(btn);
                }

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
