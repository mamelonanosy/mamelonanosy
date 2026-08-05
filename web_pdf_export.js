/*
 * Browser-side PDF exports for the hosted delivery web app.
 *
 * The desktop application makes PDFs with ReportLab.  GitHub Pages has no
 * Python process to call, so this module paints the same A4 layouts to
 * high-resolution canvases and embeds the resulting JPEGs in a small,
 * dependency-free PDF writer.  Keeping the PDFs rasterised also makes their
 * printed layout consistent across browsers and avoids a CDN dependency.
 */
(function (global) {
  'use strict';

  var A4_WIDTH = 595.2756;
  var A4_HEIGHT = 841.8898;
  var MM = 72 / 25.4;
  var CM = 72 / 2.54;
  var LABELS_PER_ROW = 3;
  var LABELS_PER_COL = 4;
  var LABELS_PER_PAGE = LABELS_PER_ROW * LABELS_PER_COL;
  var LABEL_PADDING = 1.5 * MM;
  var NORMAL_SCALE = 2.45;
  // The desktop generator renders each template label at 1000px wide.
  // This density keeps the same useful detail when three labels share A4.
  var LABEL_SCALE = 5.04;

  var TEMPLATE_CONFIGS = {
    'louanh cosmetics': {
      file: 'louanh_cosmetics.jpg', text: '#5F3B07', totalText: '#7A5314', codeText: '#006F6A',
      family: 'serif', totalFamily: 'serif', clientLines: 2, clientMin: 32,
      boxes: {
        client: [0.245, 0.258, 0.890, 0.340], address: [0.245, 0.353, 0.890, 0.418],
        phone: [0.245, 0.446, 0.890, 0.497], products: [0.245, 0.560, 0.890, 0.624],
        notes: [0.245, 0.644, 0.890, 0.708], payment: [0.245, 0.710, 0.890, 0.748],
        total: [0.455, 0.755, 0.820, 0.818]
      }
    },
    'luna shop': {
      file: 'luna_shop.jpg', text: '#A90F51', totalText: '#D10F59', codeText: '#005F6C',
      family: 'sans', totalFamily: 'sans', clientLines: 2, clientMin: 32,
      boxes: {
        client: [0.235, 0.258, 0.700, 0.340], address: [0.235, 0.353, 0.890, 0.418],
        phone: [0.235, 0.446, 0.890, 0.497], products: [0.235, 0.560, 0.890, 0.624],
        notes: [0.235, 0.644, 0.890, 0.708], payment: [0.235, 0.710, 0.890, 0.748],
        total: [0.455, 0.755, 0.820, 0.818]
      }
    },
    'traitement naturel': {
      file: 'traitement_naturel.jpg', text: '#173F35', totalText: '#173F35', codeText: '#A53E25',
      family: 'serif', totalFamily: 'serif', clientLines: 2, clientMin: 32,
      boxes: {
        client: [0.245, 0.258, 0.890, 0.340], address: [0.245, 0.353, 0.890, 0.418],
        phone: [0.245, 0.446, 0.890, 0.497], products: [0.245, 0.560, 0.890, 0.624],
        notes: [0.245, 0.644, 0.890, 0.708], payment: [0.245, 0.710, 0.890, 0.748],
        total: [0.455, 0.755, 0.820, 0.818]
      }
    },
    'tout bio mdg': {
      file: 'tout_bio_mdg.jpg', text: '#2C553B', totalText: '#2C553B', codeText: '#A14432',
      family: 'soft', totalFamily: 'soft', clientLines: 2, clientMin: 32,
      boxes: {
        client: [0.235, 0.258, 0.680, 0.340], address: [0.235, 0.353, 0.890, 0.418],
        phone: [0.235, 0.446, 0.890, 0.497], products: [0.235, 0.560, 0.890, 0.624],
        notes: [0.235, 0.644, 0.890, 0.708], payment: [0.235, 0.710, 0.890, 0.748],
        total: [0.455, 0.755, 0.820, 0.818]
      }
    },
    'elegance royale': {
      file: 'elegance_royale.jpg', text: '#17243D', totalText: '#17243D', codeText: '#A54A0A',
      family: 'deco', totalFamily: 'deco', clientLines: 2, clientMin: 32,
      boxes: {
        client: [0.235, 0.258, 0.700, 0.340], address: [0.235, 0.353, 0.890, 0.418],
        phone: [0.235, 0.446, 0.890, 0.497], products: [0.235, 0.560, 0.890, 0.624],
        notes: [0.235, 0.644, 0.890, 0.708], payment: [0.235, 0.710, 0.890, 0.748],
        total: [0.455, 0.755, 0.820, 0.818]
      }
    },
    'fashionelle mdg': {
      file: 'fashionelle_mdg.jpg', text: '#17243D', totalText: '#17243D', codeText: '#D62D53',
      family: 'modern', totalFamily: 'modern', clientLines: 2, clientMin: 32,
      boxes: {
        client: [0.300, 0.258, 0.890, 0.340], address: [0.235, 0.353, 0.890, 0.418],
        phone: [0.235, 0.446, 0.890, 0.497], products: [0.235, 0.560, 0.890, 0.624],
        notes: [0.235, 0.644, 0.890, 0.708], payment: [0.235, 0.710, 0.890, 0.748],
        total: [0.455, 0.755, 0.820, 0.818]
      }
    }
  };

  var templateImageCache = Object.create(null);
  var utf8 = new TextEncoder();

  function ownValue(source, names, fallback) {
    if (!source || typeof source !== 'object') return fallback;
    for (var i = 0; i < names.length; i++) {
      var value = source[names[i]];
      if (value !== undefined && value !== null && value !== '') return value;
    }
    return fallback;
  }

  function rawValue(source, index, names, fallback) {
    var value = ownValue(source, names || [], undefined);
    if (value !== undefined) return value;
    if (Array.isArray(source) && source[index] !== undefined && source[index] !== null) return source[index];
    return fallback;
  }

  function text(value) {
    return value === undefined || value === null ? '' : String(value);
  }

  function normaliseName(value) {
    var result = text(value).trim().toLowerCase();
    if (result.normalize) result = result.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return result.replace(/[`'’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function orderLines(order) {
    var value = rawValue(order, 11, ['order_lines', 'lines'], []);
    if (typeof value === 'string') {
      try { value = JSON.parse(value); } catch (ignore) { value = []; }
    }
    return Array.isArray(value) ? value.filter(function (line) { return line && typeof line === 'object'; }) : [];
  }

  function paymentMethod(order) {
    var method = text(rawValue(order, 21, ['payment_method', 'payment'], 'cash')).trim().toLowerCase();
    if (method === 'paye' || method === 'payé') return 'prepaid';
    if (method === 'non-paye' || method === 'non payé' || method === 'non_payé') return 'cash';
    return method || 'cash';
  }

  function exchangeProducts(order) {
    return text(rawValue(order, 23, ['exchange_products', 'exchange_collect', 'products_to_collect'], '')).trim();
  }

  function isRescheduled(order) {
    var value = rawValue(order, 16, ['reschedule_metadata', 'rescheduled_metadata', 'rescheduled'], '');
    return value !== undefined && value !== null && value !== '' && value !== false && value !== 0;
  }

  function isReassigned(order) {
    var value = rawValue(order, 18, ['reassigned_metadata', 'reassign_metadata', 'reassignment_metadata', 'reassigned'], '');
    return value !== undefined && value !== null && value !== '' && value !== false && value !== 0;
  }

  function reassignMetadata(order) {
    return text(rawValue(order, 18, ['reassigned_metadata', 'reassign_metadata', 'reassignment_metadata'], '')).trim();
  }

  function clientName(order, forLabel) {
    var name = text(rawValue(order, 2, ['client_name', 'name', 'client'], 'N/A')).trim() || 'N/A';
    if (!forLabel) {
      if (isReassigned(order) && !isRescheduled(order)) return '**' + name;
      if (isRescheduled(order)) return '*' + name;
      return name;
    }
    var resolution = text(rawValue(order, 17, ['resolution'], ''));
    if (resolution.indexOf('Duplicate Products') !== -1) return '[TR] ' + name;
    if (isReassigned(order)) return '**' + name;
    if (isRescheduled(order)) return '*' + name;
    return name;
  }

  function splitPhoneParts(value) {
    var source = text(value).trim();
    if (!source) return [];
    var pieces = source.split(/\s*(?:\/|\\|\|\||,|;|\r?\n)+\s*/).filter(Boolean);
    if (pieces.length > 1) return pieces;
    var compact = source.replace(/[\s\-().]/g, '');
    var matches = compact.match(/\+?261\d{9}|0\d{9}/g) || [];
    if (matches.length > 1 && matches.join('') === compact) return matches;
    return pieces;
  }

  function formatPhonePart(value) {
    var original = text(value).trim();
    var clean = original.replace(/[\s\-()]/g, '');
    if (clean.indexOf('+261') === 0) clean = '0' + clean.slice(4);
    else if (clean.indexOf('261') === 0 && clean.length === 12) clean = '0' + clean.slice(3);
    if (/^0\d{9}$/.test(clean)) {
      return clean.slice(0, 3) + ' ' + clean.slice(3, 5) + ' ' + clean.slice(5, 8) + ' ' + clean.slice(8, 10);
    }
    return original;
  }

  function formattedPhone(value) {
    return splitPhoneParts(value).map(formatPhonePart).join(' / ');
  }

  function numeric(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return isFinite(value) ? value : null;
    var source = text(value).replace(/\s/g, '').replace(/Ar/ig, '').replace(/,/g, '');
    if (!source) return null;
    var parsed = Number(source);
    return isFinite(parsed) ? parsed : null;
  }

  function currency(value) {
    var number = numeric(value);
    if (number === null) return value === null || value === undefined || value === '' ? '0 Ar' : text(value);
    var negative = number < 0;
    var absolute = Math.abs(number);
    var body;
    if (Math.abs(absolute - Math.round(absolute)) < 0.0001) body = String(Math.round(absolute));
    else body = absolute.toFixed(2);
    var split = body.split('.');
    var whole = split[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return (negative ? '-' : '') + whole + (split[1] ? '.' + split[1] : '') + ' Ar';
  }

  function cleanNotes(value) {
    var result = text(value).trim();
    if (!result) return '';
    var prefixes = /^(?:non\s*[-]?\s*pay(?:é|e)?|pré\s*[-]?\s*pay(?:é|e)?|pre\s*[-]?\s*pay(?:é|e)?|pay(?:é|e)?|miandry\s+paiement|mobile|(?:é|e)change(?:\s*-\s*r(?:é|e)cup(?:é|e)rer\s*:[^|]*)?)\s*(?:[|/;-]\s*)?/iu;
    var previous = null;
    while (result && result !== previous) {
      previous = result;
      result = result.replace(prefixes, '').trim().replace(/^[|/;\-\s]+|[|/;\-\s]+$/g, '').trim();
    }
    return result;
  }

  function paymentStatus(method) {
    var styles = {
      prepaid: { text: 'PAYÉ', color: '#2E7D32' },
      colis: { text: 'NON PAYÉ', color: '#C62828' },
      mobile_delivery: { text: 'PAYÉ', color: '#1565C0' },
      exchange: { text: 'ÉCHANGE', color: '#E65100' }
    };
    return styles[method] || { text: '', color: '#333333' };
  }

  function productCodes(order, extras) {
    var seen = Object.create(null);
    orderLines(order).forEach(function (line) {
      var code = text(line.product_code || line.code).trim().toUpperCase();
      if (code) seen[code] = true;
    });
    (extras || []).forEach(function (source) {
      var matches = text(source).match(/[A-Za-z][A-Za-z0-9_-]*/g) || [];
      matches.forEach(function (part) {
        // Product codes are conventionally uppercase.  This avoids colouring
        // ordinary free-form lower-case notes as if they were product codes.
        if (part === part.toUpperCase()) seen[part.toUpperCase()] = true;
      });
    });
    return seen;
  }

  function productTextWithSubtypes(order, value) {
    var result = text(value).trim();
    var subtypes = Object.create(null);
    orderLines(order).forEach(function (line) {
      var code = text(line.product_code || line.code).trim().toUpperCase();
      var subtype = text(line.subtypes || line.subtype || line.variant).trim();
      if (code && subtype) subtypes[code] = subtype;
    });
    var known = Object.keys(subtypes);
    if (!result || !known.length) return result;
    var used = Object.create(null);
    var pieces = result.split(/(,\s*)/);
    for (var i = 0; i < pieces.length; i += 2) {
      var part = pieces[i];
      var match = part.trim().match(/^([A-Za-z0-9_-]+)\b/);
      if (!match) continue;
      var code = match[1].toUpperCase();
      var subtype = subtypes[code];
      if (!subtype) continue;
      var contained = new RegExp('\\([^)]*' + escapeRegExp(subtype) + '[^)]*\\)', 'i').test(part);
      if (!contained) pieces[i] = part.replace(/\s*$/, '') + ' (' + subtype + ')' + (part.match(/\s*$/) || [''])[0];
      used[code] = true;
    }
    result = pieces.join('').trim();
    var missing = known.filter(function (code) { return !used[code]; }).map(function (code) { return code + ': ' + subtypes[code]; });
    if (missing.length) result = result ? result + ' (' + missing.join('; ') + ')' : missing.join('; ');
    return result;
  }

  function escapeRegExp(value) {
    return text(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function productSegments(value, codes) {
    var parts = text(value).match(/[A-Za-z0-9_-]+|[^A-Za-z0-9_-]+/g) || [];
    return parts.map(function (part) { return { text: part, code: !!codes[part.toUpperCase()] }; });
  }

  function fontFamily(family) {
    var families = {
      serif: 'Georgia, "Times New Roman", serif',
      script: '"Segoe Script", Georgia, serif',
      sans: '"Segoe UI", Arial, Calibri, sans-serif',
      deco: 'Constantia, Cambria, Georgia, serif',
      modern: 'Bahnschrift, "Trebuchet MS", "Segoe UI", sans-serif',
      soft: 'Candara, Corbel, "Segoe UI", sans-serif'
    };
    return families[family] || families.sans;
  }

  function setFont(ctx, size, bold, family) {
    ctx.font = (bold ? '700 ' : '400 ') + size + 'px ' + fontFamily(family || 'sans');
    ctx.textBaseline = 'alphabetic';
  }

  function textMetrics(ctx, size) {
    var metrics = ctx.measureText('Mg');
    return {
      ascent: metrics.actualBoundingBoxAscent || size * 0.76,
      descent: metrics.actualBoundingBoxDescent || size * 0.24
    };
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    var r = Math.max(0, Math.min(radius, width / 2, height / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function makeA4(scale) {
    var canvas = document.createElement('canvas');
    canvas.width = Math.round(A4_WIDTH * scale);
    canvas.height = Math.round(A4_HEIGHT * scale);
    var ctx = canvas.getContext('2d', { alpha: false });
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, A4_WIDTH, A4_HEIGHT);
    ctx.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
    return { canvas: canvas, ctx: ctx };
  }

  function createPixelCanvas(width, height) {
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    var ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
    return { canvas: canvas, ctx: ctx };
  }

  function wrapText(ctx, value, width, maxLines, ellipsis) {
    var original = text(value).trim();
    if (!original) return [];
    var words = original.split(/\s+/);
    var lines = [];
    var current = '';
    for (var i = 0; i < words.length; i++) {
      var word = words[i];
      var candidate = current ? current + ' ' + word : word;
      if (ctx.measureText(candidate).width <= width) {
        current = candidate;
        continue;
      }
      if (current) {
        lines.push(current);
        current = word;
      } else {
        var cut = word;
        while (cut.length > 1 && ctx.measureText(cut).width > width) cut = cut.slice(0, -1);
        lines.push(cut);
        current = '';
      }
      if (maxLines && lines.length >= maxLines) {
        if (ellipsis) lines[lines.length - 1] = ellipsize(ctx, lines[lines.length - 1], width);
        return lines;
      }
    }
    if (current) lines.push(current);
    if (maxLines && lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      if (ellipsis) lines[lines.length - 1] = ellipsize(ctx, lines[lines.length - 1], width);
    }
    return lines;
  }

  function ellipsize(ctx, value, width) {
    var source = text(value).replace(/\s+$/, '');
    while (source.length > 1 && ctx.measureText(source + '...').width > width) source = source.slice(0, -1).replace(/\s+$/, '');
    return source + '...';
  }

  function drawWrapped(ctx, value, x, y, width, options) {
    options = options || {};
    setFont(ctx, options.size || 10, !!options.bold, options.family || 'sans');
    var lines = wrapText(ctx, value, width, options.maxLines || 0, options.ellipsis !== false);
    var metrics = textMetrics(ctx, options.size || 10);
    var leading = options.leading || (options.size || 10) * 1.2;
    ctx.fillStyle = options.color || '#000000';
    for (var i = 0; i < lines.length; i++) ctx.fillText(lines[i], x, y + metrics.ascent + i * leading);
    return { lines: lines, height: lines.length * leading, leading: leading };
  }

  function chooseBoxText(ctx, value, width, height, options) {
    var maxFont = options.maxFont;
    var minFont = options.minFont;
    var maxLines = options.maxLines || 1;
    var best = null;
    for (var size = maxFont; size >= minFont; size--) {
      setFont(ctx, size, !!options.bold, options.family);
      var lines = wrapText(ctx, value, width, maxLines, true);
      if (!lines.length) return { size: size, lines: [], leading: size };
      var metrics = textMetrics(ctx, size);
      var leading = Math.max(metrics.ascent + metrics.descent, size) + Math.max(2, Math.round(size * 0.18));
      var truncated = false;
      var joined = lines.join(' ');
      if (joined.length < text(value).trim().length) truncated = true;
      if (leading * lines.length <= height) {
        if (!truncated) return { size: size, lines: lines, leading: leading };
        if (!best || joined.replace(/\.\.\./g, '').length > best.score) {
          best = { size: size, lines: lines, leading: leading, score: joined.replace(/\.\.\./g, '').length };
        }
      }
    }
    return best || { size: minFont, lines: wrapText(ctx, value, width, maxLines, true), leading: minFont + 3 };
  }

  function drawTemplateTextBox(ctx, box, value, color, options) {
    var x1 = box[0], y1 = box[1], x2 = box[2], y2 = box[3];
    var width = Math.max(1, x2 - x1), height = Math.max(1, y2 - y1);
    if (!text(value).trim()) return;
    var chosen = chooseBoxText(ctx, value, width, height, options);
    setFont(ctx, chosen.size, !!options.bold, options.family);
    var metrics = textMetrics(ctx, chosen.size);
    var totalHeight = chosen.leading * chosen.lines.length;
    var lineY = y1 + Math.max(0, (height - totalHeight) / 2) + metrics.ascent;
    ctx.fillStyle = color;
    chosen.lines.forEach(function (line) {
      var x = x1;
      var lineWidth = ctx.measureText(line).width;
      if (options.align === 'center') x = x1 + Math.max(0, (width - lineWidth) / 2);
      else if (options.align === 'right') x = x2 - lineWidth;
      ctx.fillText(line, x, lineY);
      lineY += chosen.leading;
    });
  }

  function drawTemplateProductBox(ctx, box, value, color, codeColor, codes, options) {
    var x1 = box[0], y1 = box[1], x2 = box[2], y2 = box[3];
    var width = Math.max(1, x2 - x1), height = Math.max(1, y2 - y1);
    if (!text(value).trim()) return;
    var chosen = chooseBoxText(ctx, value, width, height, options);
    setFont(ctx, chosen.size, true, options.family);
    var metrics = textMetrics(ctx, chosen.size);
    var totalHeight = chosen.leading * chosen.lines.length;
    var lineY = y1 + Math.max(0, (height - totalHeight) / 2) + metrics.ascent;
    chosen.lines.forEach(function (line) {
      var x = x1;
      productSegments(line, codes).forEach(function (segment) {
        if (!segment.text) return;
        ctx.fillStyle = segment.code ? codeColor : color;
        ctx.fillText(segment.text, x, lineY);
        x += ctx.measureText(segment.text).width;
      });
      lineY += chosen.leading;
    });
  }

  function hexToRgb(value) {
    var match = text(value).match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
    return match ? [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)] : [80, 80, 80];
  }

  function paleColor(value, amount) {
    var rgb = hexToRgb(value);
    return 'rgb(' + Math.round(rgb[0] * (1 - amount) + 255 * amount) + ',' +
      Math.round(rgb[1] * (1 - amount) + 255 * amount) + ',' +
      Math.round(rgb[2] * (1 - amount) + 255 * amount) + ')';
  }

  function drawTemplateStatusBox(ctx, box, value, color, family) {
    if (!text(value).trim()) return;
    var x1 = box[0], y1 = box[1], x2 = box[2], y2 = box[3];
    var width = Math.max(1, x2 - x1), height = Math.max(1, y2 - y1);
    var paddingX = Math.max(10, Math.round(width * 0.045));
    var paddingY = Math.max(4, Math.round(height * 0.16));
    var label = text(value).trim();
    var size = 20;
    for (var candidate = 44; candidate >= 20; candidate -= 2) {
      setFont(ctx, candidate, true, family);
      var metrics = textMetrics(ctx, candidate);
      if (ctx.measureText(label).width + paddingX * 2 <= width && metrics.ascent + metrics.descent + paddingY * 2 <= height) {
        size = candidate;
        break;
      }
    }
    setFont(ctx, size, true, family);
    if (ctx.measureText(label).width + paddingX * 2 > width) label = ellipsize(ctx, label, width - paddingX * 2);
    var measure = textMetrics(ctx, size);
    var textWidth = ctx.measureText(label).width;
    var pillWidth = Math.min(width, Math.max(textWidth + paddingX * 2, width * 0.38));
    var pillHeight = Math.min(height, Math.max(measure.ascent + measure.descent + paddingY * 2, height * 0.88));
    var px = x1 + (width - pillWidth) / 2;
    var py = y1 + (height - pillHeight) / 2;
    var radius = Math.max(6, pillHeight * 0.36);
    ctx.fillStyle = 'rgba(80,40,50,0.16)';
    roundedRect(ctx, px + Math.max(2, height * 0.045), py + Math.max(2, height * 0.045), pillWidth, pillHeight, radius);
    ctx.fill();
    ctx.fillStyle = paleColor(color, 0.58);
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, width * 0.007);
    roundedRect(ctx, px, py, pillWidth, pillHeight, radius);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillText(label, px + (pillWidth - textWidth) / 2, py + (pillHeight - measure.ascent - measure.descent) / 2 + measure.ascent);
  }

  function relativeBox(box, width, height) {
    return [box[0] * width, box[1] * height, box[2] * width, box[3] * height];
  }

  function labelTemplateUrl(file) {
    return new URL('assets/labels/' + file, global.location.href).toString();
  }

  function loadTemplateImage(file) {
    if (templateImageCache[file]) return templateImageCache[file];
    templateImageCache[file] = new Promise(function (resolve) {
      var image = new Image();
      image.decoding = 'sync';
      image.onload = function () { resolve(image); };
      image.onerror = function () { resolve(null); };
      image.src = labelTemplateUrl(file);
    });
    return templateImageCache[file];
  }

  function pagesArray(pages) {
    if (Array.isArray(pages)) return pages.filter(function (page) { return page && typeof page === 'object'; });
    if (pages && typeof pages === 'object') return Object.keys(pages).map(function (key) { return pages[key]; }).filter(function (page) { return page && typeof page === 'object'; });
    return [];
  }

  function resolveLabelPage(order, pages) {
    var allPages = pagesArray(pages);
    var preferred = text(ownValue(order, ['resolved_page', 'page'], '')).trim();
    var preferredKey = normaliseName(preferred);
    if (preferredKey) {
      for (var p = 0; p < allPages.length; p++) {
        if (normaliseName(allPages[p].name) === preferredKey) return allPages[p];
      }
      if (TEMPLATE_CONFIGS[preferredKey]) return { name: preferred };
    }
    var codes = productCodes(order, [rawValue(order, 6, ['products'], '')]);
    var defaultPage = null;
    for (var i = 0; i < allPages.length; i++) {
      var page = allPages[i];
      if (page.is_default && !defaultPage) defaultPage = page;
      var pageCodes = Array.isArray(page.product_codes) ? page.product_codes : text(page.product_codes || page.products).split(/[\s,;+]+/);
      for (var j = 0; j < pageCodes.length; j++) {
        if (codes[text(pageCodes[j]).trim().toUpperCase()]) return page;
      }
    }
    return defaultPage;
  }

  function templateConfigForPage(page) {
    return page ? TEMPLATE_CONFIGS[normaliseName(page.name)] || null : null;
  }

  function templateLabelCanvas(order, config, image, ratio) {
    var width = 1000;
    var height = Math.max(1, Math.round(width * ratio));
    var pixel = createPixelCanvas(width, height);
    var ctx = pixel.ctx;
    try {
      ctx.filter = 'saturate(1.34) contrast(1.12) brightness(0.98)';
      ctx.drawImage(image, 0, 0, width, height);
      ctx.filter = 'none';
    } catch (ignore) {
      ctx.filter = 'none';
      ctx.drawImage(image, 0, 0, width, height);
    }
    var boxes = config.boxes;
    var products = productTextWithSubtypes(order, rawValue(order, 6, ['products'], ''));
    var method = paymentMethod(order);
    var collected = exchangeProducts(order);
    if (method === 'exchange' && collected) products = 'LIVRER: ' + products + '  RÉCUPÉRER: ' + collected;
    var total = numeric(rawValue(order, 7, ['total_price', 'total'], 0));
    var price = method === 'prepaid' ? '0' : currency(total === null ? 0 : total).replace(/\s+Ar$/, '');
    var codes = productCodes(order, [products, collected]);
    var family = config.family;
    drawTemplateTextBox(ctx, relativeBox(boxes.client, width, height), clientName(order, true), config.text, {
      maxFont: 60, minFont: config.clientMin || 24, maxLines: config.clientLines || 1, bold: true, family: family
    });
    drawTemplateTextBox(ctx, relativeBox(boxes.address, width, height), rawValue(order, 4, ['address'], ''), config.text, {
      maxFont: 46, minFont: 20, maxLines: 2, bold: true, family: family
    });
    drawTemplateTextBox(ctx, relativeBox(boxes.phone, width, height), formattedPhone(rawValue(order, 3, ['phone'], '')), config.text, {
      maxFont: 52, minFont: 22, maxLines: 2, bold: true, family: family
    });
    drawTemplateProductBox(ctx, relativeBox(boxes.products, width, height), products, config.text, config.codeText, codes, {
      maxFont: 46, minFont: 20, maxLines: 2, bold: true, family: family
    });
    drawTemplateTextBox(ctx, relativeBox(boxes.notes, width, height), cleanNotes(rawValue(order, 10, ['notes'], '')), config.text, {
      maxFont: 38, minFont: 18, maxLines: 2, bold: true, family: family
    });
    var payment = paymentStatus(method);
    drawTemplateStatusBox(ctx, relativeBox(boxes.payment, width, height), payment.text, payment.color, family);
    drawTemplateTextBox(ctx, relativeBox(boxes.total, width, height), price, config.totalText, {
      maxFont: 68, minFont: 30, maxLines: 1, bold: true, family: config.totalFamily || family, align: 'center'
    });
    return pixel.canvas;
  }

  function drawFallbackLabel(ctx, order, page, x, y, width, height) {
    ctx.strokeStyle = '#2c3e50';
    ctx.lineWidth = 2;
    roundedRect(ctx, x, y, width, height, 3 * MM);
    ctx.stroke();
    var pageStyle = (page && page.text_color) || (order && order.resolved_page_style && order.resolved_page_style.text_color) || '#2c3e50';
    if (page) {
      setFont(ctx, 5.8, false, (page && page.font_style) || 'sans');
      ctx.fillStyle = pageStyle;
      ctx.fillText('F ' + text(page.facebook || 'Unknown'), x + 2 * MM, y + height - 2 * MM);
      var phone = 'T ' + formattedPhone(page.phone || '');
      ctx.fillText(phone, x + width - 2 * MM - ctx.measureText(phone).width, y + height - 2 * MM);
      setFont(ctx, 6.1, false, (page && page.font_style) || 'sans');
      var pageName = text(page.name).slice(0, 26);
      ctx.fillText(pageName, x + (width - ctx.measureText(pageName).width) / 2, y + height - 2 * MM);
    }
    var margin = 3 * MM;
    var textX = x + margin;
    var textWidth = width - 2 * margin;
    var cursor = y + margin;
    var rendered = drawWrapped(ctx, clientName(order, true), textX, cursor, textWidth, { size: 13, bold: true, color: '#2c3e50', maxLines: 2, leading: 6 * MM });
    cursor += rendered.height + 1.5 * MM;
    var phoneParts = splitPhoneParts(rawValue(order, 3, ['phone'], '')).map(formatPhonePart);
    if (phoneParts.length > 2) phoneParts = [phoneParts[0], phoneParts[1] + ' / +' + (phoneParts.length - 2)];
    phoneParts.forEach(function (phone) {
      var output = drawWrapped(ctx, '☎ ' + phone, textX, cursor, textWidth, { size: phoneParts.length > 1 ? 14 : 15, bold: true, color: '#2c3e50', maxLines: 1, leading: 7 * MM });
      cursor += output.height;
    });
    cursor += 1.5 * MM;
    rendered = drawWrapped(ctx, rawValue(order, 4, ['address'], ''), textX, cursor, textWidth, { size: 11, bold: true, color: '#34495e', maxLines: 2, leading: 5 * MM });
    cursor += rendered.height + 1.5 * MM;
    var method = paymentMethod(order);
    var notes = cleanNotes(rawValue(order, 10, ['notes'], ''));
    var label = paymentStatus(method);
    var products = productTextWithSubtypes(order, rawValue(order, 6, ['products'], ''));
    var collect = exchangeProducts(order);
    var productLines = label.text || notes ? 2 : 3;
    if (method === 'exchange' && collect) {
      rendered = drawWrapped(ctx, 'LIVRER: ' + products, textX, cursor, textWidth, { size: 10, bold: true, color: '#2980b9', maxLines: 2, leading: 4.5 * MM });
      cursor += rendered.height;
      rendered = drawWrapped(ctx, 'RÉCUPÉRER: ' + collect, textX, cursor, textWidth, { size: 10, bold: true, color: '#e65100', maxLines: 2, leading: 4.5 * MM });
      cursor += rendered.height;
    } else {
      rendered = drawWrapped(ctx, products, textX, cursor, textWidth, { size: 11, bold: true, color: '#2980b9', maxLines: productLines, leading: 5 * MM });
      cursor += rendered.height;
    }
    cursor += 1.5 * MM;
    if (label.text) {
      setFont(ctx, 11, true, 'sans');
      var statusWidth = Math.min(textWidth, Math.max(ctx.measureText(label.text).width + 6.4 * MM, 24 * MM));
      var statusX = textX + (textWidth - statusWidth) / 2;
      var statusY = cursor - 1.5 * MM;
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      roundedRect(ctx, statusX + 0.7 * MM, statusY + 0.7 * MM, statusWidth, 5.3 * MM, 1.7 * MM);
      ctx.fill();
      ctx.fillStyle = paleColor(label.color, 0.68);
      ctx.strokeStyle = label.color;
      ctx.lineWidth = 1.6;
      roundedRect(ctx, statusX, statusY, statusWidth, 5.3 * MM, 1.7 * MM);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = label.color;
      ctx.fillText(label.text, statusX + (statusWidth - ctx.measureText(label.text).width) / 2, statusY + 3.8 * MM);
      cursor += 5 * MM;
    }
    if (notes) {
      var bottomReserved = y + height - 14 * MM;
      var available = bottomReserved - cursor;
      var noteLines = Math.min(3, Math.max(1, Math.floor(available / (4 * MM))));
      rendered = drawWrapped(ctx, notes, textX, cursor, textWidth, { size: notes.length > 40 ? 9 : 10, bold: true, color: '#333333', maxLines: noteLines, leading: 4 * MM });
      cursor += rendered.height;
    }
    var totalValue = numeric(rawValue(order, 7, ['total_price', 'total'], 0));
    var price = method === 'prepaid' ? '0 Ar' : currency(totalValue === null ? 0 : totalValue);
    var priceColor = method === 'exchange' && totalValue !== null && totalValue < 0 ? '#e65100' : '#27ae60';
    setFont(ctx, 15, true, 'sans');
    ctx.fillStyle = priceColor;
    ctx.fillText(price, x + (width - ctx.measureText(price).width) / 2, Math.max(cursor + 14, y + height - 9.5 * MM));
    var agent = text(rawValue(order, 9, ['agent'], '')).trim();
    if (agent) {
      var agentStyles = {
        DIARY: ['#E91E63', '#FFFFFF'], MAILAKA: ['#9C27B0', '#FFFFFF'], ANTSO: ['#2196F3', '#FFFFFF'],
        BEN: ['#FF9800', '#000000'], 'I-LIVRAISON': ['#4CAF50', '#FFFFFF'], '(UNASSIGNED)': ['#607D8B', '#FFFFFF']
      };
      var upper = agent.toUpperCase().slice(0, 20);
      var agentStyle = agentStyles[upper] || ['#795548', '#FFFFFF'];
      setFont(ctx, 7, true, 'sans');
      var agentWidth = ctx.measureText(upper).width + 4 * MM;
      var agentX = x + (width - agentWidth) / 2;
      var agentY = y + height - 9 * MM;
      ctx.fillStyle = agentStyle[0];
      roundedRect(ctx, agentX, agentY, agentWidth, 4 * MM, 1.5 * MM); ctx.fill();
      ctx.fillStyle = agentStyle[1];
      ctx.fillText(upper, agentX + 2 * MM, agentY + 2.8 * MM);
    }
  }

  async function drawLabel(ctx, order, pages, x, y, width, height) {
    var page = resolveLabelPage(order, pages);
    var config = templateConfigForPage(page);
    if (config) {
      var image = await loadTemplateImage(config.file);
      if (image) {
        var rendered = templateLabelCanvas(order, config, image, height / width);
        ctx.drawImage(rendered, x, y, width, height);
        return;
      }
    }
    drawFallbackLabel(ctx, order, page, x, y, width, height);
  }

  function drawCutLines(ctx, count) {
    if (!count) return;
    var labelWidth = A4_WIDTH / LABELS_PER_ROW;
    var labelHeight = A4_HEIGHT / LABELS_PER_COL;
    var rows = Math.ceil(count / LABELS_PER_ROW);
    var lastRow = count % LABELS_PER_ROW || LABELS_PER_ROW;
    ctx.save();
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 3]);
    for (var col = 1; col < LABELS_PER_ROW; col++) {
      var x = col * labelWidth;
      if (rows > 1) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, (rows - 1) * labelHeight); ctx.stroke();
      }
      if (col < lastRow) {
        ctx.beginPath(); ctx.moveTo(x, (rows - 1) * labelHeight); ctx.lineTo(x, rows * labelHeight); ctx.stroke();
      }
    }
    for (var row = 1; row < rows; row++) {
      ctx.beginPath(); ctx.moveTo(0, row * labelHeight); ctx.lineTo(A4_WIDTH, row * labelHeight); ctx.stroke();
    }
    ctx.restore();
  }

  async function renderLabelPages(orders, pages, onPage) {
    var source = Array.isArray(orders) ? orders : [];
    var renderedPages = [];
    var totalPages = Math.max(1, Math.ceil(source.length / LABELS_PER_PAGE));
    var labelWidth = A4_WIDTH / LABELS_PER_ROW;
    var labelHeight = A4_HEIGHT / LABELS_PER_COL;
    for (var pageIndex = 0; pageIndex < totalPages; pageIndex++) {
      var page = makeA4(LABEL_SCALE);
      var first = pageIndex * LABELS_PER_PAGE;
      var count = Math.min(LABELS_PER_PAGE, Math.max(0, source.length - first));
      for (var offset = 0; offset < count; offset++) {
        var index = first + offset;
        var row = Math.floor(offset / LABELS_PER_ROW);
        var col = offset % LABELS_PER_ROW;
        var x = col * labelWidth + LABEL_PADDING;
        var y = row * labelHeight + LABEL_PADDING;
        await drawLabel(page.ctx, source[index], pages, x, y, labelWidth - 2 * LABEL_PADDING, labelHeight - 2 * LABEL_PADDING);
      }
      drawCutLines(page.ctx, count);
      if (onPage) await onPage(page.canvas);
      else renderedPages.push(page.canvas);
    }
    return renderedPages;
  }

  function parseFrenchDate(value) {
    var source = text(value).trim();
    var match = source.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!match) {
      var slashDate = source.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (slashDate) match = [null, slashDate[3], slashDate[2], slashDate[1]];
    }
    if (!match) return null;
    var year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    var date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return date;
  }

  function frenchDate(value) {
    var date = parseFrenchDate(value);
    if (!date) return text(value);
    var weekdays = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    var months = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    return weekdays[date.getUTCDay()] + ' ' + date.getUTCDate() + ' ' + months[date.getUTCMonth()] + ' ' + date.getUTCFullYear();
  }

  function tableCell(value, options) {
    var result = Object.assign({ text: text(value), align: 'left', color: '#000000' }, options || {});
    return result;
  }

  function paymentCell(order, notes) {
    var payment = paymentStatus(paymentMethod(order));
    var clean = cleanNotes(notes === undefined ? rawValue(order, 10, ['notes'], '') : notes);
    var parts = [];
    if (payment.text) parts.push({ text: payment.text, color: payment.color });
    if (clean) parts.push({ text: clean, color: '#000000' });
    return tableCell('', { parts: parts });
  }

  function tableLineLayout(ctx, cell, width, fontSize, leading) {
    var parts = Array.isArray(cell.parts) ? cell.parts : [{ text: cell.text, color: cell.color }];
    var lines = [];
    setFont(ctx, fontSize, !!cell.bold, cell.family || 'sans');
    parts.forEach(function (part) {
      var paragraphs = text(part.text).replace(/<br\s*\/?>/gi, '\n').split(/\r?\n/);
      paragraphs.forEach(function (paragraph) {
        var wrapped = wrapText(ctx, paragraph, Math.max(1, width), 0, false);
        if (!wrapped.length) wrapped = [''];
        wrapped.forEach(function (line) { lines.push({ text: line, color: part.color || cell.color || '#000000' }); });
      });
    });
    if (!lines.length) lines.push({ text: '', color: cell.color || '#000000' });
    return { lines: lines, height: lines.length * leading };
  }

  function layoutTableRow(ctx, cells, widths, options) {
    var layouts = [];
    var contentHeight = 0;
    for (var i = 0; i < cells.length; i++) {
      var layout = tableLineLayout(ctx, cells[i], widths[i] - options.leftPadding - options.rightPadding, options.fontSize, options.leading);
      layouts.push(layout);
      contentHeight = Math.max(contentHeight, layout.height);
    }
    return { layouts: layouts, height: Math.max(options.minHeight || 0, contentHeight + options.topPadding + options.bottomPadding) };
  }

  function drawTableRow(ctx, x, y, widths, cells, options) {
    var layout = layoutTableRow(ctx, cells, widths, options);
    var height = layout.height;
    var cursor = x;
    for (var i = 0; i < widths.length; i++) {
      if (options.background) {
        ctx.fillStyle = typeof options.background === 'function' ? options.background(i) : options.background;
        ctx.fillRect(cursor, y, widths[i], height);
      }
      ctx.strokeStyle = options.gridColor || '#808080';
      ctx.lineWidth = options.gridWidth || 0.5;
      ctx.strokeRect(cursor, y, widths[i], height);
      setFont(ctx, options.fontSize, !!cells[i].bold, cells[i].family || options.family || 'sans');
      var metrics = textMetrics(ctx, options.fontSize);
      var lineY = y + options.topPadding + metrics.ascent;
      layout.layouts[i].lines.forEach(function (line) {
        var lineX = cursor + options.leftPadding;
        var alignment = cells[i].align || 'left';
        var measured = ctx.measureText(line.text).width;
        if (alignment === 'center') lineX = cursor + (widths[i] - measured) / 2;
        else if (alignment === 'right') lineX = cursor + widths[i] - options.rightPadding - measured;
        ctx.fillStyle = line.color;
        ctx.fillText(line.text, lineX, lineY);
        lineY += options.leading;
      });
      cursor += widths[i];
    }
    return height;
  }

  function measureTableRow(ctx, widths, cells, options) {
    return layoutTableRow(ctx, cells, widths, options).height;
  }

  function drawKeyValue(ctx, x, y, key, value) {
    setFont(ctx, 10, true, 'sans');
    ctx.fillStyle = '#000000';
    ctx.fillText(key, x, y);
    var offset = ctx.measureText(key).width;
    setFont(ctx, 10, false, 'sans');
    ctx.fillText(text(value), x + offset, y);
  }

  function originalReassignInfo(order) {
    var source = reassignMetadata(order);
    if (!source || (source.indexOf('From Order:') === -1 && source.indexOf('Original Client:') === -1)) return '';
    function find(pattern) {
      var match = source.match(pattern);
      return match ? text(match[1]).trim() : '';
    }
    var client = find(/(?:From Order|Original Client):\s*(.+?)(?:\n|$)/i);
    var address = find(/Original Address:\s*(.+?)(?:\n|$)/i);
    var products = find(/Products:\s*(.+?)(?:\n|$)/i);
    var total = find(/Total:\s*(.+?)(?:\n|$)/i);
    return '>> ' + client + ' ' + address + ' ' + products + ' ' + total + ' SIEGE';
  }

  function noteCellForPdf(order) {
    var cell = paymentCell(order);
    var extra = [];
    if (isReassigned(order) && !isRescheduled(order)) {
      var original = originalReassignInfo(order);
      if (original) extra.push(original);
    }
    if (isRescheduled(order)) extra.push('EFA ANY');
    extra.forEach(function (line) { cell.parts.push({ text: line, color: '#000000' }); });
    return cell;
  }

  function bonColumns() {
    return [2.8 * CM, 3.8 * CM, 3.2 * CM, 2.5 * CM, 2.5 * CM, 4.2 * CM];
  }

  function bonHeaderCells() {
    return [
      tableCell('Destinataire', { align: 'center', bold: true, color: '#FFFFFF' }),
      tableCell('Lieu de livraison', { align: 'center', bold: true, color: '#FFFFFF' }),
      tableCell('Produits', { align: 'center', bold: true, color: '#FFFFFF' }),
      tableCell('Contact', { align: 'center', bold: true, color: '#FFFFFF' }),
      tableCell('Total (article+frais)', { align: 'center', bold: true, color: '#FFFFFF' }),
      tableCell('Observation', { align: 'center', bold: true, color: '#FFFFFF' })
    ];
  }

  function bonRow(order) {
    return [
      tableCell(clientName(order, false)),
      tableCell(rawValue(order, 4, ['address'], '')),
      tableCell(rawValue(order, 6, ['products'], '')),
      tableCell(formattedPhone(rawValue(order, 3, ['phone'], ''))),
      tableCell(currency(rawValue(order, 7, ['total_price', 'total'], 0)), { align: 'center' }),
      noteCellForPdf(order)
    ];
  }

  function bonHeader(ctx, page, agent, date) {
    var left = 1.5 * CM;
    var top = 1 * CM;
    setFont(ctx, 20, true, 'sans');
    var title = "BON D'ENLÈVEMENT";
    ctx.fillStyle = '#000000';
    ctx.fillText(title, (A4_WIDTH - ctx.measureText(title).width) / 2, top + 20);
    var y = top + 24 + 0.3 * CM;
    drawKeyValue(ctx, left, y + 10, 'Date: ', frenchDate(date));
    drawKeyValue(ctx, left, y + 25, 'Nombre de colis: ', text((agent.orders || []).length));
    drawKeyValue(ctx, left, y + 40, 'Agent: ', agent.name);
    var right = left + 9.5 * CM;
    drawKeyValue(ctx, right, y + 10, 'Nom Facebook: ', 'Nonie Louanh');
    drawKeyValue(ctx, right, y + 25, 'Contact: ', '038 81 804 09');
    return y + 45 + 4 + 0.3 * CM;
  }

  function drawBonTableHeader(ctx, x, y, widths) {
    return drawTableRow(ctx, x, y, widths, bonHeaderCells(), {
      fontSize: 9, leading: 10.5, topPadding: 4, bottomPadding: 4, leftPadding: 3, rightPadding: 3,
      minHeight: 0, background: '#7f8c8d', gridColor: '#808080', gridWidth: 0.5, family: 'sans'
    });
  }

  function sortByClient(orders) {
    return (Array.isArray(orders) ? orders.slice() : []).sort(function (a, b) {
      return text(rawValue(a, 2, ['client_name', 'name'], '')).trim().toLowerCase().localeCompare(
        text(rawValue(b, 2, ['client_name', 'name'], '')).trim().toLowerCase(), 'fr'
      );
    });
  }

  function renderBonGroup(group, date) {
    var agent = { name: text(group.name || group.agent || 'Non assigné'), orders: sortByClient(group.orders) };
    var pages = [];
    var current = makeA4(NORMAL_SCALE);
    pages.push(current.canvas);
    var ctx = current.ctx;
    var x = 1.5 * CM;
    var widths = bonColumns();
    var bottom = A4_HEIGHT - 1.5 * CM;
    var y = bonHeader(ctx, current, agent, date);
    y += drawBonTableHeader(ctx, x, y, widths);
    var rowOptions = {
      fontSize: 8, leading: 9, topPadding: 3, bottomPadding: 3, leftPadding: 3, rightPadding: 3,
      minHeight: 0, gridColor: '#808080', gridWidth: 0.5, family: 'sans'
    };
    agent.orders.forEach(function (order, index) {
      var cells = bonRow(order);
      var height = measureTableRow(ctx, widths, cells, rowOptions);
      if (y + height > bottom) {
        current = makeA4(NORMAL_SCALE);
        pages.push(current.canvas);
        ctx = current.ctx;
        y = 1 * CM;
        y += drawBonTableHeader(ctx, x, y, widths);
      }
      rowOptions.background = index % 2 ? '#f9f9f9' : '#ffffff';
      y += drawTableRow(ctx, x, y, widths, cells, rowOptions);
    });
    var signatureHeight = 14;
    if (y + 1 * CM + signatureHeight > bottom) {
      current = makeA4(NORMAL_SCALE);
      pages.push(current.canvas);
      ctx = current.ctx;
      y = 1 * CM;
    }
    y += 1 * CM;
    setFont(ctx, 10, false, 'sans');
    ctx.fillStyle = '#000000';
    var partner = 'Partenaire: _______________________';
    var driver = 'Livreur: _______________________';
    setFont(ctx, 10, true, 'sans');
    ctx.fillText('Partenaire:', x, y + 10);
    setFont(ctx, 10, false, 'sans');
    ctx.fillText(' _______________________', x + ctx.measureText('Partenaire:').width, y + 10);
    setFont(ctx, 10, true, 'sans');
    var driverWidth = ctx.measureText('Livreur:').width;
    setFont(ctx, 10, false, 'sans');
    var fullDriverWidth = ctx.measureText(driver).width;
    var driverX = A4_WIDTH - x - fullDriverWidth;
    setFont(ctx, 10, true, 'sans'); ctx.fillText('Livreur:', driverX, y + 10);
    setFont(ctx, 10, false, 'sans'); ctx.fillText(' _______________________', driverX + driverWidth, y + 10);
    return pages;
  }

  function normaliseGroups(groups) {
    if (groups instanceof Map) {
      return Array.from(groups.entries()).map(function (entry) { return { name: entry[0], orders: entry[1] }; });
    }
    if (Array.isArray(groups)) {
      return groups.map(function (group) {
        if (Array.isArray(group)) return { name: group[0], orders: group[1] };
        return { name: group && (group.name || group.agent), orders: group && (group.orders || group.items) };
      });
    }
    if (groups && typeof groups === 'object') {
      return Object.keys(groups).map(function (name) { return { name: name, orders: groups[name] }; });
    }
    return [];
  }

  function reportColumns() {
    return [2.8 * CM, 2.3 * CM, 4 * CM, 3.2 * CM, 2 * CM, 2.5 * CM, 2.2 * CM];
  }

  function reportHeaderCells() {
    return ['Nom', 'Téléphone', 'Adresse', 'Produits', 'Total', 'Notes', 'Commentaires'].map(function (value) {
      return tableCell(value, { align: 'center', bold: true, color: '#F5F5F5' });
    });
  }

  function reportRow(order) {
    return [
      tableCell(clientName(order, false)),
      tableCell(formattedPhone(rawValue(order, 3, ['phone'], ''))),
      tableCell(rawValue(order, 4, ['address'], '')),
      tableCell(rawValue(order, 6, ['products'], '')),
      tableCell(currency(rawValue(order, 7, ['total_price', 'total'], 0))),
      noteCellForPdf(order),
      tableCell('')
    ];
  }

  function drawReportTableHeader(ctx, x, y, widths) {
    return drawTableRow(ctx, x, y, widths, reportHeaderCells(), {
      fontSize: 8, leading: 9, topPadding: 5, bottomPadding: 5, leftPadding: 3, rightPadding: 3,
      minHeight: 0, background: '#4472C4', gridColor: '#000000', gridWidth: 0.5, family: 'sans'
    });
  }

  function sortedAgentGroups(orders) {
    var byAgent = Object.create(null);
    (Array.isArray(orders) ? orders : []).forEach(function (order) {
      var agent = text(rawValue(order, 9, ['agent'], '')).trim() || 'Non assigné';
      if (!byAgent[agent]) byAgent[agent] = [];
      byAgent[agent].push(order);
    });
    return Object.keys(byAgent).sort(function (a, b) { return a.localeCompare(b, 'fr'); }).map(function (agent) {
      return {
        name: agent,
        orders: byAgent[agent].slice().sort(function (a, b) {
          return text(rawValue(a, 4, ['address'], '')).toLowerCase().localeCompare(text(rawValue(b, 4, ['address'], '')).toLowerCase(), 'fr');
        })
      };
    });
  }

  function productCountSummary(orders) {
    var counts = Object.create(null);
    (Array.isArray(orders) ? orders : []).forEach(function (order) {
      var lines = orderLines(order);
      if (lines.length) {
        lines.forEach(function (line) {
          var code = text(line.product_code || line.code).trim().toUpperCase();
          var quantity = Number(line.quantity !== undefined ? line.quantity : line.qty) || 0;
          if (code) counts[code] = (counts[code] || 0) + quantity;
        });
        return;
      }
      var source = text(rawValue(order, 6, ['products'], '')).toUpperCase().replace(/,/g, ' ').replace(/\+/g, ' ').replace(/X/g, ' X ');
      var tokens = source.trim().split(/\s+/).filter(Boolean);
      for (var i = 0; i < tokens.length; i++) {
        if (!/^[A-Z][A-Z0-9_-]*$/.test(tokens[i]) || tokens[i] === 'X') continue;
        var code = tokens[i];
        var quantity = 1;
        if (tokens[i + 1] === 'X' && /^-?\d+$/.test(tokens[i + 2] || '')) { quantity = Number(tokens[i + 2]); i += 2; }
        else if (/^-?\d+$/.test(tokens[i + 1] || '')) { quantity = Number(tokens[i + 1]); i++; }
        counts[code] = (counts[code] || 0) + quantity;
      }
    });
    return Object.keys(counts).sort().map(function (code) { return code + ' x' + counts[code]; }).join(', ');
  }

  function drawReportParagraph(ctx, value, x, y, width, options) {
    setFont(ctx, options.size, !!options.bold, options.family || 'sans');
    var lines = wrapText(ctx, value, width, 0, false);
    if (!lines.length) return 0;
    var metrics = textMetrics(ctx, options.size);
    var leading = options.leading || options.size * 1.2;
    ctx.fillStyle = options.color || '#000000';
    lines.forEach(function (line, index) { ctx.fillText(line, x, y + metrics.ascent + index * leading); });
    return lines.length * leading + (options.spaceAfter || 0);
  }

  function antananarivoStamp() {
    try {
      var formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Indian/Antananarivo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
      });
      var parts = formatter.formatToParts(new Date());
      var values = {};
      parts.forEach(function (part) { values[part.type] = part.value; });
      return values.day + '/' + values.month + '/' + values.year + ' à ' + values.hour + ':' + values.minute;
    } catch (ignore) {
      var now = new Date();
      return String(now.getDate()).padStart(2, '0') + '/' + String(now.getMonth() + 1).padStart(2, '0') + '/' + now.getFullYear() +
        ' à ' + String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    }
  }

  function renderReportPages(orders, date) {
    var source = Array.isArray(orders) ? orders : [];
    var groups = sortedAgentGroups(source);
    var pages = [];
    var current = makeA4(NORMAL_SCALE);
    pages.push(current.canvas);
    var ctx = current.ctx;
    var x = 1 * CM;
    var width = A4_WIDTH - 2 * CM;
    var y = 1 * CM;
    var bottom = A4_HEIGHT - 1 * CM;
    var title = 'Livraisons - ' + frenchDate(date);
    setFont(ctx, 14, true, 'sans');
    ctx.fillStyle = '#1a1a1a';
    ctx.fillText(title, (A4_WIDTH - ctx.measureText(title).width) / 2, y + 14);
    y += 17 + 8;
    y += drawReportParagraph(ctx, 'Total Commandes: ' + source.length, x, y, width, { size: 9, bold: true, spaceAfter: 8 });
    var summary = groups.map(function (group) { return group.name + ': ' + group.orders.length; }).join(' | ');
    y += drawReportParagraph(ctx, 'Livraisons par Agent: ' + summary, x, y, width, { size: 9, bold: true, spaceAfter: 8 });
    var products = productCountSummary(source);
    if (products) y += drawReportParagraph(ctx, 'Produits à Expédier: ' + products, x, y, width, { size: 9, bold: true, spaceAfter: 8 });
    y += 0.3 * CM;
    var widths = reportColumns();
    var rowOptions = {
      fontSize: 8, leading: 9, topPadding: 3, bottomPadding: 3, leftPadding: 3, rightPadding: 3,
      minHeight: 0, background: '#ffffff', gridColor: '#000000', gridWidth: 0.5, family: 'sans'
    };
    function newReportPage() {
      current = makeA4(NORMAL_SCALE);
      pages.push(current.canvas);
      ctx = current.ctx;
      y = 1 * CM;
    }
    function agentHeader(group) {
      var label = '👤 ' + group.name + ' (' + group.orders.length + ' commandes)';
      setFont(ctx, 12, true, 'sans');
      var metrics = textMetrics(ctx, 12);
      var height = Math.max(20, metrics.ascent + metrics.descent + 8);
      ctx.strokeStyle = '#2980b9'; ctx.lineWidth = 1; ctx.strokeRect(x, y, width, height);
      ctx.fillStyle = '#2980b9'; ctx.fillText(label, x + 4, y + 4 + metrics.ascent);
      y += height + 6;
    }
    groups.forEach(function (group) {
      if (y + 28 + 25 > bottom) newReportPage();
      agentHeader(group);
      y += drawReportTableHeader(ctx, x, y, widths);
      group.orders.forEach(function (order) {
        var cells = reportRow(order);
        var height = measureTableRow(ctx, widths, cells, rowOptions);
        if (y + height > bottom) {
          newReportPage();
          y += drawReportTableHeader(ctx, x, y, widths);
        }
        y += drawTableRow(ctx, x, y, widths, cells, rowOptions);
      });
      y += 0.2 * CM;
    });
    y += 0.3 * CM;
    if (y + 10 > bottom) newReportPage();
    setFont(ctx, 7, false, 'sans');
    var footer = 'Généré le ' + antananarivoStamp();
    ctx.fillStyle = '#808080';
    ctx.fillText(footer, (A4_WIDTH - ctx.measureText(footer).width) / 2, y + 7);
    return pages;
  }

  function canvasToJpeg(canvas) {
    return new Promise(function (resolve, reject) {
      if (canvas.toBlob) {
        canvas.toBlob(function (blob) {
          if (blob) resolve(blob);
          else reject(new Error('Unable to encode PDF page.'));
        }, 'image/jpeg', 0.92);
        return;
      }
      try {
        var dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        var base64 = dataUrl.split(',')[1] || '';
        var binary = atob(base64);
        var bytes = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        resolve(new Blob([bytes], { type: 'image/jpeg' }));
      } catch (error) { reject(error); }
    });
  }

  function concatBytes(chunks) {
    var total = chunks.reduce(function (sum, chunk) { return sum + chunk.length; }, 0);
    var result = new Uint8Array(total);
    var offset = 0;
    chunks.forEach(function (chunk) { result.set(chunk, offset); offset += chunk.length; });
    return result;
  }

  function ascii(value) { return utf8.encode(value); }

  function objectBytes(number, body) {
    return ascii(number + ' 0 obj\n' + body + '\nendobj\n');
  }

  function streamBytes(number, dictionary, data) {
    return concatBytes([
      ascii(number + ' 0 obj\n<< ' + dictionary + ' /Length ' + data.length + ' >>\nstream\n'),
      data,
      ascii('\nendstream\nendobj\n')
    ]);
  }

  async function imageFromCanvas(pageCanvas) {
    var pixelWidth = pageCanvas.width;
    var pixelHeight = pageCanvas.height;
    var jpeg = await canvasToJpeg(pageCanvas);
    var image = { bytes: new Uint8Array(await jpeg.arrayBuffer()), width: pixelWidth, height: pixelHeight };
    // Large label sheets are roughly 50 MB uncompressed.  Once encoded,
    // release each backing store before continuing with the next sheet.
    pageCanvas.width = 1;
    pageCanvas.height = 1;
    return image;
  }

  function pdfFromImages(images) {
    var next = 3;
    var pages = images.map(function (image) {
      return { image: image, pageObject: next++, imageObject: next++, contentObject: next++ };
    });
    var objects = new Array(next);
    objects[1] = objectBytes(1, '<< /Type /Catalog /Pages 2 0 R >>');
    objects[2] = objectBytes(2, '<< /Type /Pages /Kids [' + pages.map(function (page) { return page.pageObject + ' 0 R'; }).join(' ') + '] /Count ' + pages.length + ' >>');
    pages.forEach(function (page) {
      var pageBody = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + A4_WIDTH.toFixed(4) + ' ' + A4_HEIGHT.toFixed(4) +
        '] /Resources << /ProcSet [/PDF /ImageC] /XObject << /Im0 ' + page.imageObject + ' 0 R >> >> /Contents ' + page.contentObject + ' 0 R >>';
      objects[page.pageObject] = objectBytes(page.pageObject, pageBody);
      objects[page.imageObject] = streamBytes(page.imageObject,
        '/Type /XObject /Subtype /Image /Width ' + page.image.width + ' /Height ' + page.image.height +
        ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode', page.image.bytes);
      var content = ascii('q\n' + A4_WIDTH.toFixed(4) + ' 0 0 ' + A4_HEIGHT.toFixed(4) + ' 0 0 cm\n/Im0 Do\nQ\n');
      objects[page.contentObject] = streamBytes(page.contentObject, '', content);
    });
    var header = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52, 10, 37, 226, 227, 207, 211, 10]);
    var chunks = [header];
    var offsets = new Array(objects.length).fill(0);
    var offset = header.length;
    for (var objectNumber = 1; objectNumber < objects.length; objectNumber++) {
      offsets[objectNumber] = offset;
      chunks.push(objects[objectNumber]);
      offset += objects[objectNumber].length;
    }
    var xrefOffset = offset;
    var xref = 'xref\n0 ' + objects.length + '\n0000000000 65535 f \n';
    for (var objectIndex = 1; objectIndex < objects.length; objectIndex++) xref += String(offsets[objectIndex]).padStart(10, '0') + ' 00000 n \n';
    xref += 'trailer\n<< /Size ' + objects.length + ' /Root 1 0 R >>\nstartxref\n' + xrefOffset + '\n%%EOF\n';
    chunks.push(ascii(xref));
    return new Blob([concatBytes(chunks)], { type: 'application/pdf' });
  }

  async function pdfFromCanvases(canvases) {
    var pageCanvases = canvasesOrBlank(canvases);
    var images = [];
    for (var i = 0; i < pageCanvases.length; i++) images.push(await imageFromCanvas(pageCanvases[i]));
    return pdfFromImages(images);
  }

  function canvasesOrBlank(canvases) {
    return Array.isArray(canvases) && canvases.length ? canvases : [makeA4(NORMAL_SCALE).canvas];
  }

  async function exportLabels(orders, pages) {
    var images = [];
    await renderLabelPages(orders, pages, async function(pageCanvas) {
      images.push(await imageFromCanvas(pageCanvas));
    });
    return pdfFromImages(images);
  }

  async function exportBon(agentOrders, agentName, date) {
    return pdfFromCanvases(renderBonGroup({ name: agentName || 'Non assigné', orders: agentOrders || [] }, date));
  }

  async function exportBonGroups(groups, date) {
    var pages = [];
    normaliseGroups(groups).forEach(function (group) {
      if (!group) return;
      pages = pages.concat(renderBonGroup({ name: text(group.name || 'Non assigné'), orders: group.orders || [] }, date));
    });
    return pdfFromCanvases(pages);
  }

  async function exportReport(orders, date) {
    return pdfFromCanvases(renderReportPages(orders, date));
  }

  global.WebPdfExport = Object.freeze({
    exportLabels: exportLabels,
    exportBon: exportBon,
    exportBonGroups: exportBonGroups,
    exportReport: exportReport
  });
}(window));
