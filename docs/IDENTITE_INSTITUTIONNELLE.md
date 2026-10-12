# SNAE-PPD — Direction graphique institutionnelle F1.1

Date : 24 septembre 2026. Proposition graphique pour la recette du frontend, et non charte officielle homologuée.

## Repères retenus

En-tête « RÉPUBLIQUE DE GUINÉE », devise « Travail · Justice · Solidarité », drapeau à bandes verticales rouge, jaune, verte. Le cartouche SNAE-PPD conserve l'intitulé complet du système. Le français est indiqué sans drapeau étranger et sans faux sélecteur de langue.

Les pages officielles ci-dessous ont été consultées pour les repères républicains et les intitulés de services. Elles ne certifient pas cette proposition et aucune charte graphique officielle complète n'a été obtenue :

- MMAFP, Symboles : https://mmafp.gov.gn/symboles/
- Portail E-GOUV : https://app.gov.gn/
- Espace agent FUGAS : https://agent.fugas.gov.gn/
- Service public : https://service-public.gov.gn/

Aucune copie d'armoiries, sceau, photo de responsable, signature, logo ministériel ou adresse de contact non validée n'est ajoutée. Le pictogramme d'archives est un signe du projet, pas un emblème de l'État. Les couleurs ci-dessous sont des choix de design, pas des valeurs officielles de la charte nationale.

## Palette et composition

| Usage | Couleur |
|---|---|
| Vert principal | #154B3E |
| Boutons primaires | #16553F |
| Fonds de travail | #F5F7F4 |
| Surfaces | #FFFFFF |
| Accent doré | #B58B36 |
| Accent rouge | #C73143 |
| Accent jaune | #E9BF47 |
| Accent vert national | #188156 |

En-tête républicain commun, navigation blanche regroupée par responsabilités, statut de recette explicite, périmètre visible, cartes de services sobres, tableaux administratifs. Le décor de livres flottants et les grands effets de l'ancienne connexion sont retirés. Typographie système Segoe UI / Arial, Georgia uniquement pour la phrase patrimoniale : aucune police distante ni fichier de police distribué.

## Écrans concernés

Connexion Supabase Auth ou OIDC selon la configuration, entrée de démonstration, espace de travail, institutions, départements, utilisateurs, rôles, permissions, fiches, formulaires, confirmation des commandes, profil et gouvernance.

Le code métier du client reste inchangé. Les indicateurs de l'accueil sont calculés sur les droits de /iam/me, pas des statistiques nationales. La démonstration reste fictive et en mémoire. Aucun import, scan ou espace documentaire non implémenté n'est présenté comme actif.

## Responsive et interactions

Disposition spécifique pour les petits écrans. Navigation mobile avec ouverture explicite, fermeture par Échap, retour du focus et fermeture lors d'un passage à la disposition bureau. Les tableaux larges défilent dans leur conteneur, sans imposer un défilement horizontal à toute la page. Aide à la connexion dépliable, étiquettes de champs et bouton d'affichage du mot de passe conservés.

Les vérifications de quelques parcours au clavier et de plusieurs largeurs ne constituent pas un audit complet d'accessibilité ni une conformité WCAG annoncée.

## Organisation du code

- src/ui/Institutional.tsx : drapeau, en-tête et signature institutionnelle.
- src/pages/Login.tsx : connexion et assistance.
- src/pages/Dashboard.tsx : espace de travail.
- src/app.tsx : structure commune, navigation et périmètre.
- src/institutional.css : thème F1.1, appliqué après les composants de src/styles.css.
- public/brand.svg : favicon du projet, sans armoiries inventées.

La validation institutionnelle du nom, des éventuels emblèmes et de la charte reste nécessaire avant publication sur un domaine de production.
