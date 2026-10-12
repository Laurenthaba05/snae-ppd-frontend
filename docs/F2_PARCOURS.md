# F2 — Parcours frontend des archives

Cette livraison prolonge F1.1 sans modifier les contrats IAM existants. Elle ajoute la navigation et 19 écrans de module couvrant collecte, dossiers, documents, classement, métadonnées, recherche, consultation, communication, numérisation, OCR, contrôle qualité, conservation, sort final, gels, élimination, patrimoine, restauration, indicateurs et journal.

## Démonstration

`npm install` puis `npm run demo`. Cliquer sur « Ouvrir la démonstration » et ouvrir un module dans le menu. Les modules de gestion ont liste, recherche locale, fiche, formulaire de notice et avancement simulé. La recherche transversale, les indicateurs et le journal concernent uniquement les notices fictives de cet onglet. Fermer l'onglet ou utiliser « Réinitialiser » efface les essais. Recharger l'onglet conserve temporairement ces essais. Le mode démo n'envoie aucune opération documentaire au serveur.

Aucun fichier n'est téléversé, aucun OCR, scan, transfert, restauration, gel juridique ni élimination n'est exécuté. Les étapes de démonstration ne valent pas validation administrative ou juridique. Les notices sont stockées dans `sessionStorage` et ne constituent pas des archives. Le journal local n'a aucune valeur de preuve.

## Mode connecté

Les nouveaux écrans affichent leur périmètre et un avertissement ; ils ne proposent aucune commande métier tant que leurs API, leurs habilitations et leur recette ne sont pas raccordées. Les écrans IAM F1.1 continuent à utiliser leur transport et leurs contrôles existants. La navigation vers un module ne confère aucun droit serveur.

## Tests et suite

Exécuter `npm test`, `npm run typecheck`, `npm run build`, `npm run build:demo`. Recetter ensuite chaque module contre les contrats et droits exacts du backend sur une base de test. L'ordre conseillé est documents/dossiers/versements, puis recherche et consultation, conservation, traitements et patrimoine. Les workflows nationaux, la gestion des fichiers, l'accessibilité complète et les règles de conservation exigent une recette métier avec les archivistes et autorités compétentes.

## Validation effectuée ici

`npm run check` : 36 tests réussis et build connecté réussi. `npm run build:demo` : réussi. Automatisation Chromium non exécutée : le module Python Playwright est absent de cet environnement. La recette visuelle et l’intégration réelle restent nécessaires.
