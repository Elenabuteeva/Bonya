/*
 * Небольшой генератор QR-кодов (байтовый режим, уровень коррекции M).
 * Написан по открытому описанию стандарта ISO/IEC 18004, без внешних библиотек.
 * Использование: BonyaQR.svg("текст", {size: 200}) → строка <svg>.
 */
(function (global) {
  "use strict";

  var ECC_PER_BLOCK = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28];
  var NUM_BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49];
  var FORMAT_ECL_M = 0;

  function utf8(str) {
    if (typeof TextEncoder !== "undefined") return Array.from(new TextEncoder().encode(str));
    var out = [], s = unescape(encodeURIComponent(str));
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
    return out;
  }

  function rawModules(ver) {
    var r = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      var n = Math.floor(ver / 7) + 2;
      r -= (25 * n - 10) * n - 55;
      if (ver >= 7) r -= 36;
    }
    return r;
  }
  function dataCodewords(ver) {
    return Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ver] * NUM_BLOCKS[ver];
  }

  function gfMul(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11d);
      z ^= ((y >>> i) & 1) * x;
    }
    return z & 0xff;
  }
  function rsDivisor(degree) {
    var res = [];
    for (var i = 0; i < degree - 1; i++) res.push(0);
    res.push(1);
    var root = 1;
    for (i = 0; i < degree; i++) {
      for (var j = 0; j < res.length; j++) {
        res[j] = gfMul(res[j], root);
        if (j + 1 < res.length) res[j] ^= res[j + 1];
      }
      root = gfMul(root, 0x02);
    }
    return res;
  }
  function rsRemainder(data, div) {
    var res = div.map(function () { return 0; });
    data.forEach(function (b) {
      var f = b ^ res.shift();
      res.push(0);
      div.forEach(function (c, i) { res[i] ^= gfMul(c, f); });
    });
    return res;
  }

  function encode(text) {
    var bytes = utf8(text);
    var ver, cap;
    for (ver = 1; ver <= 40; ver++) {
      cap = dataCodewords(ver) * 8;
      var ccBits = ver <= 9 ? 8 : 16;
      if (4 + ccBits + bytes.length * 8 <= cap) break;
    }
    if (ver > 40) throw new Error("Слишком длинный текст для QR-кода");

    var bits = [];
    function put(val, len) { for (var i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); }
    put(4, 4);
    put(bytes.length, ver <= 9 ? 8 : 16);
    bytes.forEach(function (b) { put(b, 8); });
    put(0, Math.min(4, cap - bits.length));
    put(0, (8 - (bits.length % 8)) % 8);
    for (var pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);

    var data = [];
    for (var i = 0; i < bits.length; i += 8) {
      var v = 0;
      for (var j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
      data.push(v);
    }

    // коррекция ошибок и перемешивание блоков
    var numBlocks = NUM_BLOCKS[ver], eccLen = ECC_PER_BLOCK[ver];
    var raw = Math.floor(rawModules(ver) / 8);
    var numShort = numBlocks - (raw % numBlocks);
    var shortLen = Math.floor(raw / numBlocks);
    var div = rsDivisor(eccLen);
    var blocks = [], k = 0;
    for (i = 0; i < numBlocks; i++) {
      var dat = data.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1));
      k += dat.length;
      var ecc = rsRemainder(dat, div);
      if (i < numShort) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    var codewords = [];
    for (i = 0; i < blocks[0].length; i++) {
      for (j = 0; j < blocks.length; j++) {
        if (i !== shortLen - eccLen || j >= numShort) codewords.push(blocks[j][i]);
      }
    }

    var size = ver * 4 + 17;
    var m = [], fn = [];
    for (i = 0; i < size; i++) {
      m.push(new Array(size).fill(false));
      fn.push(new Array(size).fill(false));
    }
    function setF(x, y, dark) { m[y][x] = dark; fn[y][x] = true; }

    for (i = 0; i < size; i++) { setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }
    function finder(x, y) {
      for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
        var d = Math.max(Math.abs(dx), Math.abs(dy)), xx = x + dx, yy = y + dy;
        if (xx >= 0 && xx < size && yy >= 0 && yy < size) setF(xx, yy, d !== 2 && d !== 4);
      }
    }
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);

    var align = [];
    if (ver > 1) {
      var n = Math.floor(ver / 7) + 2;
      var step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
      align = [6];
      for (var pos = size - 7; align.length < n; pos -= step) align.splice(1, 0, pos);
    }
    var na = align.length;
    for (i = 0; i < na; i++) for (j = 0; j < na; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)) continue;
      for (var ay = -2; ay <= 2; ay++) for (var ax = -2; ax <= 2; ax++)
        setF(align[i] + ax, align[j] + ay, Math.max(Math.abs(ax), Math.abs(ay)) !== 1);
    }

    function drawFormat(mask) {
      var d = (FORMAT_ECL_M << 3) | mask, rem = d;
      for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      var b = ((d << 10) | rem) ^ 0x5412;
      function bit(i) { return ((b >>> i) & 1) !== 0; }
      for (i = 0; i <= 5; i++) setF(8, i, bit(i));
      setF(8, 7, bit(6)); setF(8, 8, bit(7)); setF(7, 8, bit(8));
      for (i = 9; i < 15; i++) setF(14 - i, 8, bit(i));
      for (i = 0; i < 8; i++) setF(size - 1 - i, 8, bit(i));
      for (i = 8; i < 15; i++) setF(8, size - 15 + i, bit(i));
      setF(8, size - 8, true);
    }
    drawFormat(0);
    if (ver >= 7) {
      var rem = ver;
      for (i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      var vb = (ver << 12) | rem;
      for (i = 0; i < 18; i++) {
        var bt = ((vb >>> i) & 1) !== 0, a = size - 11 + (i % 3), c = Math.floor(i / 3);
        setF(a, c, bt); setF(c, a, bt);
      }
    }

    // укладка данных
    var idx = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        for (j = 0; j < 2; j++) {
          var x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
          if (!fn[y][x] && idx < codewords.length * 8) {
            m[y][x] = ((codewords[idx >>> 3] >>> (7 - (idx & 7))) & 1) !== 0;
            idx++;
          }
        }
      }
    }

    function maskBit(mask, x, y) {
      switch (mask) {
        case 0: return (x + y) % 2 === 0;
        case 1: return y % 2 === 0;
        case 2: return x % 3 === 0;
        case 3: return (x + y) % 3 === 0;
        case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
        case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
        case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
        default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
      }
    }
    function applyMask(mask) {
      for (var y = 0; y < size; y++) for (var x = 0; x < size; x++)
        if (!fn[y][x] && maskBit(mask, x, y)) m[y][x] = !m[y][x];
    }
    function penalty() {
      var p = 0, x, y, run, i;
      function lineScore(get) {
        var s = 0;
        for (var a = 0; a < size; a++) {
          run = 1;
          for (var b = 1; b <= size; b++) {
            if (b < size && get(a, b) === get(a, b - 1)) run++;
            else { if (run >= 5) s += 3 + (run - 5); run = 1; }
          }
          for (b = 0; b + 10 < size; b++) {
            var pat = [];
            for (i = 0; i < 11; i++) pat.push(get(a, b + i) ? 1 : 0);
            var str = pat.join("");
            if (str === "10111010000" || str === "00001011101") s += 40;
          }
        }
        return s;
      }
      p += lineScore(function (a, b) { return m[a][b]; });
      p += lineScore(function (a, b) { return m[b][a]; });
      for (y = 0; y < size - 1; y++) for (x = 0; x < size - 1; x++) {
        var c = m[y][x];
        if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3;
      }
      var dark = 0;
      for (y = 0; y < size; y++) for (x = 0; x < size; x++) if (m[y][x]) dark++;
      var total = size * size;
      p += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
      return p;
    }

    var best = 0, bestP = Infinity;
    for (var mk = 0; mk < 8; mk++) {
      applyMask(mk); drawFormat(mk);
      var pen = penalty();
      if (pen < bestP) { bestP = pen; best = mk; }
      applyMask(mk);
    }
    applyMask(best); drawFormat(best);
    return { size: size, modules: m };
  }

  function svg(text, opts) {
    opts = opts || {};
    var q = encode(text), border = 4, n = q.size + border * 2, path = [];
    for (var y = 0; y < q.size; y++) for (var x = 0; x < q.size; x++)
      if (q.modules[y][x]) path.push("M" + (x + border) + "," + (y + border) + "h1v1h-1z");
    var px = opts.size || 200;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + n + " " + n + '" width="' + px + '" height="' + px +
      '" shape-rendering="crispEdges" role="img" aria-label="' + (opts.label || "QR-код") + '">' +
      '<rect width="100%" height="100%" fill="#fff"/><path d="' + path.join("") + '" fill="#000"/></svg>';
  }

  global.BonyaQR = { encode: encode, svg: svg };
  if (typeof module !== "undefined") module.exports = global.BonyaQR;
})(typeof window !== "undefined" ? window : globalThis);
