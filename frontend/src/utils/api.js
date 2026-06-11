import { auth } from '../firebase';

export const apiFetch = async (url, options = {}) => {
  const token = await auth.currentUser?.getIdToken();
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(url, {
    ...options,
    headers,
  });
};
