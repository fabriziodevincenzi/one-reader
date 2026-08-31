export type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loader: Promise<TurnstileApi> | null = null;

export const getTurnstile = () => window.turnstile;

export const loadTurnstile = () => {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (loader) return loader;

  loader = new Promise<TurnstileApi>((resolve, reject) => {
    const fail = () => {
      loader = null;
      document.querySelector<HTMLScriptElement>('[data-turnstile-loader]')?.remove();
      reject(new Error('Cloudflare Turnstile could not be loaded.'));
    };
    const finish = () => {
      if (window.turnstile) resolve(window.turnstile);
      else fail();
    };
    const existingScript = document.querySelector<HTMLScriptElement>('[data-turnstile-loader]');

    if (existingScript) {
      existingScript.addEventListener('load', finish, { once: true });
      existingScript.addEventListener('error', fail, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.dataset.turnstileLoader = '';
    script.addEventListener('load', finish, { once: true });
    script.addEventListener('error', fail, { once: true });
    document.head.append(script);
  });

  return loader;
};
