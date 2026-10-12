# SNAE-PPD v13.1 — Projets séparés

La révision `separe-1` répartit les sources dans trois projets. Elle n’ajoute pas de fonction métier et ne constitue pas une validation de production.

```text
C:\Dev\snae-ppd-backend\     API Kotlin/Spring, migrations, outils, worker d’extraction
C:\Dev\snae-ppd-frontend\    application React/TypeScript/Vite
C:\Dev\snae-ppd-scanner\     connecteur local du poste de numérisation
```

`C:\Dev` est ici un répertoire de travail générique, pas un projet commun. Les projets peuvent aussi se trouver sur des disques différents. Aucun n’a besoin de lire les sources de l’autre pour être construit. Le frontend a évidemment besoin de joindre l’API pour les fonctions connectées.

## Fichiers à utiliser

- `SNAE-PPD-Backend-v13.1-Separe.zip` → racine `snae-ppd-backend`.
- `SNAE-PPD-Frontend-v13.1-Separe.zip` → racine `snae-ppd-frontend`.
- `SNAE-PPD-Scanner-v13.1-Separe.zip` → racine `snae-ppd-scanner`, seulement sur le poste avec scanner.

Décompresser chacun séparément. Ne pas déposer l’un dans l’autre et ne pas écraser une installation existante. Vérifier qu’il n’y a pas une racine dupliquée du type `snae-ppd-backend\snae-ppd-backend`.

## Contrôles initiaux — sans démarrage de service

```powershell
cd "C:\Dev\snae-ppd-backend"
py -3 .\outils\check_package.py
Test-Path .\gradlew.bat

cd "C:\Dev\snae-ppd-frontend"
py -3 .\outils\check_package.py
Test-Path .\package.json
```

Pour le scanner, le même contrôle se lance depuis son dossier séparé. `manifestErrors` doit être vide et `Test-Path` doit afficher `True`. Ce contrôle porte sur la copie vierge avant installation ou création de fichiers privés ; il ne démarre ni base ni serveur et ne prouve pas la sécurité complète.

## Compilation et lancement : une console par projet

Le backend se compile avec son Wrapper Gradle ; il n’exige pas Node/npm. Commencer par son `docs/BUILD.md` : les références réelles de dépendances restent à générer et à revoir avant `clean check bootJar`. Le lanceur `outils/local_recette.py` a été adapté pour utiliser les fichiers à sa propre racine. L’extraction reste dans `workers/` côté serveur. Les noms de volumes et ports V13 sont conservés : ne pas lancer simultanément l’ancienne copie et la nouvelle. Un nouveau `init` ne peut pas modifier les mots de passe de volumes PostgreSQL existants ; contrôler leur cohérence avant de démarrer.

Le frontend s’installe avec son propre `package.json` et son lock, conservés à l’identique. Lire son README pour les versions exactes, puis utiliser `npm.cmd ci` et les tests. Le mode démonstration est distinct du mode connecté. Le build connecté exige un fournisseur d’identité explicite.

## Liaison réseau, pas liaison de dossiers

Dans la configuration publique du frontend :

```dotenv
VITE_API_BASE=/api/v1
DEV_BACKEND_TARGET=http://127.0.0.1:8080
```

Le serveur Vite de développement utilise 127.0.0.1:5173 et relaie `/api` vers le backend. Les permissions, le JWT/SSO et la configuration de stockage restent requis pour les parcours métier. Ne pas mettre une URL absolue dans `VITE_API_BASE` ni un mot de passe serveur dans `VITE_*`. En production, le serveur web doit assurer le routage `/api` : le proxy de développement Vite ne fait pas partie des fichiers statiques.

Le scanner utilise son connecteur local sur 127.0.0.1:8765 avec la sécurité HTTPS/origine/jumelage existante ; suivre son guide avant tout essai matériel.

## Vérifications et limites

Les sources `src` des deux applications, les 55 migrations, le fichier de build Gradle, le manifeste npm et son lock sont préservés. Les chemins des lanceurs, la CI et les instructions sont adaptés au découpage. Les régressions des outils Python, le contrôle de la configuration frontend et le connecteur simulé ont été exécutés ; leurs journaux sont dans `preuves/separation-*` de chaque paquet.

La compilation complète, le démarrage avec tous les services et le scanner physique ne sont pas validés par cette livraison. Aucun mot de passe réel n’est fourni ni changé chez un fournisseur. Les données de production et l’installation actuelle sont laissées intactes. Les fonctions avancées de lots de numérisation, pages manquantes et QR restent un travail distinct.
