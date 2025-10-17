export default {
  '*.{js,jsx,ts,tsx,mts,cts}': [
    'pnpm lint:code -- --cache --cache-location data/.eslintcache',
  ],
};
