# Changements, provenance et limites

Le backend complet V13.0.0-rc1 est conservé, sauf les modifications recensées dans `preuves/changes.json`. Les 54 migrations antérieures restent identiques. V55 est la seule nouvelle migration. Aucun environnement privé ni contenu réel n'est ajouté.

Ajouts : huit fichiers Kotlin d'acquisition (contrôleur, politiques, lecteur, services, file de traitement), migration, tests de politique, worker Python et son test, connecteur local et son test, modèles, page/API/CSS frontend, route/navigation et documentation.

Corrections existantes : portée institution/département et re-verrouillage cohérent des commandes OCR ; journaux OCR limités aux références et tailles plutôt qu'au texte complet ; sélecteur documentaire avec périmètre et recherche serveur ; conservation du filtre entre pages ; libellés explicites des champs d'acquisition pour l'accessibilité. Ces changements nécessitent une régression connectée, pas seulement le succès de TypeScript.

Non livré comme terminé : compilation globale, JAR, bundle Vite de production, test SQL de V55, scanner physique, installation signée du connecteur, certificats institutionnels, OCR français sur corpus, travailleur durci en bac à sable, catalogue global des imports/extractions, purge automatisée, éditeur de correspondance de colonnes, mise à jour en masse d'objets existants, traitement massif illimité, classification métier fondée sur un modèle entraîné, fichiers PDF/A dérivés et reconnaissance fiable du manuscrit.

Les documents de l'ancien socle restent utiles pour le build, l'isolation, le SSO et le stockage. En cas de divergence, les guides `docs/acquisition/` et le README actuel prévalent pour ce nouveau module. `historique/` conserve les rapports/états antérieurs, qui ne valent pas résultats de la présente version.

## Références primaires consultées le 2 octobre 2026
- NAPS2 CLI : https://www.naps2.com/doc/command-line — profils, pilote, source, résolution et paramètres fixes.
- Tesseract CLI : https://tesseract-ocr.github.io/tessdoc/Command-Line-Usage.html — langue, TSV et modes de reconnaissance.
- Chrome Local Network Access : https://developer.chrome.com/blog/local-network-access — contraintes navigateur pour loopback/réseau local.
- OWASP File Upload Cheat Sheet : https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html — contrôle d'accès, limites, scan et stockage des fichiers non fiables.
- Pillow : https://pillow.readthedocs.io/en/stable/releasenotes/12.3.0.html — version de dépendance choisie ; cela ne vaut pas audit exhaustif de sécurité du déploiement.

Les documentations d'éditeurs décrivent les outils. Les preuves de fonctionnement du lot sont uniquement les sources et les essais explicitement exécutés, avec leur périmètre.
