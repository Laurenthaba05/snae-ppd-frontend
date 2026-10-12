# Livraison indépendante — frontend

Base : v13.1.0-rc1. Rangement : separe-1.

Le projet est utilisable comme racine de dépôt distincte ; aucun accès à un dossier frère n’est nécessaire pour trouver ses sources. Les services communiquent par leurs API et nécessitent toujours les configurations explicites de recette.

Le code applicatif, les migrations et les verrous déjà présents ne sont pas réécrits. Les modifications de rangement sont recensées dans `preuves/separation-changes.json`. Les vérifications du présent travail, lorsqu’elles sont exécutées, sont dans `preuves/separation-tests.json`. Les autres logs et résultats antérieurs sont historiques.

Le contrôle `outils/check_package.py` compare une livraison vierge au manifeste et ne démarre aucun service. Le manifeste ne constitue ni une signature institutionnelle ni une garantie de sécurité. Les fichiers créés pendant l’installation seront signalés comme ajouts ; utiliser une copie vierge pour comparer, sans effacer les données de travail.

La compilation complète, le démarrage intégré, les bases, la rotation des secrets et le matériel ne sont pas validés par cette séparation. Les fonctions avancées de numérisation proposées ultérieurement ne sont pas implémentées ici.

Source ZIP SHA-256 : `9c0d6d84dc3dbdc2a5706d437187a5c48417a3a326c85abc2fced3b3de3fa56b`.
