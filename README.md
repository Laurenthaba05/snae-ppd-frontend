# SNAE-PPD — Frontend indépendant

**Sources frontend F3/P1 + acquisition v13.1. Révision de rangement : separe-1. Candidat de recette, pas build de production validé.**

Ce dossier est un projet React/TypeScript/Vite autonome. Il ne contient pas le backend, sa base de données ou ses secrets. Ouvrir **ce dossier** dans VS Code ou dans votre éditeur. Aucun sous-dossier `frontend` n’est nécessaire.

```text
snae-ppd-frontend/
  src/                    écrans, composants et clients API
  public/
  package.json
  package-lock.json
  vite.config.ts
  .env.example            paramètres publics / exemple de proxy
  tests/
  scripts/
  outils/check_package.py
  modeles/                4 XLSX et 4 CSV de test
  docs/
```

## 1. Contrôler la copie vierge

```powershell
cd "C:\Dev\snae-ppd-frontend"
py -3 .\outils\check_package.py
Test-Path .\package.json
Test-Path .\src
```

`manifestErrors` doit être vide. Ce contrôle Python facultatif ne sert qu’à l’intégrité du ZIP ; il ne fait pas partie du runtime React. L’exécuter avant `npm ci` et avant création d’un `.env.local`.

## 2. Installer et tester

Le fichier `package.json` fourni fixe Node **24.21.0** et npm **11.19.0**. Les versions et le lock ont été conservés octet pour octet, pas mis à jour pendant la séparation. Vérifier ces outils sur votre poste avant l’installation ; ne pas contourner les contrôles avec `--force`.

```powershell
node --version
npm.cmd --version
npm.cmd ci
npm.cmd run typecheck
npm.cmd run test:f3
npm.cmd run test:p1
```

Ne pas copier `node_modules` de l’ancien dossier. Aucun JDK/Gradle n’est nécessaire pour compiler cette interface seule.

## 3. Démonstration, sans backend

```powershell
npm.cmd run demo
```

Le serveur Vite utilise 127.0.0.1:5173. Les données de démonstration sont fictives. Les fonctions d’acquisition nécessitent un backend connecté et ne sont pas simulées comme des opérations réellement réussies.

## 4. Mode connecté

Ne pas écraser une configuration existante. Depuis ce projet :

```powershell
if (-not (Test-Path .\.env.local)) {
    Copy-Item .\.env.example .\.env.local
}
```

Garder dans `.env.local` :

```dotenv
VITE_DATA_MODE=connected
VITE_API_BASE=/api/v1
DEV_BACKEND_TARGET=http://127.0.0.1:8080
```

Configurer ensuite **un seul** fournisseur d’identité de recette (`VITE_AUTH_MODE=oidc` ou `supabase`) et les paramètres publics attendus dans `.env.example`. Les laisser désactivés ne donne pas un accès métier. Ne jamais écrire un mot de passe de base, une clé `service_role`, un secret OAuth ou une clé privée dans une variable `VITE_`.

```powershell
npm.cmd run dev
```

Le navigateur appelle `/api/v1` sur le serveur frontend ; le **proxy Vite** transmet au backend. Il n’existe aucune dépendance au chemin local du backend. Ne pas mettre une URL complète dans `VITE_API_BASE` : le transport actuel exige un préfixe local. Pour un backend distant de recette, le proxy demande HTTPS et la confirmation explicite `SNAE_CONFIRMED_RECETTE_ORIGIN` correspondant exactement à l’origine ; lire `scripts/environment-policy.mjs` et faire valider la cible.

## 5. Build et déploiement

Un build connecté demande une configuration OIDC ou Supabase Auth explicite, et ne doit jamais embarquer des secrets serveur :

```powershell
npm.cmd test
npm.cmd run build
```

La séparation ne crée pas un bundle validé : installation propre, build Vite et parcours connectés restent à vérifier. `dist/` n’est pas fourni. En hébergement statique, le proxy Vite de développement n’existe plus : le serveur de diffusion doit router `/api` vers le backend et servir l’application, avec l’authentification et les protections réseau prévues. Ne pas remplacer cela par des CORS permissifs ou un accès direct à PostgreSQL.

## Scanner et modèles

La page est `Traitements → Acquisition & imports` (`/app/acquisition`). Le scanner utilise le troisième projet `snae-ppd-scanner` installé sur le poste matériel. Aucun moteur OCR serveur n’est placé dans cette interface. Les modèles de `modeles/` contiennent une ligne TEST à remplacer et ne sont pas un import de véritables institutions.

Voir `docs/acquisition/` pour les limites actuelles. Les lots avancés, le contrôle des pages manquantes et les QR ne sont pas ajoutés par cette séparation. Les documents F1/F2/F3 gardés dans `docs/` sont historiques ; ce README et `docs/SEPARATION.md` priment pour les nouveaux chemins.
