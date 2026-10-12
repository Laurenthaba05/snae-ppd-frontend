# SNAE-PPD — Audit frontend/backend et refonte F3

**Livraison de conception et de recette · 1er octobre 2026**  
Périmètre : les deux ZIP fournis dans cette conversation. Cette livraison n’est pas une certification d’accessibilité, de sécurité, de conformité juridique ni de mise en production.

## 1. Conclusion

Le projet contient déjà un socle applicatif conséquent. La meilleure évolution n’est pas d’ajouter davantage de cartes, de slogans et d’illustrations : il faut rendre l’interface fidèle aux capacités du serveur et centrée sur les opérations réelles. L’interface précédente confond parfois un parcours cible avec une fonction exécutable.

La F3 proposée conserve l’identité visuelle institutionnelle, réduit la navigation affichée, introduit de véritables onglets contextuels pour la fiche documentaire, rend explicites les états serveur et fournit un atlas de 42 parcours avec issues normales et exceptions. Une partie des composants connectés a été améliorée ; la livraison ne prétend pas réimplémenter tous les modules ni corriger toute la sécurité serveur.

**Point de vigilance principal : une entrée clôturée n’est pas un versement officiellement admis ; une ingestion terminée n’est pas une archive définitivement conservée.**

## 2. Méthode et périmètre vérifié

Les ZIP ont été extraits pour inspection de leurs sources. Les copies historiques, `.claude/worktrees`, les sorties `build`, `.git`, les dépendances `node_modules` et `dist` ne sont pas considérées comme de nouvelles fonctionnalités du code racine. Les recherches documentaires n’indexant pas le contenu des ZIP, l’analyse a porté directement sur les fichiers montés.

Inventaire du backend racine : **21 contrôleurs, 253 déclarations de routes HTTP, 53 migrations SQL V1 à V53**. Les 16 clients API et les écrans du frontend fourni ont été comparés à ces contrats, notamment pour les dossiers, documents, entrées, workflows, droits et conservation. Les DTO, services et règles déterminants ont été examinés pour interpréter les actions et états. L’inventaire de routes est une extraction statique ; il n’est ni un OpenAPI complet ni la preuve qu’un endpoint fonctionne en exploitation.

Les 42 parcours se répartissent en **26 parcours à contrat présent, 13 parcours partiels et 3 parcours cibles**. « Contrat présent » signifie que le code expose les contrats cités ; cela ne signifie pas que toutes les pages sont terminées, que toutes les permissions ont été testées en intégration, ni que l’installation est prête pour la production.

Les références HTTP du catalogue ont toutes été comparées aux routes extraites, avec normalisation des noms de paramètres de chemin. Le nom `v12.1` du ZIP et les versions mentionnées dans les anciens README ne suffisent pas à identifier les capacités réelles.

Aucune connexion au PostgreSQL distant, au fournisseur SSO, à un antivirus, à un service d’horodatage ou à une archive réelle n’a été effectuée. Aucun secret ni fichier `.env.local` fourni n’a été réutilisé dans le prototype.

## 3. Écarts et décisions de conception

### P0 — Versement : un circuit complet a été dessiné, pas implémenté

**Constat.** Le domaine courant possède OUVERTE/CLOTUREE. Les routes créent, lisent, lient et clôturent une entrée. Il manque le contrat métier de soumission, décision d’admission, intégration confirmée, inventaire du contenu et bordereau probant.

**Décision.** Montrer « Entrées archivistiques » ; conserver l’admission complète dans un parcours cible. Ne pas afficher « intégré » après /close.

Sources : S01, S02.

### P0 — Destruction et transfert ne sont pas exécutables

**Constat.** RetentionPolicy bloque ELIMINER et TRANSFERER. Le champ enum et la proposition de décision ne prouvent pas une capacité d’exécution. Le réexamen dispose de son traitement distinct.

**Décision.** Lire /readiness et ses causes ; aucune suppression, certificat ou transfert simulé en connecté. Compléter l’exécution seulement avec les mécanismes de stockage et de remise nécessaires.

Sources : S03.

### P0 — Une entrée, une ingestion et une archive ne partagent pas le même statut

**Constat.** Le document distingue statut métier, cycle archivistique, confidentialité et diffusion. Version, scellement, fichier, antivirus et ingestion ont leur propre état.

**Décision.** Afficher un état principal contextualisé puis les autres axes dans la fiche. Ne pas assimiler COMPLETED, CLEAN, VALIDE et ARCHIVE_DEFINITIVE.

Sources : S04, S10.

### P1 — La démonstration initiale peut enseigner un workflow faux

**Constat.** Le composant générique avance dans une liste de libellés. Des branches alternatives deviennent des étapes successives, notamment autorisation et refus.

**Décision.** Retirer ce simulateur des routes de démonstration actives. Utiliser des parcours explicites, avec décisions alternatives et résultat attendu.

Sources : S08.

### P1 — La fiche documentaire est trop longue et charge trop de domaines

**Constat.** La fiche initiale monte successivement versions, acteurs, publication, rétention et d’autres panneaux. Certains appels sont initiés avant la décision visuelle de permission.

**Décision.** Onglets contextuels ; montage des panneaux sélectionnés ; vérification de visibilité avant montage ; aucune autorisation déduite du simple titre d’administrateur.

Sources : S07, S09.

### P1 — Le backend a plus de capacités que ne le disent certains guides

**Constat.** Le code racine contient V53 et les endpoints fonds, autorités, imports CSV, export EAD/EAC, ainsi que des lectures documentaires et d’autres modules.

**Décision.** Utiliser le code et ses contrats comme référence de cette livraison, pas le nom du ZIP ou un ancien README. Vérifier chaque route et DTO avant raccordement.

Sources : S05.

### P1 — OCR et scanner sont confondus avec leur suivi

**Constat.** Les routes de numérisation gèrent projets, éléments, contrôles et résultats OCR. Aucune commande générale de pilotage scanner ou de lancement d’un moteur OCR n’a été identifiée dans les contrôleurs inventoriés.

**Décision.** Présenter « Enregistrer / valider un résultat OCR », pas « OCR exécuté ». Prévoir un connecteur et des jobs si ces capacités sont ajoutées.

Sources : S13.

### P1 — Certains écrans demandent des identifiants techniques à l’utilisateur

**Constat.** Des formulaires de rattachement et de commande demandent UUID ou code de transition. Les libellés et actions contextualisés doivent provenir de listes autorisées ou de contrats enrichis.

**Décision.** Sélecteurs contextuels, références métier lisibles, UUID repliés. Les choix proposés doivent respecter le périmètre serveur.

Sources : S11, S14.

### P1 — Les erreurs de commande ne sont pas homogènes

**Constat.** Certaines actions, dont la clôture d’entrée initiale, n’affichent pas leurs échecs. Des clés de requête nouvelles sont parfois générées à chaque clic.

**Décision.** Distinguer refus, conflit, validation et succès incertain ; conserver la même intention seulement sur les contrats réellement idempotents ; relire avant de répéter.

Sources : S11.

### P1 — Publication ne signifie pas portail public déployé

**Constat.** L’API de publication gère des objets et une visibilité. Le filtre de sécurité reste authentifié hors endpoints techniques publics observés.

**Décision.** Ne pas inventer une URL publique d’archive. Traiter portail public, anonymisation, dérivés, index et droits comme un chantier de diffusion séparé.

Sources : S15.

### P2 — Les indicateurs et la corbeille globale de tâches restent incomplets

**Constat.** Les routes de workflow sont centrées sur une définition, un document ou une instance. Aucun contrat agrégé Mes tâches/notifications/compteurs nationaux complet n’apparaît dans l’inventaire.

**Décision.** Accueil orienté opérations sans chiffres fabriqués. Ajouter des APIs paginées et filtrées par habilitation pour la corbeille et les compteurs.

Sources : S14.

### P2 — Les fichiers livrés ne constituent pas une installation reproductible ici

**Constat.** Le frontend contient des dépendances natives Windows. Node local 22.16.0 ne satisfait pas la plage engines déclarée. Une tentative de build échoue ; le contrôle TypeScript, lui, passe.

**Décision.** Distribuer sources + lockfile, sans node_modules, sans .env.local ni .git. Réinstaller proprement dans l’environnement cible et effectuer la recette réelle.

Sources : S12.

## 4. Design cible : sobre et opérationnel

### Structure de navigation

La navigation principale est regroupée en neuf espaces repliables : Mon espace, Versements, Archives, Traitements, Accès & diffusion, Conservation, Patrimoine, Administration, Aide & parcours. Un seul groupe est ouvert à la fois. La visibilité en mode connecté dépend des habilitations et du périmètre sélectionné, pas d’un nom de métier supposé.

L’agent voit prioritairement ses opérations documentaires ; l’archiviste accède au classement, à la description et aux traitements autorisés ; l’administrateur configure l’organisation et les habilitations ; l’auditeur consulte les événements autorisés. Ces personas sont des modèles de conception, pas de nouveaux rôles imposés au backend. Le rôle national d’administration ne doit pas conférer implicitement un droit sur les archives confidentielles.

### Grammaire d’écran

Chaque écran présente un intitulé, une courte explication, une action principale et une zone de travail. Une liste affiche les critères utiles, un nombre de résultats dont la portée est claire et une pagination. Le détail s’ouvre avec contexte et référence. Les actions avancées sont regroupées ou repliées. Les instructions juridiques, taux d’intégrité, délais et nombres de documents ne sont jamais fabriqués pour remplir l’écran.

L’accueil privilégie six points d’entrée métier maximum, sans faux compteurs. Les notifications et les métriques devront provenir d’API dédiées, avec leur périmètre et leur date d’observation. L’écran ne doit pas télécharger tous les objets pour reconstituer des statistiques globales.

### Fiche documentaire

La fiche utilise les onglets Description, Fichiers & versions, Traitement, Accès & diffusion, Conservation et Historique, sous réserve des droits disponibles. Le panneau de l’onglet actif est monté à la demande. L’onglet Historique n’appelle pas l’audit lorsque l’utilisateur ne dispose pas de la permission correspondante.

Le titre et la référence métier restent visibles. Le cycle archivistique et la confidentialité sont affichés séparément. La description comporte le producteur et le classement. Les fichiers distinguent original, maître, dérivé de consultation et dérivé public. Les preuves et identifiants techniques sont secondaires. Un dossier sans endpoint complet de contenu ne doit pas montrer une liste fictive de pièces.

### Création et décision

Les formulaires utilisent les référentiels autorisés existants, demandent les champs réellement requis et placent les détails facultatifs dans une section secondaire. Une référence automatique n’est annoncée que si le serveur la génère réellement. Un formulaire long doit conserver son intention et expliquer une reprise ; il ne doit pas multiplier les créations après un délai réseau.

Une décision sensible indique l’objet, l’effet attendu, les prérequis, le motif lorsqu’il existe dans le contrat et le besoin de validation indépendante. Une réponse incertaine n’est ni une réussite ni un échec définitif : l’utilisateur est invité à relire l’état avant de recommencer.

### Système graphique

Fond clair `#F4F7F6`, surfaces blanches, navigation vert profond `#0C2D25`, texte principal `#182C30`, couleur primaire `#123E32`, bordures `#DCE5E2`, or discret pour les repères, pas pour tout le menu. Rayons de 7 à 12 px ; marges de 16 à 32 px ; typographie système avec repli Segoe UI/Arial. Aucun fichier de police n’est livré.

La hiérarchie repose sur la taille, les espacements et les libellés plutôt que sur une accumulation de couleurs. Les icônes sont accompagnées d’un texte. Pas de portrait inventé, de photo de palais en grand fond, de données ministérielles fictives présentées comme réelles, ni d’emblème prétendument homologué.

### Mobile et accessibilité

Sous 720 px, la navigation devient un panneau avec fermeture au clavier. Les formulaires passent en une colonne ; les tableaux conservent un défilement local sans faire déborder toute la page. Le focus est visible, les boutons ont des noms accessibles et les onglets prennent en charge les flèches, Début et Fin.

La cible proposée est WCAG 2.2 niveau AA : navigation clavier, contrastes, visibilité du focus, erreurs compréhensibles et annonces d’état. Les tests visuels exécutés ne suffisent pas à attester cette conformité. Un contrôle complet avec lecteur d’écran, zoom, contraste sur toutes les combinaisons et parcours réels reste nécessaire. Référence : W3C WCAG 2.2, recommandation du 12 décembre 2024, consultée le 1er octobre 2026.

## 5. Matrice fonctionnelle et intégration

### Identité & organisation

**Écran et informations :** Institution, département, utilisateur SSO, rôle, permission, délégation, approbation.

**Parcours :** Catalogue → fiche → action contrôlée ; changer de périmètre explicitement.

**Contrat et limites :** Contrats présents ; IAM_USER_MANAGE et habilitations fines. Provisionnement SSO distinct de création de compte applicatif.

**Références dans l’atlas :** P01–P07.

### Entrées / versements

**Écran et informations :** Numéro fourni, mode, date, provenance et références disponibles.

**Parcours :** Liste → créer → rattacher → relire → clôturer.

**Contrat et limites :** National ARCHIVAL_INTAKE_READ/MANAGE. Admission complète et bordereau restent à développer.

**Références dans l’atlas :** P08–P11.

### Documents

**Écran et informations :** Référence, titre, type, institution, département, dossier, classe, axes de statut.

**Parcours :** Liste sobre → fiche à onglets → fichiers ou opération habilitée.

**Contrat et limites :** DOCUMENT_READ/CREATE. Pas de modification libre d’un original archivé ; pas de suppression directe.

**Références dans l’atlas :** P12–P14, P21.

### Dossiers

**Écran et informations :** Référence, titre, rattachement, dates et statut.

**Parcours :** Catalogue → notice → clôture selon prérequis.

**Contrat et limites :** Lire la notice n’équivaut pas à disposer de la liste de tous les documents du dossier : contrat de relation à compléter.

**Références dans l’atlas :** P15.

### Fonds & producteurs

**Écran et informations :** Niveaux fonds/série/dossier/pièce, parent, producteur et provenance.

**Parcours :** Arbre → description → autorité ; import avec prévisualisation.

**Contrat et limites :** ARCHIVAL_DESCRIPTION_READ/MANAGE. CSV previewHash ; EAD/EAC disponibles sans certification de conformité revendiquée.

**Références dans l’atlas :** P16–P17.

### Plan de classement

**Écran et informations :** Code, libellé, parent, institution, état.

**Parcours :** Parcourir → créer/activer → rattacher au document.

**Contrat et limites :** CLASSIFICATION_READ/MANAGE et DOCUMENT_CLASSIFY ; ne pas confondre organigramme et classement.

**Références dans l’atlas :** P18.

### Métadonnées

**Écran et informations :** Schéma, version, champs, valeurs documentaires.

**Parcours :** Configurer → afficher schéma du document → renseigner → valider.

**Contrat et limites :** METADATA_SCHEMA_MANAGE et DOCUMENT_METADATA_READ. Le formulaire doit suivre le schéma serveur.

**Références dans l’atlas :** P19.

### Recherche & lecture

**Écran et informations :** Texte, type de cible, page ; fichier et version sélectionnés.

**Parcours :** Rechercher → résultat autorisé → notice → contenu.

**Contrat et limites :** SEARCH_READ puis contrôle document/fichier. Le téléchargement et l’aperçu passent aujourd’hui par le même endpoint de contenu.

**Références dans l’atlas :** P20–P21.

### Circuits de validation

**Écran et informations :** Définition, étapes, transitions, affectation, état de tâche.

**Parcours :** Configurer le circuit ; puis prendre en charge et décider depuis le document.

**Contrat et limites :** WORKFLOW_DEFINITION_MANAGE / WORKFLOW_READ et capacités d’exécution. Les transitions disponibles doivent être exposées pour une UX sans codes techniques.

**Références dans l’atlas :** P22–P24.

### Numérisation

**Écran et informations :** Projet, source papier, élément, fichiers liés, clôture.

**Parcours :** Projet → éléments → import → contrôle → résultat.

**Contrat et limites :** DIGITIZATION_READ/MANAGE national dans le contrat courant ; scanner matériel absent.

**Références dans l’atlas :** P25.

### OCR & qualité

**Écran et informations :** Résultat OCR, langue, confiance, contrôle et motif.

**Parcours :** Enregistrer le résultat externe → comparer → corriger → valider.

**Contrat et limites :** Suivi de résultat et contrôle présents. Pas d’exécution OCR prouvée ; score de confiance ≠ taux de justesse garanti.

**Références dans l’atlas :** P26–P27.

### Consultations

**Écran et informations :** Référence cible, motif, demandeur, décision.

**Parcours :** Déposer → prendre en charge → autoriser OU refuser.

**Contrat et limites :** L’autorisation d’une demande n’ajoute pas automatiquement les permissions de lecture du fichier.

**Références dans l’atlas :** P28.

### Communications

**Écran et informations :** Bénéficiaire, demande liée, lieu, remise et retour.

**Parcours :** Créer → remettre → restituer.

**Contrat et limites :** Contrats présents ; la communication physique n’est pas un téléchargement.

**Références dans l’atlas :** P29.

### Droits & diffusion

**Écran et informations :** Source juridique, restriction, visibilité, canal, licence.

**Parcours :** Renseigner → vérifier → autoriser/lever ; publier/retirer.

**Contrat et limites :** RIGHTS_READ national ; PUBLICATION_READ/MANAGE scoped. Portail public non livré.

**Références dans l’atlas :** P30–P31.

### Conservation & sort final

**Écran et informations :** Règle, déclencheur, durée, échéance, disposition, blocages.

**Parcours :** Planifier → proposer → valider indépendamment → lire readiness.

**Contrat et limites :** Conservation définitive et réexamen selon actions réelles ; destruction et transfert bloqués.

**Références dans l’atlas :** P32–P33.

### Gels

**Écran et informations :** Objet concerné, référence, motif, début et levée.

**Parcours :** Ouvrir → constater les impacts → lever.

**Contrat et limites :** LEGAL_HOLD_MANAGE. Ne pas convertir une levée en destruction automatique.

**Références dans l’atlas :** P34.

### Préservation

**Écran et informations :** Événements, anomalies d’intégrité, preuve d’horodatage et sauvegardes.

**Parcours :** Surveiller → diagnostiquer → vérifier → consigner.

**Contrat et limites :** PRESERVATION_EVENT_READ et actions spécifiques. État configuré d’un service à lire ; aucune disponibilité ou restauration certifiée par cette analyse.

**Références dans l’atlas :** P35.

### Archives physiques

**Écran et informations :** Emplacement, unité, boîte, archive, mouvement.

**Parcours :** Localiser → sortir → suivre → restituer.

**Contrat et limites :** PHYSICALARCHIVES_READ/MANAGE national. Sélecteur physique du rattachement à améliorer.

**Références dans l’atlas :** P36.

### Patrimoine & restauration

**Écran et informations :** Lieux, sujets, événements, textes ; diagnostic et intervention.

**Parcours :** Décrire → enrichir ; diagnostiquer → autoriser → intervenir → terminer.

**Contrat et limites :** HERITAGE_READ / RESTORATION_READ nationaux dans le code courant. Pas de passage automatique de toute archive définitive en patrimoine public.

**Références dans l’atlas :** P37–P38.

### Audit & pilotage

**Écran et informations :** Événements paginés, objet, acteur, avant/après.

**Parcours :** Ouvrir un événement → examiner → relier à l’acte.

**Contrat et limites :** AUDIT_READ national ; Mes tâches, notifications et métriques agrégées : contrats cibles.

**Références dans l’atlas :** P39–P41.

### Incidents & reprise

**Écran et informations :** Code HTTP, code métier, champs, référence technique, intention.

**Parcours :** Comprendre → corriger ou relire → reprendre explicitement.

**Contrat et limites :** 401, 403/404 masqué, 409, 422, 503/réseau ; ne jamais transformer un échec en données fictives.

**Références dans l’atlas :** P42.

## 6. Parcours transverses et états à couvrir

| Situation | Réponse attendue de l’interface |
|---|---|
| Première utilisation | Expliquer le périmètre et donner une seule action pertinente. |
| Chargement | Indicateur déterministe ; ne pas afficher une ancienne liste d’un autre périmètre. |
| Liste vide | Distinguer absence de données, filtre trop restrictif et défaut d’autorisation. |
| 401 | Interrompre les requêtes concernées et demander une reconnexion sans répétition d’écriture. |
| 403 ou 404 masqué | Ne révéler ni titre, ni extrait, ni existence d’un objet interdit. |
| 409 | Relire la version/état et expliquer le conflit ; ne pas écraser silencieusement. |
| 422 | Afficher les champs invalides et les codes métier utiles, sans réussite fictive. |
| Réseau / 503 | Marquer le succès non confirmé ; conserver la même intention uniquement si l’idempotence serveur est prévue. |
| Mutation sensible | Confirmation contextualisée et contrôle serveur ; validation indépendante si exigée. |
| Travail concurrent | Les actions visibles peuvent devenir périmées ; relire le serveur après refus de transition. |
| Changement de périmètre / déconnexion | Annuler les lectures en cours et purger les données qui ne doivent plus être visibles. |
| Fichier infecté ou inconnu | Quarantaine ; ne pas autoriser l’aperçu sur la seule base d’un type MIME ou d’une extension. |

Ces états sont à décliner dans chaque opération, pas uniquement dans une page d’aide. Une partie est déjà traitée dans les composants de transport et formulaires fournis ; l’homogénéisation complète reste un chantier.

## 7. Ce qui a réellement été modifié dans F3

Le thème F3 et ses règles adaptatives sont ajoutés dans `src/design/f3.css`. La navigation est restructurée dans `src/app.tsx` et sa politique de visibilité documentée dans `src/design/navigation.ts`. L’accueil est remplacé par une vue orientée opérations.

La fiche documentaire connectée de `src/pages/Records.tsx` est réorganisée par onglets conditionnels. Les accès aux panneaux de publication, rétention, droits et audit sont filtrés avant leur montage. La publication ne propose plus `NON_PUBLIE`, valeur refusée par le service lors d’une publication. Le retrait de publication affiche une erreur de commande. La durée de conservation n’est plus préremplie arbitrairement à dix ans.

Le dialogue de création d’entrée conserve une clé d’intention pour la répétition d’un même corps de requête. Le rattachement documentaire utilise le sélecteur de catalogue existant. La clôture d’entrée possède une confirmation, un indicateur d’exécution et un message d’erreur ; elle n’est pas présentée comme une admission. Le sélecteur d’archives physiques et plusieurs formulaires techniques restent à améliorer.

Un nouvel écran de démonstration présente le registre documentaire, la fiche, les états vide/refus/indisponible et les entrées, sans avancer artificiellement d’un état métier au suivant. Les autres domaines ouvrent leurs parcours de référence. La démonstration IAM existante est conservée. Le mode connecté reste distinct et continue d’utiliser les API fournies.

L’atlas `src/pages/Journeys.tsx` contient 42 parcours filtrables, leurs acteurs, étapes, exceptions, résultats et contrats. Ce guide n’exécute aucun acte métier. Certains domaines disposent d’un écran de parcours plutôt que d’une nouvelle suite complète d’écrans détaillés : il ne faut pas assimiler la couverture de conception à la couverture d’implémentation.

Le fichier HTML autonome est un prototype hors ligne : sources transpillées et moteur React fourni, navigation mémoire adaptée, aucune requête distante. Il facilite la validation visuelle sans installation. Il n’est pas un build Vite de production et ne contient ni moteur PDF opérationnel ni backend.

## 8. API à compléter en priorité

Les éléments suivants sont des **contrats à concevoir**, pas des routes existantes : admission complète d’un versement avec états et preuves ; inventaire paginé du contenu d’entrée ; liste paginée des documents d’un dossier ; tâches de l’utilisateur avec actions autorisées et libellés ; centre de notifications ; agrégats de pilotage filtrés ; exécution de destruction/transfert et preuves ; jobs OCR/scanner ; portail public séparé.

Le contrat de chaque action doit expliciter le DTO, les champs requis, les permissions, le périmètre, les états de départ, la réponse, les erreurs, la concurrence, l’idempotence éventuelle et l’audit. Un paramètre de confirmation envoyé par le client ne doit pas être considéré comme une preuve d’autorisation.

Pour les listes volumineuses encore non paginées, il faut éviter de bâtir une interface nationale sur des `findAll()`. Prévoir pagination serveur, filtres bornés, ordre stable et compteur dont la portée est définie. Cela doit être testé avec un jeu volumétrique représentatif plutôt qu’annoncé à partir de quelques fixtures.

## 9. Sécurité et conformité à vérifier

La politique de navigation ne remplace jamais l’autorisation objet côté serveur. OWASP API1:2023 décrit précisément le risque d’accès à un objet par manipulation d’identifiant. Il faut tester au minimum deux institutions, deux départements, un profil sans droit documentaire, un auditeur et un compte suspendu.

Pour les fichiers, les validations de format, taille, contenu, stockage et quarantaine doivent être effectuées côté serveur. Le filtre d’extension dans le navigateur et l’empreinte calculée localement ne prouvent ni innocuité ni conservation probante. Référence : OWASP File Upload Cheat Sheet.

À vérifier en environnement de recette : API de contenu et restrictions, séparation des validateurs, révision d’habilitation pendant une session, invalidation des requêtes, cache de recherche, accès aux sources physiques et aux métadonnées sensibles, URLs et aperçu des fichiers, reprise d’une commande après réponse perdue.

Le projet fourni contient des fichiers d’environnement. Ils ont été exclus de la livraison F3. Leurs valeurs n’ont pas été reproduites. Examiner séparément leur diffusion et renouveler les secrets réellement exposés, le cas échéant. Un domaine d’hébergement, un fournisseur SSO ou une image institutionnelle ne constituent pas à eux seuls une conformité juridique. Les durées, autorités de décision et règles d’accès restent à valider par les responsables compétents.

## 10. Vérifications exécutées et limites

| Vérification | Résultat de cette session |
|---|---|
| Contrôle TypeScript du frontend fourni | Réussi. |
| Contrôle TypeScript de la source F3 | Réussi. |
| Tests F3 de visibilité et de références API | 16 réussis sur 16. |
| Tests cœur fournis exécutés sur F3 | 70 réussis sur 71 ; un fichier de tests PDF échoue dans cet environnement au chargement, identique au constat initial. |
| Inventaire des références HTTP de l’atlas | Toutes correspondent aux méthodes et chemins extraits des contrôleurs, paramètres normalisés. Ce n’est pas un test de réponse. |
| Recette navigateur du prototype local | 64 vérifications réussies : navigation, filtre, notice locale, onglets clavier, 42 parcours, état vide/refus/erreur et tailles 1440/1024/768/390 px. |
| Erreurs JavaScript dans cette recette | Aucune observée. |
| Requêtes distantes dans cette recette | Aucune. |
| Build Vite et tests Vitest | Non validés : dépendances natives Linux absentes dans le node_modules Windows fourni ; exécution npm initialement bloquée aussi par les droits des binaires. L’appel direct échoue sur le binding natif. |
| Backend, PostgreSQL, migrations en base, SSO et antivirus | Non exécutés contre un environnement actif. |
| PDF réel, numérisation, OCR, horodatage et restauration | Non validés en intégration dans cette session. |
| Audit de sécurité et WCAG exhaustifs | Non réalisés ; aucun certificat ni verdict « production-ready ». |

Les versions Node disponibles localement ne correspondent pas exactement à la plage `engines` du paquet fourni. Les résultats existants dans `build` ou `dist` du ZIP n’ont pas été présentés comme des tests exécutés durant cette analyse. Les journaux bruts et les scénarios sont joints pour distinguer clairement les observations des limites.

## 11. Plan de réalisation priorisé

**Lot A — stabiliser le socle.** Installer proprement les dépendances verrouillées dans un environnement compatible ; établir la CI ; vérifier les profils SSO et les permissions ; uniformiser les erreurs ; générer ou maintenir une spécification de contrats. Critère de sortie : build et tests réellement verts sur la plateforme cible, sans jeux de données de secours en connecté.

**Lot B — finaliser le chemin documentaire.** Organisation → entrée → document → fichier contrôlé → validation → classement → consultation. Compléter les contrats manquants du dossier et de l’admission avant d’activer les actions correspondantes. Critère de sortie : parcours de référence sur des fichiers de recette, preuve de chaque étape, gestion des doublons et du succès incertain.

**Lot C — déployer les expériences métier.** Reprendre les écrans de traitement, communication, fonds, patrimoine et conservation avec les composants F3, leurs décisions et leurs habilitations. Ajouter la corbeille de tâches et les notifications. Critère de sortie : tests multi-profils, multi-institutions et mobile, au-delà du prototype visuel.

**Lot D — homologation et pilote.** Tests de charge et de restauration, audit sécurité et accessibilité, validation documentaire/juridique, formation puis pilote limité. Critère de sortie : décisions de mise en service documentées et responsabilités d’exploitation attribuées. Aucun calendrier fiable n’est déduit de la seule lecture du code.

## 12. Utilisation de la livraison

Pour la revue de design, ouvrir `SNAE-PPD-F3-Prototype.html` dans un navigateur puis « Ouvrir la démonstration ». Le prototype fonctionne sans compte serveur ; n’y saisir que des données de test. Les éléments métier fictifs ne sont ni sauvegardés sur un backend ni des archives probantes.

Pour développer, extraire le ZIP F3 dans un nouveau répertoire. Utiliser une version de Node compatible avec `package.json`, puis `npm.cmd ci`, `npm.cmd run typecheck` et `npm.cmd run demo` sous Windows. Le mode connecté s’obtient avec une configuration propre issue de `.env.example`, un fournisseur d’identité réel et l’API de recette. Aucun secret backend ne doit être placé dans une variable VITE.

Ne pas remplacer aveuglément le frontend actuellement utilisé. Commencer par comparer les fichiers modifiés et effectuer la recette dans une branche séparée. Le backend d’origine n’a pas été modifié par cette livraison. Le lockfile fourni est conservé ; aucune migration de framework ni mise à jour de dépendance n’a été effectuée.

## 13. Références publiques utilisées

- W3C, Web Content Accessibility Guidelines 2.2 : https://www.w3.org/TR/WCAG22/ — cible de conception, non certification.
- OWASP, API1:2023 Broken Object Level Authorization : https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/ — contrôle serveur par objet.
- OWASP, File Upload Cheat Sheet : https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html — sécurité du téléversement.

## 14. Sources techniques et intégrité des fichiers

**snae-ppd-backend-v12.1(2).zip** — 31246102 octets  
SHA-256 : `59beab5ea53c8f4daea172563011b8c4e977355d8e94b25172aad1f17e6ec00e`

**SNAE-PPD-Frontend-F2-Parcours-Archives(1)(1).zip** — 60237675 octets  
SHA-256 : `89badaa726efdf72b35784c56d51899191970b1825ace63965025f19a6602a73`

### S01 — États de l’entrée archivistique

backend fourni · `src/main/kotlin/gn/gouv/snaeppd/archivalintake/domain/ArchivalIntakeDomain.kt` · lignes 1–16.

```text
   1  package gn.gouv.snaeppd.archivalintake.domain
   2  
   3  import gn.gouv.snaeppd.shared.persistence.AuditableEntity
   4  import jakarta.persistence.*
   5  import java.time.Instant
   6  import java.util.UUID
   7  
   8  enum class IntakeMode { VERSEMENT, DON, DEPOT, ACHAT, TRANSFERT, COLLECTE, RESTITUTION, AUTRE }
   9  enum class IntakeStatus { OUVERTE, CLOTUREE }
  10  
  11  @Entity
  12  @Table(name = "entrees_archivistiques", schema = "snae")
  13  class EntreeArchivistique : AuditableEntity() {
  14      @Column(nullable = false, unique = true, length = 150) lateinit var numero: String
  15      @Enumerated(EnumType.STRING)
  16      @Column(name = "mode_entree", nullable = false, length = 30) lateinit var modeEntree: IntakeMode
```

### S02 — Routes d’entrée : création, rattachement, clôture

backend fourni · `src/main/kotlin/gn/gouv/snaeppd/archivalintake/api/ArchivalIntakeController.kt` · lignes 15–47.

```text
  15      @field:NotNull val modeEntree: IntakeMode, val sourceActeurId: UUID? = null,
  16      val sourceInstitutionId: UUID? = null, @field:NotNull val dateEntree: Instant,
  17      val instrument: String? = null, @field:Size(max=255) val referencePreuve: String? = null,
  18      val responsableId: UUID? = null, val description: String? = null)
  19  
  20  @RestController
  21  @RequestMapping("/api/v1/archival-intake")
  22  class ArchivalIntakeController(private val intakes: ArchivalIntakeService) {
  23  
  24      @PostMapping("/entries")
  25      @ResponseStatus(HttpStatus.CREATED)
  26      fun create(@RequestHeader("Idempotency-Key") key: String, @Valid @RequestBody r: CreateIntakeRequest) = intakes.create(
  27          CreateIntakeCommand(r.numero, r.modeEntree, r.sourceActeurId, r.sourceInstitutionId, r.dateEntree,
  28              r.instrument, r.referencePreuve, r.responsableId, r.description, key))
  29  
  30      @GetMapping("/entries/{id}")
  31      fun get(@PathVariable id: UUID) = intakes.get(id)
  32  
  33      @GetMapping("/entries")
  34      fun list() = intakes.list()
  35  
  36      @PostMapping("/entries/{id}/documents/{documentId}")
  37      fun linkDocument(@PathVariable id: UUID, @PathVariable documentId: UUID) = intakes.linkDocument(id, documentId)
  38  
  39      @PostMapping("/entries/{id}/dossiers/{dossierId}")
  40      fun linkDossier(@PathVariable id: UUID, @PathVariable dossierId: UUID) = intakes.linkDossier(id, dossierId)
  41  
  42      @PostMapping("/entries/{id}/physical-archives/{archiveId}")
  43      fun linkPhysicalArchive(@PathVariable id: UUID, @PathVariable archiveId: UUID) = intakes.linkPhysicalArchive(id, archiveId)
  44  
  45      @PostMapping("/entries/{id}/close")
  46      fun close(@PathVariable id: UUID) = intakes.close(id)
  47  }
```

### S03 — Conservation : exécutions bloquées

backend fourni · `src/main/kotlin/gn/gouv/snaeppd/retention/policy/RetentionPolicy.kt` · lignes 65–94.

```text
  65      }
  66  
  67      fun idempotencyKey(value: String?): String {
  68          val key = value?.trim().orEmpty()
  69          if (!Regex("[A-Za-z0-9._:-]{1,160}").matches(key))
  70              invalid("IDEMPOTENCY_KEY_REQUIRED", "Une clé d'idempotence de 1 à 160 caractères est requise.")
  71          return key
  72      }
  73  
  74      fun requireSupportedExecution(decision: FinalDisposition) {
  75          when (decision) {
  76              FinalDisposition.ELIMINER -> invalid("DESTRUCTION_STORAGE_NOT_CONFIGURED",
  77                  "La destruction physique vérifiable n'est pas raccordée. Aucun contenu n'a été déclaré détruit.")
  78              FinalDisposition.TRANSFERER -> invalid("TRANSFER_HANDOVER_NOT_CONFIGURED",
  79                  "La confirmation de réception et le changement de détenteur ne sont pas raccordés.")
  80              FinalDisposition.REEXAMINER -> invalid("REEXAMINATION_REQUIRED", "Utilisez l'opération de réexamen.")
  81              FinalDisposition.CONSERVER_DEFINITIVEMENT -> Unit
  82          }
  83      }
  84  
  85      private fun invalid(code: String, message: String): Nothing = throw BusinessRuleException(code, message)
  86  }
  87  
  88  data class RuleCandidate(val id: UUID, val institutionSpecific: Boolean, val typeSpecific: Boolean,
  89      val nodeDistance: Int?, val priority: Int)
  90  
  91  object RetentionCandidateSelector {
  92      fun select(candidates: List<RuleCandidate>): RuleCandidate {
  93          if (candidates.isEmpty()) throw BusinessRuleException("RETENTION_RULE_NOT_FOUND", "Aucune règle applicable.")
  94          val comparator = compareByDescending<RuleCandidate> { it.institutionSpecific }
```

### S04 — Axes de statut du document, de sa version et de ses fichiers

backend fourni · `src/main/kotlin/gn/gouv/snaeppd/records/domain/DocumentEnums.kt` · lignes 1–12.

```text
   1  package gn.gouv.snaeppd.records.domain
   2  
   3  enum class RecordStatus { BROUILLON, ACTIF, CLOS, SUSPENDU }
   4  enum class ArchivalStatus { BROUILLON, ACTIF, SEMI_ACTIF, ARCHIVE_DEFINITIVE, ELIMINATION_APPROUVEE, DETRUIT }
   5  enum class DistributionStatus { NON_PUBLIE, INTERNE, RESTREINT, PUBLIC }
   6  enum class ConfidentialityLevel { PUBLIC, INTERNE, CONFIDENTIEL, SECRET }
   7  enum class DocumentOrigin { CREE, RECU, IMPORTE, NUMERISE, VERSE }
   8  enum class VersionState { BROUILLON, VALIDEE, REJETEE, OBSOLETE }
   9  enum class FileRole { MAITRE_CONSERVATION, DERIVE_CONSULTATION, DERIVE_PUBLIC, PIECE_JOINTE, PREVIEW, AUTRE }
  10  enum class FileScanStatus { PENDING_SCAN, CLEAN, INFECTED, QUARANTINED, FAILED }
  11  enum class FileState { PENDING_SCAN, QUARANTINED, VALIDE, REJETE, ARCHIVE }
  12  enum class ActorRole { AUTEUR, PRODUCTEUR, SIGNATAIRE, DESTINATAIRE, DONATEUR, DEPOSANT, DETENTEUR_ANTERIEUR, CONTRIBUTEUR, AUTRE }
```

### S05 — Description archivistique et producteurs V53

backend fourni · `src/main/kotlin/gn/gouv/snaeppd/archives/ArchiveController.kt` · lignes 1–33.

```text
   1  package gn.gouv.snaeppd.archives
   2  
   3  import org.springframework.http.ResponseEntity
   4  import org.springframework.web.bind.annotation.*
   5  import java.util.UUID
   6  
   7  @RestController
   8  @RequestMapping("/api/v1/archives")
   9  class ArchiveController(private val archive:ArchiveService,private val csv:ArchiveCsvService,private val exchange:ArchiveExchangeService) {
  10   @GetMapping("/descriptions") fun descriptions(@RequestParam institutionId:UUID)=archive.descriptions(institutionId)
  11   @GetMapping("/authorities") fun authorities(@RequestParam institutionId:UUID)=archive.authorities(institutionId)
  12   @GetMapping("/descriptions/{id}") fun description(@PathVariable id:UUID)=archive.get(id)
  13   @GetMapping("/authorities/{id}") fun authority(@PathVariable id:UUID)=archive.getAuthority(id)
  14   @PostMapping("/descriptions") fun create(@RequestBody body:DescriptionInput,@RequestHeader("Idempotency-Key") key:String)=archive.saveDescription(null,body,key)
  15   @PutMapping("/descriptions/{id}") fun update(@PathVariable id:UUID,@RequestBody body:DescriptionInput,@RequestHeader("Idempotency-Key") key:String)=archive.saveDescription(id,body,key)
  16   @PostMapping("/authorities") fun createAuthority(@RequestBody body:AuthorityInput,@RequestHeader("Idempotency-Key") key:String)=archive.saveAuthority(null,body,key)
  17   @PutMapping("/authorities/{id}") fun updateAuthority(@PathVariable id:UUID,@RequestBody body:AuthorityInput,@RequestHeader("Idempotency-Key") key:String)=archive.saveAuthority(id,body,key)
  18   @PostMapping("/imports/preview") fun preview(@RequestBody body:CsvInput)=csv.preview(body)
  19   @PostMapping("/imports") fun import(@RequestBody body:CsvInput,@RequestHeader("Idempotency-Key") key:String)=csv.import(body,key)
  20   @GetMapping("/template/{kind}") fun template(@PathVariable kind:String,@RequestParam institutionId:UUID):ResponseEntity<ByteArray> {
  21    archive.permission("MANAGE",institutionId); return download(csv.template(kind),"modele-$kind.csv","text/csv;charset=UTF-8")
  22   }
  23   @GetMapping("/export/{kind}") fun export(@PathVariable kind:String,@RequestParam institutionId:UUID)=download(exchange.csv(institutionId,kind),"$kind.csv","text/csv;charset=UTF-8")
  24   @GetMapping("/descriptions/{id}/ead") fun ead(@PathVariable id:UUID):ResponseEntity<ByteArray> {
  25    return download(exchange.ead(id),"fonds-$id.ead.xml","application/xml;charset=UTF-8")
  26   }
  27   @GetMapping("/authorities/{id}/eac") fun eac(@PathVariable id:UUID):ResponseEntity<ByteArray> {
  28    return download(exchange.eac(id),"producteur-$id.eac.xml","application/xml;charset=UTF-8")
  29   }
  30   @ExceptionHandler(org.springframework.web.bind.MissingServletRequestParameterException::class)
  31   fun missingParameter()=ResponseEntity.badRequest().body(mapOf("status" to 400,"code" to "ARCHIVAL_PARAMETER_REQUIRED","message" to "Sélectionnez une institution et fournissez les paramètres requis."))
  32   private fun download(text:String,name:String,type:String)=ResponseEntity.ok().header("Content-Type",type)
  33    .header("Content-Disposition","attachment; filename=\"$name\"").header("Cache-Control","no-store").header("X-Content-Type-Options","nosniff").body(text.toByteArray(Charsets.UTF_8))
```

### S06 — Consultations et communications

backend fourni · `src/main/kotlin/gn/gouv/snaeppd/consultation/api/ConsultationController.kt` · lignes 21–63.

```text
  21  
  22  @RestController
  23  @RequestMapping("/api/v1")
  24  class ConsultationController(private val requests: ConsultationRequestService, private val communications: CommunicationService) {
  25  
  26      @PostMapping("/consultations/requests")
  27      @ResponseStatus(HttpStatus.CREATED)
  28      fun createRequest(@RequestHeader("Idempotency-Key") key: String, @Valid @RequestBody r: CreateConsultationRequestBody) =
  29          requests.create(CreateConsultationRequestCommand(r.documentId, r.dossierId, r.motif, key))
  30  
  31      @GetMapping("/consultations/requests/{id}")
  32      fun getRequest(@PathVariable id: UUID) = requests.get(id)
  33  
  34      @GetMapping("/consultations/requests")
  35      fun listRequests(@RequestParam(required = false) institutionId: UUID?, @RequestParam(required = false) mine: Boolean?) =
  36          if (mine == true) requests.listMine() else requests.listByInstitution(requireNotNull(institutionId) { "institutionId is required unless mine=true" })
  37  
  38      @PostMapping("/consultations/requests/{id}/claim")
  39      fun claim(@PathVariable id: UUID) = requests.claim(id)
  40  
  41      @PostMapping("/consultations/requests/{id}/authorize")
  42      fun authorize(@PathVariable id: UUID, @RequestBody(required = false) body: AuthorizeBody?) = requests.authorize(id, body?.decisionMotif)
  43  
  44      @PostMapping("/consultations/requests/{id}/refuse")
  45      fun refuse(@PathVariable id: UUID, @Valid @RequestBody body: RefuseBody) = requests.refuse(id, body.decisionMotif)
  46  
  47      @PostMapping("/communications")
  48      @ResponseStatus(HttpStatus.CREATED)
  49      fun createCommunication(@RequestHeader("Idempotency-Key") key: String, @Valid @RequestBody r: CreateCommunicationBody) =
  50          communications.create(CreateCommunicationCommand(r.documentId, r.dossierId, r.beneficiaireId, r.demandeConsultationId, r.lieu, key))
  51  
  52      @GetMapping("/communications/{id}")
  53      fun getCommunication(@PathVariable id: UUID) = communications.get(id)
  54  
  55      @GetMapping("/communications")
  56      fun listCommunications(@RequestParam institutionId: UUID) = communications.listByInstitution(institutionId)
  57  
  58      @PostMapping("/communications/{id}/deliver")
  59      fun deliver(@PathVariable id: UUID) = communications.deliver(id)
  60  
  61      @PostMapping("/communications/{id}/return")
  62      fun returnItem(@PathVariable id: UUID) = communications.returnItem(id)
  63  }
```

### S07 — Fiche documentaire initiale : empilement des panneaux

frontend fourni · `src/pages/Records.tsx` · lignes 910–953.

```text
 910  export function RecordDetailPage({ kind, id }: {
 911      kind: RecordCatalog;
 912      id: string;
 913  }) {
 914      const { me, records, epoch } = useSession();
 915      const q = useResource<RecordDocument | Dossier>(s => kind === 'documents' ? records!.document(id, s) : records!.dossier(id, s), 'record-detail:' + kind + id + epoch);
 916      const institutionName = useInstitutionNames();
 917      const departmentName = useDepartmentNames(q.data?.institutionId ?? null);
 918      const [reclassifying, setReclassifying] = useState(false);
 919      if (q.loading)
 920          return <Busy />;
 921      if (q.error)
 922          return <ErrorNotice error={q.error} onRetry={q.refresh}/>;
 923      const e = q.data!;
 924      const scope = { institutionId: e.institutionId, departmentId: e.departmentId };
 925      const m = recordMeta[kind];
 926      const isDocument = kind === 'documents';
 927      const fields: [
 928          string,
 929          unknown
 930      ][] = [['Cote', e.reference], ['Institution', institutionName(e.institutionId)], ['Département', departmentName(e.departmentId)], ['Statut métier', e.businessStatus], ...(isDocument ? [['Type de document', (e as RecordDocument).typeDocumentId], ['Dossier', (e as RecordDocument).dossierId], ['Diffusion', (e as RecordDocument).distributionStatus], ['Version verrou', (e as RecordDocument).versionLock], ['Détruit', (e as RecordDocument).destroyed ? 'Oui' : 'Non']] as [
 931                  string,
 932                  unknown
 933              ][] : [['Ouvert le', formatDate((e as Dossier).openedOn)], ['Clos le', formatDate((e as Dossier).closedOn)]] as [
 934              string,
 935              unknown
 936          ][])];
 937      return <RecordWorkspaceProvider scope={scope} key={kind + id + epoch}><button className="back-link" onClick={() => navigate('/app/' + kind)}>← Retour à {m.name.toLowerCase()}</button>
 938          <PageHead eyebrow="FICHE DE RÉFÉRENCE" title={e.title} description="État actuel renvoyé par le backend."/>
 939          <div className="detail-grid"><section className="panel detail-card"><div className="section-heading"><h3>Informations</h3><div className="table-actions"><Badge value={e.archivalStatus}/>{isDocument && can(me, 'DOCUMENT_CLASSIFY', scope) && <button className="btn small secondary" onClick={() => setReclassifying(true)}>Reclasser</button>}</div></div><dl>{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value === null || value === undefined || value === '' ? '—' : String(value)}</dd></div>)}</dl></section>
 940          <section className="panel detail-card"><span className="feature-icon"><Icon name="shield" size={25}/></span><h3>Confidentialité</h3><Badge value={e.confidentiality}/><p>Les habilitations de lecture sont contrôlées à chaque appel, indépendamment de cet affichage.</p></section></div>
 941          {isDocument && <VersionsPanel documentId={id}/>}
 942          {isDocument && <ActorsPanel documentId={id}/>}
 943          {isDocument && <PublicationPanel documentId={id}/>}
 944          {isDocument && <RetentionPanel documentId={id} businessStatus={e.businessStatus} onDocumentChanged={q.refresh}/>}
 945          {isDocument && can(me, 'LEGAL_HOLD_MANAGE', scope) && <LegalHoldsPanel documentId={id} institutionId={e.institutionId}/>}
 946          {isDocument && can(me, 'HERITAGE_READ', scope) && <HeritagePanel documentId={id}/>}
 947          {isDocument && can(me, 'RIGHTS_READ', scope) && <RightsPanel documentId={id}/>}
 948          {isDocument && can(me, 'DOCUMENT_METADATA_READ', scope) && <MetadataPanel documentId={id}/>}
 949          {isDocument && can(me, 'WORKFLOW_READ', scope) && <WorkflowPanel documentId={id}/>}
 950          <AuditPanel objectType={isDocument ? 'DOCUMENT' : 'DOSSIER'} objectId={id}/>
 951          {reclassifying && <ReclassifyDialog documentId={id} institutionId={e.institutionId} currentNodeId={isDocument ? (e as RecordDocument).classificationNodeId : null} onClose={() => setReclassifying(false)} onSuccess={q.refresh}/>}
 952          </RecordWorkspaceProvider>;
 953  }
```

### S08 — Maquette initiale : progression générique des états

frontend fourni · `src/pages/ArchiveModules.tsx` · lignes 1–85.

```text
   1  import React, { useMemo, useState } from 'react';
   2  import { useSession } from '../auth/session';
   3  import { useWorkspace } from '../ui/workspace';
   4  import { navigate } from '../ui/navigation';
   5  import { Empty, Notice, PageHead } from '../ui/components';
   6  
   7  type Field = { key: string; label: string; type?: 'text' | 'date' | 'textarea' | 'select'; options?: string[]; required?: boolean };
   8  type Module = { id: string; title: string; description: string; group: string; fields: Field[]; examples: Array<Record<string, string>>; stages: string[] };
   9  const f = (key: string, label: string, required = false): Field => ({ key, label, required });
  10  const select = (key: string, label: string, options: string[]): Field => ({ key, label, type: 'select', options });
  11  export const archiveModules: Module[] = [
  12    { id: 'versements', title: 'Versements', description: 'Préparer et suivre le transfert des documents vers les archives.', group: 'Collecte', fields: [f('title','Intitulé du versement',true), f('producer','Service producteur',true), f('reference','Référence du bordereau'), select('medium','Support',['Papier','Numérique','Mixte']), {key:'description',label:'Description',type:'textarea'}], stages: ['Brouillon','À examiner','Accepté','Rejeté'], examples: [{title:'Versement des délibérations',producer:'Secrétariat général',reference:'VER-2026-001',medium:'Numérique',description:'Lot de démonstration.'}] },
  13    { id: 'documents', title: 'Documents', description: 'Décrire, classer et consulter les notices documentaires.', group: 'Archives', fields: [f('title','Titre du document',true), f('reference','Cote ou référence',true), f('producer','Producteur'), select('medium','Support',['Papier','Numérique','Audiovisuel']), {key:'date',label:'Date du document',type:'date'}, {key:'description',label:'Description',type:'textarea'}], stages: ['Brouillon','En contrôle','Validé','Archivé'], examples: [{title:'Rapport annuel',reference:'RAP-2025-001',producer:'Direction des études',medium:'Numérique',date:'2025-12-31',description:'Notice fictive, sans fichier déposé.'}] },
  14    { id: 'dossiers', title: 'Dossiers', description: 'Regrouper les pièces et suivre leur cycle de vie.', group: 'Archives', fields: [f('title','Intitulé du dossier',true),f('reference','Cote',true),f('producer','Service responsable'),{key:'description',label:'Objet du dossier',type:'textarea'}], stages: ['Ouvert','En instruction','Clos','Archivé'], examples: [{title:'Dossier de démonstration',reference:'DOS-2026-001',producer:'Direction administrative',description:'Aucune pièce réelle.'}] },
  15    { id: 'classement', title: 'Plan de classement', description: 'Organiser les séries et les catégories documentaires.', group: 'Archives', fields: [f('title','Nom de la série',true),f('reference','Code de classement',true),f('parent','Série parente'),{key:'description',label:'Périmètre',type:'textarea'}], stages: ['Projet','Actif','Clos'], examples: [{title:'Administration générale',reference:'AG',parent:'',description:'Exemple de série.'}] },
  16    { id: 'metadonnees', title: 'Métadonnées', description: 'Définir les champs de description et leur usage.', group: 'Archives', fields: [f('title','Nom du champ',true),f('reference','Code technique',true),select('medium','Nature',['Texte','Date','Nombre','Liste']),{key:'description',label:'Règle de saisie',type:'textarea'}], stages: ['Projet','Actif','Retiré'], examples: [{title:'Date de production',reference:'date_production',medium:'Date',description:'Exemple de définition.'}] },
  17    { id: 'recherche', title: 'Recherche', description: 'Explorer les notices de démonstration du périmètre courant.', group: 'Accès', fields: [], stages: [], examples: [] },
  18    { id: 'consultations', title: 'Consultations', description: 'Suivre les demandes de consultation et leur instruction.', group: 'Accès', fields: [f('title','Objet de la demande',true),f('reference','Cote demandée',true),f('producer','Demandeur'),{key:'description',label:'Motif',type:'textarea'}], stages: ['Déposée','En instruction','Autorisée','Refusée','Terminée'], examples: [{title:'Consultation d’un rapport',reference:'RAP-2025-001',producer:'Agent fictif',description:'Demande de recette.'}] },
  19    { id: 'communications', title: 'Communications', description: 'Tracer la mise à disposition et la restitution des pièces.', group: 'Accès', fields: [f('title','Objet de la communication',true),f('reference','Cote du document',true),f('producer','Bénéficiaire'),{key:'date',label:'Date prévue',type:'date'}], stages: ['Demandée','Remise','Restituée'], examples: [] },
  20    { id: 'numerisation', title: 'Numérisation', description: 'Préparer les lots à numériser et contrôler leur qualité.', group: 'Traitements', fields: [f('title','Nom du lot',true),f('reference','Cote source',true),f('producer','Atelier responsable'),{key:'description',label:'Consignes',type:'textarea'}], stages: ['À préparer','En cours','Contrôle qualité','Terminé'], examples: [{title:'Lot patrimoine A',reference:'PAT-001',producer:'Atelier pilote',description:'Exemple sans images numérisées.'}] },
  21    { id: 'ocr', title: 'OCR et indexation', description: 'Suivre l’extraction et la vérification des textes.', group: 'Traitements', fields: [f('title','Nom du traitement',true),f('reference','Cote source',true),{key:'description',label:'Observations',type:'textarea'}], stages: ['À traiter','En cours','À vérifier','Validé'], examples: [] },
  22    { id: 'controle', title: 'Contrôle qualité', description: 'Consigner les anomalies et leur résolution.', group: 'Traitements', fields: [f('title','Contrôle',true),f('reference','Référence de la pièce',true),select('medium','Gravité',['Mineure','Majeure','Bloquante']),{key:'description',label:'Constat',type:'textarea'}], stages: ['Ouvert','À corriger','Vérifié','Clos'], examples: [] },
  23    { id: 'conservation', title: 'Conservation', description: 'Planifier la préservation et les vérifications d’intégrité.', group: 'Conservation', fields: [f('title','Action de conservation',true),f('reference','Cote ou lot',true),{key:'date',label:'Date prévue',type:'date'},{key:'description',label:'Mesures prévues',type:'textarea'}], stages: ['Planifiée','En cours','Contrôlée','Terminée'], examples: [] },
  24    { id: 'sort-final', title: 'Durées et sort final', description: 'Préparer les règles de conservation et les décisions associées.', group: 'Conservation', fields: [f('title','Catégorie documentaire',true),f('reference','Code de règle',true),f('duration','Durée proposée'),select('medium','Sort proposé',['Conserver','Évaluer','Éliminer']),{key:'description',label:'Fondement et observations',type:'textarea'}], stages: ['Projet','À valider','Approuvé','Suspendu'], examples: [] },
  25    { id: 'gel-legal', title: 'Gel et restrictions', description: 'Examiner les restrictions et les gels de conservation.', group: 'Conservation', fields: [f('title','Objet de la mesure',true),f('reference','Cote concernée',true),{key:'description',label:'Motif et autorité compétente',type:'textarea'}], stages: ['Proposé','Actif','Levé'], examples: [] },
  26    { id: 'eliminations', title: 'Éliminations', description: 'Préparer les bordereaux sans détruire de données dans la démonstration.', group: 'Conservation', fields: [f('title','Intitulé du bordereau',true),f('reference','Référence des archives',true),{key:'description',label:'Justification',type:'textarea'}], stages: ['Projet','À autoriser','Autorisé','Exécuté'], examples: [] },
  27    { id: 'patrimoine', title: 'Patrimoine historique', description: 'Inventorier les fonds patrimoniaux et leurs conditions de conservation.', group: 'Patrimoine', fields: [f('title','Nom du fonds',true),f('reference','Cote patrimoniale',true),f('producer','Origine'),{key:'date',label:'Date repère',type:'date'},{key:'description',label:'État matériel et contexte',type:'textarea'}], stages: ['À inventorier','Inventorié','À restaurer','Conservé'], examples: [{title:'Collection historique de démonstration',reference:'PAT-001',producer:'Archives publiques',description:'Notice fictive, sans document historique réel.'}] },
  28    { id: 'restauration', title: 'Restauration', description: 'Suivre le constat d’état et les interventions patrimoniales.', group: 'Patrimoine', fields: [f('title','Intervention',true),f('reference','Cote patrimoniale',true),f('producer','Responsable'),{key:'description',label:'Constat et intervention envisagée',type:'textarea'}], stages: ['Diagnostic','À valider','En cours','Terminée'], examples: [] },
  29    { id: 'statistiques', title: 'Indicateurs', description: 'Lire uniquement les volumes des notices fictives de cet onglet.', group: 'Pilotage', fields: [], stages: [], examples: [] },
  30    { id: 'audit', title: 'Journal et traçabilité', description: 'Voir les actions de cette démonstration locale.', group: 'Pilotage', fields: [], stages: [], examples: [] }
  31  ];
  32  
  33  type RecordItem = Record<string, string> & { id: string; status: string; createdAt: string; institutionId: string; departmentId: string };
  34  type State = Record<string, RecordItem[]>;
  35  const storageKey = 'snae-f2-demo-records-v1';
  36  function initial(): State { return Object.fromEntries(archiveModules.map(m => [m.id, m.examples.map((x,i) => ({...x,id:`${m.id}-example-${i}`,status:m.stages[0] ?? '',createdAt:'2026-09-24T00:00:00.000Z',institutionId:'',departmentId:''}))])); }
  37  function load(): State { try { const s = sessionStorage.getItem(storageKey); return s ? {...initial(),...JSON.parse(s)} : initial(); } catch { return initial(); } }
  38  function save(next: State) { sessionStorage.setItem(storageKey, JSON.stringify(next)); window.dispatchEvent(new Event('snae-demo-changed')); }
  39  function useRecords() { const [records,setRecords] = useState<State>(load); const update = (next: State) => {setRecords(next);save(next);}; return {records,update}; }
  40  function scopeMatch(item: RecordItem, scope: {institutionId?: string | null;departmentId?: string | null}) { return (!scope.institutionId || item.institutionId === scope.institutionId) && (!scope.departmentId || item.departmentId === scope.departmentId); }
  41  export function ArchiveModulePage({ section, id }: {section: string;id?: string}) {
  42    const module = archiveModules.find(m => m.id === section)!;
  43    const {demo} = useSession();
  44    const {scope} = useWorkspace();
  45    const {records,update} = useRecords();
  46    const [query,setQuery] = useState('');
  47    const [creating,setCreating] = useState(false);
  48    const [form,setForm] = useState<Record<string,string>>({});
  49    const [error,setError] = useState('');
  50    const [audit,setAudit] = useState<Array<{at:string;message:string}>>(() => {try {return JSON.parse(sessionStorage.getItem('snae-f2-demo-audit-v1') || '[]');} catch {return [];} });
  51    const log = (message: string) => { const next=[{at:new Date().toISOString(),message},...audit].slice(0,100);setAudit(next);sessionStorage.setItem('snae-f2-demo-audit-v1',JSON.stringify(next)); };
  52    const visible = useMemo(() => (records[section] ?? []).filter(x => scopeMatch(x,scope)),[records,section,scope]);
  53    const matching = visible.filter(x => Object.values(x).some(v => typeof v === 'string' && v.toLowerCase().includes(query.toLowerCase())));
  54    const selected = id ? visible.find(x=>x.id===id) : undefined;
  55    const base = `/app/${section}`;
  56    const create = (event: React.FormEvent) => {
  57      event.preventDefault();
  58      if (!demo) return;
  59      const missing=module.fields.find(field=>field.required && !form[field.key]?.trim());
  60      if (missing) {setError(`Renseignez « ${missing.label} ».`);return;}
  61      const item:RecordItem={...form,id:crypto.randomUUID(),status:module.stages[0] ?? '',createdAt:new Date().toISOString(),institutionId:scope.institutionId ?? '',departmentId:scope.departmentId ?? ''};
  62      update({...records,[section]:[item,...(records[section]??[])]});log(`${module.title} · notice créée · ${item.id}`);setCreating(false);setForm({});setError('');navigate(`${base}/${encodeURIComponent(item.id)}`);
  63    };
  64    const advance = () => {
  65      if (!demo || !selected) return;
  66      const index=module.stages.indexOf(selected.status);
  67      if (index<0 || index===module.stages.length-1) return;
  68      const next=module.stages[index+1] ?? '';update({...records,[section]:(records[section]??[]).map(x=>x.id===id?{...x,status:next}:x)});log(`${module.title} · étape « ${next} » · ${id}`);
  69    };
  70    if (!demo) return <><PageHead eyebrow={module.group.toUpperCase()} title={module.title} description={module.description}/><Notice tone="warning">Écran de parcours disponible pour la recette visuelle. Les contrats et autorisations du module métier doivent être raccordés et vérifiés avant toute utilisation avec des archives réelles. Aucune écriture n’est envoyée au serveur.</Notice></>;
  71    if (section==='audit') return <><PageHead eyebrow="PILOTAGE / DÉMONSTRATION" title={module.title} description={module.description}/><Notice>Ce journal est uniquement une trace locale de démonstration, modifiable ou effaçable depuis le navigateur. Il n’a aucune valeur de preuve.</Notice>{audit.length ? <div className="archive-list">{audit.map((a,i)=><div className="archive-row" key={i}><strong>{a.message}</strong><small>{new Date(a.at).toLocaleString('fr-FR')}</small></div>)}</div> : <Empty title="Aucune action locale"/>}</>;
  72    if (section==='statistiques') return <><PageHead eyebrow="PILOTAGE / DÉMONSTRATION" title={module.title} description={module.description}/><Notice>Ces chiffres représentent les notices fictives visibles dans cet onglet. Ils ne sont pas des indicateurs nationaux.</Notice><div className="archive-stats">{archiveModules.filter(m=>m.stages.length).map(m=><button key={m.id} className="archive-stat" onClick={()=>navigate(`/app/${m.id}`)}><strong>{(records[m.id]??[]).filter(x=>scopeMatch(x,scope)).length}</strong><span>{m.title}</span></button>)}</div></>;
  73    if (section==='recherche') {
  74      const found=archiveModules.filter(m=>m.stages.length).flatMap(m=>(records[m.id]??[]).filter(x=>scopeMatch(x,scope)).map(x=>({...x,module:m} as RecordItem & {module:Module})) ).filter(x=>query && Object.values(x).some(v=>typeof v==='string' && v.toLowerCase().includes(query.toLowerCase())));
  75      return <><PageHead eyebrow="ACCÈS / DÉMONSTRATION" title={module.title} description={module.description}/><label className="archive-search-label">Rechercher dans les notices fictives<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Titre, cote, producteur…"/></label>{!query ? <Empty title="Saisissez un terme de recherche" description="La recherche porte sur les notices locales de démonstration."/> : found.length ? <div className="archive-list">{found.map(x=><button className="archive-row" key={x.id} onClick={()=>navigate(`/app/${x.module.id}/${encodeURIComponent(x.id)}`)}><span><strong>{x.title}</strong><small>{x.module.title} · {x.reference ?? 'Sans cote'}</small></span><b>{x.status}</b></button>)}</div> : <Empty title="Aucun résultat"/>}</>;
  76    }
  77    return <>
  78      <PageHead eyebrow={`${module.group.toUpperCase()} / ${demo?'DÉMONSTRATION':'RECETTE'}`} title={module.title} description={module.description}>
  79        {id ? <button className="btn secondary" onClick={()=>navigate(base)}>Retour à la liste</button> : <button className="btn primary" onClick={()=>{setCreating(true);setError('');}}>Créer une notice fictive</button>}
  80      </PageHead>
  81      <Notice>Données de démonstration dans cet onglet. Les étapes et notices ci-dessous illustrent le parcours ; aucune règle métier, preuve d’audit ou autorisation serveur n’est exécutée.</Notice>
  82      {id ? selected ? <section className="archive-panel"><div className="archive-detail-head"><div><h2>{selected.title}</h2><p>Référence : {selected.reference || '—'} · Créée le {new Date(selected.createdAt).toLocaleDateString('fr-FR')}</p></div><span className="archive-status">{selected.status}</span></div><dl className="archive-details">{module.fields.map(field=><div key={field.key}><dt>{field.label}</dt><dd>{selected[field.key] || '—'}</dd></div>)}</dl><div className="archive-actions">{module.stages.indexOf(selected.status)<module.stages.length-1 && <button className="btn secondary" onClick={advance}>Simuler l’étape suivante : {module.stages[module.stages.indexOf(selected.status)+1]}</button>}</div></section> : <Notice tone="warning">Notice inexistante dans ce périmètre de démonstration.</Notice> : <><label className="archive-search-label">Filtrer cette liste<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Titre, cote, état…"/></label>{matching.length ? <div className="archive-list">{matching.map(item=><button className="archive-row" key={item.id} onClick={()=>navigate(`${base}/${encodeURIComponent(item.id)}`)}><span><strong>{item.title}</strong><small>{item.reference || 'Sans cote'} · {item.producer || 'Producteur non renseigné'}</small></span><b>{item.status}</b></button>)}</div> : <Empty title="Aucune notice dans ce périmètre" description="Créez une notice fictive pour explorer ce parcours."/>}</>}
  83      {creating && <div className="archive-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setCreating(false);}}><section className="archive-form-panel" role="dialog" aria-modal="true" aria-label={`Créer une notice : ${module.title}`}><div className="archive-form-head"><h2>Nouvelle notice · {module.title}</h2><button className="btn secondary" onClick={()=>setCreating(false)}>Fermer</button></div><form onSubmit={create}>{module.fields.map(field=><label key={field.key} className="archive-field"><span>{field.label}{field.required ? ' *':''}</span>{field.type==='textarea' ? <textarea value={form[field.key]??''} onChange={e=>setForm({...form,[field.key]:e.target.value})}/> : field.type==='select' ? <select value={form[field.key]??''} onChange={e=>setForm({...form,[field.key]:e.target.value})}><option value="">Sélectionner</option>{field.options?.map(option=><option key={option}>{option}</option>)}</select> : <input type={field.type??'text'} value={form[field.key]??''} onChange={e=>setForm({...form,[field.key]:e.target.value})} required={field.required}/>}</label>)}{error && <p role="alert" className="archive-error">{error}</p>}<div className="archive-actions"><button type="button" className="btn secondary" onClick={()=>setCreating(false)}>Annuler</button><button type="submit" className="btn primary">Créer dans la démonstration</button></div></form></section></div>}
  84    </>;
  85  }
```

### S09 — Navigation initiale et périmètres

frontend fourni · `src/app.tsx` · lignes 35–88.

```text
  35  import type { Catalog, RecordCatalog } from './core/types';
  36  
  37  const catalogKeys = ['institutions', 'departments', 'users', 'roles'];
  38  const recordKeys = ['documents', 'dossiers'];
  39  const connectedModules = new Set(['documents', 'dossiers', 'recherche', 'audit', 'classement', 'patrimoine', 'numerisation', 'ocr', 'metadonnees', 'versements', 'sort-final', 'gel-legal', 'eliminations', 'consultations', 'communications', 'controle', 'conservation', 'restauration']);
  40  
  41  function Shell() {
  42      const { me, demo, epoch, logout, switchPersona, resetDemo } = useSession();
  43      const { scope, setScope } = useWorkspace();
  44      const path = usePath();
  45      const [menu, setMenu] = useState(false);
  46      const [scopeOpen, setScopeOpen] = useState(false);
  47      const menuButton = useRef<HTMLButtonElement>(null);
  48      const menuPanel = useRef<HTMLElement>(null);
  49      const url = new URL(path, location.origin);
  50      const parts = url.pathname.split('/').filter(Boolean);
  51      const section = parts[1] ?? '';
  52      const id = parts[2];
  53      const central = platform(me);
  54      const nav = [
  55          { path: '', label: 'Vue d’ensemble', icon: 'home', group: 'workspace', ok: true, demo: false },
  56          { path: 'fonds', label: 'Fonds et producteurs', icon: 'tree', group: 'Archives', ok: !demo && me!.grants.some(g => g.permission === 'ARCHIVAL_DESCRIPTION_READ'), demo: false },
  57          { path: 'institutions', label: 'Institutions', icon: 'building', group: 'admin', ok: me!.grants.some(g => g.permission === 'IAM_INSTITUTION_READ'), demo: false },
  58          { path: 'departments', label: 'Départements', icon: 'tree', group: 'admin', ok: me!.grants.some(g => g.permission === 'IAM_DEPARTMENT_READ'), demo: false },
  59          { path: 'users', label: 'Utilisateurs', icon: 'users', group: 'admin', ok: me!.grants.some(g => g.permission === 'IAM_USER_READ'), demo: false },
  60          { path: 'roles', label: 'Rôles et habilitations', icon: 'shield', group: 'admin', ok: can(me, 'IAM_ROLE_READ', subjectTarget(me!)), demo: false },
  61          { path: 'permissions', label: 'Permissions', icon: 'key', group: 'admin', ok: can(me, 'IAM_ROLE_READ', subjectTarget(me!)), demo: false },
  62          { path: 'governance', label: 'Gouvernance', icon: 'check', group: 'admin', ok: central, demo: false },
  63          ...archiveModules.map(module => ({ path: module.id, label: module.title, icon: module.group === 'Patrimoine' ? 'archive' : 'tree', group: module.group, ok: true, demo: !connectedModules.has(module.id) })),
  64          { path: 'archives-physiques', label: 'Archives physiques', icon: 'archive', group: 'Conservation', ok: can(me, 'PHYSICALARCHIVES_READ', {}), demo: false },
  65          { path: 'droits', label: 'Droits et sources juridiques', icon: 'shield', group: 'Accès', ok: can(me, 'RIGHTS_READ', {}), demo: false },
  66          { path: 'circuits-validation', label: 'Circuits de validation', icon: 'check', group: 'Traitements', ok: can(me, 'WORKFLOW_DEFINITION_MANAGE', scope), demo: false },
  67          { path: 'profile', label: 'Mon profil', icon: 'users', group: 'support', ok: true, demo: false },
  68          { path: 'help', label: 'Guide & assistance', icon: 'help', group: 'support', ok: true, demo: false }
  69      ];
  70      const title = nav.find(item => item.path === section)?.label ?? 'Guide';
  71      const go = (route: string) => navigate('/app' + (route ? '/' + route : ''));
  72  
  73      useEffect(() => {
  74          setMenu(false);
  75          document.title = 'SNAE-PPD · ' + title;
  76          document.getElementById('main-content')?.focus({ preventScroll: true });
  77      }, [path]);
  78      useEffect(() => {
  79          const query = window.matchMedia('(min-width: 721px)');
  80          const closeWideMenu = () => { if (query.matches) setMenu(false); };
  81          query.addEventListener('change', closeWideMenu);
  82          return () => query.removeEventListener('change', closeWideMenu);
  83      }, []);
  84      useEffect(() => {
  85          if (!menu) return;
  86          menuPanel.current?.querySelector<HTMLButtonElement>('button')?.focus();
  87          const onKey = (event: KeyboardEvent) => {
  88              if (event.key === 'Escape') { setMenu(false); menuButton.current?.focus(); }
```

### S10 — Dépôt de contenu : état d’ingestion

backend fourni · `src/main/kotlin/gn/gouv/snaeppd/storage/domain/StorageModels.kt` · lignes 1–24.

```text
   1  package gn.gouv.snaeppd.storage.domain
   2  
   3  import gn.gouv.snaeppd.records.domain.FileRole
   4  import java.io.InputStream
   5  import java.nio.file.Files
   6  import java.nio.file.LinkOption
   7  import java.nio.file.Path
   8  import java.time.Instant
   9  import java.util.UUID
  10  
  11  enum class IngestionStatus { PROCESSING, RETRYABLE, REJECTED, COMPLETED }
  12  enum class ScanOutcome { CLEAN, INFECTED, ERROR }
  13  data class ObjectLocation(val provider: String, val bucket: String, val key: String)
  14  data class ContentDescriptor(val filename: String, val mediaType: String, val extension: String,
  15      val size: Long, val sha256: String)
  16  data class ScanReport(val outcome: ScanOutcome, val engine: String, val code: String, val scannedAt: Instant)
  17  data class UploadCommand(val versionId: UUID, val idempotencyKey: String, val role: FileRole)
  18  data class IngestionView(val id: UUID, val versionId: UUID, val status: IngestionStatus,
  19      val fileId: UUID?, val filename: String, val mediaType: String, val size: Long, val sha256: String,
  20      val attempts: Int, val resultCode: String?, val createdAt: Instant, val updatedAt: Instant,
  21      val leaseExpired: Boolean = false)
  22  data class IngestionPage(val items: List<IngestionView>, val nextCursor: UUID?)
  23  data class ReservedIngestion(val view: IngestionView, val attemptId: UUID?, val location: ObjectLocation?)
  24  data class ManagedContent(val fileId: UUID, val documentId: UUID, val attemptId: UUID,
```

### S11 — Clôture frontend initiale sans gestion locale de son erreur

frontend fourni · `src/pages/ArchivalIntake.tsx` · lignes 111–146.

```text
 111                  <div><dt>Statut</dt><dd><Badge value={intake.statut}/></dd></div>
 112                  <div><dt>Date d’entrée</dt><dd>{formatDate(intake.dateEntree)}</dd></div>
 113                  <div><dt>Référence de preuve</dt><dd>{intake.referencePreuve ?? '—'}</dd></div>
 114                  <div><dt>Description</dt><dd>{intake.description ?? '—'}</dd></div>
 115              </dl>
 116              {canManage && intake.statut === 'OUVERTE' && <div className="table-actions">
 117                  <button className="btn small secondary" onClick={() => setLinking('documents')}>Rattacher un document</button>
 118                  <button className="btn small secondary" onClick={() => setLinking('dossiers')}>Rattacher un dossier</button>
 119                  <button className="btn small secondary" onClick={() => setLinking('physical-archives')}>Rattacher une archive physique</button>
 120                  <button className="btn small warning" onClick={close}>Clôturer l’entrée</button>
 121              </div>}
 122          </div>
 123          <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose}>Fermer</button></footer>
 124          {linking && <LinkDialog intakeId={intake.id} kind={linking} onClose={() => setLinking(null)} onLinked={onChanged}/>}
 125      </Modal>;
 126  }
 127  
 128  export function ArchivalIntakePage() {
 129      const { me, archivalIntake, epoch } = useSession();
 130      const canManage = can(me, 'ARCHIVAL_INTAKE_MANAGE', {});
 131      const [creating, setCreating] = useState(false);
 132      const [selectedId, setSelectedId] = useState<string | null>(null);
 133      const entriesQ = useResource<ArchivalIntake[]>(s => archivalIntake!.entries(s), 'archival-intake-entries:' + epoch);
 134      const entries = entriesQ.data ?? [];
 135      const selected = entries.find(e => e.id === selectedId) ?? null;
 136      return <><PageHead eyebrow="MODULE · ENTRÉES D’ARCHIVES" title="Entrées archivistiques" description="Suivre les versements, dons, dépôts et autres entrées de fonds, et leur rattachement aux documents, dossiers et archives physiques.">
 137          {canManage && <button className="btn primary" onClick={() => setCreating(true)}>Créer une entrée</button>}
 138      </PageHead>
 139          <div className="panel">
 140              <div className="section-heading"><h3>Entrées</h3></div>
 141              {entriesQ.loading ? <Busy /> : entriesQ.error ? <ErrorNotice error={entriesQ.error} onRetry={entriesQ.refresh}/> : entries.length ? <div className="table-scroll"><table><thead><tr><th>Numéro</th><th>Mode</th><th>Date</th><th>Statut</th></tr></thead><tbody>{entries.map(e => <tr key={e.id}><td><button className="record-name" onClick={() => setSelectedId(e.id)}><strong>{e.numero}</strong></button></td><td>{e.modeEntree}</td><td>{formatDate(e.dateEntree)}</td><td><Badge value={e.statut}/></td></tr>)}</tbody></table></div> : <Empty title="Aucune entrée archivistique" description="Créez la première entrée."/>}
 142          </div>
 143          {creating && <CreateIntakeDialog onClose={() => setCreating(false)} onCreated={entriesQ.refresh}/>}
 144          {selected && <IntakeDetailDialog intake={selected} canManage={canManage} onClose={() => setSelectedId(null)} onChanged={entriesQ.refresh}/>}
 145          </>;
 146  }
```

### S12 — Déclarations de dépendances fournies

frontend fourni · `package.json` · lignes 1–40.

```text
   1  {
   2    "name": "snae-ppd-frontend",
   3    "private": true,
   4    "version": "0.2.0",
   5    "type": "module",
   6    "engines": {
   7      "node": "^22.22.2 || ^24.15.0 || >=26.0.0"
   8    },
   9    "scripts": {
  10      "dev": "vite --host 127.0.0.1",
  11      "demo": "vite --mode demo --host 127.0.0.1",
  12      "build": "tsc --noEmit && vite build",
  13      "build:demo": "tsc --noEmit && vite build --mode demo",
  14      "preview": "vite preview --host 127.0.0.1",
  15      "typecheck": "tsc --noEmit",
  16      "test": "npm run test:core && npm run test:ui",
  17      "check": "npm run test && npm run build",
  18      "test:ui": "vitest run --config vitest.config.ts",
  19      "test:core": "tsc -p tsconfig.core.json && node --test tests/*.test.mjs"
  20    },
  21    "dependencies": {
  22      "@supabase/supabase-js": "^2.57.4",
  23      "oidc-client-ts": "^3.3.0",
  24      "pdfjs-dist": "^6.3.289",
  25      "react": "^19.3.0",
  26      "react-dom": "^19.3.0"
  27    },
  28    "devDependencies": {
  29      "@napi-rs/canvas": "^1.0.9",
  30      "@testing-library/react": "^16.3.3",
  31      "@testing-library/user-event": "^14.6.7",
  32      "@types/node": "^22.0.0",
  33      "@types/react": "^19.2.0",
  34      "@types/react-dom": "^19.2.0",
  35      "jsdom": "^30.1.1",
  36      "typescript": "~5.9.3",
  37      "vite": "^8.0.0",
  38      "vitest": "^5.0.3"
  39    }
  40  }
```

### S13 — Numérisation et OCR : contrôleurs disponibles

backend fourni · `src/main/kotlin/gn/gouv/snaeppd/digitization/api/DigitizationController.kt` · lignes 1–129.

```text
   1  package gn.gouv.snaeppd.digitization.api
   2  
   3  import gn.gouv.snaeppd.digitization.service.*
   4  import jakarta.validation.Valid
   5  import jakarta.validation.constraints.NotBlank
   6  import jakarta.validation.constraints.NotNull
   7  import jakarta.validation.constraints.Size
   8  import org.springframework.http.HttpStatus
   9  import org.springframework.web.bind.annotation.*
  10  import tools.jackson.databind.JsonNode
  11  import java.math.BigDecimal
  12  import java.time.LocalDate
  13  import java.util.UUID
  14  
  15  data class CreateProjectRequest(@field:Size(max=100) val code: String? = null,
  16      @field:NotBlank @field:Size(max=255) val nom: String, val description: String? = null,
  17      val perimetre: String? = null, val responsableId: UUID? = null, val dateDebut: LocalDate? = null,
  18      val dateFinPrevue: LocalDate? = null)
  19  
  20  data class CreateElementRequest(@field:NotNull val projetNumerisationId: UUID, val archivePhysiqueId: UUID? = null,
  21      val documentId: UUID? = null, val ordre: Int? = null, val descriptionSource: String? = null)
  22  
  23  data class LinkFileRequest(@field:NotBlank @field:Size(max=40) val typeSortie: String)
  24  
  25  data class CreateQualityControlRequest(val dpi: Int? = null, @field:Size(max=40) val modeCouleur: String? = null,
  26      val nettete: BigDecimal? = null, val nombrePages: Int? = null, val conforme: Boolean,
  27      val defauts: JsonNode? = null, @field:Size(max=30) val decision: String? = null)
  28  
  29  data class CreateOcrResultRequest(@field:NotNull val fichierId: UUID,
  30      @field:NotBlank @field:Size(max=20) val typeReconnaissance: String, @field:NotBlank val texte: String,
  31      @field:Size(max=20) val langue: String? = null, @field:Size(max=100) val moteur: String? = null,
  32      @field:Size(max=50) val versionMoteur: String? = null, val confiance: BigDecimal? = null, val numeroPage: Int? = null)
  33  
  34  data class CreateContributionRequest(val resultatOcrId: UUID? = null,
  35      @field:NotBlank @field:Size(max=40) val typeContribution: String, @field:NotBlank @field:Size(max=20000) val contenu: String)
  36  
  37  @RestController
  38  @RequestMapping("/api/v1/digitization")
  39  class DigitizationController(private val projects: ProjectService, private val elements: ElementService,
  40      private val qualityControls: QualityControlService, private val ocrResults: OcrResultService,
  41      private val contributions: ContributionService) {
  42  
  43      @PostMapping("/projects")
  44      @ResponseStatus(HttpStatus.CREATED)
  45      fun createProject(@Valid @RequestBody r: CreateProjectRequest) = projects.create(
  46          CreateProjectCommand(r.code, r.nom, r.description, r.perimetre, r.responsableId, r.dateDebut, r.dateFinPrevue))
  47  
  48      @GetMapping("/projects/{id}")
  49      fun getProject(@PathVariable id: UUID) = projects.get(id)
  50  
  51      @GetMapping("/projects")
  52      fun listProjects() = projects.list()
  53  
  54      @PostMapping("/projects/{id}/complete")
  55      fun completeProject(@PathVariable id: UUID) = projects.complete(id)
  56  
  57      @PostMapping("/projects/{id}/cancel")
  58      fun cancelProject(@PathVariable id: UUID) = projects.cancel(id)
  59  
  60      @PostMapping("/elements")
  61      @ResponseStatus(HttpStatus.CREATED)
  62      fun createElement(@RequestHeader("Idempotency-Key") key: String, @Valid @RequestBody r: CreateElementRequest) = elements.create(
  63          CreateElementCommand(r.projetNumerisationId, r.archivePhysiqueId, r.documentId, r.ordre, r.descriptionSource, key))
  64  
  65      @GetMapping("/elements/{id}")
  66      fun getElement(@PathVariable id: UUID) = elements.get(id)
  67  
  68      @GetMapping("/elements")
  69      fun listElements() = elements.list()
  70  
  71      @GetMapping("/projects/{id}/elements")
  72      fun listElementsByProject(@PathVariable id: UUID) = elements.listByProject(id)
  73  
  74      @PostMapping("/elements/{id}/files/{fichierId}")
  75      fun linkFile(@PathVariable id: UUID, @PathVariable fichierId: UUID, @Valid @RequestBody r: LinkFileRequest) =
  76          elements.linkFichier(id, fichierId, r.typeSortie)
  77  
  78      @PostMapping("/elements/{id}/complete")
  79      fun completeElement(@PathVariable id: UUID) = elements.complete(id)
  80  
  81      @PostMapping("/elements/{id}/quality-controls")
  82      @ResponseStatus(HttpStatus.CREATED)
  83      fun createQualityControl(@PathVariable id: UUID, @RequestHeader("Idempotency-Key") key: String,
  84          @Valid @RequestBody r: CreateQualityControlRequest) = qualityControls.create(
  85          CreateQualityControlCommand(id, r.dpi, r.modeCouleur, r.nettete, r.nombrePages, r.conforme, r.defauts, r.decision, key))
  86  
  87      @GetMapping("/quality-controls/{id}")
  88      fun getQualityControl(@PathVariable id: UUID) = qualityControls.get(id)
  89  
  90      @GetMapping("/elements/{id}/quality-controls")
  91      fun listQualityControls(@PathVariable id: UUID) = qualityControls.listByElement(id)
  92  
  93      @GetMapping("/quality-controls")
  94      fun listAllQualityControls() = qualityControls.listAll()
  95  
  96      @PostMapping("/ocr-results")
  97      @ResponseStatus(HttpStatus.CREATED)
  98      fun createOcrResult(@RequestHeader("Idempotency-Key") key: String, @Valid @RequestBody r: CreateOcrResultRequest) = ocrResults.create(
  99          CreateOcrResultCommand(r.fichierId, r.typeReconnaissance, r.texte, r.langue, r.moteur, r.versionMoteur, r.confiance, r.numeroPage, key))
 100  
 101      @PostMapping("/ocr-results/{id}/validate")
 102      fun validateOcrResult(@PathVariable id: UUID, @RequestHeader("Idempotency-Key") key: String) = ocrResults.validate(id, key)
 103  
 104      @GetMapping("/ocr-results/{id}")
 105      fun getOcrResult(@PathVariable id: UUID) = ocrResults.get(id)
 106  
 107      @GetMapping("/files/{fichierId}/ocr-results")
 108      fun listOcrResults(@PathVariable fichierId: UUID) = ocrResults.listByFichier(fichierId)
 109  
 110      @PostMapping("/elements/{id}/contributions")
 111      @ResponseStatus(HttpStatus.CREATED)
 112      fun createContribution(@PathVariable id: UUID, @RequestHeader("Idempotency-Key") key: String,
 113          @Valid @RequestBody r: CreateContributionRequest) = contributions.create(
 114          CreateContributionCommand(id, r.resultatOcrId, r.typeContribution, r.contenu, key))
 115  
 116      @PostMapping("/contributions/{id}/approve")
 117      fun approveContribution(@PathVariable id: UUID, @RequestHeader("Idempotency-Key") key: String) =
 118          contributions.moderate(ModerateContributionCommand(id, true, key))
 119  
 120      @PostMapping("/contributions/{id}/reject")
 121      fun rejectContribution(@PathVariable id: UUID, @RequestHeader("Idempotency-Key") key: String) =
 122          contributions.moderate(ModerateContributionCommand(id, false, key))
 123  
 124      @GetMapping("/contributions/{id}")
 125      fun getContribution(@PathVariable id: UUID) = contributions.get(id)
 126  
 127      @GetMapping("/elements/{id}/contributions")
 128      fun listContributions(@PathVariable id: UUID) = contributions.listByElement(id)
 129  }
```

### S14 — Circuit et tâches : contrats disponibles

backend fourni · `src/main/kotlin/gn/gouv/snaeppd/workflow/api/WorkflowController.kt` · lignes 1–143.

```text
   1  package gn.gouv.snaeppd.workflow.api
   2  
   3  import gn.gouv.snaeppd.workflow.domain.WorkflowDomain
   4  import gn.gouv.snaeppd.workflow.service.*
   5  import jakarta.validation.Valid
   6  import jakarta.validation.constraints.NotBlank
   7  import jakarta.validation.constraints.NotNull
   8  import jakarta.validation.constraints.PositiveOrZero
   9  import jakarta.validation.constraints.Size
  10  import org.springframework.http.HttpStatus
  11  import org.springframework.web.bind.annotation.*
  12  import tools.jackson.databind.JsonNode
  13  import java.time.LocalDate
  14  import java.util.UUID
  15  
  16  @RestController
  17  @RequestMapping("/api/v1")
  18  class WorkflowController(
  19      private val definitions: WorkflowDefinitionService,
  20      private val runtime: WorkflowRuntimeService
  21  ) {
  22      @PostMapping("/admin/workflow-definitions")
  23      @ResponseStatus(HttpStatus.CREATED)
  24      fun create(@Valid @RequestBody request: CreateWorkflowRequest) = definitions.create(
  25          CreateWorkflowDefinitionCommand(request.code, request.name, request.domain, request.institutionId, request.effectiveFrom ?: LocalDate.now())
  26      ).toResponse()
  27  
  28      @PostMapping("/admin/workflow-definitions/{definitionId}/steps")
  29      @ResponseStatus(HttpStatus.CREATED)
  30      fun addStep(@PathVariable definitionId: UUID, @Valid @RequestBody request: AddStepRequest) = definitions.addStep(
  31          AddWorkflowStepCommand(definitionId, request.code, request.label, request.order, request.responsibleRoleId, request.delayMinutes, request.initial, request.final)
  32      ).toResponse()
  33  
  34      @PostMapping("/admin/workflow-definitions/{definitionId}/transitions")
  35      @ResponseStatus(HttpStatus.CREATED)
  36      fun addTransition(@PathVariable definitionId: UUID, @Valid @RequestBody request: AddTransitionRequest) = definitions.addTransition(
  37          AddWorkflowTransitionCommand(definitionId, request.sourceStepId, request.destinationStepId, request.code, request.condition, request.action)
  38      ).toResponse()
  39  
  40      @PostMapping("/admin/workflow-definitions/{definitionId}/document-types/{typeId}")
  41      @ResponseStatus(HttpStatus.CREATED)
  42      fun bind(@PathVariable definitionId: UUID, @PathVariable typeId: UUID, @Valid @RequestBody request: BindWorkflowRequest) = definitions.bind(
  43          BindWorkflowCommand(definitionId, typeId, request.required, request.priority, request.from ?: LocalDate.now(), request.to)
  44      ).toResponse()
  45  
  46      @PostMapping("/admin/workflow-definitions/{definitionId}/activate")
  47      fun activate(@PathVariable definitionId: UUID) = definitions.activate(definitionId).toResponse()
  48  
  49      @GetMapping("/admin/workflow-definitions")
  50      fun listDefinitions(@RequestParam(required = false) institutionId: UUID?) = definitions.list(institutionId).map { it.toResponse() }
  51  
  52      @GetMapping("/admin/workflow-definitions/{definitionId}")
  53      fun getDefinition(@PathVariable definitionId: UUID) = definitions.get(definitionId).toResponse()
  54  
  55      @GetMapping("/admin/workflow-definitions/{definitionId}/steps")
  56      fun listSteps(@PathVariable definitionId: UUID) = definitions.stepsOf(definitionId).map { it.toResponse() }
  57  
  58      @GetMapping("/admin/workflow-definitions/{definitionId}/transitions")
  59      fun listTransitions(@PathVariable definitionId: UUID) = definitions.transitionsOf(definitionId).map { it.toResponse() }
  60  
  61      @GetMapping("/admin/workflow-definitions/{definitionId}/document-types")
  62      fun listBindings(@PathVariable definitionId: UUID) = definitions.bindingsOf(definitionId).map { it.toResponse() }
  63  
  64      @GetMapping("/documents/{documentId}/workflow")
  65      fun listByDocument(@PathVariable documentId: UUID) = runtime.listByDocument(documentId)
  66  
  67      @PostMapping("/documents/{documentId}/workflow")
  68      @ResponseStatus(HttpStatus.CREATED)
  69      fun start(@PathVariable documentId: UUID, @RequestHeader(value = "Idempotency-Key", required = false) key: String?, @Valid @RequestBody request: StartWorkflowRequest) = runtime.start(
  70          StartDocumentWorkflowCommand(documentId, request.definitionId, workflowStartKey(key, request.idempotencyKey), request.context, request.entreeArchivistiqueId)
  71      ).toStartResponse()
  72  
  73      @PostMapping("/workflow-tasks/{taskId}/claim")
  74      fun claim(@PathVariable taskId: UUID) = runtime.claim(taskId).toResponse()
  75  
  76      @PostMapping("/workflow-tasks/{taskId}/complete")
  77      fun complete(@PathVariable taskId: UUID, @Valid @RequestBody request: CompleteTaskRequest) = runtime.complete(
  78          CompleteWorkflowTaskCommand(taskId, request.transitionCode, request.comment)
  79      ).toStartResponse()
  80  
  81      @PostMapping("/workflows/{instanceId}/cancel")
  82      fun cancel(@PathVariable instanceId: UUID, @Valid @RequestBody request: CancelWorkflowRequest) = runtime.cancel(
  83          CancelWorkflowCommand(instanceId, request.reason)
  84      ).toStartResponse()
  85  
  86      @GetMapping("/workflows/{instanceId}")
  87      fun get(@PathVariable instanceId: UUID) = runtime.get(instanceId)
  88  }
  89  
  90  data class CreateWorkflowRequest(
  91      @field:NotBlank @field:Size(max=100) val code: String,
  92      @field:NotBlank @field:Size(max=255) val name: String,
  93      val domain: WorkflowDomain = WorkflowDomain.DOCUMENT,
  94      val institutionId: UUID? = null,
  95      val effectiveFrom: LocalDate? = null
  96  )
  97  
  98  data class AddStepRequest(
  99      @field:NotBlank @field:Size(max=100) val code: String,
 100      @field:NotBlank @field:Size(max=255) val label: String,
 101      @field:PositiveOrZero val order: Int,
 102      @field:NotNull val responsibleRoleId: UUID,
 103      @field:PositiveOrZero val delayMinutes: Int? = null,
 104      val initial: Boolean = false,
 105      val final: Boolean = false
 106  )
 107  
 108  data class AddTransitionRequest(
 109      @field:NotBlank @field:Size(max=100) val code: String,
 110      @field:NotNull val sourceStepId: UUID,
 111      @field:NotNull val destinationStepId: UUID,
 112      val condition: JsonNode? = null,
 113      val action: JsonNode? = null
 114  )
 115  
 116  data class BindWorkflowRequest(
 117      val required: Boolean = true,
 118      @field:PositiveOrZero val priority: Int = 100,
 119      val from: LocalDate? = null,
 120      val to: LocalDate? = null
 121  )
 122  
 123  data class StartWorkflowRequest(
 124      val definitionId: UUID? = null,
 125      val idempotencyKey: String? = null,
 126      val context: JsonNode? = null,
 127      val entreeArchivistiqueId: UUID? = null
 128  )
 129  
 130  data class CompleteTaskRequest(
 131      val transitionCode: String? = null,
 132      val comment: String? = null
 133  )
 134  
 135  data class CancelWorkflowRequest(@field:NotBlank val reason: String)
 136  
 137  internal fun workflowStartKey(header: String?, body: String?): String? {
 138      val h = header?.trim()?.takeIf { it.isNotEmpty() }
 139      val b = body?.trim()?.takeIf { it.isNotEmpty() }
 140      if (h != null && b != null && h != b) throw gn.gouv.snaeppd.shared.error.ConflictException(
 141          "IDEMPOTENCY_KEY_MISMATCH", "La clé du corps diffère de l'en-tête Idempotency-Key.")
 142      return h ?: b
 143  }
```

### S15 — Endpoints publics et authentification

backend fourni · `src/main/kotlin/gn/gouv/snaeppd/shared/config/SecurityConfig.kt` · lignes 1–97.

```text
   1  package gn.gouv.snaeppd.shared.config
   2  
   3  import gn.gouv.snaeppd.shared.security.JwtAudienceValidator
   4  import gn.gouv.snaeppd.shared.security.JwtRequiredClaimsValidator
   5  import gn.gouv.snaeppd.shared.security.JwtSecurityProperties
   6  import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
   7  import org.springframework.boot.context.properties.EnableConfigurationProperties
   8  import org.springframework.context.annotation.Bean
   9  import org.springframework.context.annotation.Configuration
  10  import org.springframework.security.config.Customizer.withDefaults
  11  import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity
  12  import org.springframework.security.config.annotation.web.builders.HttpSecurity
  13  import org.springframework.security.config.http.SessionCreationPolicy
  14  import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator
  15  import org.springframework.security.oauth2.jwt.JwtDecoder
  16  import org.springframework.security.oauth2.jwt.JwtValidators
  17  import org.springframework.security.oauth2.jwt.NimbusJwtDecoder
  18  import org.springframework.security.web.AuthenticationEntryPoint
  19  import org.springframework.security.web.SecurityFilterChain
  20  import org.springframework.security.web.access.AccessDeniedHandler
  21  import org.springframework.http.client.SimpleClientHttpRequestFactory
  22  import org.springframework.web.client.RestTemplate
  23  
  24  @Configuration
  25  @EnableMethodSecurity
  26  @EnableConfigurationProperties(JwtSecurityProperties::class)
  27  class SecurityConfig {
  28      @Bean
  29      @ConditionalOnProperty(prefix = "snae.security.jwt", name = ["enabled"], havingValue = "true")
  30      fun jwtDecoder(properties: JwtSecurityProperties): JwtDecoder {
  31          require(properties.issuer.isNotBlank()) { "snae.security.jwt.issuer is required" }
  32          require(properties.jwkSetUri.isNotBlank()) { "snae.security.jwt.jwk-set-uri is required" }
  33          require(properties.audiences.isNotEmpty()) { "snae.security.jwt.audiences is required" }
  34          require(properties.algorithms.isNotEmpty() && properties.algorithms.all { it in setOf("RS256","ES256") }) {
  35              "JWT algorithms must be explicitly configured from RS256 or ES256"
  36          }
  37          val jwksHttpClient = RestTemplate(SimpleClientHttpRequestFactory().apply {
  38              setConnectTimeout(10_000)
  39              setReadTimeout(20_000)
  40          })
  41          val decoder = NimbusJwtDecoder.withJwkSetUri(properties.jwkSetUri).restOperations(jwksHttpClient).jwsAlgorithms { algorithms ->
  42              algorithms.clear()
  43              properties.algorithms.forEach {
  44                  algorithms.add(org.springframework.security.oauth2.jose.jws.SignatureAlgorithm.from(it))
  45              }
  46          }.build()
  47          decoder.setJwtValidator(
  48              DelegatingOAuth2TokenValidator(
  49                  JwtValidators.createDefaultWithIssuer(properties.issuer),
  50                  JwtAudienceValidator(properties.audiences),
  51                  JwtRequiredClaimsValidator()
  52              )
  53          )
  54          return decoder
  55      }
  56  
  57      @Bean
  58      @ConditionalOnProperty(prefix = "snae.security.jwt", name = ["enabled"], havingValue = "true")
  59      fun jwtSecurityFilterChain(
  60          http: HttpSecurity,
  61          authenticationEntryPoint: AuthenticationEntryPoint,
  62          accessDeniedHandler: AccessDeniedHandler
  63      ): SecurityFilterChain = configureBase(http, authenticationEntryPoint, accessDeniedHandler)
  64          .oauth2ResourceServer { it.jwt(withDefaults()).authenticationEntryPoint(authenticationEntryPoint) }
  65          .addFilterAfter(gn.gouv.snaeppd.identity.api.IdentityTokenContextFilter(),
  66              org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter::class.java)
  67          .build()
  68  
  69      @Bean
  70      @ConditionalOnProperty(prefix = "snae.security.jwt", name = ["enabled"], havingValue = "false", matchIfMissing = true)
  71      fun closedSecurityFilterChain(
  72          http: HttpSecurity,
  73          authenticationEntryPoint: AuthenticationEntryPoint,
  74          accessDeniedHandler: AccessDeniedHandler
  75      ): SecurityFilterChain = configureBase(http, authenticationEntryPoint, accessDeniedHandler).build()
  76  
  77      private fun configureBase(
  78          http: HttpSecurity,
  79          authenticationEntryPoint: AuthenticationEntryPoint,
  80          accessDeniedHandler: AccessDeniedHandler
  81      ): HttpSecurity = http
  82          .csrf { it.disable() }
  83          .sessionManagement { it.sessionCreationPolicy(SessionCreationPolicy.STATELESS) }
  84          .headers {
  85              it.contentTypeOptions(withDefaults())
  86              it.frameOptions { frame -> frame.deny() }
  87              it.httpStrictTransportSecurity { hsts -> hsts.includeSubDomains(true).maxAgeInSeconds(31_536_000) }
  88          }
  89          .exceptionHandling {
  90              it.authenticationEntryPoint(authenticationEntryPoint)
  91              it.accessDeniedHandler(accessDeniedHandler)
  92          }
  93          .authorizeHttpRequests {
  94              it.requestMatchers("/actuator/health", "/actuator/health/**", "/api/v1/system/status").permitAll()
  95              it.anyRequest().authenticated()
  96          }
  97  }
```

### S16 — Lecture documentaire et versions

backend fourni · `src/main/kotlin/gn/gouv/snaeppd/records/service/RecordQueryService.kt` · lignes 45–134.

```text
  45          authorization.requirePermission("DOCUMENT_READ", institutionId, departmentId)
  46          val bounded = boundedSize(size)
  47          val boundedPage = boundedPage(page)
  48          val ids = visibility.ids(true, institutionId, departmentId, boundedPage, bounded)
  49          val byId = documents.findAllById(ids.take(bounded)).associateBy { it.id }
  50          return RecordPage(ids.take(bounded).mapNotNull { byId[it]?.toResponse() }, boundedPage, bounded, ids.size > bounded)
  51      }
  52  
  53      fun document(id: UUID): DocumentResponse {
  54          val item = documents.findById(id).orElseThrow { notFound("DOCUMENT") }
  55          maskDenied("DOCUMENT") {
  56              authorization.requirePermission("DOCUMENT_READ", item.institutionId, item.departementId)
  57              confidentiality.requireReadable(item.id, item.niveauConfidentialite, item.institutionId, item.departementId)
  58          }
  59          return item.toResponse()
  60      }
  61  
  62      fun versions(documentId: UUID): List<VersionResponse> {
  63          val item = documents.findById(documentId).orElseThrow { notFound("DOCUMENT") }
  64          maskDenied("DOCUMENT") {
  65              authorization.requirePermission("DOCUMENT_READ", item.institutionId, item.departementId)
  66              confidentiality.requireReadable(item.id, item.niveauConfidentialite, item.institutionId, item.departementId)
  67          }
  68          return versions.findAllByDocumentIdOrderByNumeroVersionDesc(documentId).map { it.toResponse() }
  69      }
  70  
  71      fun files(versionId: UUID): List<FileResponse> {
  72          val version = versions.findById(versionId).orElseThrow { notFound("VERSION") }
  73          val document = documents.findById(version.documentId).orElseThrow { notFound("VERSION") }
  74          maskDenied("VERSION") {
  75              authorization.requirePermission("DOCUMENT_READ", document.institutionId, document.departementId)
  76              confidentiality.requireReadable(document.id, document.niveauConfidentialite, document.institutionId, document.departementId)
  77          }
  78          return files.findAllByVersionDocumentId(versionId).map { it.toResponse() }
  79      }
  80  
  81      fun dossiers(institutionId: UUID?, departmentId: UUID?, page: Int, size: Int): RecordPage<DossierResponse> {
  82          authorization.requirePermission("DOSSIER_READ", institutionId, departmentId)
  83          val bounded = boundedSize(size)
  84          val boundedPage = boundedPage(page)
  85          val ids = visibility.ids(false, institutionId, departmentId, boundedPage, bounded)
  86          val byId = dossiers.findAllById(ids.take(bounded)).associateBy { it.id }
  87          return RecordPage(ids.take(bounded).mapNotNull { byId[it]?.toResponse() }, boundedPage, bounded, ids.size > bounded)
  88      }
  89  
  90      fun dossier(id: UUID): DossierResponse {
  91          val item = dossiers.findById(id).orElseThrow { notFound("DOSSIER") }
  92          maskDenied("DOSSIER") {
  93              authorization.requirePermission("DOSSIER_READ", item.institutionId, item.departementId)
  94              confidentiality.requireClearance(item.niveauConfidentialite, item.institutionId, item.departementId)
  95          }
  96          return item.toResponse()
  97      }
  98  
  99      /** types_document has no institution dimension at all (it's a shared national reference catalog),
 100       * so there is no per-record scope to check — gated instead on the caller holding DOCUMENT_READ in
 101       * their own institution/department, mirroring IdentityAccess.catalog()'s pattern for reference data. */
 102      fun documentTypes(): List<DocumentTypeResponse> {
 103          val actor = actors.current()
 104          authorization.requirePermission("DOCUMENT_READ", actor.institutionId, actor.departmentId)
 105          return types.findAll().filter { it.statut == "ACTIF" }.sortedBy { it.code }.map { it.toResponse() }
 106      }
 107  
 108      /** Acteurs (personnes/organismes liés aux documents) sont aussi un référentiel partagé sans
 109       * dimension institution, même logique de contrôle que documentTypes(). */
 110      fun actorsList(page: Int, size: Int): RecordPage<ActorResponse> {
 111          val actor = actors.current()
 112          authorization.requirePermission("DOCUMENT_READ", actor.institutionId, actor.departmentId)
 113          val bounded = boundedSize(size)
 114          val boundedPage = boundedPage(page)
 115          val result = acteurs.findAll(PageRequest.of(boundedPage, bounded, Sort.by(Sort.Direction.ASC, "nom").and(Sort.by(Sort.Direction.ASC, "id"))))
 116          return RecordPage(result.content.map { it.toResponse() }, boundedPage, bounded, result.hasNext())
 117      }
 118  
 119      fun documentActors(documentId: UUID): List<DocumentActorResponse> {
 120          val item = documents.findById(documentId).orElseThrow { notFound("DOCUMENT") }
 121          maskDenied("DOCUMENT") {
 122              authorization.requirePermission("DOCUMENT_READ", item.institutionId, item.departementId)
 123              confidentiality.requireReadable(item.id, item.niveauConfidentialite, item.institutionId, item.departementId)
 124          }
 125          return documentActeurs.findAllByDocumentId(documentId).map { it.toResponse() }
 126      }
 127  
 128      private fun boundedSize(size: Int) = size.coerceIn(1, 100)
 129      private fun boundedPage(page: Int) = page.coerceAtLeast(0)
 130      private fun notFound(type: String) = NotFoundException("${type}_NOT_FOUND", "Ressource introuvable.")
 131      private inline fun maskDenied(type: String, check: () -> Unit) {
 132          try { check() } catch (e: AccessDeniedException) { throw notFound(type) }
 133      }
 134  }
```

## 15. Atlas des 42 parcours

Chaque fiche décrit un parcours de référence. Les exceptions complètent le chemin nominal ; elles ne sont pas des étapes obligatoires à exécuter successivement.

### P01 — Se connecter et retrouver son périmètre

**Domaine :** Identité · **Acteur :** Tous les utilisateurs  
**Couverture :** Contrat présent dans le code · **Écran :** `/app/profile`

1. Ouvrir la connexion
2. S’authentifier via le fournisseur configuré
3. Résoudre le compte avec /iam/me
4. Ouvrir le périmètre autorisé

**Exceptions et reprise :**

- Compte non provisionné : rester sur une erreur explicite
- Session expirée : annuler les requêtes et revenir à la connexion
- Aucun fournisseur configuré : connexion indisponible

**Résultat attendu :** Session nominative et droits reçus du serveur ; pas de rôle déduit du poste.

**Contrats existants cités :**

`GET /api/v1/iam/me`  

**Fichiers repères :** auth/session.tsx · IdentityController.kt

### P02 — Enregistrer une institution

**Domaine :** Identité · **Acteur :** Administrateur habilité  
**Couverture :** Contrat présent dans le code · **Écran :** `/app/institutions`

1. Rechercher une institution existante
2. Créer la fiche
3. Renseigner code interne, nom et type
4. Confirmer et ouvrir la fiche

**Exceptions et reprise :**

- Code en doublon : corriger
- Conflit de version : relire
- Permission refusée : aucune création

**Résultat attendu :** Institution créée ; le code applicatif n’est pas un numéro légal de création.

**Contrats existants cités :**

`GET /api/v1/iam/institutions`  
`POST /api/v1/iam/institutions`  

**Fichiers repères :** pages/Catalog.tsx · IdentityController.kt

### P03 — Structurer les départements

**Domaine :** Identité · **Acteur :** Administrateur habilité  
**Couverture :** Contrat présent dans le code · **Écran :** `/app/departments`

1. Choisir l’institution
2. Choisir une unité parente admissible
3. Renseigner le département
4. Enregistrer puis consulter l’impact

**Exceptions et reprise :**

- Parent incompatible ou cycle : refuser
- Réorganisation : examiner les comptes et droits dépendants

**Résultat attendu :** Structure organisationnelle rattachée ; ne pas réécrire la provenance historique.

**Contrats existants cités :**

`POST /api/v1/iam/departments`  
`GET /api/v1/iam/departments/{id}/impact`  

**Fichiers repères :** pages/EntityForm.tsx · IdentityGovernanceController.kt

### P04 — Provisionner un utilisateur SSO

**Domaine :** Identité · **Acteur :** Administrateur habilité  
**Couverture :** Parcours partiel à compléter · **Écran :** `/app/users`

1. Vérifier l’identité dans le fournisseur
2. Renseigner le sujet SSO et le profil
3. Choisir institution et département
4. Créer le compte applicatif

**Exceptions et reprise :**

- Le fournisseur SSO ne crée pas automatiquement le compte métier
- Pas d’invitation par email inventée

**Résultat attendu :** Compte rattaché à une identité existante ; automatisation d’invitation hors contrat observé.

**Contrats existants cités :**

`POST /api/v1/iam/users`  
`GET /api/v1/iam/users/{id}`  

**Fichiers repères :** pages/EntityForm.tsx · IdentityController.kt

### P05 — Attribuer ou révoquer des habilitations

**Domaine :** Identité · **Acteur :** Administrateur habilité  
**Couverture :** Parcours partiel à compléter · **Écran :** `/app/roles`

1. Sélectionner le rôle
2. Examiner les permissions
3. Choisir bénéficiaire, portée et période
4. Attribuer ou révoquer
5. Relire la synthèse d’accès

**Exceptions et reprise :**

- Périmètre trop large : refus
- Délégation expirée : ne pas proposer de commande
- Impossible de s’octroyer des droits implicitement

**Résultat attendu :** Habilitation explicite ; écrans dédiés de création des délégations et changement de portée à compléter.

**Contrats existants cités :**

`POST /api/v1/iam/role-assignments`  
`POST /api/v1/iam/role-assignments/{id}/revoke`  
`GET /api/v1/iam/users/{id}/access-summary`  

**Fichiers repères :** pages/Actions.tsx · IdentityController.kt

### P06 — Approuver un changement sensible de permissions

**Domaine :** Identité · **Acteur :** Deux administrateurs indépendants  
**Couverture :** Contrat présent dans le code · **Écran :** `/app/governance`

1. Examiner l’impact du rôle
2. Proposer la différence de permissions
3. Faire examiner par un autre approbateur
4. Appliquer, rejeter ou annuler
5. Relire le journal

**Exceptions et reprise :**

- Auto-approbation : refus
- Version dépassée : relire l’impact
- Réponse incertaine : même intention, jamais une nouvelle écriture aveugle

**Résultat attendu :** Changement appliqué après contrôle indépendant, ou demande clôturée sans effet.

**Contrats existants cités :**

`POST /api/v1/iam/roles/{id}/permission-changes`  
`POST /api/v1/iam/permission-changes/{id}/approve`  
`POST /api/v1/iam/permission-changes/{id}/reject`  

**Fichiers repères :** pages/Governance.tsx · IdentityGovernanceController.kt

### P07 — Gérer un départ et fermer les accès

**Domaine :** Identité · **Acteur :** Administrateur habilité  
**Couverture :** Contrat présent dans le code · **Écran :** `/app/users`

1. Ouvrir le compte
2. Vérifier attributions et délégations
3. Révoquer les accès concernés
4. Suspendre le compte et révoquer les anciens jetons
5. Contrôler la synthèse

**Exceptions et reprise :**

- La déconnexion du navigateur seule ne révoque pas les droits
- Conserver les traces de responsabilité des anciennes actions

**Résultat attendu :** Accès retirés sans effacer l’identité des événements historiques.

**Contrats existants cités :**

`POST /api/v1/iam/users/{id}/status`  
`POST /api/v1/iam/users/{id}/revoke-tokens`  

**Fichiers repères :** pages/Actions.tsx · IdentityController.kt

### P08 — Créer une entrée archivistique

**Domaine :** Versements · **Acteur :** Gestionnaire national habilité  
**Couverture :** Contrat présent dans le code · **Écran :** `/app/versements`

1. Choisir le mode d’entrée
2. Renseigner numéro et date réelle
3. Renseigner provenance et responsable disponibles
4. Créer l’entrée ouverte

**Exceptions et reprise :**

- Date future interdite
- Numéro déjà utilisé : corriger
- Nouvelle tentative identique : conserver la clé d’intention

**Résultat attendu :** Entrée OUVERTE. Le numéro est saisi, pas généré par le backend fourni.

**Contrats existants cités :**

`POST /api/v1/archival-intake/entries`  

**Fichiers repères :** pages/ArchivalIntake.tsx · ArchivalIntakeService.kt

### P09 — Rattacher le contenu d’une entrée

**Domaine :** Versements · **Acteur :** Gestionnaire national habilité  
**Couverture :** Parcours partiel à compléter · **Écran :** `/app/versements`

1. Ouvrir une entrée
2. Sélectionner un document, dossier ou original physique existant
3. Confirmer le rattachement
4. Vérifier l’état renvoyé

**Exceptions et reprise :**

- Objet inexistant : pas de rattachement
- Inventaire du contenu lié non fourni par ces GET
- Ne pas afficher un total de pièces non renvoyé

**Résultat attendu :** Liens enregistrés ; inventaire paginé et contrôles de lot restent à ajouter côté backend.

**Contrats existants cités :**

`POST /api/v1/archival-intake/entries/{id}/documents/{documentId}`  
`POST /api/v1/archival-intake/entries/{id}/dossiers/{dossierId}`  
`POST /api/v1/archival-intake/entries/{id}/physical-archives/{archiveId}`  

**Fichiers repères :** pages/ArchivalIntake.tsx · ArchivalIntakeController.kt

### P10 — Clôturer le registre d’entrée

**Domaine :** Versements · **Acteur :** Gestionnaire national habilité  
**Couverture :** Contrat présent dans le code · **Écran :** `/app/versements`

1. Ouvrir l’entrée
2. Vérifier les informations
3. Lire l’avertissement de clôture
4. Confirmer
5. Relire le statut serveur

**Exceptions et reprise :**

- Entrée déjà clôturée : conflit
- Échec réseau : relire avant de recommencer
- Clôture distincte de validation, scellement et conservation

**Résultat attendu :** État CLOTUREE, pas une preuve autonome d’admission probante.

**Contrats existants cités :**

`POST /api/v1/archival-intake/entries/{id}/close`  

**Fichiers repères :** pages/ArchivalIntake.tsx · ArchivalIntakeService.kt

### P11 — Admettre un versement complet avec bordereau

**Domaine :** Versements · **Acteur :** Service producteur puis archiviste  
**Couverture :** Évolution à développer · **Écran :** `/app/versements`

1. Préparer un lot
2. Contrôler l’inventaire et les fichiers
3. Soumettre
4. Accepter, refuser ou demander correction
5. Confirmer l’intégration
6. Produire le reçu lié à l’inventaire

**Exceptions et reprise :**

- Lot partiellement admis : politique à décider
- Stockage échoué : ne pas annoncer intégré
- Aucune transition inventée dans le mode connecté

**Résultat attendu :** Parcours cible. Lien entrée/workflow existant, mais admission du lot et bordereau non exposés dans cette archive.

**Contrats existants cités :**

Aucun contrat complet cité pour cette expérience cible ou transverse.

**Fichiers repères :** ArchivalIntakeController.kt · WorkflowController.kt

### P12 — Créer une notice et préparer ses fichiers

**Domaine :** Archives · **Acteur :** Agent documentaire habilité  
**Couverture :** Contrat présent dans le code · **Écran :** `/app/documents`

1. Créer la notice avec institution, type et référence
2. Lire les versions existantes
3. Sélectionner la version non scellée
4. Déposer le fichier
5. Suivre le reçu d’ingestion

**Exceptions et reprise :**

- Ne pas créer une version supplémentaire pour contourner une réponse incomplète
- Référence existante : relire
- Dépôt interrompu : suivre le reçu

**Résultat attendu :** Notice de travail, distincte d’une archive définitive.

**Contrats existants cités :**

`POST /api/v1/documents`  
`GET /api/v1/documents/{id}/versions`  
`POST /api/v1/versions/{versionId}/content`  

**Fichiers repères :** pages/RecordForm.tsx · pages/Records.tsx · RecordCoreController.kt

### P13 — Suivre un dépôt et traiter la quarantaine

**Domaine :** Archives · **Acteur :** Agent documentaire habilité  
**Couverture :** Parcours partiel à compléter · **Écran :** `/app/documents`

1. Sélectionner le fichier et son usage
2. Envoyer le contenu
3. Lire PROCESSING, RETRYABLE, REJECTED ou COMPLETED
4. Examiner analyse et état du fichier
5. Faire valider lorsque requis

**Exceptions et reprise :**

- COMPLETED ne signifie pas admission définitive
- REJECTED : ne pas relancer le même fichier sans correction
- Annulation backend présente ; commande UI à compléter

**Résultat attendu :** Le reçu technique, l’antivirus et la validation archivistique restent des états distincts.

**Contrats existants cités :**

`GET /api/v1/ingestions/{id}`  
`GET /api/v1/versions/{versionId}/ingestions`  
`POST /api/v1/ingestions/{id}/cancel`  

**Fichiers repères :** core/ingestion.ts · ContentStorageController.kt

### P14 — Valider le maître et sceller une version

**Domaine :** Archives · **Acteur :** Archiviste habilité  
**Couverture :** Contrat présent dans le code · **Écran :** `/app/documents`

1. Lire les fichiers et leur contrôle
2. Valider le fichier maître admissible
3. Examiner la version
4. Déclencher le scellement
5. Vérifier le hash et l’état
6. Horodater si le service est configuré

**Exceptions et reprise :**

- Fichier infecté ou maître absent : refus
- Version scellée : pas de remplacement
- Horodatage qualifié : disponibilité à confirmer en recette

**Résultat attendu :** Scellement technique et reçu d’horodatage éventuel ; aucune homologation juridique revendiquée.

**Contrats existants cités :**

`POST /api/v1/files/{fileId}/validate-master`  
`POST /api/v1/versions/{versionId}/seal`  
`POST /api/v1/versions/{versionId}/timestamp`  

**Fichiers repères :** pages/Records.tsx · FileIngestionService.kt · PreservationController.kt

### P15 — Créer et clore un dossier

**Domaine :** Archives · **Acteur :** Agent ou archiviste habilité  
**Couverture :** Parcours partiel à compléter · **Écran :** `/app/dossiers`

1. Créer un dossier contextualisé
2. Rattacher les notices à la création
3. Consulter sa fiche
4. Clore le dossier autorisé

**Exceptions et reprise :**

- Vue exhaustive des documents du dossier à compléter par contrat dédié
- Clôture du dossier distincte de la conservation définitive des pièces

**Résultat attendu :** Dossier décrit ; ne pas fabriquer une liste complète à partir d’une seule page documentaire.

**Contrats existants cités :**

`POST /api/v1/dossiers`  
`GET /api/v1/dossiers/{id}`  
`POST /api/v1/dossiers/{id}/close`  

**Fichiers repères :** pages/Records.tsx · RecordCoreController.kt

### P16 — Décrire un fonds et ses producteurs

**Domaine :** Archives · **Acteur :** Archiviste habilité  
**Couverture :** Contrat présent dans le code · **Écran :** `/app/fonds`

1. Choisir l’institution
2. Créer une autorité ou un producteur
3. Décrire les niveaux fonds, série, dossier ou pièce
4. Relier les notices
5. Exporter les formats disponibles

**Exceptions et reprise :**

- Parent invalide ou cycle : refus
- Version en conflit : relire
- Exports EAD/EAC à valider avec les outils d’échange destinataires

**Résultat attendu :** Description hiérarchique et provenance conservées, sans les confondre avec l’organigramme courant.

**Contrats existants cités :**

`GET /api/v1/archives/descriptions`  
`POST /api/v1/archives/authorities`  
`POST /api/v1/archives/descriptions`  
`GET /api/v1/archives/descriptions/{id}/ead`  

**Fichiers repères :** pages/ArchivalDescription.tsx · ArchiveController.kt

### P17 — Importer des descriptions en CSV

**Domaine :** Archives · **Acteur :** Archiviste habilité  
**Couverture :** Contrat présent dans le code · **Écran :** `/app/fonds`

1. Obtenir le modèle
2. Préparer les lignes
3. Prévisualiser et contrôler les anomalies
4. Confirmer avec le hash de prévisualisation
5. Relire le résultat

**Exceptions et reprise :**

- Prévisualisation périmée : recommencer
- Ligne invalide : corriger avant import
- Échappement CSV nécessaire à l’export

**Résultat attendu :** Import contrôlé ; pas d’écriture à partir d’un fichier non prévisualisé.

**Contrats existants cités :**

`GET /api/v1/archives/template/{kind}`  
`POST /api/v1/archives/imports/preview`  
`POST /api/v1/archives/imports`  

**Fichiers repères :** pages/ArchivalDescription.tsx · ArchiveController.kt

### P18 — Administrer le plan de classement

**Domaine :** Archives · **Acteur :** Archiviste habilité  
**Couverture :** Parcours partiel à compléter · **Écran :** `/app/classement`

1. Choisir la portée
2. Créer un nœud et son parent
3. Activer la rubrique
4. Reclasser un document autorisé
5. Vérifier le rattachement

**Exceptions et reprise :**

- Code en doublon : refus
- Rubrique inactive : ne pas proposer
- Déplacement des branches et versionnement complet à étendre

**Résultat attendu :** Classement actif et rattachement documentaire ; provenance inchangée.

**Contrats existants cités :**

`POST /api/v1/classification/nodes`  
`POST /api/v1/classification/nodes/{id}/activate`  
`PUT /api/v1/documents/{id}/classification`  

**Fichiers repères :** pages/Classification.tsx · ClassificationController.kt

### P19 — Définir puis renseigner les métadonnées

**Domaine :** Archives · **Acteur :** Archiviste puis agent habilité  
**Couverture :** Contrat présent dans le code · **Écran :** `/app/metadonnees`

1. Créer un schéma et ses champs
2. Lier les types documentaires
3. Activer le schéma
4. Ouvrir les champs applicables au document
5. Valider et enregistrer les valeurs

**Exceptions et reprise :**

- Type, champ requis ou enum invalide : erreur au champ
- Remplacement complet : préserver les valeurs non modifiées
- Changement d’un schéma actif à cadrer

**Résultat attendu :** Des formulaires métier typés, sans exposer le JSON aux utilisateurs ordinaires.

**Contrats existants cités :**

`POST /api/v1/admin/metadata-schemas`  
`GET /api/v1/documents/{documentId}/metadata/schema`  
`PUT /api/v1/documents/{documentId}/metadata`  

**Fichiers repères :** pages/Metadata.tsx · MetadataController.kt

### P20 — Retrouver une archive autorisée

**Domaine :** Archives · **Acteur :** Utilisateur habilité  
**Couverture :** Contrat présent dans le code · **Écran :** `/app/recherche`

1. Saisir des mots-clés
2. Choisir document, dossier ou tous
3. Parcourir les résultats autorisés
4. Ouvrir la fiche
5. Affiner la recherche

**Exceptions et reprise :**

- Aucun résultat ne prouve pas l’absence de document
- Index indisponible : afficher une erreur, pas zéro résultat
- Filtres date et institution absents du contrat de recherche fourni

**Résultat attendu :** Résultats filtrés par le serveur ; aucune fuite de titre ou d’extrait non autorisé.

**Contrats existants cités :**

`GET /api/v1/search?q=…&type=…&page=…&size=…`  

**Fichiers repères :** pages/Search.tsx · SearchController.kt

### P21 — Consulter ou télécharger un fichier

**Domaine :** Archives · **Acteur :** Lecteur habilité  
**Couverture :** Contrat présent dans le code · **Écran :** `/app/documents`

1. Ouvrir la notice
2. Choisir une version et un fichier lisible
3. Vérifier l’accès serveur
4. Prévisualiser
5. Télécharger seulement selon le contrat actuel

**Exceptions et reprise :**

- Accès refusé : fermer l’aperçu
- Session changée : révoquer l’URL locale
- Fichier altéré, trop volumineux ou non pris en charge : état explicite

**Résultat attendu :** Le contrat actuel sert le même contenu à la lecture et au téléchargement ; séparation de droits à développer.

**Contrats existants cités :**

`GET /api/v1/files/{fileId}/content`  

**Fichiers repères :** ui/FileContentDialog.tsx · ContentStorageController.kt

### P22 — Configurer un circuit de validation

**Domaine :** Traitements · **Acteur :** Administrateur fonctionnel habilité  
**Couverture :** Contrat présent dans le code · **Écran :** `/app/circuits-validation`

1. Créer une définition
2. Définir étapes et rôles
3. Définir les transitions
4. Associer les types documentaires
5. Valider et activer le graphe

**Exceptions et reprise :**

- Étape initiale/finale incohérente : refus
- Graphe invalide : corriger
- Aucun code de transition inventé par le frontend

**Résultat attendu :** Un circuit paramétré, pas une séquence figée commune à tous les documents.

**Contrats existants cités :**

`POST /api/v1/admin/workflow-definitions`  
`POST /api/v1/admin/workflow-definitions/{definitionId}/steps`  
`POST /api/v1/admin/workflow-definitions/{definitionId}/transitions`  

**Fichiers repères :** pages/Workflow.tsx · WorkflowController.kt

### P23 — Prendre en charge et terminer une validation

**Domaine :** Traitements · **Acteur :** Validateur habilité  
**Couverture :** Parcours partiel à compléter · **Écran :** `/app/documents`

1. Ouvrir le circuit du document
2. Prendre une tâche ouverte
3. Examiner les pièces
4. Choisir une transition autorisée
5. Terminer la tâche
6. Relire le prochain état

**Exceptions et reprise :**

- Tâche déjà prise : conflit
- Mauvais responsable : refus
- Échec d’écriture : état inconnu à relire
- API des transitions disponibles par acteur à ajouter

**Résultat attendu :** Instance EN_COURS puis TERMINE ; terminer le circuit n’est pas automatiquement admettre un lot.

**Contrats existants cités :**

`GET /api/v1/documents/{documentId}/workflow`  
`POST /api/v1/workflow-tasks/{taskId}/claim`  
`POST /api/v1/workflow-tasks/{taskId}/complete`  

**Fichiers repères :** pages/Workflow.tsx · WorkflowRuntimeService.kt

### P24 — Demander une correction et reprendre le circuit

**Domaine :** Traitements · **Acteur :** Validateur et agent documentaliste  
**Couverture :** Parcours partiel à compléter · **Écran :** `/app/documents`

1. Examiner la tâche
2. Choisir la transition de correction configurée
3. Motiver le retour
4. Corriger l’objet autorisé
5. Reprendre selon le graphe

**Exceptions et reprise :**

- Retour impossible sans transition configurée
- Une version scellée ne se modifie pas
- Suspension et annulation sont des décisions distinctes

**Résultat attendu :** Branche dépendante de la définition active ; libellé métier à fournir avec les transitions serveur.

**Contrats existants cités :**

`POST /api/v1/workflow-tasks/{taskId}/complete`  
`POST /api/v1/workflows/{instanceId}/cancel`  

**Fichiers repères :** pages/Workflow.tsx · WorkflowRuntimeService.kt

### P25 — Suivre un projet de numérisation

**Domaine :** Traitements · **Acteur :** Opérateur habilité  
**Couverture :** Parcours partiel à compléter · **Écran :** `/app/numerisation`

1. Créer le projet
2. Référencer les originaux et les éléments
3. Numériser avec l’équipement externe
4. Déposer puis lier les fichiers
5. Contrôler et terminer le projet

**Exceptions et reprise :**

- Aucun pilotage TWAIN/WIA exposé
- Un projet peut être annulé
- Élément incomplet : ne pas afficher terminé

**Résultat attendu :** Suivi et rattachement disponibles ; capture scanner à intégrer séparément.

**Contrats existants cités :**

`POST /api/v1/digitization/projects`  
`POST /api/v1/digitization/elements`  
`POST /api/v1/digitization/elements/{id}/files/{fichierId}`  

**Fichiers repères :** pages/Digitization.tsx · DigitizationController.kt

### P26 — Enregistrer puis valider un résultat OCR

**Domaine :** Traitements · **Acteur :** Opérateur puis contrôleur habilité  
**Couverture :** Parcours partiel à compléter · **Écran :** `/app/ocr`

1. Sélectionner un fichier admissible
2. Importer le texte produit par un moteur externe
3. Renseigner langue, moteur et confiance
4. Vérifier les résultats
5. Valider le texte

**Exceptions et reprise :**

- Résultat enregistré ≠ moteur OCR exécuté
- Confiance 0–1 descriptive, pas garantie d’exactitude
- Conservation de l’original obligatoire dans le design

**Résultat attendu :** NON_VALIDE puis VALIDE ; pas de bouton « Lancer l’OCR » sans service d’exécution.

**Contrats existants cités :**

`POST /api/v1/digitization/ocr-results`  
`POST /api/v1/digitization/ocr-results/{id}/validate`  

**Fichiers repères :** pages/Digitization.tsx · DigitizationController.kt

### P27 — Consigner un contrôle qualité

**Domaine :** Traitements · **Acteur :** Contrôleur habilité  
**Couverture :** Contrat présent dans le code · **Écran :** `/app/controle`

1. Ouvrir l’élément et les fichiers
2. Examiner lisibilité et complétude
3. Renseigner la fiche de contrôle
4. Consigner la décision
5. Corriger et contrôler à nouveau si nécessaire

**Exceptions et reprise :**

- Un contrôle déclaré ne prouve pas une analyse automatique
- Pas de statut automatique À corriger si aucun objet backend correspondant

**Résultat attendu :** Constat tracé ; formulaires visuels à préférer au JSON de défauts.

**Contrats existants cités :**

`GET /api/v1/digitization/quality-controls`  
`POST /api/v1/digitization/elements/{id}/quality-controls`  

**Fichiers repères :** pages/Digitization.tsx · DigitizationController.kt

### P28 — Demander et instruire une consultation

**Domaine :** Accès · **Acteur :** Demandeur puis instructeur habilités  
**Couverture :** Contrat présent dans le code · **Écran :** `/app/consultations`

1. Créer une demande sur une référence connue et admissible
2. Consulter ses demandes
3. Faire prendre en charge
4. Autoriser ou refuser avec motif
5. Présenter la décision

**Exceptions et reprise :**

- Une autorisation de demande n’accorde pas implicitement un droit de téléchargement
- Aucun catalogue d’objets secrets n’est exposé pour demander l’accès

**Résultat attendu :** DEPOSEE → EN_INSTRUCTION → AUTORISEE ou REFUSEE, deux fins alternatives.

**Contrats existants cités :**

`POST /api/v1/consultations/requests`  
`GET /api/v1/consultations/requests?mine=true`  
`POST /api/v1/consultations/requests/{id}/claim`  
`POST /api/v1/consultations/requests/{id}/authorize`  

**Fichiers repères :** pages/Consultations.tsx · ConsultationController.kt

### P29 — Communiquer une pièce et enregistrer son retour

**Domaine :** Accès · **Acteur :** Gestionnaire des communications  
**Couverture :** Contrat présent dans le code · **Écran :** `/app/communications`

1. Sélectionner le bénéficiaire et l’objet
2. Référencer la demande si nécessaire
3. Enregistrer la communication
4. Constater la remise
5. Constater la restitution

**Exceptions et reprise :**

- Demande autorisée distincte de pièce remise
- Communication physique et téléchargement ne sont pas interchangeables

**Résultat attendu :** DEMANDEE → REMISE → RESTITUEE ; contrôles serveur conservés.

**Contrats existants cités :**

`POST /api/v1/communications`  
`POST /api/v1/communications/{id}/deliver`  
`POST /api/v1/communications/{id}/return`  

**Fichiers repères :** pages/Consultations.tsx · ConsultationController.kt

### P30 — Gérer les sources et restrictions d’accès

**Domaine :** Accès · **Acteur :** Archiviste ou responsable habilité  
**Couverture :** Contrat présent dans le code · **Écran :** `/app/droits`

1. Créer la référence juridique vérifiée
2. Rattacher le statut au document
3. Ouvrir la restriction
4. Examiner ses conditions
5. Lever avec justification

**Exceptions et reprise :**

- Une restriction de lecture n’est pas un gel de conservation
- Aucun délai juridique national inventé par le frontend

**Résultat attendu :** Restriction documentée et tracée ; sources à valider par les responsables compétents.

**Contrats existants cités :**

`POST /api/v1/rights/sources`  
`POST /api/v1/rights/documents/{documentId}/restrictions`  
`POST /api/v1/rights/restrictions/{id}/release`  

**Fichiers repères :** pages/Rights.tsx · RightsController.kt

### P31 — Publier un dérivé autorisé et le retirer

**Domaine :** Accès · **Acteur :** Responsable de publication habilité  
**Couverture :** Parcours partiel à compléter · **Écran :** `/app/documents`

1. Vérifier droits et version
2. Choisir le fichier de diffusion
3. Choisir canal et licence
4. Publier
5. Retirer si nécessaire

**Exceptions et reprise :**

- Le maître de conservation ne se publie pas comme un dérivé
- Publication métier ≠ portail public anonyme
- Revalidation des restrictions au serveur

**Résultat attendu :** Publication PUBLIEE ou RETIREE ; portail public séparé absent du périmètre livré.

**Contrats existants cités :**

`POST /api/v1/publication/documents/{documentId}/publications`  
`POST /api/v1/publication/publications/{id}/withdraw`  

**Fichiers repères :** pages/Records.tsx · PublicationController.kt · SecurityConfig.kt

### P32 — Appliquer une règle de conservation

**Domaine :** Conservation · **Acteur :** Archiviste habilité  
**Couverture :** Contrat présent dans le code · **Écran :** `/app/sort-final`

1. Définir et activer la règle applicable
2. Clore le document selon ses prérequis
3. Planifier l’échéance
4. Examiner l’événement calculé
5. Suivre l’arrivée à échéance

**Exceptions et reprise :**

- Règle absente ou ambiguë : blocage explicite
- Date de base absente : ne pas inventer une échéance
- Gel actif : suspendre le traitement concerné

**Résultat attendu :** Date et règle calculées côté serveur, pas une durée arbitraire dans la fiche.

**Contrats existants cités :**

`POST /api/v1/retention/documents/{documentId}/schedule`  
`GET /api/v1/retention/events`  

**Fichiers repères :** pages/RetentionNational.tsx · RetentionController.kt

### P33 — Décider le sort final sans fausse destruction

**Domaine :** Conservation · **Acteur :** Proposant, validateur et exécutant distincts  
**Couverture :** Parcours partiel à compléter · **Écran :** `/app/eliminations`

1. Ouvrir l’échéance
2. Proposer une disposition
3. Faire valider indépendamment
4. Lire les blocages readiness
5. Exécuter la conservation définitive ou le réexamen supporté

**Exceptions et reprise :**

- ELIMINER : DESTRUCTION_STORAGE_NOT_CONFIGURED
- TRANSFERER : TRANSFER_HANDOVER_NOT_CONFIGURED
- Gel ou acteur non indépendant : refus

**Résultat attendu :** La destruction physique et le transfert final sont volontairement bloqués par le backend actuel.

**Contrats existants cités :**

`POST /api/v1/retention/events/{id}/dispositions`  
`POST /api/v1/retention/dispositions/{id}/validate`  
`GET /api/v1/retention/dispositions/{id}/readiness`  
`POST /api/v1/retention/dispositions/{id}/execute`  

**Fichiers repères :** DispositionService.kt · RetentionPolicy.kt

### P34 — Ouvrir puis lever un gel

**Domaine :** Conservation · **Acteur :** Responsable habilité  
**Couverture :** Contrat présent dans le code · **Écran :** `/app/gel-legal`

1. Identifier document ou dossier
2. Renseigner référence et motif
3. Ouvrir le gel
4. Vérifier l’impact sur les échéances
5. Lever avec référence de décision

**Exceptions et reprise :**

- Le gel bloque le devenir mais n’est pas une restriction de consultation
- Levée ≠ suppression ni exécution automatique

**Résultat attendu :** ACTIF → LEVE ; décisions de conservation réexaminées ensuite selon le serveur.

**Contrats existants cités :**

`POST /api/v1/retention/legal-holds`  
`POST /api/v1/retention/legal-holds/{id}/release`  

**Fichiers repères :** LegalHoldService.kt · pages/Records.tsx

### P35 — Surveiller intégrité et sauvegardes

**Domaine :** Conservation · **Acteur :** Responsable de préservation habilité  
**Couverture :** Contrat présent dans le code · **Écran :** `/app/conservation`

1. Lire l’état du service
2. Filtrer les anomalies
3. Ouvrir le fichier concerné
4. Vérifier l’intégrité ou consigner l’intervention
5. Consulter les sauvegardes

**Exceptions et reprise :**

- Planificateur désactivé : l’indiquer, pas un faux statut vert
- Anomalie d’intégrité : bloquer l’usage concerné
- Restauration de sauvegarde : pas de commande UI inventée

**Résultat attendu :** État réellement renvoyé par le serveur ; disponibilité d’exploitation non prouvée par l’audit statique.

**Contrats existants cités :**

`GET /api/v1/preservation/monitor`  
`GET /api/v1/preservation/backups`  
`POST /api/v1/files/{fileId}/verify-integrity`  

**Fichiers repères :** ui/PreservationMonitoring.tsx · PreservationMonitorController.kt

### P36 — Localiser et déplacer une archive physique

**Domaine :** Patrimoine · **Acteur :** Magasinier ou archiviste habilité  
**Couverture :** Contrat présent dans le code · **Écran :** `/app/archives-physiques`

1. Définir les lieux et unités de rangement
2. Enregistrer l’archive physique
3. Consigner une sortie ou un mouvement
4. Suivre l’échéance de retour
5. Enregistrer la restitution

**Exceptions et reprise :**

- Emplacement incompatible ou inactif : refus
- Original manquant : signalement et traçabilité
- Un fichier numérisé ne remplace pas automatiquement l’original

**Résultat attendu :** Localisation et mouvements gérés avec leurs objets dédiés.

**Contrats existants cités :**

`GET /api/v1/physical-archives/archives`  
`GET /api/v1/physical-archives/locations`  

**Fichiers repères :** pages/PhysicalArchives.tsx · PhysicalArchivesController.kt

### P37 — Enrichir un document patrimonial

**Domaine :** Patrimoine · **Acteur :** Conservateur habilité  
**Couverture :** Contrat présent dans le code · **Écran :** `/app/patrimoine`

1. Ouvrir une notice
2. Relier lieux, événements et sujets
3. Renseigner les textes contextuels
4. Vérifier les attributions et sources
5. Consulter le contexte

**Exceptions et reprise :**

- Date incertaine : conserver la précision déclarée
- Valeur patrimoniale ≠ accès public automatique

**Résultat attendu :** Description patrimoniale enrichie sans modifier le contenu original.

**Contrats existants cités :**

`POST /api/v1/heritage/documents/{documentId}/texts`  
`GET /api/v1/heritage/documents/{documentId}/subjects`  

**Fichiers repères :** pages/Heritage.tsx · HeritageController.kt

### P38 — Conduire une restauration physique

**Domaine :** Patrimoine · **Acteur :** Conservateur et intervenant habilités  
**Couverture :** Contrat présent dans le code · **Écran :** `/app/restauration`

1. Créer le diagnostic
2. Soumettre la demande
3. Autoriser et démarrer l’intervention
4. Consigner les actes et le résultat
5. Terminer et restituer à la conservation

**Exceptions et reprise :**

- Pas d’approbation fictive sans habilitation
- Échec ou intervention partielle à documenter
- Photos et pièces probantes selon les objets disponibles

**Résultat attendu :** DIAGNOSTIC → A_VALIDER → EN_COURS → TERMINEE selon les transitions serveur.

**Contrats existants cités :**

`GET /api/v1/physical-archives/restorations`  

**Fichiers repères :** pages/PhysicalArchives.tsx · PhysicalArchivesController.kt

### P39 — Examiner la traçabilité

**Domaine :** Pilotage · **Acteur :** Auditeur national habilité  
**Couverture :** Contrat présent dans le code · **Écran :** `/app/audit`

1. Choisir catégorie ou objet
2. Parcourir les événements paginés
3. Ouvrir le détail
4. Examiner acteur, date, avant et après
5. Relier à l’opération métier

**Exceptions et reprise :**

- Accès AUDIT_READ national requis dans le code courant
- Une erreur de lecture n’est pas un journal vide
- Aucun effacement du journal depuis le frontend

**Résultat attendu :** Lecture auditée ; l’audit statique ne prouve pas une inaltérabilité certifiée.

**Contrats existants cités :**

`GET /api/v1/audit/events`  
`GET /api/v1/audit/objects/{objectType}/{objectId}/events`  

**Fichiers repères :** pages/Audit.tsx · AuditController.kt

### P40 — Disposer d’une corbeille de tâches et d’indicateurs

**Domaine :** Pilotage · **Acteur :** Chaque métier dans son périmètre  
**Couverture :** Évolution à développer · **Écran :** `/app/parcours`

1. Choisir une vue Mes tâches
2. Voir uniquement les tâches autorisées
3. Filtrer retards et actions
4. Ouvrir l’objet source
5. Actualiser les indicateurs agrégés

**Exceptions et reprise :**

- Aucun total national calculé à partir d’une page
- Endpoint global Mes tâches absent
- Ne pas exposer les compteurs d’objets interdits

**Résultat attendu :** Cible prioritaire : endpoints agrégés, filtrage serveur et compteur par périmètre à ajouter.

**Contrats existants cités :**

Aucun contrat complet cité pour cette expérience cible ou transverse.

**Fichiers repères :** WorkflowController.kt · pages/Dashboard.tsx

### P41 — Recevoir une notification exploitable

**Domaine :** Pilotage · **Acteur :** Utilisateur concerné  
**Couverture :** Évolution à développer · **Écran :** `/app/parcours`

1. Recevoir une alerte serveur
2. Lire la cause et l’échéance
3. Ouvrir la ressource autorisée
4. Traiter l’action
5. Relire le nouvel état

**Exceptions et reprise :**

- Une notification n’est pas une preuve de traitement
- Email, centre de notifications et accusé de lecture non exposés dans les contrôleurs examinés

**Résultat attendu :** Aucun bouton de notification avec compteur fictif dans le mode connecté.

**Contrats existants cités :**

Aucun contrat complet cité pour cette expérience cible ou transverse.

**Fichiers repères :** Inventaire des 21 contrôleurs fournis

### P42 — Reprendre après un incident sans doublon

**Domaine :** Transversal · **Acteur :** Tous les utilisateurs  
**Couverture :** Parcours partiel à compléter · **Écran :** `/app/parcours`

1. Identifier lecture ou écriture
2. Afficher la cause et la référence technique
3. Préserver l’intention de commande lorsque supportée
4. Relire le serveur
5. Reprendre explicitement

**Exceptions et reprise :**

- 401 : reconnexion
- 403/404 masqué : ne pas divulguer l’objet
- 409 : version ou état périmé
- 422 : corriger les champs
- 503/réseau : succès non confirmé

**Résultat attendu :** Le retour visuel ne doit jamais afficher une réussite inventée ; généraliser à tous les formulaires.

**Contrats existants cités :**

Aucun contrat complet cité pour cette expérience cible ou transverse.

**Fichiers repères :** core/http.ts · core/commands.ts · pages/Workflow.tsx

