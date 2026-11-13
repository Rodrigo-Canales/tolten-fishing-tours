import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  devToolbar: { enabled: false },
  site: 'https://toltenfishingtours.cl',
  vite: { plugins: [tailwindcss()] },
});
