for (const element of document.querySelectorAll('body *')) {
  if (['fixed', 'sticky'].includes(getComputedStyle(element).position)) element.remove();
}
for (const element of [document.documentElement, document.body]) {
  element.style.setProperty('overflow', 'auto', 'important');
}
