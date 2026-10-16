import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'jsdom',
        include: ['tests/ui/**/*.test.tsx'],
        // La mesure de couverture de la traduction (I18N_COVERAGE_OUT=<fichier>) n'est chargée que sur demande : le catalogue anglais est volumineux.
        setupFiles: ['tests/ui/setup.ts', ...(process.env.I18N_COVERAGE_OUT ? ['tests/ui/i18n-coverage.setup.ts'] : [])],
        clearMocks: true,
        restoreMocks: true,
        testTimeout: 10000
        // Les fichiers de test tournent en parallèle (140 s en séquence, ~22 s en parallèle, mesuré le 16 octobre 2026) : aucun ne partage d'état avec un autre (chaque fichier a son propre
        // environnement jsdom et ses propres simulacres). Un test qui lit trop tôt un résultat asynchrone échouera de temps en temps sous charge : attendre (findBy…), ne pas lire (getBy…).
    }
});
