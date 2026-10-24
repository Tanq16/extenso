setInterval(() => {
  document.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
}, 60000);
