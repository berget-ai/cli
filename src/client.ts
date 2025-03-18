import createClient from 'openapi-fetch';
import type { paths } from './types/api';

// Create a typed client for the Berget API
export const apiClient = createClient<paths>({
  baseUrl: 'https://api.berget.ai',
});

// Example usage:
// const { data, error } = await apiClient.GET('/some-endpoint', {
//   params: {
//     // path and query parameters
//   },
//   headers: {
//     // custom headers
//   }
// });
