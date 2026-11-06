/* Ghost from the Past — redaction of obvious secrets before anything leaves the browser. Pure, UMD (globalThis.GhostRedact). */
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  root.GhostRedact = m;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function luhn(digits) {
    var sum = 0, dbl = false;
    for (var i = digits.length - 1; i >= 0; i--) {
      var d = digits.charCodeAt(i) - 48;
      if (dbl) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      sum += d;
      dbl = !dbl;
    }
    return sum % 10 === 0;
  }

  // 13–19 digits, optionally grouped by single spaces or dashes.
  var CARD_RE = /(^|[^\d])(\d(?:[ -]?\d){12,18})(?!\d)/g;

  function redactCards(text) {
    return text.replace(CARD_RE, function (all, pre, num) {
      var digits = num.replace(/[ -]/g, '');
      if (digits.length < 13 || digits.length > 19) return all;
      if (/^(\d)\1+$/.test(digits)) return all; // 0000… placeholders
      return luhn(digits) ? pre + '[redacted-card]' : all;
    });
  }

  var SECRET_RES = [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    /\bsk-(?:proj-|ant-|live_|test_)?[A-Za-z0-9_-]{20,}\b/g,
    /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g,
    /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g,
    /\bgithub_pat_[A-Za-z0-9_]{40,}\b/g,
    /\bglpat-[A-Za-z0-9_-]{20,}\b/g,
    /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
    /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
    /\bAIza[0-9A-Za-z_-]{35}\b/g,
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    /\bhf_[A-Za-z0-9]{30,}\b/g,
    /\bnpm_[A-Za-z0-9]{36}\b/g,
    /\bcf(?:ut|at|ct)_[A-Za-z0-9]{30,}/g,
    /\bya29\.[A-Za-z0-9_-]{20,}/g,
    /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9\/_-]+/g,
    /https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+/g,
    /\bxapp-[A-Za-z0-9-]{10,}\b/g,
    /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g,
    /\bdop_v1_[a-f0-9]{64}\b/g,
    /\bshp(?:at|ss|ca|pa)_[a-fA-F0-9]{32}\b/g,
    /AccountKey=[A-Za-z0-9+\/=]{40,}/g,
    /(?:(?:\b|_)(?:api[_-]?key|secret|token|password|passwd|bearer)|_key)\s*[:=]\s*["']?[A-Za-z0-9_\-\/+=.]{16,}["']?/gi,
  ];

  function redactSecrets(text) {
    for (var i = 0; i < SECRET_RES.length; i++) text = text.replace(SECRET_RES[i], '[redacted-secret]');
    return text;
  }

  var EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
  function redactEmails(text) {
    return text.replace(EMAIL_RE, '[redacted-email]');
  }

  // US SSN-like and Indian Aadhaar-like (12 digits in 4-4-4 groups) identifiers.
  var ID_RES = [/\b\d{3}-\d{2}-\d{4}\b/g, /(?<![\d-])[2-9]\d{3}([ -])\d{4}\1\d{4}(?![ -]?\d)/g, /\b[A-Z]{5}\d{4}[A-Z]\b/g /* PAN */];
  function redactIds(text) {
    for (var i = 0; i < ID_RES.length; i++) text = text.replace(ID_RES[i], '[redacted-id]');
    return text;
  }

  /** opts: {emails: boolean (default true)} */
  function redact(text, opts) {
    if (typeof text !== 'string' || !text) return text || '';
    var o = opts || {};
    var out = redactSecrets(text);
    out = redactCards(out);
    out = redactIds(out);
    if (o.emails !== false) out = redactEmails(out);
    return out;
  }

  /** Redacts the user-visible text fields of a captured page in place and returns it. */
  function redactPage(page, opts) {
    if (!page) return page;
    page.markdown = redact(page.markdown, opts);
    page.title = redact(page.title, opts);
    page.excerpt = redact(page.excerpt, opts);
    
    // Recursively redact meta (depth limit 6)
    function redactValue(val, depth) {
      if (depth > 6) return val;
      if (typeof val === 'string') return redact(val, opts);
      if (Array.isArray(val)) return val.map(function (v) { return redactValue(v, depth + 1); });
      if (val && typeof val === 'object' && Object.prototype.toString.call(val) === '[object Object]') {
        var out = {};
        for (var k in val) out[k] = redactValue(val[k], depth + 1);
        return out;
      }
      return val;
    }
    
    if (page.meta) page.meta = redactValue(page.meta, 0);
    return page;
  }

  return { luhn: luhn, redact: redact, redactPage: redactPage, redactCards: redactCards, redactSecrets: redactSecrets, redactEmails: redactEmails, redactIds: redactIds };
});
