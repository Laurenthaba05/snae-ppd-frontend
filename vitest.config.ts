import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'jsdom',
        include: ['tests/ui/**/*.test.tsx'],
        // La mesure de couverture de la traduction (I18N_COVERAGE_OUT=<fichier>) n'est chargée que sur demande : le catalogue anglais est volumineux.
        setupFiles: ['tests/ui/setup.ts', ...(process.env.I18N_COVERAGE_OUT ? ['tests/ui/i18n-coverage.setup.ts'] : [])],
        clearMocks: true,
        restoreMocks: true,
        testTimeout: 10000,
        fileParallelism: false
    }
});
