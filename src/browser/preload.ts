export function getMinimalPreloadScript(): string {
  return `
(() => {
  try {
    Object.defineProperty(navigator, 'webdriver', {
      configurable: true,
      get: () => undefined
    });
  } catch {}

  try {
    const chromeValue = typeof window.chrome === 'object' && window.chrome !== null
      ? { ...window.chrome, runtime: window.chrome.runtime ?? {} }
      : { runtime: {} };

    Object.defineProperty(window, 'chrome', {
      configurable: true,
      value: chromeValue
    });
  } catch {}

  try {
    Object.defineProperty(navigator, 'languages', {
      configurable: true,
      get: () => ['zh-CN', 'zh', 'en-US', 'en']
    });
  } catch {}
})();
`.trim();
}
