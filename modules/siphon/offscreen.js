const sink = document.getElementById('sink');

chrome.runtime.onMessage.addListener((message) => {
  if (message?.target !== 'offscreen-doc' || message.type !== 'copy-data-to-clipboard') return;
  sink.value = message.data;
  sink.select();
  // navigator.clipboard.writeText needs a focused document, which an offscreen document cannot be.
  document.execCommand('copy');
});
