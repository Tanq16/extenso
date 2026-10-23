import '../lib/messages.js';
import { h, setStatus } from '../ui/dom.js';

const { messages } = globalThis.extenso;

const records = [];
let selected = null;
let hostFilter = '';
let pageHost = '';

const requestList = h('div', { className: 'requests' });
const hostSelect = h('select', {});
const findInput = h('input', { type: 'text', placeholder: 'Find by value', spellcheck: false });
const detail = h('div', { className: 'detail' });
const formSlot = h('div', {});
const status = h('p', { className: 'status' });

const hostOf = (url) => {
  const parsed = URL.parse(url);
  return parsed ? parsed.host : '';
};

const flatten = (node, prefix = '', out = {}) => {
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      const path = Array.isArray(node) ? `${prefix}[${key}]` : prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === 'object') flatten(value, path, out);
      else out[path] = value;
    }
  } else if (prefix) {
    out[prefix] = node;
  }
  return out;
};

const parseJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const evalPage = (expression) =>
  new Promise((resolve) => {
    chrome.devtools.inspectedWindow.eval(expression, (result, exception) => resolve(exception ? null : result));
  });

const loadPageContext = async () => {
  const context = await evalPage(
    `(function () {
      const read = (area) => { const o = {}; try { for (let i = 0; i < area.length; i++) { const k = area.key(i); o[k] = area.getItem(k); } } catch (e) {} return o; };
      return { host: location.host, url: location.href, local: read(localStorage), session: read(sessionStorage) };
    })()`,
  );
  if (context) pageHost = context.host;
  let cookies = [];
  try {
    if (context?.url && chrome.cookies) cookies = await chrome.cookies.getAll({ url: context.url });
  } catch {}
  return { ...(context ?? { host: '', local: {}, session: {} }), cookies };
};

const scopeFor = (host) => `*://${host || pageHost || '*'}/*`;

const prefill = (template) => {
  const name = h('input', { type: 'text', value: template.name ?? '', placeholder: 'Rule name' });
  const pattern = h('input', { type: 'text', value: scopeFor(template.host), spellcheck: false });
  const key = h('input', { type: 'text', value: template.key ?? '', spellcheck: false });
  const path = h('input', { type: 'text', value: template.extract?.path ?? '', placeholder: 'JSON path', spellcheck: false });
  const pathField = h('label', { className: 'field' }, 'JSON path', path);
  pathField.hidden = template.extract?.mode !== 'json';

  const save = async (event) => {
    event.preventDefault();
    try {
      await messages.send('siphon', 'addRule', {
        rule: {
          name: name.value.trim() || `${template.source} ${template.key || ''}`.trim(),
          scope: { pattern: pattern.value.trim(), urlRegex: '' },
          source: template.source,
          key: key.value.trim(),
          extract: template.extract?.mode === 'json'
            ? { mode: 'json', path: path.value.trim() }
            : { mode: 'whole' },
          keep: { mode: 'latest', n: 5 },
          on: { notify: false, copy: false },
        },
      });
      formSlot.replaceChildren();
      setStatus(status, 'Rule saved to Siphon settings.', 'success');
    } catch (error) {
      setStatus(status, error.message, 'error');
    }
  };

  formSlot.replaceChildren(
    h('form', { className: 'card', onsubmit: save },
      h('h3', {}, 'New rule'),
      h('span', { className: 'badge info' }, template.source),
      h('label', { className: 'field' }, 'Name', name),
      h('label', { className: 'field' }, 'Scope', pattern),
      h('label', { className: 'field' }, 'Key', key),
      pathField,
      h('div', { className: 'row' },
        h('button', { type: 'submit', className: 'primary' }, 'Save rule'),
        h('button', { type: 'button', onclick: () => formSlot.replaceChildren() }, 'Cancel'),
      ),
    ),
  );
};

const item = (label, value, template) =>
  h('button', { type: 'button', className: 'item kv', onclick: () => prefill(template) },
    h('strong', {}, label),
    h('span', { className: 'mono grow truncate' }, value == null ? '' : String(value)),
  );

const section = (title, children) =>
  children.length ? h('section', { className: 'card' }, h('h3', {}, title), ...children) : null;

const renderDetail = async () => {
  detail.replaceChildren();
  const context = await loadPageContext();
  const sections = [];

  if (selected) {
    const { request, response, body, host } = selected;
    const query = (request.queryString ?? []).map((q) =>
      item(q.name, q.value, { host, source: 'query', key: q.name }),
    );
    const reqHeaders = (request.headers ?? []).map((head) =>
      item(head.name, head.value, { host, source: 'request.header', key: head.name }),
    );
    const bodyFields = [];
    const post = request.postData;
    if (post?.params?.length) {
      bodyFields.push(...post.params.map((p) =>
        item(p.name, p.value, { host, source: 'request.body', key: p.name }),
      ));
    } else if (post?.text) {
      const json = parseJson(post.text);
      if (json) {
        for (const [path, value] of Object.entries(flatten(json))) {
          bodyFields.push(item(path, value, { host, source: 'request.body', key: path }));
        }
      }
    }
    const respHeaders = (response.headers ?? []).map((head) =>
      item(head.name, head.value, { host, source: 'response.header', key: head.name }),
    );
    const respKeys = [];
    const respJson = body && parseJson(body);
    if (respJson) {
      for (const [path, value] of Object.entries(flatten(respJson))) {
        respKeys.push(item(path, value, { host, source: 'response.body', key: '', extract: { mode: 'json', path } }));
      }
    }
    sections.push(
      section('Query', query),
      section('Request headers', reqHeaders),
      section('Request body', bodyFields),
      section('Response headers', respHeaders),
      section('Response JSON', respKeys),
    );
  }

  const cookieItems = (context.cookies ?? []).map((cookie) =>
    item(cookie.name, cookie.value, { host: pageHost, source: 'cookie', key: cookie.name }),
  );
  const localItems = Object.entries(context.local ?? {}).map(([key, value]) =>
    item(key, value, { host: pageHost, source: 'localStorage', key }),
  );
  const sessionItems = Object.entries(context.session ?? {}).map(([key, value]) =>
    item(key, value, { host: pageHost, source: 'sessionStorage', key }),
  );
  sections.push(
    section('Cookies', cookieItems),
    section('localStorage', localItems),
    section('sessionStorage', sessionItems),
  );

  detail.append(...sections.filter(Boolean));
  if (!detail.childElementCount) detail.append(h('p', { className: 'empty' }, 'Select a request, or inspect the page cookies and storage.'));
};

const findByValue = async (needle) => {
  const query = needle.trim();
  if (!query) return renderDetail();
  const context = await loadPageContext();
  const results = [];
  const add = (label, value, template) => {
    if (value != null && String(value).includes(query)) results.push(item(label, value, template));
  };
  for (const record of records) {
    const { request, response, body, host } = record;
    for (const q of request.queryString ?? []) add(`query ${q.name}`, q.value, { host, source: 'query', key: q.name });
    for (const head of request.headers ?? []) add(`req header ${head.name}`, head.value, { host, source: 'request.header', key: head.name });
    for (const p of request.postData?.params ?? []) add(`body ${p.name}`, p.value, { host, source: 'request.body', key: p.name });
    for (const head of response.headers ?? []) add(`resp header ${head.name}`, head.value, { host, source: 'response.header', key: head.name });
    const respJson = body && parseJson(body);
    if (respJson) {
      for (const [path, value] of Object.entries(flatten(respJson))) {
        add(`resp ${path}`, value, { host, source: 'response.body', key: '', extract: { mode: 'json', path } });
      }
    }
  }
  for (const cookie of context.cookies ?? []) add(`cookie ${cookie.name}`, cookie.value, { host: pageHost, source: 'cookie', key: cookie.name });
  for (const [key, value] of Object.entries(context.local ?? {})) add(`localStorage ${key}`, value, { host: pageHost, source: 'localStorage', key });
  for (const [key, value] of Object.entries(context.session ?? {})) add(`sessionStorage ${key}`, value, { host: pageHost, source: 'sessionStorage', key });

  detail.replaceChildren(
    results.length
      ? h('section', { className: 'card' }, h('h3', {}, `Matches for "${query}"`), ...results)
      : h('p', { className: 'empty' }, `No matches for "${query}".`),
  );
};

const drawRequests = () => {
  const hosts = [...new Set(records.map((record) => record.host))].sort();
  hostSelect.replaceChildren(
    h('option', { value: '' }, 'All hosts'),
    ...hosts.map((host) => h('option', { value: host, selected: host === hostFilter }, host)),
  );
  requestList.replaceChildren();
  const visible = records.filter((record) => !hostFilter || record.host === hostFilter);
  for (const record of visible.slice().reverse()) {
    const button = h('button', {
      type: 'button',
      'aria-selected': String(record === selected),
      onclick: () => {
        selected = record;
        drawRequests();
        renderDetail();
      },
    }, h('span', { className: 'mono truncate' }, `${record.method} ${record.path}`));
    requestList.append(button);
  }
  if (!visible.length) requestList.append(h('p', { className: 'empty' }, 'No requests recorded yet.'));
};

chrome.devtools.network.onRequestFinished.addListener((entry) => {
  const url = entry.request?.url ?? '';
  const parsed = URL.parse(url);
  const record = {
    url,
    host: hostOf(url),
    path: parsed ? parsed.pathname + parsed.search : url,
    method: entry.request?.method ?? '',
    request: entry.request ?? {},
    response: entry.response ?? {},
    body: null,
  };
  records.push(record);
  entry.getContent?.((content, encoding) => {
    if (content && encoding !== 'base64') record.body = content;
  });
  drawRequests();
});

chrome.devtools.network.onNavigated?.addListener(() => {
  pageHost = '';
  renderDetail();
});

hostSelect.addEventListener('change', () => {
  hostFilter = hostSelect.value;
  drawRequests();
});
findInput.addEventListener('input', () => findByValue(findInput.value));

document.querySelector('main').append(
  h('div', { className: 'row' }, hostSelect, findInput,
    h('button', { type: 'button', className: 'small danger', onclick: () => { records.length = 0; selected = null; drawRequests(); renderDetail(); } }, 'Clear'),
  ),
  status,
  formSlot,
  h('div', { className: 'layout' }, requestList, detail),
);

drawRequests();
renderDetail();
