> HISTORIQUE : chemins de l’ancien paquet groupé. Ne pas utiliser comme procédure de lancement. Lire le README à la racine.

> **LOT P1 — Instructions de lancement/sécurité remplacées : lire `../docs/DEMARRAGE.md`, `../docs/BUILD.md` et `../docs/RECETTE-P1.md`. Le guide ci-dessous est historique et ne prouve pas les résultats P1.**

# Sécurisation P1 — lire en premier

Consulter `../docs/DEMARRAGE.md` et `../docs/RAPPORT-P1.md` avant toute exécution.
Aucune connexion distante ni rotation de secret n’a été effectuée.
Les procédures historiques ci-dessous ne remplacent pas les nouveaux lanceurs P1.

# SNAE-PPD — Refonte F3, audit et parcours

**Livraison de conception / recette, pas version homologuée ni prête pour la production.**

La base React/TypeScript/Vite fournie est conservée. La F3 améliore la navigation, l’accueil,
la fiche documentaire, certains dialogues d’entrée et la séparation démonstration/connexion.
Elle ajoute 42 parcours avec leurs contrats, exceptions et limites. Le backend n’a pas été modifié.

## Consulter d’abord

- `docs/f3/AUDIT.html` : analyse détaillée, 16 extraits de sources, matrice des domaines, 42 parcours.
- `docs/f3/CHANGEMENTS.md` : portée des modifications et éléments non terminés.
- `docs/f3/endpoints-backend.json` : 253 déclarations HTTP extraites des 21 contrôleurs racine.
- `docs/f3/parcours.json` : 42 parcours ; 26 à contrat présent, 13 partiels, 3 cibles.
- `docs/f3/verification/` : résultats réellement observés dans cette session.
- `docs/f3/apercus/` : captures du prototype local, pas preuves de connexion au backend.

Un contrat présent dans le code n’est pas un parcours certifié en intégration.
Les anciens documents F1/F2 conservés peuvent contenir des constats antérieurs : le rapport F3
précise le périmètre réellement examiné. Les anciens manifestes conservés sont dans `docs/historique/` ; leurs validations ne valent pas recette F3.

## Installer dans un nouveau dossier

Utiliser une version de Node compatible avec la plage `engines` du `package.json` fourni.
Ne pas recopier le node_modules du ZIP initial : il contenait des dépendances natives Windows.

```powershell
node --version
npm.cmd ci
npm.cmd run typecheck
npm.cmd run test:f3
npm.cmd run demo
```

Ouvrir l’adresse localhost affichée par Vite (port 5173), puis « Ouvrir la démonstration ».
Le mode demo utilise `.env.demo`, un fournisseur désactivé et des objets fictifs.
Les nouvelles notices de démonstration ne sont pas des archives conservées.

## Connexion à un serveur de recette

```powershell
Copy-Item .env.example .env.local
# Renseigner un fournisseur d’identité public OIDC ou Supabase Auth.
# Indiquer le backend de recette dans DEV_BACKEND_TARGET.
# Ne jamais mettre DB_PASSWORD, service_role ni une clé secrète dans VITE_*.
npm.cmd run dev
```

Le préfixe API reste `/api/v1`. Les clients ajoutent leur chemin métier ; ne pas ajouter
`/iam` à cette base. Le mode connecté n’utilise pas de données de secours fictives.
Les permissions graphiques ne remplacent pas les autorisations serveur.

## Tests à exécuter avant intégration

```powershell
npm.cmd run typecheck
npm.cmd run test:f3
npm.cmd run test:core
npm.cmd run test:ui
npm.cmd run build
npm.cmd run build:demo
```

Observé dans cette session : TypeScript réussi ; 16 tests F3 réussis ; 70 tests cœur sur 71,
avec un échec de chargement des tests PDF dans l’environnement ; 64 vérifications visuelles
réussies dans le prototype local. Build Vite et Vitest non validés faute de bindings natifs
Linux dans les dépendances fournies. Aucun backend, PostgreSQL, SSO ou antivirus actif testé.

Ne pas déduire une réussite globale de ces résultats partiels.

## Prototype autonome

Le fichier `SNAE-PPD-F3-Prototype.html`, livré séparément, s’ouvre sans installation.
Il utilise une navigation mémoire et des données fictives, sans API distante. Ce n’est pas un
build de déploiement. `scripts/prototype-local.cjs` reconstruit ce prototype pour revue graphique
après installation des dépendances ; il ne remplace pas `npm run build`.
