# 05 : Refus : place partie et créneau annulé

Status: resolved
Blocked by: 04
Spec : `.scratch/tunnel/spec.md`

**Ce qu'il faut construire :** quand le serveur oppose un refus, la personne voit un écran dédié, pas une erreur. Si la place est partie, elle voit combien de places restent et jusqu'à trois dates alternatives qu'elle peut choisir directement. Si le créneau est annulé, elle en est informée. Dans les deux cas, « Voir toutes les dates » affiche des créneaux rafraîchis (ou un état de chargement tant qu'ils ne le sont pas), et sa saisie est intacte.

Corrige le bug de « Voir toutes les dates » qui affiche des créneaux pas encore rafraîchis.

- [x] Un refus « place partie » affiche l'écran dédié avec le nombre de places restantes, saisie intacte
- [x] Les alternatives sont les trois prochains créneaux disponibles ; en choisir une mène aux coordonnées avec le nombre de places ramené au plafond
- [x] Un refus « créneau annulé » affiche l'écran dédié, saisie intacte
- [x] Après un refus, les créneaux du cours sont rechargés
- [x] `voirToutesLesDates` affiche les créneaux rafraîchis, ou un état de chargement si le rechargement n'est pas terminé (test qui échoue d'abord)
- [x] Une réponse de rechargement qui ne correspond plus à l'écran courant ne le perturbe pas
- [x] Vérifié à la main via les scénarios « place partie » et « créneau annulé » de la page de contrôle du faux serveur

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

## Answer

Livré dans `44a4034`.

Écarts au ticket :

- L'écran `place-partie` ne porte pas de champ `restantes` : son `creneau` porte les places restantes annoncées par le refus (`available`), puis celles des créneaux rechargés, plus récentes. « Réserver pour N personnes » devient un seul `choisirCreneau(creneau)`, que le tunnel accepte désormais depuis l'écran du refus. La borne habituelle ramène la demande aux places restantes, en un seul changement.
- Ajout trouvé en revue : quand les créneaux rechargés montrent le créneau refusé devenu complet, l'écran le reflète, et le bouton de réduction disparaît. Test dédié.
- Les alternatives excluent le créneau refusé même s'il lui reste des places, comme avant : le bouton de réduction le propose déjà. C'est un écart littéral à « les trois prochains créneaux disponibles ».
- Les alternatives restent vides tant que le rechargement n'a pas répondu, et le restent s'il échoue. « Voir toutes les dates » montre alors l'erreur avec « Réessayer ». Aucun test ne couvre le rechargement en erreur sur l'écran du refus.
- `voirToutesLesDates` n'est accepté que depuis les deux écrans de refus. Les créneaux y sont toujours rafraîchis ou en chargement, parce que le refus les a remis en chargement dans le même changement que son écran.
- Le test du bug « Voir toutes les dates » a échoué d'abord, mais seulement parce que l'action n'existait pas encore, et il n'est pas commité séparément. Les deux tests de réponse périmée sont passés d'emblée : ils sont protégés par le numéro de demande et la vérification de l'écran. Une mutation de chacun de ces gardes les fait échouer.
- `ouvrirTunnel` disparaît avec `etat.ecran` : le bouton appelle `tunnel.ouvrir()`.
- Revue : le refus `{ ok: false, erreur: { statut: 409, code: 'slot_full', … } }` revient souvent dans les tests, et un helper le raccourcirait. Laissé en l'état.
- Vérifié dans la démo, widget seul, par script :
  - `slot_full_partial` :
    - écran du refus avec trois alternatives, saisie intacte ;
    - « Réserver pour 1 personne » ramène aux coordonnées ;
    - une alternative mène à ses coordonnées, saisie et téléphone intacts ;
    - « Voir toutes les dates » affiche les créneaux rechargés ;
  - `slot_cancelled` : écran d'annulation, puis « Choisir une autre date » affiche les créneaux, saisie intacte.
  - Le faux serveur est remis sur `ok`.
