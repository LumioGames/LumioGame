import { defineConfig } from 'vitest/config'

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: () => 'presentation.js',
      cssFileName: 'presentation',
    },
  },
  test: { include: ['src/**/*.test.ts'] },
})
