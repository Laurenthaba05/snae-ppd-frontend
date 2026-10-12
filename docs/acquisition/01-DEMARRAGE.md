# Acquisition — installation de l’interface séparée

Commencer par `../../README.md` dans ce dépôt. Exécuter `npm` à la racine de `snae-ppd-frontend`, jamais dans le backend.

La route est `/app/acquisition`. La base API reste `/api/v1` et le proxy de développement utilise `DEV_BACKEND_TARGET`. Le serveur, l’authentification, le stockage privé, l’antivirus, les nouvelles permissions et les fonctions d’acquisition doivent être configurés dans **le projet backend séparé** avant la recette interactive.

Les imports et l’extraction sont désactivés par défaut dans le serveur. Les activer uniquement après validation des prérequis et des permissions. Le mode démonstration n’exécute pas d’OCR, de scan physique ou d’import métier réel.

Les modèles Excel/CSV sont disponibles dans `modeles/` à la racine de ce frontend. Les documents `02-IMPORTS.md`, `04-EXTRACTION.md` et `05-API-ET-RECETTE.md` décrivent les contrats et limites de v13.1. Certains chemins d’implémentation y désignent l’autre dépôt ; ce sont des références documentaires, pas des dépendances locales.

La configuration du scanner se trouve dans le troisième paquet `snae-ppd-scanner`. Le worker d’extraction s’installe côté backend, pas dans ce frontend.
