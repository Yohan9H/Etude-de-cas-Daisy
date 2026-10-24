# 06 : Échecs d'envoi qui ramènent au formulaire

Status: resolved
Blocked by: 04, 05
Spec : `.scratch/tunnel/spec.md`

**Ce qu'il faut construire :** quand l'envoi échoue sans être un refus, la personne retrouve son formulaire avec sa saisie intacte et un message adapté. Les textes sont repris tels quels de l'implémentation actuelle ; leur réorganisation et les bugs de traduction des erreurs de l'API sont hors périmètre (voir la spec).

- [x] Téléphone devenu obligatoire : le champ téléphone apparaît avec une erreur explicative
- [x] Trop de places : la demande est ramenée au plafond de l'atelier, avec une explication
- [x] Trop de requêtes (429) : un message demande d'attendre avant de réessayer
- [x] Pas de réponse : le message prévient que la réservation a peut-être été enregistrée ; le tunnel ne réessaie jamais tout seul
- [x] Toute autre erreur : message « service momentanément indisponible »
- [x] Dans tous les cas, l'écran est celui des coordonnées et la saisie est intacte
- [x] Les tests vérifient le type d'issue et l'écran, pas les phrases exactes
- [x] Vérifié à la main via les scénarios correspondants de la page de contrôle du faux serveur

## Comments

- Ticket 04 (`f45bb51`) : `phone_required` est déjà traité dans le tunnel (`telephoneDemande` à vrai, erreur sur `phone`, test « fait apparaître le téléphone en erreur quand l'atelier l'exige désormais »). Il reste la vérification dans la démo de ce cas sur le site hostile, et le passage des autres échecs (`too_many_seats`, 429, absence de réponse, autres) du point d'entrée au tunnel. `envoyer` rend aujourd'hui l'erreur à `main.ts` (`soumettre`, `traiterEchec`) : ce retour disparaît avec ce ticket et le 05.
- Frontières relues après le ticket 04. Les tickets 05, 06 et 07 modifient tous trois la suite de l'`await` dans `envoyer` (`src/tunnel.ts`), ainsi que `soumettre` et `traiterEchec` dans `src/main.ts`. Ils se font l'un après l'autre (05, puis 06, puis 07), jamais en parallèle. Ce ticket dépend donc aussi du 05.
- La case « Téléphone devenu obligatoire » est cochée : c'est livré au 04, code et test. Il reste à le vérifier dans la démo avec les autres scénarios.
- Ce que ce ticket retire de `main.ts` :
  - `erreurEnvoi` et le bandeau qu'il alimente ;
  - `soumettre` et ce qui reste de `traiterEchec` ;
  - l'effacement du bandeau au retour, dans `enteteTunnel` (il passe dans `revenir`, comme les erreurs par champ).
- `envoyer` ne rend plus rien (`Promise<void>`) une fois ce ticket fait.
- « Les tests vérifient le type d'issue » : l'état du tunnel a besoin d'une issue d'envoi typée, par exemple trop de places, trop de requêtes, sans réponse ou indisponible, que le rendu traduit en texte. Le message seul ne suffit pas.
- `too_many_seats` lit aujourd'hui le plafond dans `etat.studio` de `main.ts`. Le tunnel a déjà l'atelier : `bornerPlaces` s'applique.
- Livré : `EchecEnvoi` (`trop-de-places`, `trop-de-requetes`, `sans-reponse`, `indisponible`) vit dans l'écran `coordonnees`, champ `echec`. Il disparaît avec l'écran, donc au retour comme au prochain envoi, même refusé par la validation. `trop-de-places` fige `plafond` et `places` au moment de l'échec : le bandeau ne bouge plus si la personne change ensuite le nombre de places. `main.ts` traduit l'échec en texte dans `texteDEchec`, avec les phrases reprises telles quelles.
- Écart assumé : les places ramenées passent par `bornerPlaces`, qui tient compte aussi des places restantes du créneau (l'ancien code ne prenait que le plafond de l'atelier). Le texte peut donc annoncer « au maximum 4 places… ramenée à 2 ».
- Vérifié dans la démo :
  - widget seul, scénarios `too_many_seats`, `rate_limited`, `server_error`, `phone_required` : les quatre messages s'affichent, saisie intacte. `too_many_seats` affiche « ramenée à 1 » avec 1 place demandée : c'est le bug connu `.scratch/traduction-erreurs-api/issues/01`, pas une régression ;
  - absence de réponse simulée en faisant échouer `fetch` sur `/bookings` dans la page (le scénario `hang` ne rend jamais la main, faute de délai maximal) : bon message, un seul `POST`, aucun nouvel essai. Le bandeau disparaît après un retour aux créneaux ;
  - site hostile, au clic : `phone_required` (champ en erreur, focus dessus), puis 429 (bandeau affiché, erreur du téléphone effacée).
