# 04 : Envoyer une réservation et la confirmer

Status: ready-for-agent
Blocked by: 03
Spec : `.scratch/tunnel/spec.md`

**Ce qu'il faut construire :** le chemin heureux complet. La personne envoie sa réservation ; une saisie invalide affiche une erreur sur chaque champ concerné ; sinon un écran d'attente s'affiche, puis l'écran de confirmation avec le code et le total. En terminant, ou en fermant l'écran de confirmation, sa saisie est effacée. Pendant l'envoi, le tunnel ne peut pas être fermé, et un double envoi est impossible.

Corrige le bug de la saisie conservée après Échap sur l'écran de confirmation.

- [ ] `envoyer` valide la saisie ; en cas d'erreur, les erreurs par champ sont dans l'état et rien n'est envoyé
- [ ] La couche de rendu place le focus sur le premier champ en erreur ; le tunnel ne touche pas au DOM
- [ ] Un second `envoyer` pendant un envoi en cours est ignoré (une seule réservation créée)
- [ ] Pendant l'envoi, l'écran est l'écran d'attente et `fermer` est ignoré
- [ ] Une réservation réussie affiche l'écran de confirmation avec le code et le total
- [ ] `terminer` efface la saisie et ferme le tunnel
- [ ] `fermer` depuis l'écran de confirmation efface aussi la saisie (test qui échoue d'abord)
- [ ] Les champs de l'ancien état global remplacés sont supprimés
- [ ] Vérifié à la main dans la démo, y compris le double-clic sur le bouton d'envoi
