# 06 : Échecs d'envoi qui ramènent au formulaire

Status: ready-for-agent
Blocked by: 04
Spec : `.scratch/tunnel/spec.md`

**Ce qu'il faut construire :** quand l'envoi échoue sans être un refus, la personne retrouve son formulaire avec sa saisie intacte et un message adapté. Les textes sont repris tels quels de l'implémentation actuelle ; leur réorganisation et les bugs de traduction des erreurs de l'API sont hors périmètre (voir la spec).

- [ ] Téléphone devenu obligatoire : le champ téléphone apparaît avec une erreur explicative
- [ ] Trop de places : la demande est ramenée au plafond de l'atelier, avec une explication
- [ ] Trop de requêtes (429) : un message demande d'attendre avant de réessayer
- [ ] Pas de réponse : le message prévient que la réservation a peut-être été enregistrée ; le tunnel ne réessaie jamais tout seul
- [ ] Toute autre erreur : message « service momentanément indisponible »
- [ ] Dans tous les cas, l'écran est celui des coordonnées et la saisie est intacte
- [ ] Les tests vérifient le type d'issue et l'écran, pas les phrases exactes
- [ ] Vérifié à la main via les scénarios correspondants de la page de contrôle du faux serveur

## Comments

- Ticket 04 (`f45bb51`) : `phone_required` est déjà traité dans le tunnel (`telephoneDemande` à vrai, erreur sur `phone`, test « fait apparaître le téléphone en erreur quand l'atelier l'exige désormais »). Il reste la vérification dans la démo de ce cas sur le site hostile, et le passage des autres échecs (`too_many_seats`, 429, absence de réponse, autres) du point d'entrée au tunnel. `envoyer` rend aujourd'hui l'erreur à `main.ts` (`soumettre`, `traiterEchec`) : ce retour disparaît avec ce ticket et le 05.

