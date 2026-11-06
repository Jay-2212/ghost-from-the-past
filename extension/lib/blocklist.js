/* Ghost from the Past — URL blocklist. Pure, UMD: globalThis.GhostBlocklist in the browser, module.exports in Node.
 *
 * Pattern forms (one per line, "#" starts a comment):
 *   example.com          host or any subdomain of it
 *   *.example.com        glob on the hostname (* = any run of characters)
 *   checkout.*  *bank*   glob on the hostname
 *   example.com/mail*    glob on host + path (www. stripped)
 *   chrome://*           glob on the full URL (any pattern containing "://")
 *   @private-network     built-in rule: localhost, *.local/.internal/.lan/.corp, private and link-local IPs
 *   @auth-paths          built-in rule: URL paths like /login, /signin, /oauth, /2fa, /password
 *   @payment-paths       built-in rule: URL paths like /checkout, /payment, /billing, /wallet
 * Incognito windows are never captured at all (manifest "incognito": "not_allowed"), so they need no pattern.
 */
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  root.GhostBlocklist = m;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DEFAULT_BLOCKLIST = [
    '# Ghost from the Past default blocklist. One pattern per line. Edit freely; "Reset to defaults" restores it.',
    '# Incognito windows are never remembered (the extension cannot run there).',
    '',
    '# Browser pages, files and your own machine / network',
    'chrome://*', 'chrome-extension://*', 'edge://*', 'about:*', 'moz-extension://*', 'file://*', 'view-source:*', 'data:*',
    '@private-network',
    '',
    '# Sign-in, accounts and one-time codes',
    '@auth-paths',
    'accounts.google.com', 'myaccount.google.com', 'login.microsoftonline.com', 'login.live.com', 'account.microsoft.com',
    'appleid.apple.com', 'idmsa.apple.com', 'login.*', 'signin.*', 'sign-in.*', 'auth.*', 'sso.*', 'idp.*', 'oauth.*',
    '*.okta.com', '*.auth0.com', '*.onelogin.com', 'github.com/login*', 'github.com/settings*', 'github.com/sessions*',
    '',
    '# Email and private messages',
    'mail.google.com', 'inbox.google.com', 'outlook.live.com', 'outlook.office.com', 'outlook.office365.com', 'mail.yahoo.com',
    'mail.proton.me', '*.protonmail.com', 'mail.zoho.com', 'mail.zoho.in', '*.fastmail.com', 'icloud.com/mail*', 'mail.aol.com',
    'web.whatsapp.com', 'web.telegram.org', 'messages.google.com', 'discord.com/channels*', 'app.slack.com', 'teams.microsoft.com',
    'www.messenger.com', 'instagram.com/direct*', 'x.com/messages*', 'twitter.com/messages*', 'facebook.com/messages*', 'linkedin.com/messaging*',
    '',
    '# Private documents, workspaces and AI chats',
    'docs.google.com', 'drive.google.com', 'calendar.google.com', 'contacts.google.com', 'keep.google.com', 'photos.google.com',
    'onedrive.live.com', '*.sharepoint.com', 'office.com', 'dropbox.com/home*', 'app.box.com',
    'notion.so', 'notion.com', '*.slack.com', '*.atlassian.net',
    'chatgpt.com', 'chat.openai.com', 'claude.ai', 'gemini.google.com',
    '',
    '# Cloud consoles',
    'console.aws.amazon.com', 'portal.azure.com', 'console.cloud.google.com',
    '',
    '# Password managers',
    'vault.*', 'roboform.com', 'enpass.io',
    '1password.com', 'bitwarden.com', 'lastpass.com', 'dashlane.com', 'keepersecurity.com', 'nordpass.com',
    'proton.me/pass*', 'passwords.google.com', 'passwords.google',
    '',
    '# Banking, UPI, payments, investing and crypto',
    '@payment-paths',
    '*bank*', '*netbanking*', 'onlinesbi.sbi', '*.sbi', 'kotak.com', 'chase.com', 'wellsfargo.com', 'citi.com', 'capitalone.com',
    'americanexpress.com', 'discover.com', 'usaa.com', 'barclays.co.uk', 'hsbc.co.uk', 'hsbc.co.in', 'monzo.com', 'n26.com',
    'paypal.com', 'stripe.com', 'checkout.*', 'pay.*', 'payments.*', 'pay.google.com', 'wallet.google.com',
    'paytm.com', 'phonepe.com', 'bhimupi.org.in', 'npci.org.in', 'razorpay.com', 'cashfree.com', 'payu.in', 'billdesk.com',
    'cred.club', 'mobikwik.com', 'amazon.in/pay*', 'amazon.com/cpe/yourpayments*', 'wise.com', 'revolut.com', 'venmo.com',
    'cash.app', 'kite.zerodha.com', 'console.zerodha.com', 'groww.in', 'upstox.com', 'angelone.in', 'robinhood.com',
    'fidelity.com', 'schwab.com', 'vanguard.com', 'etrade.com', 'coinbase.com', 'binance.com', 'kraken.com', 'wazirx.com',
    'policybazaar.com', 'cibil.com', 'experian.com', 'creditkarma.com',
    '',
    '# Health portals and records',
    'mychart.*', '*.mychart.com', '*mychart*', '*patientportal*', 'patient.*', 'myhealth.*', 'healthvault.*',
    'practo.com/consult*', 'apollo247.com', '1mg.com/my-account*', 'pharmeasy.in/account*', 'nhs.uk/nhs-app*',
    'healthcare.gov', 'my.clevelandclinic.org', 'followmyhealth.com', 'patient.athenahealth.com', 'abdm.gov.in', 'healthid.ndhm.gov.in',
    '',
    '# Government, tax and ID',
    'uidai.gov.in', 'myaadhaar.uidai.gov.in', 'incometax.gov.in', 'eportal.incometax.gov.in', 'digilocker.gov.in',
    'passportindia.gov.in', 'epfindia.gov.in', 'unifiedportal-mem.epfindia.gov.in', 'parivahan.gov.in', 'gst.gov.in',
    'irs.gov', 'ssa.gov', 'login.gov', 'id.me', 'gov.uk/sign-in*', 'access.service.gov.uk', 'my.gov.au', 'canada.ca/en/revenue-agency*',
  ];

  var PRIVATE_SUFFIXES = ['.local', '.internal', '.lan', '.corp', '.intranet', '.home.arpa', '.localhost'];
  var AUTH_PATH = /(^|\/)(log-?in|sign-?in|sign-?up|log-?on|oauth2?|authorize|auth|sso|saml|2fa|mfa|otp|verify-otp|password|reset-?password|forgot-?password|account\/security)(\/|$|\.|\?)/i;
  var PAYMENT_PATH = /(^|\/)(checkout|payment|payments|pay|billing|wallet|upi|cart\/payment|order\/pay)(\/|$|\.|\?)/i;

  function isPrivateHost(host) {
    host = String(host || '').toLowerCase().replace(/^\[|\]$/g, '');
    if (!host) return false;
    if (host === 'localhost' || host === '0.0.0.0' || host === '::1' || host === '::') return true;
    for (var i = 0; i < PRIVATE_SUFFIXES.length; i++) if (host.endsWith(PRIVATE_SUFFIXES[i])) return true;
    var m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (m) {
      var a = +m[1], b = +m[2];
      if (a === 10 || a === 127 || a === 0) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
      if (a === 169 && b === 254) return true;
      if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT / tailscale
      return false;
    }
    if (/^f[cd][0-9a-f]{2}:/i.test(host) || /^fe80:/i.test(host)) return true; // IPv6 ULA / link-local
    if (host.indexOf('.') === -1) return true; // single-label intranet names like "nas" or "router"
    return false;
  }

  function globToRegExp(glob) {
    var re = '';
    for (var i = 0; i < glob.length; i++) {
      var c = glob[i];
      re += c === '*' ? '.*' : /[.+?^${}()|[\]\\\/]/.test(c) ? '\\' + c : c;
    }
    return new RegExp('^' + re + '$', 'i');
  }

  function parseList(list) {
    var lines = Array.isArray(list) ? list : String(list || '').split(/\r?\n/);
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var l = String(lines[i]).trim();
      if (!l || l[0] === '#') continue;
      out.push(l);
    }
    return out;
  }

  function matchOne(pattern, u) {
    var p = pattern.toLowerCase();
    if (p === '@private-network') return isPrivateHost(u.hostname);
    if (p === '@auth-paths') return AUTH_PATH.test(u.pathname);
    if (p === '@payment-paths') return PAYMENT_PATH.test(u.pathname);
    if (p.indexOf('://') !== -1 || /^[a-z-]+:\*?$/.test(p) || /^(about|data|view-source):/.test(p)) {
      return globToRegExp(p).test(u.href);
    }
    var host = u.hostname.toLowerCase().replace(/^www\./, '');
    if (p.indexOf('/') !== -1) {
      var hp = host + u.pathname.toLowerCase();
      var pp = p.replace(/^www\./, '');
      if (globToRegExp(pp).test(hp)) return true;
      // also allow subdomains for host/path patterns without a leading glob
      return pp[0] !== '*' && globToRegExp('*.' + pp).test(hp);
    }
    if (p.indexOf('*') === -1) {
      p = p.replace(/^www\./, '');
      return host === p || host.endsWith('.' + p);
    }
    // "*.x" matches the apex x as well as any subdomain
    if (p.slice(0, 2) === '*.' && host === p.slice(2).replace(/^www\./, '')) return true;
    return globToRegExp(p).test(host);
  }

  /** Returns the first matching pattern, or null. Unparseable URLs are treated as blocked ('invalid-url'). */
  function matchUrl(url, list, extraHosts) {
    var u;
    try {
      u = new URL(url);
    } catch (e) {
      return 'invalid-url';
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      // Only web pages are ever remembered, whatever the list says.
      return 'non-web:' + u.protocol;
    }
    var host = u.hostname.toLowerCase();
    if (extraHosts) {
      for (var j = 0; j < extraHosts.length; j++) {
        var h = String(extraHosts[j] || '').toLowerCase();
        if (h && (host === h || host.endsWith('.' + h))) return h;
      }
    }
    var patterns = parseList(list);
    for (var i = 0; i < patterns.length; i++) {
      try {
        if (matchOne(patterns[i], u)) return patterns[i];
      } catch (e) {
        /* ignore a broken user pattern */
      }
    }
    
    // Check hash routes: if hash starts with #/ or #!/ treat it as a route
    if (u.hash && /^#!?\//.test(u.hash)) {
      try {
        var h = new URL(u.origin + u.hash.replace(/^#!?/, ''));
        for (var k = 0; k < patterns.length; k++) {
          try {
            if (matchOne(patterns[k], h)) return patterns[k];
          } catch (e) {
            /* ignore a broken user pattern */
          }
        }
      } catch (e) {
        /* invalid hash route, ignore */
      }
    }
    
    return null;
  }

  function isBlocked(url, list, extraHosts) {
    return matchUrl(url, list, extraHosts) !== null;
  }

  /** Pattern that excludes the site of this URL (used by the popup's "Don't remember this site"). */
  function patternForSite(url) {
    try {
      return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    } catch (e) {
      return null;
    }
  }

  return {
    DEFAULT_BLOCKLIST: DEFAULT_BLOCKLIST,
    defaultText: function () {
      return DEFAULT_BLOCKLIST.join('\n');
    },
    parseList: parseList,
    isPrivateHost: isPrivateHost,
    matchUrl: matchUrl,
    isBlocked: isBlocked,
    patternForSite: patternForSite,
  };
});
