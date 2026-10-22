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
