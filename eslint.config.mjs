// ESLint : un filet de sécurité, pas une charte de style. Les règles retenues attrapent des erreurs réelles (hooks React appelés au mauvais endroit, dépendances oubliées d'un effet, variables
// inutilisées, tableaux ou objets comparés par erreur…) ; la mise en forme (espaces, guillemets, longueur des lignes) n'est PAS contrôlée : le code du projet écrit volontairement des
// lignes denses. TypeScript contrôle déjà les noms non définis (no-undef est donc coupé) et les types (aucune règle « avec types » : la vérification reste rapide).
//
//   npm run lint        échoue sur toute erreur et sur toute alerte au-delà de la base fixée (--max-warnings dans package.json : 34 dépendances d'effets à relire et 8 any)
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default defineConfig(
    globalIgnores(['dist/**', '.test-build/**', 'node_modules/**', 'public/**', 'preuves/**', 'deploy/**', 'modeles/**', 'docs/**', 'outils/**', 'src/core/i18nScreens.ts', 'scripts/*.cjs']),
    js.configs.recommended,
    tseslint.configs.recommended,
    {
        files: ['**/*.{ts,tsx,mjs}'],
        plugins: { 'react-hooks': reactHooks },
        rules: {
            'no-undef': 'off',
            // L'espace insécable et l'espace fine insécable sont de la typographie française voulue (dans des expressions régulières, des chaînes et des modèles) ; seuls ceux du code lui-même sont suspects.
            'no-irregular-whitespace': ['error', { skipStrings: true, skipTemplates: true, skipRegExps: true, skipComments: true, skipJSXText: true }],
            // Les hooks : les deux règles historiques de React, rien de plus (le préréglage « recommended » de la v7 ajoute des règles du compilateur React, trop bruyantes ici).
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'warn',
            // Un `_` en tête dit « volontairement inutilisé » ; une variable de catch inutilisée est courante et sans danger.
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
            // Les `any` explicites existent aux frontières (JSON du serveur) : alerte, pas erreur.
            '@typescript-eslint/no-explicit-any': 'warn',
            // Le style dense du projet utilise des expressions sans effet de bord apparent (`cond && appel()`) : à ne pas bloquer.
            '@typescript-eslint/no-unused-expressions': ['warn', { allowShortCircuit: true, allowTernary: true }],
            'no-empty': ['error', { allowEmptyCatch: true }]
        }
    },
    {
        // Les tests simulent des API partielles : les assertions de type et les `any` y sont normaux.
        files: ['tests/**'],
        rules: { '@typescript-eslint/no-explicit-any': 'off', '@typescript-eslint/no-non-null-assertion': 'off' }
    }
);
