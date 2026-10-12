# Texte et métadonnées — extraction locale et relecture

## Formats et traitement
| Source | Ce que le moteur fait |
|---|---|
| PDF texte | Extraction page par page via Poppler ; aucune rasterisation obligatoire |
| PDF scanné ou mixte | OCR des pages pauvres en texte en mode AUTO ; mode FORCE disponible |
| PNG/JPEG | Informations techniques et OCR si demandé |
| TIFF multipage | Traitement image par image, sous plafond |
| DOCX | Texte des paragraphes et propriétés embarquées ; pas d'OCR des images internes ni rendu exhaustif des en-têtes/pieds de page |
| TXT UTF-8 | Texte natif et repérage des champs possibles |

Aucun ancien DOC, archive ZIP arbitraire, PDF chiffré protégé ou manuscrit n'est annoncé comme reconnu de façon fiable. Le document doit d'abord être présent dans le stockage géré, validé, contrôlé antivirus CLEAN et relié à une notice accessible.

Le worker ne contacte aucun service OCR/IA cloud. Les exécutables approuvés sont lancés avec arguments fixes et environnement filtré. Les fichiers d'origine ne sont pas réécrits. Le résultat est une représentation dérivée à relire, pas une conversion automatique en PDF/A ou un nouveau document officiel.

## Ce qui est calculé et ce qui reste une proposition
Les informations techniques comprennent format déclaré/inspecté, taille, SHA-256, pages ou dimensions lorsqu'ils peuvent être déterminés. Le nombre de pages d'un DOCX n'est pas inventé : sa pagination dépend du rendu, il reste inconnu.

Les champs métiers sont issus de règles explicites : première ligne plausible comme titre, mentions de date, motif de référence, type possible, auteur déclaré dans les propriétés embarquées. Chaque proposition porte sa provenance, un extrait et, quand c'est possible, une page. **Le système n'utilise pas un modèle de compréhension générale entraîné sur les documents administratifs guinéens.** Ce sont des heuristiques transparentes, à enrichir après mesure sur votre corpus.

Une date EXIF, une date de création PDF ou un nom d'auteur Word ne prouvent pas la date administrative ni l'identité du signataire. Les suggestions ne sont pas des faits établis. Plusieurs dates déclenchent un avertissement ; le système ne choisit pas silencieusement la date juridiquement pertinente.

Tesseract retourne une confiance de reconnaissance du texte. Le score de règle/texte n'est pas une probabilité calibrée d'exactitude de la métadonnée. Aucune promesse de 90 %, 95 % ou 100 % d'exactitude n'est faite.

## Parcours connecté
Choisir un fichier validé → mode AUTO/NONE/FORCE et langue → demander l'extraction → file persistante → contrôle des droits et du SHA-256 → extraction → **À relire** → correction du texte → sélection explicite des champs → motif → validation ou rejet.

Statuts : QUEUED → RUNNING → TO_REVIEW → REVIEWED. Une erreur mène à FAILED ; une annulation à CANCELLED. Le frontend actualise le statut toutes les 2,5 secondes pendant l'attente, s'arrête sur erreur, puis permet une reprise explicite. Un worker interrompu ne provoque pas une boucle infinie de réessais automatiques.

L'agent choisit explicitement d'appliquer un titre et/ou une date à une **notice ouverte**, sous ses permissions de correction. Aucun champ n'est coché par défaut. Référence, producteur, plan de classement, confidentialité, habilitations et durée de conservation ne sont pas modifiés automatiquement.

Le texte peut être corrigé dans le formulaire. Son enregistrement comme résultat OCR validé exige une confirmation et les droits de numérisation existants. Le texte brut extrait reste dans le résultat source ; le texte relu est un enregistrement distinct, avec empreinte et motif de validation. L'événement d'indexation existant est réutilisé ; cela ne démontre pas que votre moteur de recherche externe est opérationnel.

La version de la notice est capturée au départ. Si elle change avant validation, le backend refuse l'application au lieu d'écraser le travail d'un autre agent. Les droits sont recontrôlés à la demande, au traitement, à la consultation et à la validation. Une révocation d'accès interdit la lecture ultérieure du résultat, qui contient lui-même du contenu sensible.

## Limites de charge
40 pages/images, 25 millions de pixels par image, 200 000 caractères extraits, réponse JSON 2 Mo, fichier au maximum 50 Mio et délai configurable 30–300 secondes (180 par défaut). Le plafond de dépôt du socle, parfois 6 Mio, reste prioritaire : l'augmentation du plafond d'extraction n'autorise pas un dépôt plus grand. Un dépassement produit une erreur plutôt qu'un succès tronqué.

Cinq demandes en attente/en cours maximum par agent ; un traitement à la fois par instance de worker. Le verrouillage et les baux sont codés en PostgreSQL, mais l'exécution multi-instance, les annulations concurrentes et les performances réelles doivent être validées en recette.

## Validation linguistique
`fra`, `eng` et `fra+eng` sont proposés ; les données de langue doivent être installées. Une langue demandée absente provoque un refus, sans bascule silencieuse vers une autre langue. Ici, une image synthétique anglaise a réellement été reconnue par Tesseract et un PDF natif synthétique par Poppler. La qualité OCR sur vos scans français, documents anciens, tampons, écritures manuscrites et documents dégradés n'a pas été mesurée. Le repérage des dates françaises est testé séparément sur texte natif.
