/* Сайт сбора для Бони. Все данные берутся из content.json — этот файл менять не нужно. */
(function () {
  "use strict";

  var SHOW_RECEIPTS = 5;
  var SHOW_NEWS = 3;
  var MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

  // ---------- вспомогательные функции ----------
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function isNum(n) { return typeof n === "number" && isFinite(n); }
  function money(n) { return Math.round(n).toLocaleString("ru-RU") + " ₽"; }
  function parseDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "").trim());
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function dateLong(s) { var d = parseDate(s); return d ? d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear() : esc(s); }
  function dateDay(s) { var d = parseDate(s); return d ? d.getDate() + " " + MONTHS[d.getMonth()] : esc(s); }
  function dateShort(s) {
    var d = parseDate(s);
    return d ? ("0" + d.getDate()).slice(-2) + "." + ("0" + (d.getMonth() + 1)).slice(-2) + "." + d.getFullYear() : esc(s);
  }
  function byDateDesc(a, b) {
    var da = parseDate(a.date), db = parseDate(b.date);
    return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
  }
  function isImage(path) { return /\.(jpe?g|png|webp|gif|heic)$/i.test(path || ""); }
  function isPdf(path) { return /\.pdf$/i.test(path || ""); }
  var warnings = [];
  function warn(msg) { warnings.push(msg); if (window.console) console.warn("content.json: " + msg); }

  // ---------- пиксельная графика ----------
  var PIX = {
    heart: { px: 3, color: "#D9477F", grid: [".XX.XX.", "XXXXXXX", "XXXXXXX", ".XXXXX.", "..XXX..", "...X..."] },
    "heart-big": { px: 6, color: "#F4A7C3", grid: [".XX.XX.", "XXXXXXX", "XXXXXXX", ".XXXXX.", "..XXX..", "...X..."] },
    doc: { px: 2, color: "currentColor", grid: ["XXXXX.", "X...XX", "X.XX.X", "X....X", "X.XX.X", "X....X", "XXXXXX"] },
    cat: { px: 3, color: "#A7A1AE", colors: { D: "#4A4252", G: "#9BC26B", P: "#F08DB0" },
      grid: ["X.........X", "XX.......XX", "XXX.....XXX", "XXXXDXDXXXX", "XXXXXXXXXXX", "XXGXXXXXGXX", "XXXXXXXXXXX", "XXXXXPXXXXX", ".XXXXXXXXX.", "..XXXXXXX.."] }
  };
  function pixel(name) {
    var p = PIX[name], h = p.grid.length, w = p.grid[0].length, r = "";
    p.grid.forEach(function (row, y) {
      for (var x = 0; x < row.length; x++) {
        var ch = row[x];
        if (ch !== ".") r += '<rect x="' + x + '" y="' + y + '" width="1" height="1" fill="' + ((p.colors && p.colors[ch]) || p.color) + '"/>';
      }
    });
    return '<svg width="' + w * p.px + '" height="' + h * p.px + '" viewBox="0 0 ' + w + " " + h + '" shape-rendering="crispEdges" aria-hidden="true">' + r + "</svg>";
  }
  function drawPixels(root) {
    (root || document).querySelectorAll("[data-pixel]").forEach(function (el) { el.innerHTML = pixel(el.getAttribute("data-pixel")); });
  }

  // ---------- уведомления и копирование ----------
  var toastTimer;
  function toast(text) {
    var t = $("toast");
    t.textContent = text;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2200);
  }
  function copy(text, okMsg) {
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      toast(ok ? okMsg : "Не получилось скопировать — выделите текст вручную");
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { toast(okMsg); }, fallback);
    } else fallback();
  }

  // ---------- расчёты ----------
  function totals(c) {
    var raised = 0, paid = 0, planned = 0, plannedUnknown = 0;
    (c.donations || []).forEach(function (d, i) {
      if (isNum(d.amount_rub) && d.amount_rub >= 0) raised += d.amount_rub;
      else warn("в поступлении №" + (i + 1) + " нет суммы amount_rub (числом, без пробелов и ₽)");
    });
    (c.expenses || []).forEach(function (e, i) {
      if (e.status === "paid") {
        if (isNum(e.amount)) paid += e.amount; else warn("у оплаченного расхода №" + (i + 1) + " нет суммы amount");
      } else if (e.status === "planned") {
        if (isNum(e.amount)) planned += e.amount; else plannedUnknown++;
      } else warn("у расхода №" + (i + 1) + " статус должен быть \"paid\" или \"planned\"");
    });
    var goal = c.goal && isNum(c.goal.amount) && c.goal.amount > 0 ? c.goal.amount : null;
    var left = goal !== null ? Math.max(goal - raised, 0) : null;
    var pct = goal !== null ? Math.min(100, Math.floor((raised / goal) * 100)) : 0;
    return { raised: raised, paid: paid, planned: planned, plannedUnknown: plannedUnknown, goal: goal, left: left, pct: pct };
  }

  function bar(el, pct, n) {
    var filled = Math.round((pct / 100) * n);
    if (pct > 0 && filled === 0) filled = 1;
    var html = "";
    for (var i = 0; i < n; i++) html += "<i" + (i < filled ? ' class="on"' : "") + "></i>";
    el.innerHTML = html;
    if (el.hasAttribute("aria-valuenow")) { el.setAttribute("aria-valuenow", pct); el.setAttribute("aria-valuetext", pct + "%"); }
  }

  // ---------- кнопки файлов ----------
  var fileChecks = [];
  function fileButton(path, label, cls) {
    var id = "f" + Math.random().toString(36).slice(2, 9);
    fileChecks.push({ id: id, path: path });
    return '<a id="' + id + '" class="btn btn-file ' + (cls || "") + '" href="' + esc(path) + '" data-file="' + esc(path) +
      '" data-label="' + esc(label) + '" target="_blank" rel="noopener"><span data-pixel="doc"></span>' + esc(label) + "</a>";
  }
  function checkFiles() {
    if (!/^https?:$/.test(location.protocol)) return;
    fileChecks.forEach(function (f) {
      fetch(f.path, { method: "HEAD", cache: "no-cache" }).then(function (r) {
        if (r.status === 404) {
          var el = $(f.id);
          if (!el) return;
          el.classList.add("is-missing");
          el.removeAttribute("href");
          el.setAttribute("aria-disabled", "true");
          el.title = "Файл ещё не загружен";
          var title = el.querySelector(".tile-title");
          if (title) title.textContent += " (скоро)";
          else if (el.lastChild) el.lastChild.textContent = "файл скоро";
        }
      }).catch(function () {});
    });
  }

  // ---------- просмотр картинок ----------
  var viewer = { list: [], i: 0, zoom: 1, meta: "", title: "" };
  function openViewer(list, index, meta, title) {
    viewer.list = list; viewer.i = index; viewer.meta = meta || ""; viewer.title = title || ""; viewer.zoom = 1;
    viewer.opener = document.activeElement;
    $("viewer").hidden = false;
    document.body.style.overflow = "hidden";
    showViewer();
    $("viewer-close").focus();
  }
  function showViewer() {
    var path = viewer.list[viewer.i], img = $("viewer-img");
    img.src = path;
    img.alt = viewer.title + (viewer.list.length > 1 ? ", документ " + (viewer.i + 1) : "");
    $("viewer-meta").textContent = viewer.meta + (viewer.list.length > 1 ? ", документ " + (viewer.i + 1) + " из " + viewer.list.length : "");
    $("viewer-title").textContent = viewer.title;
    $("viewer-orig").href = path;
    $("viewer-prev").disabled = viewer.i === 0;
    $("viewer-next").disabled = viewer.i >= viewer.list.length - 1;
    $("viewer-prev").hidden = $("viewer-next").hidden = viewer.list.length < 2;
    setZoom(1);
  }
  function setZoom(z) {
    viewer.zoom = Math.max(1, Math.min(4, z));
    var img = $("viewer-img"), stage = $("viewer-stage");
    if (viewer.zoom === 1) { stage.classList.remove("zoomed"); img.style.width = ""; }
    else { stage.classList.add("zoomed"); img.style.width = (stage.clientWidth - 32) * viewer.zoom + "px"; }
    $("viewer-zoom").textContent = Math.round(viewer.zoom * 100) + "%";
  }
  function closeViewer() {
    $("viewer").hidden = true;
    document.body.style.overflow = "";
    $("viewer-img").removeAttribute("src");
    if (viewer.opener && viewer.opener.focus) viewer.opener.focus();
  }
  function initViewer() {
    $("viewer-close").addEventListener("click", closeViewer);
    $("viewer-in").addEventListener("click", function () { setZoom(viewer.zoom + 0.5); });
    $("viewer-out").addEventListener("click", function () { setZoom(viewer.zoom - 0.5); });
    $("viewer-prev").addEventListener("click", function () { if (viewer.i > 0) { viewer.i--; showViewer(); } });
    $("viewer-next").addEventListener("click", function () { if (viewer.i < viewer.list.length - 1) { viewer.i++; showViewer(); } });
    $("viewer").addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeViewer();
      if (e.key === "ArrowLeft") $("viewer-prev").click();
      if (e.key === "ArrowRight") $("viewer-next").click();
    });
    // картинки открываются в просмотрщике, PDF — в новой вкладке
    document.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest("a[data-file]");
      if (!a) return;
      if (a.classList.contains("is-missing")) { e.preventDefault(); toast("Этот файл ещё не загружен"); return; }
      var group = a.getAttribute("data-group");
      var path = a.getAttribute("data-file");
      if (!isImage(path)) return;
      e.preventDefault();
      var links = group ? Array.prototype.slice.call(document.querySelectorAll('a[data-group="' + group + '"]')) : [a];
      var imgs = links.map(function (l) { return l.getAttribute("data-file"); }).filter(isImage);
      openViewer(imgs, Math.max(0, imgs.indexOf(path)), a.getAttribute("data-meta") || "", a.getAttribute("data-title") || "");
    });
  }

  // ---------- отрисовка ----------
  function render(c) {
    var t = totals(c);
    var texts = c.texts || {}, photos = c.photos || {}, story = c.story || {};

    // первый экран
    if (texts.title) { $("t-title").textContent = texts.title; }
    if (texts.intro) $("t-intro").textContent = texts.intro;
    if (texts.photo_sticker) $("t-sticker").textContent = texts.photo_sticker;
    if (photos.hero) { $("p-hero").src = photos.hero; $("p-hero").alt = photos.hero_alt || ""; }

    $("f-goal").textContent = t.goal !== null ? money(t.goal) : "уточняется";
    $("f-goal").classList.toggle("pending", t.goal === null);
    $("f-raised").textContent = money(t.raised);
    $("f-left").textContent = t.left !== null ? money(t.left) : "—";
    $("f-pct").textContent = t.goal !== null ? t.pct + "%" : "";
    bar($("f-bar"), t.pct, 18);
    ["f-updated", "h-updated", "foot-updated"].forEach(function (id) { $(id).textContent = dateLong(c.updated); });

    var g = c.goal || {}, gh = "";
    if (g.explanation) gh += "<p>" + esc(g.explanation) + "</p>";
    (g.changes || []).slice().sort(byDateDesc).forEach(function (ch) {
      gh += "<p><b>" + dateDay(ch.date) + ":</b> " + esc(ch.text) + "</p>";
    });
    $("goal-text").innerHTML = gh;
    $("goal-why").hidden = !gh;

    // знакомство
    $("t-about").textContent = texts.about || "";
    if (photos.about) {
      $("p-about-webp").srcset = photos.about;
      $("p-about").src = photos.about_fallback || photos.about;
      $("p-about").alt = photos.about_alt || "";
    }
    $("gallery").innerHTML = (photos.gallery || []).map(function (p) {
      return '<img src="' + esc(p.src) + '" alt="' + esc(p.alt) + '" loading="lazy">';
    }).join("");

    // история
    $("t-clinic").textContent = story.clinic || "";
    $("timeline").innerHTML = (story.events || []).map(function (ev) {
      return '<li class="' + (ev.now ? "now" : "") + '"><div class="node" aria-hidden="true"></div><div class="ev">' +
        '<span class="when">' + esc(ev.when) + (ev.now ? ", сейчас" : "") + "</span><h3>" + esc(ev.title) + "</h3><p>" + esc(ev.text) + "</p></div></li>";
    }).join("");
    var st = [["Подтверждено", story.confirmed], ["Предполагают врачи", story.assumed], ["Пока неизвестно", story.unknown]];
    $("status").innerHTML = st.filter(function (s) { return s[1]; }).map(function (s) {
      return '<div class="status-row"><h3>' + s[0] + "</h3><p>" + esc(s[1]) + "</p></div>";
    }).join("");

    // почему
    if (photos.why) { $("p-why").src = photos.why; $("p-why").alt = photos.why_alt || ""; }
    $("t-why").innerHTML = (texts.why || []).map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("");
    $("t-signature").textContent = texts.signature || "";

    // чеки
    $("e-paid").textContent = money(t.paid);
    $("e-planned").textContent = t.planned > 0 ? money(t.planned) : (t.plannedUnknown ? "уточняется" : "—");
    // Строки списка «Чеки»:
    // 1) оплаченные расходы с файлами (expenses, status "paid") — с суммой;
    // 2) отдельный список receipts — чеки по дням, сумма у них необязательна.
    // В итог «Уже оплачено» идут только суммы из expenses, поэтому чеки из receipts ничего не удваивают.
    var looseReceipts = (c.receipts || []).filter(function (r) { return r && r.file; });
    var rows = [];
    (c.expenses || []).forEach(function (e) {
      if (e.status !== "paid") return;
      var files = (e.files || []).map(function (f) { return typeof f === "string" ? { file: f } : f; });
      if (!files.length && looseReceipts.length) return; // общая запись без файлов — её чеки лежат в receipts
      rows.push({ date: e.date, amount: isNum(e.amount) ? e.amount : null, title: e.title || "", files: files });
    });
    var byDay = {};
    looseReceipts.forEach(function (r) {
      var key = r.date || "";
      if (!byDay[key]) { byDay[key] = { date: key, amount: 0, allHaveAmount: true, title: "", files: [] }; rows.push(byDay[key]); }
      byDay[key].files.push({ file: r.file, label: r.label });
      if (isNum(r.amount)) byDay[key].amount += r.amount; else byDay[key].allHaveAmount = false;
    });
    rows.forEach(function (r) { if (r.allHaveAmount === false) r.amount = null; });
    rows.sort(byDateDesc);
    var paid = rows;
    $("receipts").innerHTML = rows.length ? rows.map(function (e, i) {
      var files = e.files;
      var group = "r" + i;
      var btns = files.length ? files.map(function (f, k) {
        var label = f.label || (files.length > 1 ? "Чек " + (k + 1) : "Открыть чек");
        return fileButton(f.file, label, "").replace("<a ", '<a data-group="' + group + '" data-meta="' + esc(dateShort(e.date) + (e.amount !== null ? ", " + money(e.amount) : "")) + '" data-title="' + esc(e.title || "Чек") + '" ');
      }).join("") : '<span class="btn btn-file is-missing" aria-disabled="true"><span data-pixel="doc"></span>чеки скоро</span>';
      var dayRow = e.amount === null && !e.title;
      var filesStyle = dayRow ? ' style="grid-column: 2 / -1; flex-basis: 100%; justify-content: flex-start"' : "";
      return '<li' + (i >= SHOW_RECEIPTS ? " hidden" : "") + (dayRow ? ' style="flex-wrap: wrap"' : "") + '><div class="receipt-info"><span class="receipt-date">' + dateShort(e.date) + "</span>" +
        (e.amount !== null ? '<span class="receipt-sum">' + money(e.amount) + "</span>" : "") +
        (e.title ? '<span class="receipt-note">' + esc(e.title) + "</span>" : "") + '</div><div class="receipt-files"' + filesStyle + ">" + btns + "</div></li>";
    }).join("") : '<li class="empty">Чеки появятся здесь.</li>';
    var more = $("receipts-more");
    more.hidden = paid.length <= SHOW_RECEIPTS;
    more.onclick = function () {
      $("receipts").querySelectorAll("li[hidden]").forEach(function (li) { li.hidden = false; });
      more.hidden = true;
    };

    // выписки
    var docs = (c.documents || []).slice().sort(byDateDesc);
    $("documents").innerHTML = docs.length ? docs.map(function (d) {
      var id = "d" + Math.random().toString(36).slice(2, 9);
      fileChecks.push({ id: id, path: d.file });
      return '<li><a id="' + id + '" href="' + esc(d.file) + '" data-file="' + esc(d.file) + '" data-meta="' + esc(dateShort(d.date)) + '" data-title="' + esc(d.title) +
        '" target="_blank" rel="noopener"><span data-pixel="doc"></span><span class="tile-text"><span class="tile-date">' + dateShort(d.date) +
        '</span><span class="tile-title">' + esc(d.title) + "</span></span></a></li>";
    }).join("") : '<li class="empty">Выписки появятся здесь.</li>';

    // предстоящие
    var planned = (c.expenses || []).filter(function (e) { return e.status === "planned"; });
    $("planned").innerHTML = planned.length ? '<ul class="planned-list">' + planned.map(function (e) {
      var src = e.source && e.source.file
        ? '<a href="' + esc(e.source.file) + '" data-file="' + esc(e.source.file) + '" data-title="' + esc(e.source.title || "Назначение") + '" target="_blank" rel="noopener">' + esc(e.source.title || "Назначение") + "</a>"
        : (e.source && e.source.title ? "<span>" + esc(e.source.title) + "</span>" : "");
      return '<li><span class="planned-title">' + esc(e.title) + '</span><span class="planned-src">' + src +
        (e.preliminary === false ? "" : '<span class="pill">предварительно</span>') + '</span><span class="planned-sum">' +
        (isNum(e.amount) ? money(e.amount) : "уточняется") + "</span></li>";
    }).join("") + "</ul>" : '<p class="empty">Пока нет назначенных расходов с известной стоимостью.</p>';

    // новости
    var news = (c.news || []).slice().sort(byDateDesc);
    $("news-list").innerHTML = news.map(function (n, i) {
      return '<article class="news-item"' + (i >= SHOW_NEWS ? " hidden" : "") + '><div class="news-meta"><time datetime="' + esc(n.date) + '">' + dateDay(n.date) + "</time>" +
        (i === 0 ? '<span class="news-fresh">свежее</span>' : "") + "</div><div><p>" + esc(n.text) + "</p>" +
        (n.photo ? '<img src="' + esc(n.photo) + '" alt="' + esc(n.photo_alt || "Фото к новости") + '" loading="lazy">' : "") + "</div></article>";
    }).join("");
    var nm = $("news-more");
    nm.hidden = news.length <= SHOW_NEWS;
    nm.onclick = function () {
      $("news-list").querySelectorAll("article[hidden]").forEach(function (a) { a.hidden = false; });
      nm.hidden = true;
    };

    // помощь
    $("h-raised").textContent = money(t.raised);
    $("h-of").textContent = t.goal !== null ? "из " + money(t.goal) : "";
    bar($("h-bar"), t.pct, 22);
    renderRub(c.payments && c.payments.rub);
    renderCrypto((c.payments && c.payments.crypto) || []);

    var url = c.site_url || location.href.split("#")[0];
    $("share-url").textContent = url.replace(/^https?:\/\//, "").replace(/\/$/, "");
    $("share-copy").onclick = function () { copy(url, "Ссылка скопирована"); };
    $("share-btn").onclick = function () {
      var data = { title: document.title, text: "Помочь Боне пройти обследования и лечение", url: url };
      if (navigator.share) navigator.share(data).catch(function () {});
      else copy(url, "Ссылка скопирована — можно отправить её знакомым");
    };

    var ct = c.contacts || {}, ch = "";
    if (ct.email) ch += '<a href="mailto:' + esc(ct.email) + '">' + esc(ct.email) + "</a>";
    if (ct.telegram) {
      var tg = String(ct.telegram).replace(/^@/, "");
      ch += '<a href="https://t.me/' + esc(tg) + '" target="_blank" rel="noopener">Telegram: @' + esc(tg) + "</a>";
    }
    $("contacts").innerHTML = ch;
    $("t-thanks").textContent = texts.thanks || "";
    $("t-footer").textContent = texts.footer || "";

    drawPixels();
    checkFiles();
    if (warnings.length) showWarnings();
  }

  function field(label, value, mono) {
    return '<div class="field"><span class="label">' + esc(label) + '</span><span class="value' + (mono ? " mono" : "") + '">' + esc(value) + "</span></div>";
  }

  function renderRub(r) {
    r = r || {};
    $("rub-bank").textContent = r.bank || "";
    $("rub-bank").hidden = !r.bank;
    var h = '<div class="pay-body">';
    if (r.url) {
      h += '<a class="btn btn-pink" href="' + esc(r.url) + '" target="_blank" rel="noopener">Перейти к сбору' + (r.bank ? " в " + esc(r.bank) : "") + "</a>";
      h += '<div class="qr" id="rub-qr"></div><p class="pay-note">Можно навести камеру телефона на QR-код — откроется та же страница сбора.</p>';
    } else {
      h += '<button type="button" class="btn" disabled>Перейти к сбору' + (r.bank ? " в " + esc(r.bank) : "") + "</button>";
      h += '<p class="pay-note">Ссылка на сбор появится здесь, как только будет готова.</p>';
    }
    if (r.details) {
      h += field(r.details_label || "Реквизиты", r.details);
      h += '<div class="copy-line"><button type="button" class="btn btn-paper btn-sm" id="rub-copy">Скопировать</button></div>';
    }
    h += "</div>";
    $("rub-body").innerHTML = h;
    if (r.url && window.BonyaQR) $("rub-qr").innerHTML = BonyaQR.svg(r.url, { size: 176, label: "QR-код со ссылкой на сбор" });
    if (r.details) $("rub-copy").onclick = function () { copy(r.details, "Реквизиты скопированы"); };
  }

  function renderCrypto(list) {
  var url = "https://pay.oxapay.com/19548371";

  var tag = document.querySelector("#crypto .tag");
  if (tag) tag.textContent = "через OxaPay";

  $("crypto-body").innerHTML =
    '<div class="pay-body">' +
      '<a class="btn btn-lilac" href="' + url + '" ' +
      'target="_blank" rel="noopener noreferrer">' +
        'Помочь криптой' +
      '</a>' +
      '<p class="pay-note">' +
        'Выберите валюту и сеть на странице оплаты OxaPay. ' +
        'Спасибо за помощь Боне!' +
      '</p>' +
      '<div class="qr" id="crypto-pay-qr"></div>' +
    '</div>';

  if (window.BonyaQR) {
    $("crypto-pay-qr").innerHTML = BonyaQR.svg(url, {
      size: 176,
      label: "QR-код со ссылкой на сбор в OxaPay"
    });
  }
}


  function showWarnings() {
    var box = document.createElement("div");
    box.setAttribute("role", "alert");
    box.style.cssText = "background:#FFF1C2;color:#2A1F33;border:2px dashed #2A1F33;border-radius:12px;padding:12px 16px;margin:12px 16px;font-size:15px";
    box.innerHTML = "<b>Проверьте content.json:</b><br>" + warnings.map(esc).join("<br>");
    document.body.insertBefore(box, document.body.firstChild);
  }

  function showError(msg) {
    var box = document.createElement("div");
    box.setAttribute("role", "alert");
    box.style.cssText = "background:#FFE3EC;color:#2A1F33;border:2px solid #D9477F;border-radius:12px;padding:14px 16px;margin:12px 16px;font-size:16px";
    box.innerHTML = msg;
    document.body.insertBefore(box, document.body.firstChild);
  }

  // ---------- запуск ----------
  initViewer();
  drawPixels();
  function start(c) {
    try { render(c); } catch (e) { showError("Ошибка при показе данных: " + esc(e.message)); throw e; }
  }
  if (window.BONYA_CONTENT) start(window.BONYA_CONTENT);
  else {
    fetch("content.json", { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error("файл content.json не найден (" + r.status + ")"); return r.text(); })
      .then(function (txt) {
        var data;
        try { data = JSON.parse(txt); }
        catch (e) { throw new Error("в content.json ошибка оформления: " + e.message + ". Проверьте запятые и кавычки рядом с последним изменением."); }
        start(data);
      })
      .catch(function (e) {
        showError(location.protocol === "file:"
          ? "Страница открыта как файл с компьютера — так браузер не даёт прочитать content.json. Откройте сайт по ссылке GitHub Pages."
          : "Не удалось загрузить данные: " + esc(e.message));
      });
  }
})();
