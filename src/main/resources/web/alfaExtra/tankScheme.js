// Эскиз вертикальной цилиндрической ёмкости в масштабе (форма verticalTankCalculation, контейнер schemeBox).
// Перенос tankSvg из «Калькулятора резервуаров ВЦР»: ноги, жидкость до фактического уровня с рабочим объёмом,
// изоляция и облицовка по зонам в их размер, пояса рубашки (наружный диаметр = диаметр колбы + 20) с общей площадью рубашек,
// корпус со швами обечаек, диаметр и размеры по высоте. Все размеры — в мм.
function TankScheme(props) {
    var React = window.React;
    var c = props.data.c;
    function v(name) { var e = c[name]; return e && e.value != null ? +e.value : null; }

    var D = v("sDiameter"), H = v("sHeight");
    if (!D || !H)
        return React.createElement("div", { style: { padding: 12, color: "#5a6878" } }, "Укажите диаметр и высоту колбы");

    var fh = v("sFloor") || 0, bh = v("sBottom") || 0, th = v("sTop") || 0;
    var ra = (v("sApexTop") || 0) / 2, rb = (v("sApexBottom") || 0) / 2, r = D / 2;
    var ins = v("sInsulation") || 0;
    function on(name) { return !!(c[name] && c[name].value); }
    // изоляция и облицовка по зонам: нижний конус, колба, верхний конус
    var insZ = [on("sInsBottom") ? ins : 0, on("sInsShell") ? ins : 0, on("sInsTop") ? ins : 0];
    var cladZ = [on("sCladBottom"), on("sCladShell"), on("sCladTop")], cl = cladZ[0] || cladZ[1] || cladZ[2];
    var pyr = !!c.sPyramidal.value, legD = v("sLegDiameter"), hasLegs = pyr || legD != null;

    var W = D + 2 * ins + D * 0.5, Ht = fh + bh + H + th + 60, pad = W * 0.06;
    var vbW = W + pad * 2, vbH = Ht + pad * 2.2, s = Math.max(vbW / 260, vbH / 340);
    // поля по бокам под подписи объёма и общей высоты
    vbW = Math.max(vbW, vbH * 0.75) + s * 11 * 8;
    var cx = vbW / 2;
    function Y(y) { return vbH - pad - y; }
    function n(x) { return (+x).toFixed(1); }
    function pt(x, y) { return n(x) + " " + n(Y(y)); }
    function sw(w) { return n(w * s); }
    function fmt(x) { return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(x); }
    var y0 = fh, y1 = fh + bh, y2 = y1 + H, y3 = y2 + th;
    var o = "";

    // ноги и пол
    if (hasLegs) {
        var lw = pyr ? D * 0.07 : Math.max(legD, D * 0.03), lx = r - lw / 2 - ((v("sProtrude") || 0) > 0 ? 0 : lw / 2);
        [-1, 1].forEach(function (sg) {
            var x = cx + sg * lx;
            if (pyr)
                o += '<path d="M' + pt(x - lw * 0.9, 0) + " L" + pt(x + lw * 0.9, 0) + " L" + pt(x + lw * 0.35, y1 + 100) + " L" + pt(x - lw * 0.35, y1 + 100) +
                     'Z" fill="#c3ced9" stroke="#1b2632" stroke-width="' + sw(1) + '"/>';
            else
                o += '<rect x="' + n(x - lw / 2) + '" y="' + n(Y(y1 + 100)) + '" width="' + n(lw) + '" height="' + n(y1 + 100) +
                     '" fill="#c3ced9" stroke="#1b2632" stroke-width="' + sw(1) + '"/>';
        });
    }
    o += '<line x1="' + n(cx - r * 1.35) + '" y1="' + n(Y(0)) + '" x2="' + n(cx + r * 1.35) + '" y2="' + n(Y(0)) + '" stroke="#5a6878" stroke-width="' + sw(1.2) + '"/>';

    // жидкость до фактического уровня; ниже колбы — только в нижнем конусе
    var lv = Math.min(fh + (v("sLiquid") || 0), y2);
    var poly = [[cx - rb, y0], [cx + rb, y0], [cx + r, y1], [cx + r, lv], [cx - r, lv], [cx - r, y1]];
    if (lv < y1) {
        var rr = rb + (r - rb) * (lv - y0) / (y1 - y0);
        poly = [[cx - rb, y0], [cx + rb, y0], [cx + rr, lv], [cx - rr, lv]];
    }
    o += '<path d="M' + poly.map(function (q) { return pt(q[0], q[1]); }).join(" L") + 'Z" fill="#d6e7ef"/>';

    // профиль правой стороны корпуса снизу вверх: вершина нижнего конуса, низ и верх колбы, вершина верхнего конуса
    var prof = [[rb, y0], [r, y1], [r, y2], [ra, y3]];
    // профиль, отодвинутый от корпуса наружу на свою толщину для каждого участка (нижний конус, колба, верхний конус)
    function offset(d) {
        var lines = [0, 1, 2].map(function (k) {
            var a = prof[k], b = prof[k + 1], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.sqrt(dx * dx + dy * dy) || 1;
            var nx = dy / len * d[k], ny = -dx / len * d[k];
            return [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny]];
        });
        function cross(l1, l2) {
            var x1 = l1[0][0], y1_ = l1[0][1], x2 = l1[1][0], y2_ = l1[1][1], x3 = l2[0][0], y3_ = l2[0][1], x4 = l2[1][0], y4 = l2[1][1];
            var den = (x1 - x2) * (y3_ - y4) - (y1_ - y2_) * (x3 - x4);
            if (Math.abs(den) < 1e-9) return l1[1];
            var t = ((x1 - x3) * (y3_ - y4) - (y1_ - y3_) * (x3 - x4)) / den;
            return [x1 + t * (x2 - x1), y1_ + t * (y2_ - y1_)];
        }
        return [lines[0][0], cross(lines[0], lines[1]), cross(lines[1], lines[2]), lines[2][1]];
    }
    function side(points, sg) { return points.map(function (q) { return [cx + sg * q[0], q[1]]; }); }
    function path(points) { return points.map(function (q) { return pt(q[0], q[1]); }).join(" L"); }

    // рубашка по колбе: наружный диаметр = диаметр колбы + 20 мм (на эскизе не тоньше трёх точек, чтобы была видна)
    var belts = v("sBelts") || 0, beltH = v("sBeltHeight") || 0, jw = Math.max(10, s * 3);
    var jacketShell = belts > 0 && beltH > 0;

    // изоляция: поверх рубашки, на своих зонах
    var insD = [insZ[0], insZ[1] ? insZ[1] + (jacketShell ? jw : 0) : 0, insZ[2]];
    if (ins > 0 && (insD[0] || insD[1] || insD[2])) {
        var outer = offset(insD);
        [-1, 1].forEach(function (sg) {
            o += '<path d="M' + path(side(outer, sg).concat(side(prof, sg).reverse())) + 'Z" fill="#f3dfa2" stroke="#c9a54a" stroke-width="' + sw(0.6) + '"/>';
        });
    }

    // облицовка: колба — поверх изоляции + 20 мм по диаметру, конусы — поверх изоляции; только на своих зонах
    if (cl) {
        var cladP = offset([insZ[0], insZ[1] + Math.max(10, jacketShell ? jw : 0), insZ[2]]);
        [-1, 1].forEach(function (sg) {
            var q = side(cladP, sg);
            [0, 1, 2].forEach(function (k) {
                if (cladZ[k])
                    o += '<path d="M' + path([q[k], q[k + 1]]) + '" fill="none" stroke="#5a6878" stroke-width="' + sw(1.1) +
                         '" stroke-dasharray="' + sw(5) + " " + sw(3) + '"/>';
            });
        });
    }

    // пояса рубашки по колбе — равномерно по высоте колбы, с одинаковыми промежутками сверху, снизу и между поясами
    if (belts * beltH > H) beltH = H / belts;
    var gap = (H - belts * beltH) / (belts + 1);
    for (var i = 0; i < belts; i++) {
        var yb = y1 + gap + i * (beltH + gap);
        [cx - r - jw, cx + r].forEach(function (x) {
            o += '<rect x="' + n(x) + '" y="' + n(Y(yb + beltH)) + '" width="' + n(jw) + '" height="' + n(beltH) +
                 '" fill="#e3eff4" stroke="#16698a" stroke-width="' + sw(1) + '"/>';
        });
    }

    // корпус и швы обечаек
    o += '<path d="M' + pt(cx - rb, y0) + " L" + pt(cx - r, y1) + " L" + pt(cx - r, y2) + " L" + pt(cx - ra, y3) + " L" + pt(cx + ra, y3) +
         " L" + pt(cx + r, y2) + " L" + pt(cx + r, y1) + " L" + pt(cx + rb, y0) + 'Z" fill="none" stroke="#1b2632" stroke-width="' + sw(1.6) + '"/>';
    [y1, y2].forEach(function (y) {
        o += '<line x1="' + n(cx - r) + '" y1="' + n(Y(y)) + '" x2="' + n(cx + r) + '" y2="' + n(Y(y)) + '" stroke="#1b2632" stroke-width="' + sw(1.6) + '"/>';
    });
    var seam = v("sSeam");
    if (seam > 0)
        for (var yy = y1 + seam; yy < y2 - 1; yy += seam)
            o += '<line x1="' + n(cx - r) + '" y1="' + n(Y(yy)) + '" x2="' + n(cx + r) + '" y2="' + n(Y(yy)) +
                 '" stroke="#8794a3" stroke-width="' + sw(0.8) + '" stroke-dasharray="' + sw(3) + " " + sw(3) + '"/>';

    // уровень жидкости с рабочим объёмом, диаметр, высота колбы и общая высота
    var fs = s * 11;
    function text(x, y, t, attrs) {
        return '<text x="' + n(x) + '" y="' + n(y) + '" font-family="Roboto, sans-serif" font-size="' + n(fs) + '" ' + attrs + ">" + t + "</text>";
    }
    o += '<line x1="' + n(cx - r * 1.08) + '" y1="' + n(Y(lv)) + '" x2="' + n(cx + r * 1.08) + '" y2="' + n(Y(lv)) +
         '" stroke="#16698a" stroke-width="' + sw(1.2) + '" stroke-dasharray="' + sw(6) + " " + sw(4) + '"/>';
    var work = v("sWork");
    if (work != null) o += text(cx + r * 1.1, Y(lv) - fs * 0.4, "V<tspan font-size=\"" + n(fs * 0.7) + "\">раб</tspan> " + fmt(work) + " м³", 'fill="#16698a" font-weight="600"');
    o += text(cx, Y(y3) - fs * 0.6, "Ø" + D, 'fill="#5a6878" text-anchor="middle"');
    var jacketArea = v("sJacketArea");
    if (jacketArea != null)
        o += text(fs * 0.6, fs * 1.6, "Площадь рубашек " + fmt(jacketArea) + " м²", 'fill="#16698a" font-weight="600"');
    var shift = cl || ins ? ins + 40 : 0, xr = cx + r + shift + D * 0.12, xl = cx - r - shift - D * 0.16;
    o += '<line x1="' + n(xr) + '" y1="' + n(Y(y1)) + '" x2="' + n(xr) + '" y2="' + n(Y(y2)) + '" stroke="#5a6878" stroke-width="' + sw(0.9) + '"/>';
    o += text(xr + fs * 0.4, Y((y1 + y2) / 2), H, 'fill="#5a6878"');
    var total = v("sTotal");
    o += '<line x1="' + n(xl) + '" y1="' + n(Y(0)) + '" x2="' + n(xl) + '" y2="' + n(Y(y3)) + '" stroke="#5a6878" stroke-width="' + sw(0.9) + '"/>';
    if (total != null) o += text(xl - fs * 0.4, Y(y3 / 2), total, 'fill="#5a6878" text-anchor="end"');

    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + n(vbW) + " " + n(vbH) +
              '" style="width:100%;height:100%;display:block" role="img" aria-label="Эскиз ёмкости: диаметр ' + D + " мм, высота колбы " + H + ' мм">' + o + "</svg>";
    return React.createElement("div", { style: { width: "100%", height: "100%", padding: 8, boxSizing: "border-box" },
                                        dangerouslySetInnerHTML: { __html: svg } });
}
