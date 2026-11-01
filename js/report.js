// ════════════════════════════════════════════════════════════════
//  Deepa Silks — staff PDF report (A4, generated in the browser)
//
//  buildReportData(checklistResponse, staff, now) is PURE (no DOM,
//  no network) and is covered by tests/report.test.js.
//  downloadReport(data, opts) draws the PDF with the VENDORED jsPDF
//  (js/vendor/jspdf.umd.min.js, loaded lazily on demand — no CDN).
//
//  Design notes:
//  • A4 portrait, standard PDF fonts only (no font files to ship).
//  • Words, never glyphs: statuses say "OK / Failed / Pending" (and
//    are also coloured), so the report survives greyscale printing.
//  • Red #B5122A + navy #0F2237 + cream, the Deepa Silks palette.
//  • The Tamil tagline "தீப வணக்கம்" is drawn by the BROWSER onto a
//    canvas and embedded as an image (jsPDF cannot shape Tamil text).
//  • A footer with page numbers runs on EVERY page.
// ════════════════════════════════════════════════════════════════
(function (global) {
  'use strict';

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var IST_OFFSET_MS = 5.5 * 3600000;

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  // Pad a single-digit hour: '2026-10-24 9:35:26' -> '2026-10-24 09:35:26'.
  // Sheets/manual edits can store '9:35:26'; our parsers expect two digits.
  // An already two-digit hour, a date-only value, junk or a ","-list is
  // returned unchanged (split comma lists before calling).
  function padHour(s) {
    return String(s === null || s === undefined ? '' : s).replace(
      /^(\d{4}-\d{2}-\d{2}[ T])(\d)(:\d{2}(?::\d{2})?)$/,
      function (m, date, h, rest) { return date + '0' + h + rest; });
  }

  // Epoch ms → IST parts, with no Intl dependency (deterministic in tests).
  function istParts(ms) {
    var d = new Date(Number(ms) + IST_OFFSET_MS);
    if (isNaN(d.getTime())) return null;
    return {
      date: d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()),
      time: pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes()) + ':' + pad2(d.getUTCSeconds())
    };
  }

  // '2026-10-26 14:03:11' → '26 Oct 2026, 02:03 PM' ('' when unreadable).
  function prettyStamp(s) {
    var v = padHour(s);
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(String(v || '').trim());
    if (!m) return '';
    var y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
    var out = d + ' ' + MONTHS[mo - 1] + ' ' + y;
    if (m[4] !== undefined) {
      var hh = +m[4], mm = m[5];
      if (hh > 23 || +mm > 59) return out;
      var ampm = hh >= 12 ? 'PM' : 'AM';
      var h12 = hh % 12 || 12;
      out += ', ' + pad2(h12) + ':' + mm + ' ' + ampm;
    }
    return out;
  }

  // Photo capture time for the PDF caption: the pretty form ONLY when the
  // value carries a real date AND a real time; otherwise '' so the caption
  // prints "not recorded" instead of a bare date. Mirrors Dates.prettyPhoto
  // (report.js is standalone and cannot depend on the browser Dates helper).
  // Rejects a bare date, a midnight stamp (date-only cell) and pre-app years
  // (a Sheets time-of-day serial, 1899-12-30).
  function photoStamp(s) {
    var v = padHour(s);
    var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(v || '').trim());
    if (!m) return '';
    var y = +m[1], mo = +m[2], d = +m[3], hh = +m[4], mm = +m[5];
    var ss = m[6] === undefined ? 0 : +m[6];
    if (y < 2020 || mo < 1 || mo > 12 || d < 1 || d > 31) return '';
    if (hh > 23 || mm > 59 || ss > 59) return '';
    if (hh === 0 && mm === 0 && ss === 0) return '';
    return prettyStamp(v);
  }

  // Keep the PDF inside standard-font territory: no emoji, no ₹, no
  // typographic dashes (they render as boxes in the 14 core fonts).
  function safeText(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/₹/g, 'Rs.')
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[–—]/g, '-')
      .replace(/→/g, '->')
      .replace(/[✓✔]/g, 'OK')
      .replace(/[\uD800-\uDFFF]/g, '');   // emoji surrogates
  }

  // One report row per task: {taskId, taskName, type, response, status,
  // remarks, photos:[{ref, takenAt}]} — status is always worded.
  function toRow(t, st) {
    var refs = String((st && st.photoRef) || '').split(',');
    var times = String((st && st.photoTime) || '').split(',');
    var photos = [];
    refs.forEach(function (raw, i) {
      var ref = String(raw).trim();
      if (ref) photos.push({ ref: ref, takenAt: String(times[i] === undefined ? '' : times[i]).trim() });
    });
    var type = String(t.type || '').toLowerCase();
    var rawResp = st ? String(st.response || '') : '';
    var response;
    if (!st) response = 'Not submitted';
    else if (type === 'yesno') response = /^y/i.test(rawResp) ? 'Yes' : (/^n/i.test(rawResp) ? 'No' : rawResp);
    else if (type === 'rating') response = rawResp ? rawResp + ' / 5' : 'Not answered';
    else if (type === 'photo') response = photos.length ? 'Photo (' + photos.length + ')' : 'Photo';
    else response = rawResp || 'Not answered';
    var status = !st ? 'Pending'
      : (String(st.status || '').toUpperCase() === 'FAIL' ? 'Failed' : 'OK');
    return {
      taskId: String(t.taskId || ''),
      taskName: String(t.taskName || ''),
      type: String(t.type || ''),
      response: safeText(response),
      status: status,
      remarks: safeText((st && st.remarks) || ''),
      photos: photos
    };
  }

  // PURE: a getChecklist response (+ the signed-in staff + a fixed "now")
  // → everything the renderer needs. No DOM, no network, no Date.now()
  // unless "now" is omitted.
  function buildReportData(checklistResponse, staff, now) {
    var res = checklistResponse || {};
    var s = staff || {};
    var nowMs = now === undefined || now === null
      ? Date.now()
      : (now instanceof Date ? now.getTime() : Number(now));
    var gen = istParts(nowMs) || { date: '', time: '' };
    var store = res.store || {};
    var header = {
      title: 'Store Operations Checklist Report',
      storeName: safeText(store.name || 'Deepa Silks'),
      storeLocation: safeText(store.location || ''),
      staffName: safeText(s.name || res.name || ''),
      role: safeText(s.role || res.role || ''),
      reportDate: String(res.date || ''),
      generatedOn: gen.date + (gen.time ? ' ' + gen.time : '')
    };
    var sections = [];
    var total = 0, completed = 0, failed = 0, pending = 0, photos = 0;
    (res.sections || []).forEach(function (sec) {
      var rows = [];
      (sec.tasks || []).forEach(function (t) {
        var st = t.submitted ? (t.submittedStatus || {}) : null;
        var row = toRow(t, st);
        total++;
        if (row.status === 'OK') completed++;
        else if (row.status === 'Failed') failed++;
        else pending++;
        photos += row.photos.length;
        rows.push(row);
      });
      if (rows.length) sections.push({ name: safeText(sec.section || ''), tasks: rows });
    });
    return {
      header: header,
      summary: {
        total: total,
        completed: completed,
        failed: failed,
        pending: pending,
        completionPct: total > 0 ? Math.round(((completed + failed) / total) * 100) : 0,
        photos: photos
      },
      sections: sections
    };
  }

  // ── browser half (never loaded by the Node tests) ────────────
  function ensureJsPdf() {
    if (global.jspdf && global.jspdf.jsPDF) return Promise.resolve(global.jspdf.jsPDF);
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'js/vendor/jspdf.umd.min.js';        // vendored — never a CDN
      s.onload = function () {
        if (global.jspdf && global.jspdf.jsPDF) resolve(global.jspdf.jsPDF);
        else reject(new Error('The PDF library loaded but is not usable.'));
      };
      s.onerror = function () { reject(new Error('The PDF library could not be loaded.')); };
      document.head.appendChild(s);
    });
  }

  // Load an image (same-origin URL or data URL) as a data URL that KEEPS THE
  // FILE'S OWN FORMAT — images/cb-logo.png stays PNG (alpha intact) instead of
  // being re-encoded on a canvas, so its pixels are never touched.
  function toDataUrl(src) {
    if (!src) return Promise.resolve(null);
    if (/^data:/i.test(src)) return Promise.resolve(src);   // already a data URL
    if (typeof fetch !== 'function') return Promise.resolve(null);
    return fetch(src, { cache: 'force-cache' })
      .then(function (r) { return r.ok ? r.blob() : null; })
      .then(function (b) {
        if (!b) return null;
        if (!/^image\//i.test(b.type || '')) return null;
        return new Promise(function (resolve) {
          var fr = new FileReader();
          fr.onload = function () { resolve(fr.result); };   // "data:image/jpeg;base64,…"
          fr.onerror = function () { resolve(null); };
          fr.readAsDataURL(b);
        });
      })
      .catch(function () { return null; });                  // missing file → skip quietly
  }

  // jsPDF needs the format name; read it from the data URL we actually loaded
  // ('JPEG' for image/jpeg, 'PNG' for image/png) instead of hardcoding one.
  function imgFormat(dataUrl) {
    var m = /^data:image\/(jpe?g|png|gif|webp)/i.exec(String(dataUrl || ''));
    if (!m) return null;
    var t = m[1].toLowerCase();
    if (t === 'jpg') t = 'jpeg';
    return (t === 'jpeg' || t === 'png') ? t.toUpperCase() : null;
  }

  function addImage(doc, dataUrl, x, y, w, h) {
    var fmt = imgFormat(dataUrl);
    if (!fmt) return false;
    try { doc.addImage(dataUrl, fmt, x, y, w, h); return true; }
    catch (e) { return false; }
  }

  // The Consulting & Beyond artwork is dark grey, so on the maroon header band we need it
  // white. That version is made at RUNTIME: draw the same PNG onto a canvas,
  // paint it with 'source-in' + white (which keeps the PNG's alpha and only
  // replaces its colour), and export PNG again. One file, no second asset.
  // The canvas is capped at 600 px wide — still ~350 dpi at the 43 mm it is
  // drawn at — because jsPDF stores PNG as raw RGB, so a full-size copy would
  // add ~750 KB to every PDF.
  // Returns null on any failure so the caller can skip the logo entirely.
  function whiteLogo(dataUrl) {
    return new Promise(function (resolve) {
      if (!dataUrl || typeof Image === 'undefined' || typeof document === 'undefined') {
        resolve(null); return;
      }
      var img = new Image();
      img.onload = function () {
        try {
          var sw = img.naturalWidth || img.width, sh = img.naturalHeight || img.height;
          if (!sw || !sh) { resolve(null); return; }
          var w = sw, h = sh;
          if (w > 600) { h = Math.round(h * 600 / w); w = 600; }
          var c = document.createElement('canvas');
          c.width = w; c.height = h;
          var ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          ctx.globalCompositeOperation = 'source-in';   // keep the alpha shape
          ctx.fillStyle = '#FFFFFF';                    // replace the colour
          ctx.fillRect(0, 0, w, h);
          resolve(c.toDataURL('image/png'));
        } catch (e) { resolve(null); }
      };
      img.onerror = function () { resolve(null); };
      img.src = dataUrl;
    });
  }

  // The Deepa tagline under the store name in the header band. Standard PDF
  // fonts have no Tamil glyphs and jsPDF does no complex-script shaping, so
  // the browser draws it (correct Tamil joining) onto a transparent canvas
  // and we embed that as a PNG. Waits briefly for the web font
  // (Noto Serif Tamil) and falls back to the system Tamil font.
  // Returns { url, w, h } (pixels) or null on any failure → tagline skipped.
  var TAGLINE = 'தீப வணக்கம்';
  function taglineImage(color) {
    return new Promise(function (resolve) {
      if (typeof document === 'undefined') { resolve(null); return; }
      var FONT = '600 64px "Noto Serif Tamil", "Latha", "Nirmala UI", "Tamil Sangam MN", serif';
      var ready = Promise.resolve();
      try {
        if (document.fonts && document.fonts.load) {
          ready = Promise.race([
            document.fonts.load(FONT, TAGLINE).catch(function () {}),
            new Promise(function (r) { setTimeout(r, 1500); })
          ]);
        }
      } catch (e) { /* no font loading API → system font */ }
      ready.then(function () {
        try {
          var c = document.createElement('canvas');
          var ctx = c.getContext('2d');
          ctx.font = FONT;
          var w = Math.ceil(ctx.measureText(TAGLINE).width) + 12;
          if (!w || w < 20) { resolve(null); return; }
          c.width = w; c.height = 96;
          ctx = c.getContext('2d');                       // resizing resets state
          ctx.font = FONT;
          ctx.fillStyle = color || '#FFF8E7';
          ctx.textBaseline = 'middle';
          ctx.fillText(TAGLINE, 6, 48);
          resolve({ url: c.toDataURL('image/png'), w: c.width, h: c.height });
        } catch (e) { resolve(null); }
      });
    });
  }

  // Photo thumbs are re-compressed small so the PDF stays email/phone friendly.
  function shrinkPhoto(dataUrl) {
    return new Promise(function (resolve) {
      if (!dataUrl) { resolve(null); return; }
      var img = new Image();
      img.onload = function () {
        try {
          var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
          if (!w || !h) { resolve(null); return; }
          if (w > 800) { h = Math.round(h * 800 / w); w = 800; }
          var c = document.createElement('canvas');
          c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(c.toDataURL('image/jpeg', 0.6));
        } catch (e) { resolve(null); }
      };
      img.onerror = function () { resolve(null); };
      img.src = dataUrl;
    });
  }

  // Fetch every distinct photo id with a max of 3 in flight.
  function fetchPhotos(refs, loader, onProgress) {
    var out = {}, i = 0, active = 0, done = 0, total = refs.length;
    return new Promise(function (resolve) {
      if (!total) { resolve(out); return; }
      function next() {
        while (active < 3 && i < total) {
          (function (ref) {
            active++;
            Promise.resolve().then(function () { return loader(ref); })
              .then(function (url) { out[ref] = url; })
              .catch(function () { out[ref] = null; })       // → "Photo unavailable"
              .then(function () {
                active--; done++;
                if (onProgress) onProgress('Preparing PDF... ' + done + '/' + total + ' photos');
                if (done === total) resolve(out); else next();
              });
          })(refs[i++]);
        }
      }
      next();
    });
  }

  function downloadReport(data, opts) {
    var o = opts || {};
    var loader = o.photoLoader;
    var onProgress = o.onProgress || function () {};
    var jsPdfCtor;
    return ensureJsPdf().then(function (Ctor) {
      jsPdfCtor = Ctor;
      var refs = [];
      data.sections.forEach(function (sec) {
        sec.tasks.forEach(function (task) {
          task.photos.forEach(function (ph) {
            if (refs.indexOf(ph.ref) === -1) refs.push(ph.ref);
          });
        });
      });
      return Promise.all([
        loader ? fetchPhotos(refs, loader, onProgress) : Promise.resolve({}),
        toDataUrl('images/deepa-logo.png'),    // Deepa header logo (left, on a white chip)
        toDataUrl('images/cb-logo.png'),       // Consulting & Beyond header logo (right, optional)
        taglineImage('#FCF4E1')                // "தீப வணக்கம்" under the store name (optional)
      ]).then(function (r) {
        // The header band is red, so the dark artwork is recoloured white
        // at runtime; if anything fails we simply ship no Consulting & Beyond logo.
        return whiteLogo(r[2]).then(function (white) {
          return { photos: r[0], deepa: r[1], cb: white, tagline: r[3] };
        });
      });
    }).then(function (assets) {
      onProgress('Preparing PDF...');
      return renderPdf(jsPdfCtor, data, assets, onProgress).then(function (pdf) {
        var name = 'Deepa_Silks_Checklist_' +
          (data.header.staffName || 'Staff').replace(/[^\w-]+/g, '_') + '_' +
          (data.header.reportDate || (new Date().toISOString().slice(0, 10))) + '.pdf';
        savePdf(pdf, name);
        onProgress('');
        return name;
      });
    }).catch(function (e) {
      onProgress('');
      throw e;
    });
  }

  function renderPdf(jsPdfCtor, data, assets, onProgress) {
    var doc = new jsPdfCtor({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    var W = 210, H = 297, ML = 14, MR = 14, CW = W - ML - MR;
    var FOOT = 16;                       // reserved strip at the bottom
    var maxY = H - FOOT;
    // Deepa palette: MAROON = brand red #B5122A, GOLD = navy accent #0F2237.
    var MAROON = [181, 18, 42], GOLD = [15, 34, 55];
    var GREEN = [30, 107, 58], RED = [211, 48, 42], AMBER = [176, 110, 10];
    var INK = [42, 26, 28], INK60 = [112, 104, 102], CREAM = [255, 248, 231];
    var IVORY = [252, 246, 234], LINE = [234, 220, 198];

    // The photo thumbs, shrunk once, keyed by file id.
    var thumbs = {};
    var shrinkJobs = [];
    Object.keys(assets.photos).forEach(function (ref) {
      if (assets.photos[ref]) {
        shrinkJobs.push(shrinkPhoto(assets.photos[ref]).then(function (t) { thumbs[ref] = t; }));
      }
    });

    return Promise.all(shrinkJobs).then(function () {
      var y = 0;

      function need(h) {
        if (y + h > maxY) { doc.addPage(); y = 20; return true; }
        return false;
      }
      function line(x1, yy, x2) { doc.setDrawColor.apply(doc, LINE); doc.line(x1, yy, x2, yy); }

      // ── page 1 header band ─────────────────────────────────
      doc.setFillColor.apply(doc, MAROON);
      doc.rect(0, 0, W, 30, 'F');

      // Consulting & Beyond credit, top RIGHT of the band: 11 mm tall, right margin equal to
      // the left one, aspect ratio taken from the image's real pixels. If it
      // did not load we simply never draw it.
      var cbRight = W - MR;
      if (assets.cb) {
        var cbH = 11, cbW = 0;
        try {
          var dims = doc.getImageProperties(assets.cb);
          if (dims && dims.width && dims.height) cbW = cbH * dims.width / dims.height;
        } catch (e) { cbW = 0; }
        if (cbW > 0 && cbW < CW * 0.5) {                 // sanity: never eat the title
          if (addImage(doc, assets.cb, cbRight - cbW, (30 - cbH) / 2, cbW, cbH)) {
            cbRight -= (cbW + 6);                        // title may not reach it
          }
        }
      }

      // Deepa logo is red artwork, so it sits on a small white chip on the red band.
      var tx = ML;
      if (assets.deepa) {
        var lgH = 20, lgW = 16.4;                         // logo is portrait (≈ 0.82 : 1)
        try {
          var ld = doc.getImageProperties(assets.deepa);
          if (ld && ld.width && ld.height) lgW = lgH * ld.width / ld.height;
        } catch (e) { /* keep the default ratio */ }
        if (lgW > 0 && lgW < 30) {
          doc.setFillColor(255, 255, 255);
          doc.roundedRect(ML, 3, lgW + 3, lgH + 4, 2, 2, 'F');
          if (addImage(doc, assets.deepa, ML + 1.5, 5, lgW, lgH)) tx = ML + lgW + 3 + 5;
        }
      }
      doc.setTextColor(255, 248, 231);
      doc.setFont('helvetica', 'bold');
      var titleSize = 15;
      doc.setFontSize(titleSize);
      // Never let the title run under the Consulting & Beyond logo: shrink it to fit.
      var title = safeText(data.header.title);
      while (titleSize > 10 && doc.getTextWidth(title) > (cbRight - tx)) {
        titleSize -= 0.5;
        doc.setFontSize(titleSize);
      }
      doc.text(title, tx, 13);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(252, 232, 214);
      doc.text(safeText(data.header.storeName + (data.header.storeLocation ? ' - ' + data.header.storeLocation : '')), tx, 19.5);
      // "தீப வணக்கம்" — browser-drawn image, 5 mm tall, under the store name.
      if (assets.tagline && assets.tagline.w && assets.tagline.h) {
        var tgH = 5, tgW = tgH * assets.tagline.w / assets.tagline.h;
        if (tgW < (cbRight - tx)) addImage(doc, assets.tagline.url, tx - 0.6, 21.2, tgW, tgH);
      }
      y = 36;

      // ── who / when box ─────────────────────────────────────
      var infoH = 20;
      doc.setFillColor.apply(doc, IVORY);
      doc.setDrawColor.apply(doc, LINE);
      doc.rect(ML, y, CW, infoH, 'FD');
      doc.setTextColor.apply(doc, INK);
      doc.setFontSize(9);
      var col = [
        ['Staff', data.header.staffName || '-'],
        ['Role', data.header.role || '-'],
        ['Report date', data.header.reportDate ? (window.Dates && window.Dates.formatFull ? window.Dates.formatFull(data.header.reportDate) : data.header.reportDate) : '-'],
        ['Generated on', prettyStamp(data.header.generatedOn) ? prettyStamp(data.header.generatedOn) + ' IST' : (data.header.generatedOn || '-')]
      ];
      var cwid = CW / col.length;
      col.forEach(function (c, i) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor.apply(doc, INK60);
        doc.setFontSize(7.5);
        doc.text(safeText(c[0]), ML + i * cwid + 5, y + 8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor.apply(doc, MAROON);
        doc.setFontSize(10);
        doc.text(doc.splitTextToSize(safeText(c[1]), cwid - 8)[0] || '-', ML + i * cwid + 5, y + 14);
        if (i) { doc.setDrawColor.apply(doc, LINE); doc.line(ML + i * cwid, y + 3, ML + i * cwid, y + infoH - 3); }
      });
      y += infoH + 6;

      // ── summary strip ──────────────────────────────────────
      var sm = data.summary;
      var stats = [
        ['Total tasks', String(sm.total)],
        ['Completed OK', String(sm.completed)],
        ['Failed / No', String(sm.failed)],
        ['Pending', String(sm.pending)],
        ['Completion', sm.completionPct + '%'],
        ['Photos', String(sm.photos)]
      ];
      var boxH = 18, bw = CW / stats.length;
      doc.setFillColor.apply(doc, CREAM);
      doc.setDrawColor.apply(doc, GOLD);
      doc.rect(ML, y, CW, boxH, 'FD');
      stats.forEach(function (st, i) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor.apply(doc, i === 2 && +st[1] > 0 ? RED : (i === 4 ? MAROON : INK));
        doc.setFontSize(13);
        doc.text(st[1], ML + i * bw + bw / 2, y + 9, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setTextColor.apply(doc, INK60);
        doc.setFontSize(7);
        doc.text(st[0], ML + i * bw + bw / 2, y + 14.5, { align: 'center' });
        if (i) { doc.setDrawColor.apply(doc, LINE); doc.line(ML + i * bw, y + 3, ML + i * bw, y + boxH - 3); }
      });
      y += boxH + 8;

      // ── per-section tables ─────────────────────────────────
      var COLS = [
        ['Task', 60], ['Response', 28], ['Status', 22], ['Remarks', CW - 110]
      ];
      function statusColor(s) { return s === 'OK' ? GREEN : (s === 'Failed' ? RED : AMBER); }

      function tableHeader() {
        doc.setFillColor.apply(doc, MAROON);
        doc.rect(ML, y, CW, 8, 'F');
        doc.setTextColor(255, 248, 231);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        var x = ML;
        COLS.forEach(function (c) {
          doc.text(c[0], x + 3, y + 5.4);
          x += c[1];
        });
        y += 8;
      }

      data.sections.forEach(function (sec) {
        need(24);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11.5);
        doc.setTextColor.apply(doc, MAROON);
        doc.text(safeText(sec.name), ML, y + 5);
        y += 7;
        doc.setDrawColor.apply(doc, GOLD);
        doc.setLineWidth(0.6);
        doc.line(ML, y, ML + CW, y);
        doc.setLineWidth(0.2);
        y += 2.5;
        tableHeader();
        sec.tasks.forEach(function (task) {
          var nameLines = doc.splitTextToSize(safeText(task.taskName) || '-', COLS[0][1] - 6);
          var remLines = doc.splitTextToSize(task.remarks || '-', COLS[3][1] - 6);
          var rowsN = Math.max(nameLines.length, remLines.length, 1);
          var rowH = rowsN * 4.2 + 3.6;
          if (y + rowH > maxY) { doc.addPage(); y = 20; tableHeader(); }
          doc.setFillColor.apply(doc, (sec.tasks.indexOf(task) % 2) ? IVORY : [255, 255, 255]);
          doc.rect(ML, y, CW, rowH, 'F');
          doc.setDrawColor.apply(doc, LINE);
          doc.line(ML, y + rowH, ML + CW, y + rowH);
          var x = ML;
          doc.setTextColor.apply(doc, INK);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.text(nameLines, x + 3, y + 6); x += COLS[0][1];
          doc.text(task.response || '-', x + 3, y + 6); x += COLS[1][1];
          doc.setFont('helvetica', 'bold');
          doc.setTextColor.apply(doc, statusColor(task.status));
          doc.text(task.status, x + 3, y + 6); x += COLS[2][1];
          doc.setFont('helvetica', 'normal');
          doc.setTextColor.apply(doc, task.remarks ? INK : INK60);
          doc.text(remLines, x + 3, y + 6);
          y += rowH;
        });

        // ── this section's photos: 2 per row, ~55 mm thumbs ──
        var phs = [];
        sec.tasks.forEach(function (task) {
          task.photos.forEach(function (ph, i) {
            phs.push({ task: task.taskName, ref: ph.ref, takenAt: ph.takenAt, idx: i + 1, count: task.photos.length });
          });
        });
        if (phs.length) {
          need(20);
          y += 5;
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9.5);
          doc.setTextColor.apply(doc, MAROON);
          doc.text('Photos (' + phs.length + ')', ML, y + 4);
          y += 7;
          var TW = 55, GAP = CW - 2 * TW, capH = 11;
          phs.forEach(function (ph, i) {
            var colI = i % 2;
            var img = thumbs[ph.ref] || null;
            var ih = img ? Math.min(TW * 0.75, 55) : 30;   // landscape-ish box
            var blockH = ih + capH;
            if (y + blockH > maxY) { doc.addPage(); y = 20; }
            var x = ML + colI * (TW + GAP);
            doc.setDrawColor.apply(doc, LINE);
            doc.setFillColor.apply(doc, IVORY);
            doc.rect(x, y, TW, ih, 'FD');
            if (img) {
              // keep the aspect ratio inside the box
              var w = TW - 2, h = 36;
              try {
                var dims = doc.getImageProperties(img);
                h = (dims.height && dims.width) ? (TW - 2) * dims.height / dims.width : ih - 2;
                if (h > ih - 2) { h = ih - 2; w = dims.width ? h * dims.width / dims.height : w; }
              } catch (e) {}
              if (!addImage(doc, img, x + (TW - w) / 2, y + (ih - h) / 2, w, h)) img = null;
            }
            if (!img) {
              doc.setFont('helvetica', 'italic');
              doc.setFontSize(8);
              doc.setTextColor.apply(doc, INK60);
              doc.text('Photo unavailable', x + TW / 2, y + ih / 2, { align: 'center' });
            }
            var taken = photoStamp(ph.takenAt);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor.apply(doc, INK);
            doc.text('Photo taken: ' + (taken ? taken + ' IST' : 'not recorded'), x, y + ih + 4);
            doc.setTextColor.apply(doc, INK60);
            doc.text('Photo ' + ph.idx + ' of ' + ph.count + ' - ' + safeText(ph.task), x, y + ih + 8);
            if (colI === 1) y += blockH + 2;
            else if (i === phs.length - 1) y += blockH + 2;   // odd last one
          });
        }
        y += 6;
      });

      if (data.sections.length === 0) {
        doc.setFont('helvetica', 'italic');
        doc.setTextColor.apply(doc, INK60);
        doc.text('No tasks were submitted for this day.', ML, y + 5);
      }

      // ── footer on EVERY page: text only, no logo ───────────
      var pages = doc.getNumberOfPages();
      var footerLeft = 'Deepa Silks Store Operations Checklist - ' +
        (data.header.staffName || '-') + ' - ' + (data.header.reportDate || '-');
      for (var p = 1; p <= pages; p++) {
        doc.setPage(p);
        doc.setDrawColor.apply(doc, LINE);
        doc.line(ML, H - 13, W - MR, H - 13);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor.apply(doc, INK60);
        doc.text(safeText(footerLeft), ML, H - 9);
        doc.text('Page ' + p + ' of ' + pages, W - MR, H - 9, { align: 'right' });
      }
      return doc;
    });
  }

  // doc.save() covers desktop + Android; iOS Safari needs a Blob URL.
  function savePdf(doc, filename) {
    try {
      var blob = doc.output('blob');
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      var canDownload = typeof a.download !== 'undefined' &&
        !/iP(hone|ad|od)/i.test(navigator.userAgent || '');
      if (canDownload) {
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
      } else {
        window.open(url, '_blank');       // iOS: share/save from the opened tab
        setTimeout(function () { URL.revokeObjectURL(url); }, 120000);
      }
    } catch (e) {
      doc.save(filename);
    }
  }

  global.DeepaReport = {
    buildReportData: buildReportData,
    downloadReport: downloadReport,
    prettyStamp: prettyStamp,
    photoStamp: photoStamp,
    safeText: safeText,
    imgFormat: imgFormat,
    whiteLogo: whiteLogo,
    taglineImage: taglineImage
  };
})(typeof window !== 'undefined' ? window : globalThis);
