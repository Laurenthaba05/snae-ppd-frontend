# Configuration — Frontend F1.1

## 1. Deux environnements distincts

La démonstration est explicitement construite avec `npm run demo` ou `npm run build:demo`. Elle ne lit ni token ni secret et reste en mémoire. Le mode API utilise `npm run dev` puis `npm run build`. Une erreur HTTP ne provoque pas de fallback fictif.

Toutes les variables préfixées VITE_ sont visibles dans le bundle navigateur. N’y écrire aucun mot de passe PostgreSQL, client_secret, clé Storage privilégiée ou service_role. Ne jamais transférer le `.env` du backend vers ce projet.

## 2. Mode API de développement

Dans `.env.local` :

```dotenv
VITE_DATA_MODE=api
VITE_APP_LABEL=Recette institutionnelle
VITE_API_BASE=/api/v1
DEV_BACKEND_TARGET=http://127.0.0.1:8080
```

Le backend reste un service séparé. Son URL de base de données doit pointer vers une base de recette, et ses migrations/tests doivent être vérifiés avant de le démarrer. Le frontend n’exécute aucun Flyway ni SQL. Toutes les requêtes navigateur passent par `/api` de même origine. Ne pas résoudre un défaut CORS en ouvrant des origines `*` ou en désactivant les autorisations Spring.

Le proxy conserve la vérification des certificats quand le backend cible utilise HTTPS. La valeur http proposée ne convient qu’au trafic de boucle locale. Pour une topologie distante, configurer HTTPS et les autorités de certification attendues.

### Adresse d'assistance de l'écran de connexion

```dotenv
VITE_SUPPORT_EMAIL=assistance@institution.gn
```

Facultatif. Avec une adresse, le bandeau « Besoin d'un accès ? » de l'écran de connexion devient un lien de courrier (`mailto:`, objet « Demande d'accès SNAE-PPD ») qui **montre l'adresse** : un poste sans messagerie configurée peut ainsi la copier ; le panneau d'aide (bouton « Assistance » de l'en-tête, « Un problème de connexion ? ») la rappelle aussi. Sans valeur, le bandeau garde son bouton « En savoir plus » et l'aide intégrée. Une valeur qui n'a pas la forme d'une adresse (espace, virgule, point-virgule, `?`, plusieurs adresses…) est ignorée, jamais placée telle quelle dans un lien. Comme toutes les variables `VITE_`, l'adresse est lue **à la construction** (`npm run build`) et visible dans le bundle : à régler dans l'environnement de chaque construction, `.env.local` n'étant pas versionné.

## 3. Supabase Auth

```dotenv
VITE_AUTH_MODE=supabase
VITE_SUPABASE_URL=https://VOTRE_PROJET.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=VOTRE_CLE_PUBLIQUE
```

La clé doit être **publishable** ou l’ancienne clé **anon**, jamais secret/service_role. Le projet PostgreSQL existant n’implique pas que le fournisseur Auth soit correctement configuré. Utiliser un projet et des comptes de recette dont le fournisseur émet des tokens acceptés par le backend (issuer, audience, algorithme et JWKS correspondants).

Le formulaire envoie les identifiants au SDK du fournisseur, pas à un endpoint Spring `/login`. Le fournisseur retourne un access token ; le frontend l’envoie à `/api/v1/iam/me` puis aux commandes autorisées. Le `sub` doit avoir été provisionné et habilité dans SNAE par le processus opérateur approuvé. Aucun rôle ni compte n’est créé automatiquement par la connexion.

Configuration du SDK : `persistSession:false`, session en mémoire, renouvellement par le SDK tant que la session active le permet. Fermer/recharger l’onglet fait perdre la session locale. Le mot de passe saisi est effacé du formulaire après la tentative. Le module ne propose pas de faux reset password : la récupération reste chez le fournisseur.

## 4. OIDC institutionnel

```dotenv
VITE_AUTH_MODE=oidc
VITE_OIDC_AUTHORITY=https://IDENTITE_INSTITUTIONNELLE/realm
VITE_OIDC_CLIENT_ID=CLIENT_PUBLIC_FRONTEND
VITE_OIDC_SCOPE=openid profile email
```

Configurer le client public chez le fournisseur pour Authorization Code + PKCE. URI de retour de développement : `http://localhost:5173/auth/callback` ; déclarer séparément l’URI HTTPS de recette/déploiement. Ne pas mélanger 127.0.0.1 et localhost si le fournisseur exige un redirect_uri exact. L’audience du token doit correspondre à celle attendue par le resource server ; cela peut nécessiter une configuration fournisseur spécifique.

`oidc-client-ts` gère state/nonce/PKCE. Le state temporaire de transaction est dans sessionStorage, la session utilisateur est en mémoire. Aucun refresh token n’est explicitement demandé via offline_access. Cette version ne configure pas de renouvellement silencieux iframe ; à expiration, une nouvelle connexion est nécessaire. La sortie ferme la session locale, pas forcément la session globale du fournisseur.

Les accès HTTP doivent être HTTPS hors boucle locale. Aucun schéma HTTP de fournisseur ni client_secret n’est accepté. Une redirection échouée efface l’URL de callback ; les détails du token ne sont pas affichés.

## 5. Tokens et sécurité

Les tokens ne sont pas copiés dans localStorage et ne sont jamais envoyés à une URL choisie par une donnée métier. Le client de l’API utilise uniquement une base relative `/api/...`, sans cookie applicatif ajouté, sans cache HTTP intentionnel et sans suivi des redirections de l’API. Les requêtes métier incluent Bearer et X-Correlation-Id ; les écritures incluent Idempotency-Key.

La mémoire du navigateur ne protège pas à elle seule contre toute XSS. Le frontend n’est pas une frontière d’autorisation et ne répare pas les défauts du backend. Pour une exploitation sensible, évaluer un BFF et une session en cookie HttpOnly avec protection CSRF, en conservant un mécanisme SSO central validé. Ce BFF n’est pas livré dans F1.

Le compte est relu via `/me` périodiquement et au retour de fenêtre. Un 401 ferme les vues protégées ; un 403 ne se transforme jamais en succès ou en mode demo. La révocation est appliquée par le backend au moment de la requête, pas garantie à la seconde par un bouton masqué.

Les réponses peuvent arriver après expiration ou changement de périmètre : les lectures sont annulables et leurs anciens résultats ne sont plus affichés après changement de clé/périmètre. Pas de cache métier persistant ni service worker. La sortie annule les requêtes connues et efface l’identité affichée.

## 6. Distribution web

Servir le bundle API et le backend sous la même origine : `/` pour les fichiers statiques, `/api/` pour Spring. Le reverse proxy doit préserver Authorization et X-Correlation-Id, conserver les contrôles TLS en amont, ne pas mettre en cache `/api/` et renvoyer index.html pour les routes `/app/...` et `/auth/callback`.

`deploy/nginx-location-example.conf` fournit seulement les locations à adapter dans une configuration HTTPS gérée par l’exploitant. Ce n’est pas une configuration de production universelle : définir certificats, authentification du réseau, CSP avec les origines Auth exactes, HSTS et supervision. Ne pas utiliser `vite --host 0.0.0.0` ni `vite preview` comme serveur public.

Après `npm install`, vérifier et committer package-lock.json ; utiliser npm ci dans la chaîne de livraison. Ne pas déployer un ancien bundle contenant une mauvaise audience ou une URL de recette : les VITE_ sont incorporées à la construction. Redémarrer Vite après modification de `.env.local`.

## Références officielles

- https://vite.dev/guide/
- https://vite.dev/guide/env-and-mode
- https://authts.github.io/oidc-client-ts/
- https://supabase.com/docs/reference/javascript/auth-signinwithpassword
- https://supabase.com/docs/guides/getting-started/api-keys

Ces références documentent les bibliothèques ; elles ne certifient pas l’intégration SNAE-PPD.
