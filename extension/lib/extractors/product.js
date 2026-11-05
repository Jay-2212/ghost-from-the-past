/* Product pages (Amazon, Flipkart, any JSON-LD Product): name, price, rating, key specs. No reviews. */
(function (root) {
  var P = root.GhostPipeline || (typeof require === 'function' ? require('../pipeline.js') : null);
  var h = P.h;
  var MAX_SPECS = 40;

  function isAmazon(u) { return /(^|\.)amazon\.[a-z.]+$/.test(u.hostname) && /\/(dp|gp\/product|gp\/aw\/d)\//.test(u.pathname); }
  function isFlipkart(u) { return /(^|\.)flipkart\.com$/.test(u.hostname) && /\/p\/itm/.test(u.pathname); }

  function rows(doc, sels) {
    var out = [];
    sels.forEach(function (sel) {
      h.$$(doc, sel).forEach(function (tr) {
        var cells = h.$$(tr, 'th, td');
        if (cells.length >= 2) {
          var k = h.txt(cells[0]).replace(/[\u200e\u200f:]/g, '').trim(), v = h.txt(cells[cells.length - 1]).replace(/[\u200e\u200f]/g, '').trim();
          if (k && v && k.length < 80 && v.length < 300) out.push('- **' + k + '**: ' + v);
        }
      });
    });
    return out.filter(function (r, i) { return out.indexOf(r) === i; });
  }

  P.register({
    name: 'product',
    order: 70,
    match: function (url, doc) {
      var u = new URL(url);
      return isAmazon(u) || isFlipkart(u) || !!(doc && h.findLd(doc, ['Product']));
    },
    extract: function (doc, url) {
      var u = new URL(url);
      var ld = h.findLd(doc, ['Product']) || {};
      var offers = Array.isArray(ld.offers) ? ld.offers[0] : ld.offers || {};
      if (offers && offers.offers) offers = Array.isArray(offers.offers) ? offers.offers[0] : offers.offers;
      var name = h.txt(h.first(doc, ['#productTitle', 'h1 span.VU-ZEz', 'h1._6EBuvT', 'h1.yhB1nd', 'h1'])) || ld.name || h.metaContent(doc, 'og:title');
      var price = h.txt(h.first(doc, ['#corePriceDisplay_desktop_feature_div .a-price .a-offscreen', '#corePrice_feature_div .a-price .a-offscreen', '.a-price .a-offscreen', '#priceblock_ourprice', '#priceblock_dealprice', 'div.Nx9bqj', 'div._30jeq3']));
      var currency = '';
      if (!price && offers && (offers.price || offers.lowPrice)) { price = String(offers.price || offers.lowPrice); currency = offers.priceCurrency || ''; }
      if (!price) {
        // Flipkart and others: first visible "₹1,234"-like text near the title
        var m = (h.txt(doc.body).match(/₹\s?[\d,]+(?:\.\d+)?/) || [])[0];
        if (m) price = m;
      }
      var rating = h.txt(h.first(doc, ['#acrPopover .a-icon-alt', 'span[data-hook="rating-out-of-text"]', 'div.XQDdHH', 'div._3LWZlK'])) ||
        (ld.aggregateRating ? ld.aggregateRating.ratingValue + ' / 5 (' + (ld.aggregateRating.reviewCount || ld.aggregateRating.ratingCount || '?') + ')' : '');
      var brand = h.txt(h.first(doc, ['#bylineInfo', 'a#brand'])) || h.ldName(ld.brand);
      var bullets = h.$$(doc, '#feature-bullets li span.a-list-item, #feature-bullets li').map(h.txt).filter(function (t) { return t && t.length > 3; });
      bullets = bullets.filter(function (b, i) { return bullets.indexOf(b) === i; }).slice(0, 15);
      if (!bullets.length) bullets = h.$$(doc, 'div._2418kt li, ul.G4BRas li, div.xFVion li').map(h.txt).filter(Boolean).slice(0, 15);
      var specSels = ['#productOverview_feature_div tr', '#productDetails_techSpec_section_1 tr', '#productDetails_detailBullets_sections1 tr', '#technicalSpecifications_section_1 tr', 'div._3k-BhJ tr', 'div.GNDEQ- tr', 'table._0ZhAN9 tr'];
      if (isFlipkart(u)) specSels.push('table tr');
      var specs = rows(doc, specSels).slice(0, MAX_SPECS);
      if (!specs.length) {
        specs = h.$$(doc, '#detailBullets_feature_div li').map(function (li) { return '- ' + h.txt(li).replace(/[\u200e\u200f]/g, '').replace(/\s*:\s*/, ': '); }).filter(function (s) { return s.length > 4; }).slice(0, MAX_SPECS);
      }
      var desc = ld.description || h.txt(h.$(doc, '#productDescription'));
      var lines = [];
      lines.push('- **Price**: ' + (price ? (currency ? currency + ' ' : '') + price : 'not shown'));
      if (brand) lines.push('- **Brand**: ' + brand);
      if (rating) lines.push('- **Rating**: ' + rating);
      lines.push('- **Store**: ' + u.hostname.replace(/^www\./, ''));
      if (bullets.length) lines.push('', '## Key features', '', bullets.map(function (b) { return '- ' + h.cap(b, 400); }).join('\n'));
      if (specs.length) lines.push('', '## Specifications', '', specs.join('\n'));
      if (desc) lines.push('', '## Description', '', h.cap(desc, 3000));
      return { kind: 'product', title: name, markdown: lines.join('\n'), excerpt: h.cap(bullets[0] || desc || name, 280), meta: { price: price || undefined, currency: currency || undefined, rating: rating || undefined, brand: brand || undefined, store: u.hostname.replace(/^www\./, '') } };
    },
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
