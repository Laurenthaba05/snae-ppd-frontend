# Contrats V13 à intégrer au frontend

Ce ZIP ne modifie pas le frontend F3. Les nouvelles routes sont additives ; les autorisations de workflow et de rattachement sont renforcées. Les écrans doivent présenter les erreurs au lieu de rester en attente. `docs/api/routes.json` contient l'inventaire statique complet ; `parcours-v13.http` contient des exemples de requêtes de recette.

## 1. Documents d'un dossier

`GET /api/v1/dossiers/{id}/documents?page=0&size=20&q=rapport`

Réponse : `items`, `page`, `size`, `hasMore`. Pas de total global. La notice parente exige `DOSSIER_READ` et son habilitation de confidentialité. Chaque pièce exige `DOCUMENT_READ`, son périmètre, sa confidentialité et l'absence de restriction active. Ce filtrage intervient avant `LIMIT`. Les pièces cachées ne sont pas incluses dans le total d'une page.

Un dossier visible mais sans pièces accessibles renvoie une page vide ; un dossier non visible est masqué par `404`. Les archives uniquement physiques ne sont pas transformées en fichiers fictifs. Les liens vers de nouvelles pièces restent dans Versements.

## 2. Recherche dans les listes

Les `GET /documents` et `/dossiers` existants acceptent désormais `q`. La recherche porte uniquement sur le titre et la référence, pas sur le texte OCR. Limite : 200 caractères ; caractères `%` et `_` traités comme texte, pas comme jokers SQL. Conserver `institutionId` ET `departmentId` dans les sélecteurs. Une habilitation départementale ne devient pas nationale pour contourner un refus.

Pagination bornée : taille 1–100, page 0–1 000 000. Une page énorme n'est pas une méthode recommandée d'export ; les grands volumes nécessitent une recette de performances et éventuellement une pagination par curseur.

## 3. Correction contrôlée d'une description

`PUT /api/v1/documents/{id}/description`

```json
{
  "expectedVersion": 3,
  "title": "Rapport annuel corrigé",
  "description": "Description vérifiée",
  "documentDate": "2026-01-20",
  "reason": "Correction d'une erreur de saisie"
}
```

`PUT /api/v1/dossiers/{id}/description` emploie `expectedVersion`, `title`, `subject`, `description`, `reason`.

**Il s'agit du remplacement de la section descriptive, pas d'un PATCH partiel.** Un champ nullable omis devient `null` et efface sa valeur. Préremplir le formulaire avec la dernière réponse GET et envoyer toute la section. `expectedVersion` ne peut pas être omis ; ne pas utiliser systématiquement zéro. Le serveur verrouille la notice, vérifie cette version, trace le motif et publie l'événement d'indexation.

Droits nécessaires : `DOCUMENT_READ` + `DOCUMENT_DESCRIPTION_UPDATE`, ou les deux équivalents dossier, dans le périmètre de l'objet et avec ses restrictions. Ces deux droits nouveaux ne sont accordés automatiquement à aucun rôle par V54.

Ce parcours concerne les notices ouvertes (`BROUILLON` / `ACTIF`) non closes, non détruites. Il ne corrige pas directement les descriptions d'archives closes/définitives : cette procédure supervisée reste à définir. Les références, provenance, niveaux d'accès, durées et fichiers ne sont pas modifiés par ces endpoints.

| Réponse | Comportement écran |
|---|---|
| 200 | Réafficher la version retournée, pas une copie locale supposée à jour |
| 400 | Corriger les champs obligatoires/types |
| 404 | Ne pas révéler l'existence d'une notice non accessible |
| 409 `DESCRIPTION_VERSION_CONFLICT` | Relire et comparer, sans écraser silencieusement |
| 422 `DESCRIPTION_LOCKED` | Expliquer que la correction directe n'est plus autorisée |
| Timeout / état incertain | Relire avant répétition ; pas de rejeu automatique |

Les réponses document/dossier ajoutent les champs descriptifs et, pour le dossier, `versionLock`. Le frontend doit lire les champs reçus plutôt qu'inventer un numéro de version.

## 4. Corbeille de tâches documentaires

`GET /api/v1/workflow-tasks/inbox?bucket=AVAILABLE&page=0&size=20`

`bucket=MINE` retourne les tâches en cours prises par l'utilisateur ; `AVAILABLE` les tâches ouvertes qu'il est autorisé à prendre. Les filtres institution/département sont facultatifs et restreignent davantage le résultat. Le contrôle réel s'applique à chaque ligne : lecture du document, lecture du workflow, rôle affecté actif dans le bon périmètre, habilitation de confidentialité et droit de prise en charge/achèvement.

Chaque ligne expose `id`, `instanceId`, `stepId`, `stepLabel`, `status`, `dueAt`, `documentId`, `documentReference`, `documentTitle`. Les instances annulées ou tâches d'anciennes étapes ne sont pas proposées. Il n'y a pas de compteur national caché ni de notifications push. Ce n'est pas la corbeille universelle de tous les modules.

## 5. Afficher les décisions sans saisir des codes

Après `POST /workflow-tasks/{taskId}/claim`, appeler `GET /workflow-tasks/{taskId}/actions`.

Réponse : `taskId`, `stepLabel`, `canCompleteFinal`, `options`, `advisory=true`. Une option contient `transitionCode`, `label`, `enabled`, `blockedReason`. Les libellés proviennent des étapes de destination ; le backend n'invente pas que tel code signifie « approuver » ou « refuser ». Pour une étape finale, `canCompleteFinal=true` et la liste est vide.

La liste est indicative. `POST /workflow-tasks/{taskId}/complete` reste la seule commande d'achèvement et réévalue les conditions/actions. Une condition changée, une restriction nouvelle ou des métadonnées incomplètes peuvent donc encore bloquer la commande. Ne pas exécuter les actions dans un GET ni convertir une erreur d'évaluation en succès.

## 6. Versements et compatibilité

Les contrats `/archival-intake/entries` restent `OUVERTE` / `CLOTUREE`. Le backend vérifie maintenant les droits des documents/dossiers/archives physiques rattachés et refuse le rattachement à une entrée fermée avant la contrainte SQL. Le code d'erreur applicatif de ce cas devient `ARCHIVAL_INTAKE_ALREADY_CLOSED` (409) ; la contrainte SQL indépendante reste en place.

Le frontend ne doit pas traduire `CLOTUREE` par « admis et intégré au SAE », ni générer une preuve d'admission inexistante. Un archiviste avec des droits d'entrée mais sans droits de lecture sur la pièce ne peut plus la rattacher arbitrairement.
