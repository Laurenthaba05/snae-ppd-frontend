# Imports en masse — Excel et CSV

## Périmètre livré
Création d'institutions, départements, dossiers et notices documentaires. Aucun import de comptes, mots de passe, rôles ou attributions de droits. L'import ne met pas à jour les objets existants : une référence déjà prise est une erreur, pas une autorisation d'écrasement.

Quatre modèles XLSX et quatre CSV sont fournis dans `modeles/`. Ils contiennent une ligne **TEST fictive**, à remplacer/supprimer avant utilisation. Les champs de date sont du texte ISO. Dans Excel, conserver le format Texte ; ne pas les transformer en nombres de série.

| Type | Colonnes |
|---|---|
| Institutions | code, nom, sigle, type_institution |
| Départements | code, nom, type_unite, parent_code |
| Dossiers | reference, titre, objet, description, confidentialite, classement_id |
| Documents | reference, titre, type_document_code, date_document, description, confidentialite, dossier_reference, classement_id, nom_fichier |

Le contexte institution/département est choisi dans l'application, pas accepté librement depuis chaque ligne. Les départements parents, dossiers, types et rubriques cités doivent déjà exister et être autorisés. Un parent de département se crée dans un lot antérieur. Les codes documentaires doivent correspondre au référentiel réel, par exemple RAPPORT uniquement s'il existe.

## Parcours
Choisir le type et le périmètre → sélectionner le tableau → contrôle antivirus → analyse bornée → aperçu des lignes et erreurs → correction du fichier si nécessaire → confirmation explicite → création transactionnelle des notices → rattachement des fichiers séparés → extraction éventuelle.

Un lot est limité à **500 lignes de données**, **5 Mio**, 24 colonnes et 5 000 caractères par cellule. CSV UTF-8, BOM accepté, séparateur point-virgule par défaut, virgule/tabulation possibles. Les champs cités multilignes sont pris en charge.

Excel : `.xlsx` uniquement, première feuille visible nommée `Donnees`. Les anciennes versions `.xls`, les `.xlsm`, formules de la feuille de données, macros, cellules fusionnées dans les données, lignes de données cachées et liens externes sont refusés. Le lecteur n'évalue aucune formule. Les propriétés avancées d'Excel ne sont pas un format d'import supporté. Un classeur de 5 Mio peut aussi être rejeté s'il dépasse les limites de décompression ou de structure.

L'API accepte une correspondance `mapping` entre en-têtes normalisés et champs autorisés. **L'écran livré s'appuie sur les modèles canoniques ; il ne contient pas encore d'éditeur graphique de correspondance de colonnes.** Les numéros du rapport désignent les lignes logiques de données (après retrait des lignes entièrement vides), pas nécessairement le numéro physique d'une feuille comportant des trous.

## Validation et atomicité
L'aperçu expire après 24 heures pour empêcher une validation tardive ; dix aperçus actifs au maximum par agent. Le propriétaire conserve l'accès au lot selon ses habilitations courantes. Le rapport d'erreurs CSV neutralise les préfixes de formule.

À la confirmation, le hash du fichier et les droits/références sont revérifiés. La transaction de création est tout-ou-rien. Une erreur à cette étape annule les créations du lot ; les contrôles préalables ne sont pas la promesse qu'aucune condition concurrente ne peut changer.

Les dépôts de fichiers sont ensuite **des opérations distinctes**. Excel/CSV contient les notices, pas les octets du PDF. La colonne `nom_fichier` sert à associer les fichiers choisis dans l'interface, sans chemin local ni URL. Le backend réutilise la version initiale réellement créée et la chaîne de dépôt existante. Il n'invente pas une deuxième version pour contourner un manque d'identifiant.

Un fichier absent, un rejet antivirus ou une interruption ne supprime pas les notices déjà importées et ne transforme pas le lot en versement accepté. L'interface affiche les reçus individuels et permet leur relecture. **La création des notices et l'envoi de tous leurs fichiers ne sont pas une transaction distribuée unique.**

## Reprise et conservation des données d'import
Conserver la référence du lot affichée. La même clé avec la même requête permet la reprise ; la même clé avec un autre contenu est refusée. Après rechargement, le lot peut être retrouvé par son identifiant dans le panneau de reprise ; un historique global filtrable reste à développer. Si la réponse initiale est perdue avant réception de l'identifiant, vérifier les références dans le catalogue avant de créer une nouvelle intention.

Les octets du classeur ne sont pas conservés par le module ; les données normalisées, erreurs et références le sont. L'expiration d'un aperçu n'est **pas** une suppression de ses données. La purge des charges d'import/extraction demande une politique de conservation distincte, non automatisée dans cette version.
