# 04 : Envoyer une réservation et la confirmer

Status: resolved
Blocked by: 03
Spec : `.scratch/tunnel/spec.md`

**Ce qu'il faut construire :** le chemin heureux complet. La personne envoie sa réservation ; une saisie invalide affiche une erreur sur chaque champ concerné ; sinon un écran d'attente s'affiche, puis l'écran de confirmation avec le code et le total. En terminant, ou en fermant l'écran de confirmation, sa saisie est effacée. Pendant l'envoi, le tunnel ne peut pas être fermé, et un double envoi est impossible.

Corrige le bug de la saisie conservée après Échap sur l'écran de confirmation.

- [x] `envoyer` valide la saisie ; en cas d'erreur, les erreurs par champ sont dans l'état et rien n'est envoyé
- [x] La couche de rendu place le focus sur le premier champ en erreur ; le tunnel ne touche pas au DOM
- [x] Un second `envoyer` pendant un envoi en cours est ignoré (une seule réservation créée)
- [x] Pendant l'envoi, l'écran est l'écran d'attente et `fermer` est ignoré
- [x] Une réservation réussie affiche l'écran de confirmation avec le code et le total
- [x] `terminer` efface la saisie et ferme le tunnel
- [x] `fermer` depuis l'écran de confirmation efface aussi la saisie (test qui échoue d'abord)
- [x] Les champs de l'ancien état global remplacés sont supprimés
- [x] Vérifié à la main dans la démo, y compris le double-clic sur le bouton d'envoi

## Answer

Livré dans `f45bb51`.

Écarts au ticket :

- `phone_required` est traité dans le tunnel, en avance sur le ticket 06 : les erreurs par champ y vivent désormais, et `telephoneExige` ne pouvait pas rester seul dans `main.ts`. `envoyer` passe `telephoneDemande` à vrai et met l'erreur sur `phone`, avec un test.
- La page hôte qui referme l'écran de confirmation (`hoteAFerme`) efface aussi la saisie, en plus de `terminer` et `fermer` : même règle, quelle que soit la façon de quitter la confirmation (story 33).
- L'écran `confirmation` porte l'email de la réservation : la saisie est effacée avant que l'hôte iframe ne confirme la fermeture, et l'écran ne doit pas afficher « partir à . » entre-temps.
- Le verrou d'envoi est privé au tunnel (pas dans l'état) : le rendu n'en a pas besoin, l'écran `envoi` suffit à l'affichage. Il tient aussi quand le tunnel est refermé puis rouvert avant la réponse (test dédié).
- `revenir` des coordonnées efface les erreurs, comme le faisait `main.ts`.
- Transitoire jusqu'aux tickets 05 et 06 : en cas d'échec autre que `phone_required`, `envoyer` revient aux coordonnées et rend l'erreur au point d'entrée, qui garde les écrans de refus et `erreurEnvoi`. Sur un refus, cela fait deux redessins de suite (coordonnées, puis refus).
- Transitoire jusqu'au ticket 07 : si la page hôte referme pendant l'envoi, la réponse est ignorée et la confirmation perdue ; un test fige ce comportement, le ticket 07 l'inversera.
- Le type du corps de `postBooking` est exporté de `api.ts` (`CorpsReservation`) pour que `ApiTunnel` ne le recopie pas.
- Revue : la validation de `tunnel.ts` et la liste des champs de `main.ts` décrivent les mêmes champs à deux endroits ; ajouter un champ obligatoire touchera les deux fichiers.
- Vérifié dans la démo :
  - widget seul :
    - envoi vide : une erreur sur chaque champ, focus sur le prénom ;
    - double-clic réel sur « Confirmer » : un seul POST ;
    - Échap pendant l'envoi ignoré ;
    - confirmation avec code et total ;
    - Échap sur la confirmation, puis réouverture : saisie vide ;
    - `slot_full_partial` (refus et « Réserver pour 1 personne », saisie intacte), `phone_required` (champ en erreur, focus), `rate_limited` (bandeau) ;
  - site hostile (iframe) : validation, double-clic réel (un seul POST), confirmation, « Terminer » qui referme via l'écho de l'hôte, puis réouverture avec la saisie vide.

