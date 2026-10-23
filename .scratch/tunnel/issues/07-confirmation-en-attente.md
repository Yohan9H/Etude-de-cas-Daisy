# 07 : Confirmation en attente

Status: ready-for-agent
Blocked by: 04, 06
Spec : `.scratch/tunnel/spec.md`

**Ce qu'il faut construire :** si la page hôte referme le tunnel pendant l'envoi et que la réservation réussit, la personne voit sa confirmation à la prochaine ouverture, au lieu de la perdre. Sans confirmation en attente, rouvrir le tunnel ramène à la liste des cours en gardant la saisie.

Corrige le bug de la confirmation perdue.

- [ ] L'hôte ferme pendant l'envoi, puis la réservation réussit : le tunnel garde une confirmation en attente et ne redemande pas l'ouverture de lui-même (test qui échoue d'abord)
- [ ] `ouvrir` avec une confirmation en attente affiche l'écran de confirmation avec le code et le total
- [ ] Terminer ou fermer cette confirmation efface la saisie et la confirmation en attente
- [ ] L'hôte ferme pendant l'envoi, puis l'envoi échoue : à la réouverture, le comportement normal s'applique, saisie intacte
- [ ] `ouvrir` sans confirmation en attente, après une fermeture en cours de route, affiche la liste des cours avec la saisie conservée
- [ ] Vérifié à la main dans la démo avec une réponse lente du faux serveur

## Comments

- Ticket 04 (`f45bb51`) : quand la page hôte referme pendant l'envoi, `envoyer` ignore la réponse (garde « l'écran n'est plus `envoi` »). Le test « la page hôte referme le tunnel pendant l'envoi › reste fermé quand la réponse arrive » fige cette perte : à inverser ici.
- Revue du 04 : le verrou d'envoi tient tant que la réponse n'est pas arrivée. Rouvert entre-temps, un second envoi est ignoré sans retour visible. Une fois la première réponse jetée, le verrou se relâche et un nouvel envoi crée une seconde réservation. Garder la confirmation en attente règle le second point ; le premier mérite un écran (l'attente) plutôt qu'un clic muet.
- Frontières relues après le ticket 04. Les tickets 05, 06 et 07 modifient tous trois la suite de l'`await` dans `envoyer` (`src/tunnel.ts`), ainsi que `soumettre` et `traiterEchec` dans `src/main.ts`. Ils se font l'un après l'autre (05, puis 06, puis 07), jamais en parallèle. Ce ticket dépend donc aussi du 06.
- Avec les refus (05) et les échecs (06) dans le tunnel, un échec qui arrive après la fermeture par l'hôte ne doit afficher ni écran de refus ni bandeau à la réouverture : c'est le sens de « le comportement normal s'applique ».
