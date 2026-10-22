# 07 : Confirmation en attente

Status: ready-for-agent
Blocked by: 04
Spec : `.scratch/tunnel/spec.md`

**Ce qu'il faut construire :** si la page hôte referme le tunnel pendant l'envoi et que la réservation réussit, la personne voit sa confirmation à la prochaine ouverture, au lieu de la perdre. Sans confirmation en attente, rouvrir le tunnel ramène à la liste des cours en gardant la saisie.

Corrige le bug de la confirmation perdue.

- [ ] L'hôte ferme pendant l'envoi, puis la réservation réussit : le tunnel garde une confirmation en attente et ne redemande pas l'ouverture de lui-même (test qui échoue d'abord)
- [ ] `ouvrir` avec une confirmation en attente affiche l'écran de confirmation avec le code et le total
- [ ] Terminer ou fermer cette confirmation efface la saisie et la confirmation en attente
- [ ] L'hôte ferme pendant l'envoi, puis l'envoi échoue : à la réouverture, le comportement normal s'applique, saisie intacte
- [ ] `ouvrir` sans confirmation en attente, après une fermeture en cours de route, affiche la liste des cours avec la saisie conservée
- [ ] Vérifié à la main dans la démo avec une réponse lente du faux serveur
