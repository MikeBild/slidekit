import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Slidev sets rollup `output.manualChunks`, which conflicts with the single-chunk
// build that vite-plugin-singlefile needs (rolldown rejects manualChunks + no
// code-splitting). Strip it in a post-resolve hook so everything ends up in one
// inlined index.html.
function stripManualChunks() {
  return {
    name: 'strip-manual-chunks',
    enforce: 'post' as const,
    configResolved(config: any) {
      const out = config?.build?.rollupOptions?.output
      if (Array.isArray(out))
        out.forEach((o: any) => {
          delete o.manualChunks
        })
      else if (out) delete out.manualChunks
    },
  }
}

export default defineConfig({
  plugins: [
    viteSingleFile({
      useRecommendedBuildConfig: true,
      removeViteModuleLoader: true,
    }),
    stripManualChunks(),
  ],
})
