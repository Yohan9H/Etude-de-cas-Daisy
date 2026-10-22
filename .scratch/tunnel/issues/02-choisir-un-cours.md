# 02 : Choisir un cours et voir ses créneaux

Status: resolved
Blocked by: 01
Spec : `.scratch/tunnel/spec.md`

**Ce qu'il faut construire :** la personne choisit un cours et voit ses créneaux des 90 prochains jours, triés par date, sans les créneaux passés. Si elle change de cours pendant un chargement, elle voit toujours les créneaux du dernier cours choisi. Le chargement ou l'erreur des créneaux ne s'affiche que sur la liste des créneaux. Elle peut revenir à la liste des cours et réessayer un chargement en erreur.

Corrige deux bugs : la réponse de créneaux périmée qui écrase la bonne, et l'état de chargement partagé entre cours et créneaux.

- [x] `choisirCours` affiche l'écran des créneaux de ce cours et charge ses créneaux sur une fenêtre de 90 jours calculée avec l'horloge injectée
- [x] Les créneaux passés sont retirés et la liste est triée par date ; cette règle n'existe qu'à un seul endroit
- [x] La liste des créneaux a son propre état de chargement, indépendant de celui des cours
- [x] Une réponse de créneaux qui ne correspond plus au cours affiché est ignorée (test qui échoue d'abord)
- [x] Revenir aux cours pendant un chargement de créneaux n'affiche ni chargement ni erreur sur la liste des cours (test qui échoue d'abord)
- [x] `revenir` depuis les créneaux ramène à la liste des cours
- [x] `reessayer` relance un chargement de créneaux en erreur
- [x] Les champs de l'ancien état global remplacés sont supprimés
- [x] Vérifié à la main dans la démo, y compris un scénario d'erreur via la page de contrôle du faux serveur

## Answer

Livré dans `0df9499`.

Écarts au ticket :

- Le test « revenir aux cours pendant un chargement » passe dès son écriture : le ticket 01 avait déjà séparé l'état des cours de celui des créneaux. Pour vérifier qu'il protège bien, le bug a été réintroduit le temps d'un essai (erreur des créneaux écrite dans l'état des cours) : le test échoue alors. Le test de la réponse périmée, lui, a échoué d'abord.
- Une réponse périmée est repérée par un numéro de demande, pas par le cours affiché : seule la dernière demande de créneaux écrit dans l'état. Une réponse qui arrive après `revenir` est donc encore enregistrée, mais l'écran des cours ne la lit pas. Ce choix évite une liste bloquée en chargement quand l'écran courant n'est plus celui des créneaux (coordonnées, refus).
- La fenêtre de 90 jours est comptée en millisecondes (`90 × 24 h`) et non plus avec `setDate`. Elle ne dépend plus du fuseau de la machine, mais sa borne se décale d'une heure au changement d'heure. Le décalage de fuseau est hors périmètre de la spec.
- `revenir` ne gère que créneaux → cours ; coordonnées → créneaux arrive au ticket 03.
- `main.ts` garde un type `Ecran` local pour les écrans pas encore portés ; `null` veut dire « afficher l'écran du tunnel ».
- Transitoire, à reprendre au ticket 05 : après un refus, `rafraichirCreneaux` appelle `tunnel.choisirCours`. Les alternatives restent vides jusqu'à la réponse (avant, elles étaient périmées), et un rechargement en échec s'affiche en erreur avec « Réessayer » derrière « Voir toutes les dates ». Ce correctif anticipé n'a pas de test qui échoue d'abord ; le ticket 05 doit l'ajouter.
- Revue : `ApiTunnel.getSlots` garde le nom anglais de l'API, comme `getCourses` au ticket 01. La règle de vocabulaire de `CODING_STANDARDS.md` l'interdit pour un nom de dépendance : à trancher (renommer les deux, ou documenter l'exception).
- Vérifié dans la démo :
  - site sobre : créneaux triés ; erreur via `server_error` puis « Réessayer » ;
  - scénario `slow` : retour aux cours pendant un chargement, puis changement rapide de cours ;
  - widget seul : refus `slot_full`, avec 3 alternatives puis « Voir toutes les dates », saisie conservée.

