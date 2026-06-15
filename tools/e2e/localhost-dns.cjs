// Resolve *.localhost subdomains (e.g. remdo.localhost) to loopback for this
// process only. Playwright's request context resolves hosts via the host OS
// rather than Chromium, so `page.request` to a *.localhost app host fails on
// systems without nss-myhostname / systemd-resolved. RFC 6761 reserves
// `localhost` and its subdomains for loopback, so this never affects real
// names. Loaded via NODE_OPTIONS=--require; nothing is written to disk and the
// override disappears when the process exits.
const dns = require('node:dns');
const process = require('node:process');

const LOOPBACK = '127.0.0.1';
const LOCALHOST_SUBDOMAIN = /\.localhost$/i;
const isLocalhostSubdomain = host => typeof host === 'string' && LOCALHOST_SUBDOMAIN.test(host);

const realLookup = dns.lookup;
dns.lookup = function lookup(hostname, options, callback) {
  if (!isLocalhostSubdomain(hostname)) {
    return realLookup.call(this, hostname, options, callback);
  }
  const cb = typeof options === 'function' ? options : callback;
  const wantsAll = typeof options === 'object' && options !== null && options.all === true;
  process.nextTick(() => {
    if (wantsAll) {
      cb(null, [{ address: LOOPBACK, family: 4 }]);
    } else {
      cb(null, LOOPBACK, 4);
    }
  });
};

const realLookupPromise = dns.promises.lookup;
dns.promises.lookup = function lookup(hostname, options) {
  if (!isLocalhostSubdomain(hostname)) {
    return realLookupPromise.call(this, hostname, options);
  }
  const wantsAll = typeof options === 'object' && options !== null && options.all === true;
  return Promise.resolve(wantsAll ? [{ address: LOOPBACK, family: 4 }] : { address: LOOPBACK, family: 4 });
};
