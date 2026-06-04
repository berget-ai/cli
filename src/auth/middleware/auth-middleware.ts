import type { Middleware } from 'openapi-fetch';

import { FileTokenStore } from '../storage/token-store.js';

export function authMiddleware(options: {
  getToken?: () => Promise<null | string>;
  refresh?: () => Promise<boolean>;
}): Middleware {
  const getToken =
    options.getToken ||
    (async () => {
      const store = new FileTokenStore();
      const data = await store.get();
      return data?.access_token || null;
    });

  return {
    async onRequest({ request }) {
      const token = await getToken();
      if (token && !request.headers.get('Authorization')) {
        request.headers.set('Authorization', `Bearer ${token}`);
      }
      return request;
    },
    async onResponse({ request, response }) {
      if (response.status === 401 && options.refresh) {
        const ok = await options.refresh();
        if (ok) {
          const newToken = await getToken();
          if (newToken) {
            request.headers.set('Authorization', `Bearer ${newToken}`);
            return fetch(request);
          }
        }
      }
      return undefined; // no modification
    },
  };
}
