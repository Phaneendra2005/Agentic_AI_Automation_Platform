export const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');

export function assetUrl(path) {
  if (!path) return '';
  if (/^https?:\/\//.test(path)) return path;
  return `${API_ORIGIN}${path}`;
}
