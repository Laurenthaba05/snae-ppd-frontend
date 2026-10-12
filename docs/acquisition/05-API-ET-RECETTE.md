# Contrats et recette à exécuter

## Endpoints ajoutés
Préfixe `/api/v1/acquisition`, authentification existante obligatoire. Les résultats sont non cachables. Une option serveur activée ne remplace pas une permission.

| Méthode et chemin relatif | Fonction |
|---|---|
| GET /capabilities | Capacités/configuration publique pour un compte humain connecté |
| GET /imports/templates/{kind}.csv | En-têtes CSV canoniques |
| POST /imports/preview | Multipart file, kind, institutionId, departmentId, delimiter, mapping JSON facultatif ; Idempotency-Key requis |
| GET /imports/{id} | Lire un lot appartenant à l'agent |
| POST /imports/{id}/commit | Corps expectedSha256 ; reprise pilotée par l'identifiant du lot |
| POST /imports/{id}/cancel | Annuler un aperçu non validé |
| GET /imports/{id}/errors.csv | Rapport de diagnostic protégé contre les formules |
| POST /files/{fileId}/extractions | Corps ocr/language ; Idempotency-Key requis |
| GET /extractions/{id} | État, résultat et relecture autorisés |
| POST /extractions/{id}/review | Choix explicites, version attendue, motif et texte relu facultatif ; Idempotency-Key requis |
| POST /extractions/{id}/cancel | Annulation du propriétaire selon l'état |

Le frontend utilise les API existantes pour le catalogue, les versions, le dépôt géré et les reçus d'ingestion. Les POST de commit/cancel reçoivent une clé côté client, mais leur idempotence serveur est assurée par l'objet et son état ; pas de table de commande fictive supplémentaire.

Exemple de validation d'extraction, valeurs fictives :

```json
{
  "expectedDocumentVersion": 0,
  "accept": true,
  "applyTitle": true,
  "title": "Rapport relu",
  "applyDate": true,
  "documentDate": "2026-10-02",
  "publishVerifiedText": true,
  "correctedText": "Texte vérifié par l'agent.",
  "reason": "Vérification sur le document original"
}
```

Une acceptation sans champ coché enregistre seulement l'examen. Un rejet n'applique rien. Le texte corrigé ne doit pas dépasser 200 000 caractères. Une même clé avec un autre contenu provoque un conflit.

## Preuves exécutées ici
| Essai | Résultat | Limite |
|---|---|---|
| Lecteur Excel/CSV et politique d'import Kotlin | 59 scénarios réussis | Classes pures, Kotlin 1.9 local, sans Spring/PostgreSQL ; inclut les quatre vrais modèles XLSX |
| Extraction Python | 24 tests réussis | Inclut 1 vrai OCR anglais et 1 PDF texte natif synthétique ; pas de corpus français réel |
| Connecteur scanner | 19 tests réussis | NAPS2 et matériel simulés ; vraies requêtes HTTP loopback pour les contrôles d'accès |
| Interface React acquisition | 14 assertions réussies | Composants réels, API/identité fictives ; HTML injecté hors réseau, pas de CORS/TLS backend testé |
| TypeScript complet | Réussi | Dépendances hors ligne réutilisées ; pas de npm ci propre |
| Régressions frontend F3 / P1 | 16 / 14 tests réussis | Suites antérieures, non équivalentes à des tests métier connectés |
| Compilation globale Gradle | Non aboutie | DNS services.gradle.org indisponible ; pas de test Spring/JPA/HTTP |
| Migration V55 / extraction branchée au serveur / scanner réel | Non exécutés | Environnement de recette nécessaire |

Les chiffres ne s'additionnent pas en taux d'achèvement. Le journal de chaque essai se trouve dans `preuves/`. Le banc React n'est pas un bundle Vite de production. Il utilise un remplacement de crypto.randomUUID uniquement pour son origine opaque de test ; le produit continue d'utiliser la primitive du navigateur.

## Recette obligatoire en environnement isolé
1. Compiler avec les vraies dépendances, exécuter les tests unitaires et d'intégration existants, appliquer V55 avec le rôle de migration distinct. Vérifier que PUBLIC, anon et authenticated n'ont pas accès directement aux nouvelles tables sensibles.
2. Avec comptes national/institution/département et non autorisé : contrôler import, propriété des lots, confidentialité, accès par ID direct et révocation d'accès entre demande et traitement. Le contenu d'une autre institution ne doit jamais être révélé par les résultats d'extraction.
3. Importer 1 puis 500 lignes, tester un doublon interne/existant, une formule, une macro, une date invalide, un antivirus indisponible. Introduire un échec à la dernière ligne lors du commit et vérifier qu'aucune création du lot n'est persistée.
4. Rejouer la même clé, puis changer son contenu ; tester une réponse incertaine et les confirmations concurrentes. Les créations ne doivent pas se doubler.
5. Créer les notices, associer des PDF dont un est absent, un est rejeté et un reste en contrôle. Les états doivent rester exacts ; aucune « réussite globale » trompeuse.
6. Tester un PDF texte, un scan français, un PDF mixte, un TIFF multipage et un DOCX. Comparer titre/date/référence au document réel ; mesurer erreurs et omissions avant tout seuil d'automatisation.
7. Révoquer l'accès pendant l'extraction, arrêter le worker, annuler, dépasser les limites, changer la version documentaire avant validation. Rejeter/relire explicitement et vérifier l'absence de modification de l'original et des règles d'accès/conservation.
8. Avec le modèle réel de scanner : profiler NAPS2, tester vitre/chargeur/recto-verso, débranchement, papier absent, délai, relecture, dépôt et suppression locale. Tester les vrais certificats et la permission réseau local dans les navigateurs institutionnels.
9. Contrôler logs/ACL, nettoyage après crash, quotas, isolation OS et réseau du worker, monitoring, sauvegarde/restauration des nouvelles tables et résultats, puis politique de purge des données opérationnelles.

Le contrôle de livraison bloque tant que ces preuves et celles du socle P1/V13 ne sont pas établies. La présente intégration ne clôture pas les chantiers antérieurs de versement complet, transfert/destruction, sauvegarde réelle ou qualification d'horodatage.

## Rejouer les essais locaux ciblés
Dans l'environnement de test, installer Pillow depuis requirements, ainsi que ReportLab pour la fixture PDF, Playwright pour le banc visuel, Tesseract et Poppler pour les tests qui les utilisent. Les dépendances de tests ne sont pas redistribuées et leur provenance doit être revue.

```powershell
py -3 -B -m unittest discover -s .\workers -p "test_*.py" -v
py -3 -B -m unittest discover -s .\connecteur-scanner -p "test_*.py" -v
cd .\frontend
npm.cmd run typecheck
npm.cmd run test:f3
npm.cmd run test:p1
node scripts/bench-acquisition.cjs ../artifacts/acquisition-bench
py -3 scripts/test_acquisition_browser.py --bench ../artifacts/acquisition-bench --proofs ../artifacts/acquisition-browser
```

La suite Python marque des tests OCR/PDF « skipped » si les outils manquent : ne pas présenter ces tests comme exécutés. Le lecteur Kotlin est raccordé à JUnit via AcquisitionPolicyTest ; les quatre modèles sont aussi vérifiés par la sonde autonome lorsqu'on lui passe le dossier `modeles`.
