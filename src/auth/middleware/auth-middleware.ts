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
    async onRequest(req) {
      const token = await getToken();
      if (token && !req.headers.get('Authorization')) {
        req.headers.set('Authorization', `Bearer ${token}`);
      }
      return req;
    },
    async onResponse(res, _options, req) {
      if (res.status === 401 && options.refresh) {
        const ok = await options.refresh();
        if (ok) {
          const newToken = await getToken();
          if (newToken) {
            req.headers.set('Authorization', `Bearer ${newToken}`);
            return fetch(req);
          }
        }
      }
      return undefined; // no modification
    },
  };
}
