(() => {
  const STEP = /^\s*(step\s*)?\d+\s*(\/|of)\s*\d+\s*$/i;
  const findStep = () => {
    let match = [...document.body.querySelectorAll('*')]
      .find((el) => el.childElementCount <= 4 && STEP.test(el.textContent) && el.getClientRects().length);
    let inner;
    while (match && (inner = [...match.children].find((child) => STEP.test(child.textContent)))) match = inner;
    return match;
  };
  const toast = (text) => {
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = 'position:fixed;top:20px;right:20px;z-index:2147483647;padding:8px 16px;border-radius:6px;background:black;color:white;font:bold 14px sans-serif;pointer-events:none';
    document.documentElement.append(el);
    setTimeout(() => el.remove(), 2000);
  };
  let attempts = 0;
  const timer = setInterval(() => {
    const step = findStep();
    if (!step && ++attempts < 40) return;
    clearInterval(timer);
    if (step) (step.closest('button, a, [role="button"]') ?? step).click();
    toast(step ? `Clicked "${step.textContent.trim()}"` : 'No step counter found');
  }, 250);
})();
