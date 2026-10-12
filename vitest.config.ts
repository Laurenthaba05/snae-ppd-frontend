import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'jsdom',
        include: ['tests/ui/**/*.test.tsx'],
        setupFiles: ['tests/ui/setup.ts'],
        clearMocks: true,
        restoreMocks: true,
        testTimeout: 10000,
        fileParallelism: false
    }
});
