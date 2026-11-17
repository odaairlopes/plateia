/**
 * Dependencies that must exist exactly once at runtime, shared by the shell and
 * every micro frontend. Each of them keeps state in a React context or a module
 * singleton; two copies would mean two themes, two routers, two query caches.
 * Subpaths (react/jsx-runtime, react-dom/client) inherit the setting.
 */
export const sharedDependencies = {
  react: { singleton: true },
  'react-dom': { singleton: true },
  'react-router-dom': { singleton: true },
  '@mui/material': { singleton: true },
  '@emotion/react': { singleton: true },
  '@emotion/styled': { singleton: true },
  '@tanstack/react-query': { singleton: true },
  i18next: { singleton: true },
  'react-i18next': { singleton: true },
} as const;

export const ports = { shell: 5173, catalog: 5174, booking: 5175 } as const;
