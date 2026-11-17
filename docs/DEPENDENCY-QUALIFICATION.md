# Dépendances de qualification — 2 novembre 2026

Utiliser Node 24.21.0 et npm 11.19.0, puis `npm ci`, `npm run audit:dependencies` et `npm run check`. Le build connecté exige une configuration publique d’identité. La CI utilise une origine synthétique `https://identity.example.invalid` : ce bundle valide la compilation, pas une connexion ni un déploiement.

Deux dépendances transitives des outils sont épinglées via `overrides` :

* `minimatch` 11.0.1, correctif de l’amplification des motifs. ESLint et typescript-eslint déclaraient encore la branche 10 ; l’exception de version majeure est limitée à cet outil et doit être réexaminée quand ces projets adoptent le correctif. Vérifier le lint complet après toute modification.
* `undici` 8.12.2, correctifs du client HTTP utilisé par jsdom. Vérifier toute la suite d’interface.

Avis des mainteneurs : [minimatch](https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249), [undici](https://github.com/nodejs/undici/security/advisories/GHSA-2m5v-pch6-74hx). Les versions précédentes étaient 10.2.6 et 8.11.2. Aucun `npm audit fix --force` ni retour à une ancienne version d’ESLint n’est nécessaire.

Le contrôle CI refuse désormais les alertes modérées et supérieures. Un audit npm sans alerte ne constitue pas un audit de sécurité exhaustif.
