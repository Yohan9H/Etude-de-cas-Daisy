# 03 : Choisir un créneau, le nombre de places et saisir ses coordonnées

Status: resolved
Blocked by: 02
Spec : `.scratch/tunnel/spec.md`

**Ce qu'il faut construire :** la personne choisit un créneau disponible, règle le nombre de places dans les limites permises, saisit ses coordonnées, et peut revenir aux créneaux sans perdre sa saisie.

- [x] `choisirCreneau` affiche l'écran des coordonnées ; un créneau complet ne peut pas être choisi
- [x] Le nombre de places est borné par le plafond de l'atelier et par les places restantes du créneau, avec un minimum de 1 ; cette borne n'existe qu'à un seul endroit
- [x] `changerPlaces` applique cette borne
- [x] Changer de créneau dans le même cours garde le nombre de places, ramené au nouveau plafond ; changer de cours le remet à 1
- [x] `saisir` met à jour un champ de la saisie ; le téléphone n'est demandé que si l'atelier l'exige
- [x] `revenir` depuis les coordonnées ramène aux créneaux du même cours, saisie intacte
- [x] Les champs de l'ancien état global remplacés sont supprimés
- [x] Vérifié à la main dans la démo

## Answer

Livré dans `7431b5a`.

Écarts au ticket :

- Le nombre de places n'est remis à 1 que si le cours change vraiment : rechoisir le même cours le garde (test dédié). C'est nécessaire tant que le rechargement après un refus passe par `choisirCours` (transitoire, ticket 05) ; sinon « Vous en demandiez N » et les alternatives repartiraient d'une place.
- L'écran `coordonnees` porte `placesMaximum`, calculé par le tunnel : le rendu ne recalcule pas la borne.
- `changerPlaces` ramène à 1 une valeur qui n'est pas un entier (`Number('')`, `NaN`) : la garde contre `seats: 0` est passée du `<select>` au tunnel.
- `saisir` prévient les abonnés comme toute transition. Pour ne pas perdre le curseur à chaque frappe, `main.ts` ne redessine pas quand seule la saisie a changé (`surChangement`). Le rendu connaît donc la forme de l'état ; la revue propose aussi, à défaut, que la notification dise ce qui a changé.
- Restent dans `main.ts`, marqués transitoires : `telephoneExige` (ticket 06, s'ajoute à `telephoneDemande`), `erreurs` et `erreurEnvoi` (04 et 06), et l'effacement de la saisie à « Terminer » par cinq `saisir(cle, '')` (ticket 04). Échap sur la confirmation garde toujours la saisie : bug du ticket 04.
- À reprendre au ticket 05 :
  - « Réserver pour N personnes » après un refus fait deux changements (`choisirCreneau` puis `changerPlaces`).
  - `choisirCreneau` y reçoit le créneau d'avant le refus, avec ses places restantes périmées : le sélecteur peut proposer plus de places qu'il n'en reste. Ce défaut existait déjà.
  - Le bouton et les alternatives ne fonctionnent que parce que le tunnel est revenu sur les créneaux.
- L'aide « Il reste N places sur ce créneau » compare encore `seats_available` au plafond de l'atelier dans `main.ts`. C'est un texte qui explique la borne, pas la borne elle-même.
- Vérifié dans la démo :
  - widget seul :
    - frappe au clavier sans perte du curseur ;
    - places bornées à 2 sur un créneau à 2 places, puis à 3 ;
    - changement de créneau qui ramène le nombre de places au plafond ;
    - changement de cours qui remet à 1 place ;
    - fermeture puis réouverture, saisie gardée ;
    - `slot_full_partial` puis « Réserver pour 1 personne » ;
    - `server_error`, retour au formulaire saisie intacte ;
    - réservation réussie, puis « Terminer » qui efface la saisie ;
  - site sobre : créneau complet non sélectionnable, retour aux créneaux puis même créneau, saisie intacte.
