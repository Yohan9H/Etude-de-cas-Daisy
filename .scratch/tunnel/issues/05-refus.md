# 05 : Refus : place partie et créneau annulé

Status: ready-for-agent
Blocked by: 04
Spec : `.scratch/tunnel/spec.md`

**Ce qu'il faut construire :** quand le serveur oppose un refus, la personne voit un écran dédié, pas une erreur. Si la place est partie, elle voit combien de places restent et jusqu'à trois dates alternatives qu'elle peut choisir directement. Si le créneau est annulé, elle en est informée. Dans les deux cas, « Voir toutes les dates » affiche des créneaux rafraîchis (ou un état de chargement tant qu'ils ne le sont pas), et sa saisie est intacte.

Corrige le bug de « Voir toutes les dates » qui affiche des créneaux pas encore rafraîchis.

- [ ] Un refus « place partie » affiche l'écran dédié avec le nombre de places restantes, saisie intacte
- [ ] Les alternatives sont les trois prochains créneaux disponibles ; en choisir une mène aux coordonnées avec le nombre de places ramené au plafond
- [ ] Un refus « créneau annulé » affiche l'écran dédié, saisie intacte
- [ ] Après un refus, les créneaux du cours sont rechargés
- [ ] `voirToutesLesDates` affiche les créneaux rafraîchis, ou un état de chargement si le rechargement n'est pas terminé (test qui échoue d'abord)
- [ ] Une réponse de rechargement qui ne correspond plus à l'écran courant ne le perturbe pas
- [ ] Vérifié à la main via les scénarios « place partie » et « créneau annulé » de la page de contrôle du faux serveur

## Comments

- Frontières relues après le ticket 04. Les tickets 05, 06 et 07 modifient tous trois la suite de l'`await` dans `envoyer` (`src/tunnel.ts`), ainsi que `soumettre` et `traiterEchec` dans `src/main.ts`. Ils se font l'un après l'autre (05, puis 06, puis 07), jamais en parallèle.
- Ce que ce ticket retire de `main.ts` :
  - les branches `slot_full` et `slot_cancelled` de `traiterEchec` ;
  - `rafraichirCreneaux` ;
  - le type `Ecran` et `etat.ecran` (les écrans de refus passent dans l'`Ecran` du tunnel) ;
  - la priorité des refus dans `dessiner`.
- Ce qu'il laisse en place : `envoyer` rend encore les autres échecs au point d'entrée. Ce retour disparaît au ticket 06.
- Repris de la réponse du ticket 03 :
  - « Réserver pour N personnes » fait deux changements (`choisirCreneau` puis `changerPlaces`) ;
  - le créneau d'avant le refus porte des places restantes périmées ;
  - le bouton et les alternatives ne marchent que parce que le tunnel est revenu sur les créneaux, via `choisirCours`.
- Sur un refus, le ticket 04 fait encore deux redessins (coordonnées, puis refus) : une seule transition doit suffire ici.
