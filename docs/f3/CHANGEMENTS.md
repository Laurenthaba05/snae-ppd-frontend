# Portée de F3

## Ajouts

`src/design/f3.css` — palette, mise en page, navigation réduite, tableaux, formulaires,
états, parcours et règles responsive.

`src/design/navigation.ts` — correspondance des espaces avec les permissions visuelles.
Les modules nationaux restent nationaux selon le contrat actuel. Cette couche ne sécurise
pas les API et ne crée pas de rôle implicite.

`src/design/journeys.ts`, `src/pages/Journeys.tsx` — atlas de 42 parcours et branches d’erreur.

`src/pages/DesignPreview.tsx` — registre, fiche et états visuels synthétiques, entrées et
accès aux parcours. Aucun moteur OCR, preuve d’intégrité ou admission n’est simulé comme réel.

`src/ui/Tabs.tsx` — onglets avec sélection clavier.

`tests/f3/design.test.mjs` — 16 tests de visibilité, périmètre et référence de contrats.

## Modifications

`src/app.tsx` — navigation repliable, routes de démonstration séparées, entrée du guide,
visibilité métier, suppression de la mention permanente « Module 01 ».

`src/pages/Dashboard.tsx` — accueil orienté opérations, sans compteurs fabriqués.

`src/pages/Records.tsx` — onglets conditionnels, contrôle des droits avant certains panneaux,
gestion d’erreur du retrait de publication, retrait du choix NON_PUBLIE lors d’une publication,
retrait de la durée préremplie de dix ans.

`src/pages/ArchivalIntake.tsx` — clé d’intention de création pour corps identique, sélecteur
documentaire, confirmation et erreur de clôture, précision que clôture n’est pas admission.

`src/main.tsx` — chargement du thème. `package.json` — ajout du script test:f3 ; dépendances
et lockfile conservés. `.env.example` et `.env.demo` — configurations nettoyées.

## Pas encore livré

Admission complète/bordereau probant ; destruction/transfert effectifs ; scanner direct ;
exécution d’un moteur OCR ; portail public anonyme ; centre de notifications ; corbeille
globale de tâches ; nouveaux écrans détaillés pour chaque opération de chaque domaine ;
audit de sécurité/accès exhaustif ; recette complète PostgreSQL/SSO/stockage.

Les API existantes et les écrans métier fournis restent dans la source. Certains écrans
conservent des champs techniques et nécessitent un second passage UX. Ne pas confondre
l’atlas de conception avec la livraison de 42 workflows exécutables.
