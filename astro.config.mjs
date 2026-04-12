// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  site: 'https://econpedia.dedyn.io',
  output: 'static',
  build: {
    format: 'directory',
  },
  markdown: {
    shikiConfig: {
      theme: 'github-dark',
    },
  },
  vite: {
    css: {
      preprocessorOptions: {},
    },
  },
});
