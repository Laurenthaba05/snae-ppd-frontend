> Le connecteur est un projet séparé. Les commandes ci-dessous s’exécutent depuis sa racine, pas depuis ce dépôt.

# Scanner depuis l'application — connecteur local

## Architecture et matériel
Le frontend pilote un service sur **127.0.0.1:8765**. Ce service appelle NAPS2 Console sur le poste Windows de l'agent. NAPS2 utilise un profil de scanner créé et testé par l'opérateur. Le backend distant n'accède pas directement au câble USB.

Le connecteur livré cible l'invocation **Windows `NAPS2.Console.exe`**. NAPS2 propose aussi d'autres plateformes, mais leurs conventions de commande ne sont pas implémentées ni qualifiées ici. Le support effectif du matériel dépend du scanner, de son pilote et du profil NAPS2 ; aucun scanner physique n'a été utilisé pendant les tests.

## Préparation du poste
Installer le pilote fabricant et NAPS2 depuis une source approuvée. Dans NAPS2, créer un profil nommé par exemple `SNAE Bureau`, tester une page à plat, puis le chargeur/recto-verso seulement s'ils sont supportés. Fermer toute tâche de scan concurrente.

Copier `config.example.json` dans le projet distinct `snae-ppd-scanner` dans un dossier privé externe au dépôt. Renseigner le chemin absolu de NAPS2, la liste fermée des profils autorisés et **l'origine exacte du frontend**, schéma et port compris. `localhost` et `127.0.0.1` sont des origines différentes.

Le connecteur exige HTTPS pour l'usage normal. Faire provisionner par l'administrateur un certificat valide et approuvé pour `127.0.0.1`, incluant le SAN IP approprié, puis renseigner `tlsCertificate` et `tlsPrivateKey`. Protéger la clé par les ACL du poste. Le paquet ne fournit pas de clé privée ni de mécanisme d'installation de certificat automatique.

```powershell
cd "C:\Dev\snae-ppd-scanner"
py -3 .\scanner_bridge.py --config "C:\SNAE-Recette-Privee\scanner.json"
```

Pour un essai exclusivement local avec un frontend local HTTP, l'option `--allow-http-local` est disponible explicitement. Elle n'est pas un mode de déploiement institutionnel et n'autorise pas un site distant à contacter le service HTTP. Ne pas désactiver les protections globales du navigateur ou la validation TLS pour faire fonctionner le scan.

## Jumelage et utilisation
Le connecteur affiche un code temporaire aléatoire dans sa console locale. Le saisir dans l'onglet **Scanner un document**, avec l'adresse du connecteur. Ce code expire après huit heures ; il n'est ni un mot de passe DB ni le JWT SSO. Il reste en mémoire de l'onglet, pas en localStorage, et n'est pas envoyé au backend.

Choisir profil, source (vitre/chargeur/recto-verso) et résolution 150/200/300 dpi → lancer → **relire l'état et l'aperçu** → vérifier le PDF → choisir notice et version existantes → importer le scan → suivre le reçu → demander l'extraction après ingestion terminée.

Le scan crée un PDF dans un répertoire temporaire du poste ; le navigateur n'envoie le document au backend qu'après l'action d'import de l'agent. Un document peut être préparé par import tabulaire avant cette étape. L'écran ne crée pas silencieusement une notice à la place de l'utilisateur.

Chrome peut demander l'autorisation d'accès au réseau local/loopback. Les certificats, la permission du navigateur, la politique CSP du site, le reverse proxy et les règles de sécurité du poste doivent être vérifiés ensemble. Ce parcours HTTPS + réseau local n'a pas été testé avec votre environnement institutionnel.

## Sécurité et limites
Écoute loopback uniquement ; Host et Origin contrôlés ; aucune origine générique `*` ; code de session distinct ; commandes NAPS2 prédéfinies sans shell ni arguments libres ; un scan simultané ; timeout 180 secondes ; quatre résultats temporaires au maximum ; taille du PDF plafonnée à 50 Mio. Le dépôt backend peut imposer un plafond inférieur.

Le PDF reste soumis aux contrôles antivirus et d'intégrité du backend. Le succès matériel d'un scan n'est ni un archivage probant ni une admission au SAE. L'option OCR NAPS2 est désactivée : l'extraction est réalisée dans la chaîne contrôlée côté serveur.

Le bouton de suppression locale n'efface que la copie temporaire du connecteur. Les tâches terminées âgées de plus de trente minutes sont nettoyées lors des interactions suivantes, et à l'arrêt normal. Après arrêt forcé/crash, vérifier et purger les répertoires temporaires selon la procédure de poste. Les permissions POSIX sont restrictives ; sous Windows, vérifier les ACL héritées du répertoire temporaire. Aucun effacement sécurisé garanti n'est revendiqué.

Non fournis : installateur Windows signé, déploiement automatique de certificats, service Windows supervisé, sélection dynamique de tous les pilotes, capture caméra, éditeur de recadrage/fusion/réorganisation des pages. Un délai réseau incertain après lancement exige la relecture de l'état plutôt qu'un nouvel appui répétitif sur Scanner.
