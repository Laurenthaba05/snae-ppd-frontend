# SNAE-PPD — Frontend F2

Cette version ajoute les écrans de parcours documentaire et patrimonial à F1.1. Lire [docs/F2_PARCOURS.md](docs/F2_PARCOURS.md) avant de les utiliser : démonstration locale uniquement pour les modules métier, sans API documentaire connectée.

# SNAE-PPD — Frontend F1.1 / Identité institutionnelle guinéenne

Refonte visuelle du frontend F1, version `0.1.1`, 24 septembre 2026. React, TypeScript et Vite. En-tête République de Guinée, devise nationale, drapeau rouge-jaune-vert, vert profond, blanc et touches or. Navigation administrative, tableaux et formulaires harmonisés. Le signe des archives est propre au projet, pas une armoirie officielle. Direction graphique proposée pour validation institutionnelle, aucune homologation revendiquée.

**Statut : candidate de recette frontend.** Aucun backend, migration ou secret existant n’est modifié. Les défauts du backend signalés dans l’audit V43 ne sont pas corrigés par cette interface. Ne pas ouvrir la plateforme aux données sensibles avant recette intermodules et sécurité.

## Démarrer la démonstration sur Windows

Installer Node.js 24, ou une version 22 à partir de 22.12. Ouvrir le dossier `snae-ppd-frontend-f1.1-institutionnel`, pas le backend Kotlin.

```powershell
node --version
npm --version
npm install
npm run demo
```

Ouvrir `http://localhost:5173`. Cliquer sur **Ouvrir la démonstration**. Le sélecteur en haut permet d’utiliser Administrateur A, Administrateur B et Agent de recette. Toutes les données sont fictives, en mémoire de l’onglet ; recharger ou réinitialiser efface les modifications. La démonstration ne contacte ni Supabase ni le backend. Elle simule quelques règles pour la recette visuelle, pas toute la sécurité métier.

Si PowerShell bloque `npm.ps1`, utiliser `npm.cmd install` et `npm.cmd run demo` ; ne pas désactiver globalement la politique de sécurité. Le serveur est lié à la boucle locale, pas à toutes les interfaces réseau.

## Activer le mode connecté

```powershell
Copy-Item .env.example .env.local
```

Renseigner un seul fournisseur d’identité dans `.env.local`. Voir `docs/CONFIGURATION.md`. Arrêter le serveur de démonstration avec Ctrl+C puis :

```powershell
npm run dev
```

Le mode connecté ne devient jamais une démonstration en cas de panne. Sans fournisseur configuré, la connexion est désactivée. Le backend doit être démarré séparément sur une base de recette. Le proxy Vite `/api` cible par défaut `http://127.0.0.1:8080` et conserve le chemin `/api/v1/iam/...`.

## Refonte F1.1

Connexion, accueil, navigation, listes, fiches, formulaires, confirmations, gouvernance et mobile reçoivent la nouvelle identité. Les API, règles, sessions et transports de F1 restent inchangés. Aucun écran documentaire, bouton de scan ou faux dépôt n’est ajouté. Le thème est isolé dans `src/institutional.css`, appliqué après les composants communs.

## Écrans livrés

- Connexion Supabase Auth par email/mot de passe **ou** redirection OIDC/SSO, jamais login local inventé dans Spring.
- Espace de travail et profil courant, droits issus de `/iam/me`, indicateurs bornés à ces droits.
- Institutions : liste paginée, création, fiche, modification et statut.
- Départements : institution obligatoire, sélection de parent, création, fiche, modification et statut.
- Utilisateurs : liste, rattachement SSO, fiche, modification du profil, statut, révocation des anciens tokens, synthèse d’accès.
- Rôles : liste, création, fiche, modification, statut, permissions.
- Attributions de rôles : création contrôlée et révocation ; lecture des délégations et révocation lorsqu’autorisée.
- Gouvernance : impact d’un rôle, demandes paginées par rôle, proposition, comparaison avant/après, approbation indépendante, rejet et annulation.
- Guide et périmètre. Aucun faux bouton de gestion documentaire, OCR ou portail public n’est présenté comme implémenté.

F1.1 ne couvre pas encore toute l’administration de délégations (création/réémission), le changement de portée d’un compte, les alertes globales ni les 13 modules métier. Les appels et écrans suivront par lots. Les listes sont paginées, les filtres locaux portent uniquement sur la page chargée. Il n’existe pas de statistiques nationales inventées.

## Commandes

```powershell
npm test
npm run typecheck
npm run build
npm run check
npm run build:demo
npm run preview
```

`build` produit le frontend connecté ; `build:demo` produit exclusivement une démo. Ne pas publier la démo sur un domaine institutionnel de production. `preview` n’est pas un serveur d’exploitation et ne fournit pas le proxy backend de développement.

Installation npm de F1.1 non aboutie dans l’environnement de génération (EAI_AGAIN). **Aucun package-lock.json fictif n’est livré.** Après la première installation connectée, vérifier le lockfile produit, le conserver en gestion de versions, puis utiliser `npm ci` pour les builds reproductibles. La CI fournie exige ce lockfile. La recette Vite/SSO/backend reste obligatoire.

## Architecture

```
src/
  auth/     fournisseur, session, résolution /me
  api/      client des contrats IAM
  core/     types, droits d’affichage, validation, commandes, HTTP
  demo/     transport simulé, uniquement pour build demo
  pages/    écrans IAM et gouvernance
  ui/       navigation, périmètre, formulaires, tableaux, composants
```

Les permissions d’affichage ne sont jamais une autorisation serveur. Les commandes ont une clé d’idempotence par intention, des motifs, et les versions attendues requises. Aucun rejeu automatique d’écriture. Les erreurs 401/403/409/422 et les réponses incertaines sont traitées sans afficher un faux succès.

## Documentation

- `docs/IDENTITE_INSTITUTIONNELLE.md` — palette, symboles, sources et périmètre de la proposition.
- `docs/CONFIGURATION.md` — connexion, secrets et déploiement.
- `docs/CONTRATS_API.md` — correspondance aux classes et routes du backend.
- `docs/RECETTE.md` — scénario complet et cas négatifs.
- `docs/VALIDATION.md` — vérifications réelles, limites et étapes restant à exécuter.
- `docs/RELEASE_FILES.json` — empreintes des fichiers de cette livraison.
