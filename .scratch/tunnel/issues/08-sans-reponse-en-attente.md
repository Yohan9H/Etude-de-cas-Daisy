# 08 : Avertissement « sans réponse » gardé en attente

Status: resolved
Blocked by: 07
Spec : `.scratch/tunnel/spec.md`

**Ce qu'il faut construire :** si la page hôte referme le tunnel pendant l'envoi et que l'envoi reste sans réponse, la personne retrouve l'avertissement à la prochaine ouverture : l'écran des coordonnées, avec l'échec `sans-reponse` et la saisie intacte. Aujourd'hui, cet échec est tu, alors que la réservation existe peut-être. La personne rouvre, renvoie, et l'atelier reçoit peut-être une seconde réservation (user story 28).

Les autres échecs arrivés tunnel fermé restent tus, comme au ticket 07 : le serveur a répondu, rien n'a été créé.

- [x] L'hôte ferme pendant l'envoi, puis l'envoi reste sans réponse : à la réouverture, l'écran est celui des coordonnées du créneau envoyé, avec l'échec `sans-reponse`, saisie intacte (test qui échoue d'abord)
- [x] Le tunnel ne redemande pas l'ouverture de lui-même et ne réessaie jamais tout seul
- [x] Un refus, un 429 ou un 503 arrivé tunnel fermé laisse le comportement du ticket 07 inchangé : liste des cours, saisie intacte, ni écran de refus ni bandeau
- [x] Une fois affiché, l'avertissement se comporte comme après un envoi sans réponse tunnel ouvert : il disparaît au retour aux créneaux ou au prochain envoi
- [x] La décision sur `ouvrir` dans `spec.md` et le terme « Confirmation en attente » de `GLOSSARY.md` sont mis à jour
- [x] Vérifié à la main dans la démo

## Comments

- Choix de l'écran : les coordonnées, plutôt que la liste des cours. C'est l'écran que l'envoi aurait affiché tunnel ouvert. Son bandeau dit déjà de vérifier ses emails avant de réessayer, et le bouton pour réessayer est juste en dessous. Cela déroge à la user story 32 (repartir de la liste des cours de peur d'un créneau devenu complet). Si le créneau est devenu complet, un nouvel envoi reçoit un refus, et l'écran de refus s'affiche normalement.
- Piste d'implémentation : plutôt qu'un second champ à côté de `confirmationEnAttente` (`src/tunnel.ts`), garder en attente l'écran que l'envoi aurait affiché, la confirmation ou les coordonnées avec l'échec `sans-reponse`, et le remettre tel quel dans `ouvrir`. Le glossaire suit le nom retenu.
- Démo : le scénario `hang` du faux serveur ne produit pas d'absence de réponse. Faute de délai maximal sur l'envoi (bug connu, hors périmètre de la spec), la requête attend indéfiniment. Le statut `null` vient seulement d'une erreur réseau (`catch` de `src/api.ts`). Pour la produire : arrêter le faux serveur (port 3001) pendant l'envoi, après la fermeture par la page hôte, puis le relancer avec `npm run api` avant de rouvrir.
- Quand un délai maximal sera ajouté à l'envoi, ce cas deviendra fréquent : ce ticket devient alors nécessaire, plus seulement souhaitable.

## Answer

Commit `9f84e76`.

Écarts au ticket :

- Le nom retenu est `ecranEnAttente` (type `EcranEnAttente`), et le terme du glossaire devient « Écran en attente ». « Confirmation en attente » passe en « À éviter » : la confirmation n'en est plus qu'un cas. La user story 34 de `spec.md` garde son libellé, car elle ne parle que de la confirmation.
- `docs/agents/verification-demo.md` gagne une troisième exception à la réouverture, avec la recette pour produire l'absence de réponse : arrêter le faux serveur après la fermeture par la page hôte, puis le relancer.
- `phone_required` et `too_many_seats` arrivés tunnel fermé restent tus, comme les autres échecs auxquels le serveur a répondu.
- Si l'hôte referme une seconde fois sur l'avertissement affiché, la réouverture repart de la liste des cours, comme tunnel ouvert. Aucun test ne couvre ce cas.
- Vérifié dans la démo, sur le site sobre : envoi, fermeture par la page hôte, arrêt du faux serveur, relance, réouverture. On retrouve les coordonnées du créneau envoyé, avec le bandeau « sans réponse » et la saisie intacte. Le bandeau disparaît au retour aux créneaux.
