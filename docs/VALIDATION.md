# Validation F1.1 — Refonte institutionnelle

Date : 24 septembre 2026. Base : archive SNAE-PPD-Frontend-F1-IAM.zip fournie dans la conversation. Version 0.1.1. Aucune connexion au backend, au fournisseur d'identité, au bucket ou à la base de l'utilisateur. Aucun secret repris.

## Vérifications effectivement réalisées

| Contrôle | Résultat | Limite |
|---|---|---|
| npm test | 36 tests réussis, 0 échec, 0 ignoré | Noyau TypeScript avec tsc 5.8.3 disponible localement, Node 22.16.0 ; pas toutes les sources React |
| Transpilation des sources applicatives | 31 fichiers TS/TSX, 0 diagnostic syntaxique | transpileModule n'effectue pas le contrôle de types complet |
| Parcours Chromium de démonstration | 13 étapes réussies | React 18.2.0 local, routeur navigateur simulé en mémoire ; pas le build React 19 / Vite cible |
| Disposition responsive | Connexion, accueil et catalogue : 320, 390, 768, 1024, 1280, 1440, 1920 px, sans débordement horizontal global détecté | Tableaux volontairement défilants ; pas chaque écran et chaque résolution |
| Menu mobile | Échap et restitution du focus vérifiés dans le parcours | Pas un audit exhaustif d'accessibilité |
| Assistance et mot de passe | Ouverture/fermeture de l'aide, affichage/masquage du mot de passe vérifiés | Aperçu de formulaire avec un pilote d'identité simulé, aucune authentification réelle |
| Installation npm | Tentée, échec EAI_AGAIN sur registry.npmjs.org | Aucun lockfile inventé |
| npm run typecheck / build Vite / vrai SSO | Non exécutés jusqu'au bout | Dépendances exactes non téléchargeables dans l'environnement |

Le parcours de 13 étapes couvre connexion de démonstration, identité, catalogue, création, relecture de commande, modification avec version, suspension, proposition, approbation par B, restrictions de l'agent, mobile, déconnexion et absence d'appel backend ou erreur JavaScript non gérée.

Une première revue responsive a trouvé un débordement du catalogue à 320 px causé par un contenu accessible positionné hors de son conteneur. Le conteneur de tableau a été corrigé ; la matrice de sept largeurs a ensuite été réexécutée avec succès. Les dernières captures correspondent au code livré.

## Nature des aperçus

Les captures sont des rendus Chromium des composants modifiés et de leurs CSS, pas des images générées représentant des fonctionnalités fictives. Le banc hors ligne utilise React 18.2.0 extrait de l'environnement JupyterLab installé, une transpilation TypeScript 5.8.3 et un historique de navigation simulé. Les bibliothèques de ce banc ne sont pas distribuées avec le projet. Il n'est pas équivalent à une compilation Vite ou à la version React du package.json.

La capture connexion-formulaire.png montre le composant Supabase configuré avec un pilote de test inactif. Elle ne prouve pas une connexion à Supabase. Les captures espace de travail/catalogue/gouvernance utilisent les données explicitement fictives du mode démonstration.

## Périmètre des modifications

Seuls les écrans, structure de navigation, identité visuelle, CSS, favicon, documentation, version et recette visuelle sont modifiés. Les octets de src/api, src/auth, src/core, src/demo, .env.example et .env.demo sont comparés à la base et conservés. Les sources des commandes et des formulaires métier restent présentes ; les règles de sécurité et permissions n'ont pas été remplacées par des règles d'affichage. Voir SOURCE_CHANGES.json et RELEASE_FILES.json.

## Acceptation sur un poste connecté

```powershell
npm install
npm test
npm run typecheck
npm run build
npm run build:demo
npm run demo
```

Après la première installation, examiner et conserver package-lock.json puis utiliser npm ci en CI. Exécuter scripts/recette_browser.py sur le serveur Vite avec les dépendances cibles. Tester SSO réel, /iam/me, session expirée, permissions révoquées et commandes incertaines sur le backend de recette. Les problèmes backend documentés ne sont pas corrigés par la refonte visuelle.

Statut : proposition graphique et candidate de recette frontend ; ni homologation institutionnelle, ni certification d'accessibilité, ni version de production validée.
