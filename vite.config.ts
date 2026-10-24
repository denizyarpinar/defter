import { defineConfig } from 'vite';

// three.js alone is ~600 kB minified, over Vite's 500 kB warning. Split it into three chunks
// (core, WebGL renderer, examples/addons); the browser loads them in parallel and caches them
// separately from the app code, which changes more often.
// Task 6.4c-2: the Vercel environment at build time (production / preview / ''), so a trial lock
// (?ocrKayit=1) can stay shut on the live site.
declare const process: { env: Record<string, string | undefined> };

export default defineConfig({
  define: { __VERCEL_ENV__: JSON.stringify(process.env.VERCEL_ENV ?? '') },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'three-core', test: /node_modules[\/]three[\/]build[\/]three\.core/, priority: 3 },
            { name: 'three-webgl', test: /node_modules[\/]three[\/]build[\/]/, priority: 2 },
            { name: 'three-addons', test: /node_modules[\/]three[\/]examples[\/]/, priority: 1 }
          ]
        }
      }
    }
  }
});
