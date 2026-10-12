# Contrats IAM utilisés

Base inspectée : `snae-ppd-backend-v12.1(1).zip`, SHA-256 `ee76c1f88169400bb28c8cd5057085704867f061d63e87ac57db9971034bb8b1`. Seuls les fichiers de sources et ressources du projet racine ont été extraits pour le contrat, sans IDE, Git, worktrees ou secret. Aucune source du backend n’est redistribuée dans le frontend.

Sources de référence sous `src/main/kotlin/gn/gouv/snaeppd/identity/` : `api/IdentityController.kt`, `api/IdentityGovernanceController.kt`, les DTO/services de vues et commandes. Les protections de périmètre et d’élévation de privilèges restent dans le backend. Le dernier journal JUnit remonté dans la conversation est un journal antérieur ; il n’est pas présenté comme un nouveau résultat de build.

## Routes reliées aux écrans

Préfixe commun `/api/v1/iam` ; objets JSON directement retournés, sans inventer une enveloppe `data`.

| Routes | Écran |
|---|---|
| GET /me | Connexion, espace de travail, droits, menus |
| GET/POST /institutions, GET/PUT /institutions/{id}, POST /{id}/status | Référentiel institutions |
| GET/POST /departments, GET/PUT /departments/{id}, POST /{id}/status | Départements dans une institution explicite |
| GET/POST /users, GET/PUT /users/{id}, POST /{id}/status, POST /{id}/revoke-tokens | Identités |
| GET/POST /roles, GET/PUT /roles/{id}, POST /{id}/status | Catalogue des rôles |
| GET /permissions, GET/PUT /roles/{id}/permissions | Permissions et configuration directe d’un rôle non utilisé |
| GET /users/{id}/role-assignments, POST /role-assignments, POST /role-assignments/{id}/revoke | Attributions |
| GET /users/{id}/delegations, POST /delegations/{id}/revoke | Historique et révocation des délégations |
| GET /roles/{id}/impact, GET/POST /roles/{id}/permission-changes | Gouvernance par rôle |
| GET /permission-changes/{id}, POST /{id}/approve, /reject, /cancel | Demandes et décision indépendante |
| GET /users/{id}/access-summary | Profil/synthèse des accès |

La méthode client `departmentImpact` est préparée, mais son écran dédié ne fait pas partie de la recette F1. Le backend n’expose pas de boîte globale de toutes les demandes de permissions : le frontend exige un rôle et n’invente pas `/permission-changes` en liste globale.

## Noms et invariants transportés

- Lectures paginées : `{items, page, size, hasMore}`. Filtres d’institution/département avant l’appel. Les filtres de nom/statut de F1 portent sur la page déjà chargée, pas sur toute la base.
- Utilisateur en réponse : `accountType`, `scope`, `institutionId`, `departmentId`, `ssoId`, `status`, `version`.
- Inscription : `typeCompte`, `scope`, `institutionId`, `departmentId`, `ssoId`, `nom`, `prenom`, `email` ; pas `password`, pas `createdBy`.
- Attribution : `utilisateurId`, `roleId`, `scope`, `institutionId`, `departmentId`, `dateDebut`, `dateFin`, `motif`.
- Mise à jour : `expectedVersion` lue dans la fiche + `reason`.
- Proposition : `expectedRoleVersion`, liste complète `permissionIds`, `reason`.
- Résolution : `expectedVersion` de la demande, pas celle du rôle, + `reason`.
- Les UUID sont validés côté client ; le serveur tranche leur existence, les rattachements et les droits. Les dates de formulaire sont converties en ISO UTC. Un début vide reste null et laisse l’heure au backend.

Une commande préparée conserve sa clé lors d’un rejeu identique tant que la modale reste ouverte. Changer réellement son contenu est une nouvelle intention. Après fermeture/rechargement, aucune clé n’est persistée : en cas de réponse incertaine, relire la ressource avant de recommencer. Les conflits 409 ne sont pas corrigés par la génération aveugle d’une clé neuve.

`/me` contient des grants contextualisés ; ce ne sont pas des rôles choisis dans un JWT non vérifié. Les gardes de menu/bouton sont des indications ergonomiques, pas la sécurité du serveur. Si /me indique `truncated`, les droits affichés et les menus peuvent être incomplets ; les demandes autorisées restent à valider auprès du backend.

## Hors périmètre

Aucune création de compte chez le fournisseur SSO, aucun amorçage automatique du premier administrateur, aucune modification de SQL/migration, aucune suppression d’archives, aucune API documentaire de lecture inventée. La création/réémission des délégations, la modification de portée de compte et la gouvernance institutionnelle plus large suivront un autre lot.
