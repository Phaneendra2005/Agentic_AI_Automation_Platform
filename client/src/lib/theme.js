export function resolveTheme(theme) {
  if (theme === 'system' && typeof window !== 'undefined') {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return theme === 'light' ? 'light' : 'dark';
}

export function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  const resolved = resolveTheme(theme);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
}
