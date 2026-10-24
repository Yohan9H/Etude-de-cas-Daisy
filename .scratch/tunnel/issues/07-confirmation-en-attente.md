# 07 : Confirmation en attente

Status: resolved
Blocked by: 04, 06
Spec : `.scratch/tunnel/spec.md`

**Ce qu'il faut construire :** si la page hôte referme le tunnel pendant l'envoi et que la réservation réussit, la personne voit sa confirmation à la prochaine ouverture, au lieu de la perdre. Sans confirmation en attente, rouvrir le tunnel ramène à la liste des cours en gardant la saisie.

Corrige le bug de la confirmation perdue.

- [x] L'hôte ferme pendant l'envoi, puis la réservation réussit : le tunnel garde une confirmation en attente et ne redemande pas l'ouverture de lui-même (test qui échoue d'abord)
- [x] `ouvrir` avec une confirmation en attente affiche l'écran de confirmation avec le code et le total
- [x] Terminer ou fermer cette confirmation efface la saisie et la confirmation en attente
- [x] L'hôte ferme pendant l'envoi, puis l'envoi échoue : à la réouverture, le comportement normal s'applique, saisie intacte
- [x] `ouvrir` sans confirmation en attente, après une fermeture en cours de route, affiche la liste des cours avec la saisie conservée
- [x] Vérifié à la main dans la démo avec une réponse lente du faux serveur

## Comments

- Ticket 04 (`f45bb51`) : quand la page hôte referme pendant l'envoi, `envoyer` ignore la réponse (garde « l'écran n'est plus `envoi` »). Le test « la page hôte referme le tunnel pendant l'envoi › reste fermé quand la réponse arrive » fige cette perte : à inverser ici.
- Revue du 04 : le verrou d'envoi tient tant que la réponse n'est pas arrivée. Rouvert entre-temps, un second envoi est ignoré sans retour visible. Une fois la première réponse jetée, le verrou se relâche et un nouvel envoi crée une seconde réservation. Garder la confirmation en attente règle le second point ; le premier mérite un écran (l'attente) plutôt qu'un clic muet.
- Frontières relues après le ticket 04. Les tickets 05, 06 et 07 modifient tous trois la suite de l'`await` dans `envoyer` (`src/tunnel.ts`), ainsi que `soumettre` et `traiterEchec` dans `src/main.ts`. Ils se font l'un après l'autre (05, puis 06, puis 07), jamais en parallèle. Ce ticket dépend donc aussi du 06.
- Avec les refus (05) et les échecs (06) dans le tunnel, un échec qui arrive après la fermeture par l'hôte ne doit afficher ni écran de refus ni bandeau à la réouverture : c'est le sens de « le comportement normal s'applique ».

## Answer

Livré dans `79234a8`.

Écarts au ticket :

- Rouvert avant la réponse, le tunnel remet l'écran d'attente au lieu de la liste des cours (premier point de la revue du 04). Sans lui, une réservation réussie pendant que la personne parcourt les cours partirait en attente, invisible alors que le tunnel est ouvert. Le verrou d'envoi garde pour cela le cours et le créneau envoyés. Le critère 5 ne vaut donc que hors envoi en cours ; la décision sur `ouvrir` dans `spec.md` et la recette `docs/agents/verification-demo.md` sont mises à jour.
- La confirmation en attente est effacée dès que `ouvrir` l'affiche ; `terminer` et `fermer` effacent ensuite la saisie comme pour toute confirmation.
- Point laissé ouvert : un envoi sans réponse (statut null) arrivé tunnel fermé est tu, comme le ticket le demande. Or la réservation existe peut-être, et la personne peut renvoyer. En tension avec la user story 28 ; à trancher.

Vérifié dans la démo, sur le site sobre (iframe), avec la latence normale du `POST /bookings` (1,5 à 4 s), fermeture par la page hôte (`cancel` sur le `dialog`) juste après l'envoi. Trois cas : réussite puis réouverture (confirmation avec code et total, puis « Terminer » et formulaire vide) ; scénario `server_error` (liste des cours, saisie intacte, pas de bandeau) ; réouverture avant la réponse (écran d'attente, puis confirmation).
