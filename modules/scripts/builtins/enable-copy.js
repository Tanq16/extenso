for (const type of ['contextmenu', 'copy', 'cut', 'paste', 'selectstart', 'dragstart']) {
  window.addEventListener(type, (event) => event.stopImmediatePropagation(), true);
}
const style = document.createElement('style');
style.textContent = '* { user-select: text !important; -webkit-user-select: text !important; }';
document.documentElement.append(style);
