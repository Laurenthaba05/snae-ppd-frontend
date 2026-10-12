# Recette frontend F1.1

## A. Sans backend : vérifier l’interface

Exécuter `npm install`, `npm test`, puis `npm run demo`. Ouvrir localhost:5173. Tous les comptes sont des personas fictives, sans mot de passe et sans droit serveur.

1. Ouvrir la démonstration : bandeau permanent, administrateur A et espace de travail. Les indicateurs décrivent des grants, pas une volumétrie nationale.
2. Institutions : créer une ressource QA_F1 ; relire la commande, confirmer et retrouver la ligne. Modifier avec motif, puis suspendre. Une ressource archivée est terminale.
3. Départements : choisir une institution, ouvrir la liste, utiliser la sélection paginée d’un parent. Les cycles et rattachements devront être testés contre le serveur, pas déduits de la démo.
4. Utilisateurs : ouvrir une identité différente de soi, consulter les attributions, utiliser les formulaires avec sub fictif uniquement en démo. Ne pas y saisir de véritables données personnelles.
5. Rôles : ouvrir Archiviste de démonstration, configurer les permissions, ajouter DOSSIER_CREATE, motiver et soumettre une proposition.
6. Impact et demandes : A ne dispose pas d’un bouton d’approbation de sa propre proposition. Passer à la persona B, retrouver le rôle, examiner les différences, approuver avec motif : demande APPLIED.
7. Passer à Agent : gouvernance absente et écritures indisponibles. Cela teste l’affichage, pas la sécurité du backend.
8. À 390px : ouvrir/fermer le menu, naviguer, vérifier les tableaux défilants et les modales. Naviguer au clavier ; Escape ferme une modale non occupée.
9. Se déconnecter : aucune fiche protégée ne reste affichée. Réinitialiser/recharger : toutes les mutations de démonstration disparaissent.

Automatisation optionnelle du navigateur (avec le serveur demo déjà lancé) :

```powershell
python -m pip install playwright
python -m playwright install chromium
python scripts/recette_browser.py --base-url http://localhost:5173
```

Le script n’utilise aucun compte réel. Les résultats et captures vont dans artifacts/browser. La procédure de revue hors ligne décrite dans VALIDATION est distincte et n’est pas le build Vite.

## B. Avec une vraie API de recette

Préconditions : tests backend/migrations validés, serveur sécurisé opérationnel, base jetable/copie, fournisseur JWT configuré, identités SSO nominatives A/B/T/X et habilitations explicites. Ne pas basculer vers la base d’archives réelles. Configurer le frontend en API et un seul fournisseur, puis `npm run dev`.

- Sans token/configuration : pas d’accès aux écrans protégés, aucun fallback demo.
- Token valide mais sub non provisionné : erreur 403 visible, aucune auto-création de compte ou droit.
- A habilité : /me retourne les grants, les listes sont chargées dans leur périmètre.
- Création puis répétition exacte : reçu serveur et ressource uniques. Interrompre une réponse d’écriture : état incertain affiché, pas de rejeu automatique.
- Mettre une fiche à jour dans une seconde fenêtre : expectedVersion périmée doit conduire à 409 et à une relecture, pas à un écrasement silencieux.
- X hors institution : aucune consultation ni mutation permise en changeant seulement l’UUID ou la route ; ne pas tester seulement un bouton caché.
- Rôle utilisé : PUT direct refusé, proposition puis approbation indépendante ; droits de A/B revérifiés au moment de la résolution ; demande expirée/version périmée refusée.
- Suspendre/révoquer un compte via une autre autorité : prochaine requête refusée. Reconnexion avec ancien token ne doit pas contourner auth_not_before.
- Vérifier dans l’audit backend acteur, heure, objet, résultat et corrélation, sans token complet ni mot de passe.
- Backend ou IdP indisponible : message contrôlé, aucune réussite ni statistiques fictives.

Tester le mode OIDC avec le vrai callback, state, PKCE, audience et signature, puis le mode Supabase uniquement si ce fournisseur est retenu. Les tests unitaires et visuels livrés ne valident pas ce parcours externe.

## C. Acceptation avant ouverture

Installation npm vérifiée + lockfile revu ; npm ci reproductible ; npm run check réussi ; recette navigateur sur build Vite ; parcours SSO réel ; périmètres IAM ; corrections P0/P1 du backend ; contrôles TLS/CSP/cache/proxy ; sauvegarde/restauration. Aucune certification de production ni conformité d’accessibilité globale n’est revendiquée par F1.
