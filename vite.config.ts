import { defineConfig } from 'vite';

// three.js alone is ~600 kB minified, over Vite's 500 kB warning. Split it into three chunks
// (core, WebGL renderer, examples/addons); the browser loads them in parallel and caches them
// separately from the app code, which changes more often.
export default defineConfig({
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
