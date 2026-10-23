(() => {
  const TAG = 'siphon:net';
  const post = (url, status, body) => {
    try {
      window.postMessage({ tag: TAG, url: new URL(url, location.href).href, status, body }, location.origin);
    } catch {}
  };
  const originalFetch = window.fetch;
  if (originalFetch) {
    window.fetch = async function (...args) {
      const response = await originalFetch.apply(this, args);
      try {
        const input = args[0];
        const url = typeof input === 'string' ? input : (input?.url ?? String(input));
        response
          .clone()
          .text()
          .then((text) => post(url, response.status, text))
          .catch(() => {});
      } catch {}
      return response;
    };
  }
  const open = XMLHttpRequest.prototype.open;
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__siphonUrl = url;
    return open.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('load', () => {
      try {
        const type = this.responseType;
        let text = '';
        if (type === '' || type === 'text') text = this.responseText;
        else if (type === 'json') text = JSON.stringify(this.response);
        if (text) post(this.__siphonUrl, this.status, text);
      } catch {}
    });
    return send.apply(this, args);
  };
})();
