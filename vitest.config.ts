import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

// Task 6.5-1: every test file starts with the Turkish dictionary (src/dil/testKurulum.ts)
export default mergeConfig(viteConfig, defineConfig({
  test: { setupFiles: ['src/dil/testKurulum.ts'] }
}));
