Status: ready-for-agent

# Spec : le module tunnel

## Problème

Le tunnel de réservation n'a pas de propriétaire. Chacun des huit écrans du widget modifie lui-même l'état global puis redessine, et les appels réseau écrivent dans ce même état sans vérifier qu'il est encore d'actualité. Comprendre une seule transition (par exemple « choisir un créneau ») oblige à lire quatre endroits du code, et la borne du nombre de places est réécrite cinq fois.

Pour la personne qui réserve, cela se traduit par des bugs réels :

- en changeant de cours pendant un chargement, elle peut voir les créneaux de l'ancien cours ;
- en revenant à la liste des cours pendant que les créneaux chargent, elle voit « Chargement… » ou un message d'erreur sur la mauvaise liste ;
- après un refus, « Voir toutes les dates » peut afficher des créneaux qui n'ont pas encore été rafraîchis ;
- si elle ferme le tunnel avec Échap sur l'écran de confirmation, ses coordonnées restent pré-remplies à la prochaine ouverture ;
- si la page hôte referme le tunnel pendant l'envoi, la réservation est créée mais la personne ne voit jamais sa confirmation.

Pour le développeur, rien de tout cela n'est testable : il n'existe aucun test, et la logique est mêlée au DOM.

## Solution

Un module **tunnel** possède l'état du tunnel et toutes ses transitions. Les écrans ne font plus que rendre l'état et signaler les gestes de la personne. Le tunnel reçoit de l'extérieur l'API, l'hôte et l'horloge, ce qui permet de tester chaque transition, y compris les enchaînements asynchrones et les refus, sans navigateur ni serveur.

Pour la personne qui réserve, le tunnel se comporte comme aujourd'hui, sans les bugs listés ci-dessus.

## User stories

1. En tant que visiteur du site de l'atelier, je veux ouvrir le tunnel en cliquant sur le bouton de réservation, afin de commencer à réserver.
2. En tant que visiteur, je veux que la liste des cours ne soit chargée qu'à la première ouverture, afin de ne pas télécharger de données si je ne clique jamais.
3. En tant que visiteur, je veux voir un état « chargement » sur la liste des cours pendant qu'elle se charge, afin de savoir que quelque chose se passe.
4. En tant que visiteur, je veux voir un message et un bouton « Réessayer » si la liste des cours ne se charge pas, afin de pouvoir retenter sans recharger la page.
5. En tant que visiteur, je veux choisir un cours et voir ses créneaux des 90 prochains jours, afin de trouver une date qui me convient.
6. En tant que visiteur, je veux que les créneaux déjà passés ne me soient jamais proposés, afin de ne pas choisir une date impossible.
7. En tant que visiteur, je veux que les créneaux soient triés par date, afin de les parcourir dans l'ordre.
8. En tant que visiteur, je veux que l'état de chargement ou d'erreur des créneaux ne s'affiche que sur la liste des créneaux, afin de ne pas voir un message trompeur sur la liste des cours.
9. En tant que visiteur qui change d'avis rapidement, je veux que les créneaux affichés soient toujours ceux du cours que j'ai choisi en dernier, même si une réponse plus ancienne arrive après.
10. En tant que visiteur, je veux pouvoir réessayer le chargement des créneaux s'il a échoué.
11. En tant que visiteur, je veux revenir d'une étape en arrière (des créneaux vers les cours, des coordonnées vers les créneaux), afin de corriger un choix.
12. En tant que visiteur, je veux qu'un créneau complet ne soit pas sélectionnable.
13. En tant que visiteur, je veux choisir le nombre de places, borné à la fois par le plafond de l'atelier et par les places restantes du créneau, afin de ne pas demander l'impossible.
14. En tant que visiteur, je veux garder mon nombre de places (ramené au nouveau plafond si besoin) quand je change de créneau dans le même cours.
15. En tant que visiteur, je veux que mon nombre de places revienne à 1 quand je change de cours.
16. En tant que visiteur, je veux saisir mes coordonnées et voir une erreur précise sur chaque champ invalide quand j'envoie.
17. En tant que visiteur, je veux que le téléphone ne soit demandé que si l'atelier l'exige.
18. En tant que visiteur, je veux qu'un double-clic ou un appui répété sur Entrée n'envoie qu'une seule réservation.
19. En tant que visiteur, je veux voir un écran d'attente pendant l'envoi.
20. En tant que visiteur, je veux voir un écran de confirmation avec mon code de réservation et le total quand la réservation réussit.
21. En tant que visiteur dont la place est partie pendant la saisie, je veux voir combien de places restent et des dates alternatives, sans perdre ce que j'ai saisi.
22. En tant que visiteur dont la place est partie, je veux pouvoir choisir directement l'une des alternatives proposées.
23. En tant que visiteur dont le créneau a été annulé, je veux en être informé et pouvoir choisir une autre date, sans perdre ma saisie.
24. En tant que visiteur après un refus, je veux que « Voir toutes les dates » m'affiche des créneaux rafraîchis, ou un état de chargement tant qu'ils ne le sont pas.
25. En tant que visiteur, si l'atelier exige désormais un téléphone alors qu'il ne le demandait pas au chargement, je veux voir apparaître le champ avec une explication, sans perdre ma saisie.
26. En tant que visiteur, si je demande plus de places que l'atelier n'en accepte, je veux que ma demande soit ramenée au plafond avec une explication.
27. En tant que visiteur, si j'ai lancé trop de réservations, je veux un message qui me dit d'attendre avant de réessayer.
28. En tant que visiteur, si le serveur ne répond pas, je veux être prévenu que ma réservation a peut-être été enregistrée et que je dois vérifier mes emails avant de réessayer ; le widget ne doit jamais réessayer tout seul.
29. En tant que visiteur, si le service est indisponible, je veux retrouver mon formulaire avec ma saisie intacte.
30. En tant que visiteur, je veux fermer le tunnel avec la croix ou la touche Échap à n'importe quelle étape, sauf pendant l'envoi.
31. En tant que visiteur, je veux que ma saisie soit conservée si je ferme le tunnel avant la fin, afin de ne pas tout retaper en le rouvrant.
32. En tant que visiteur qui rouvre le tunnel après l'avoir fermé en cours de route, je veux repartir de la liste des cours, afin de ne pas retomber sur un créneau peut-être devenu complet.
33. En tant que visiteur, je veux que mes coordonnées soient effacées une fois ma réservation terminée, que je clique sur « Terminer » ou que je ferme l'écran de confirmation.
34. En tant que visiteur dont la page hôte a refermé le tunnel pendant l'envoi, je veux voir ma confirmation en attente à la prochaine ouverture, afin de ne pas ignorer qu'une réservation a été créée.
35. En tant qu'artisan, je veux que la page de mon site puisse refermer le tunnel à tout moment, et que le widget revienne alors au bouton.
36. En tant que développeur, je veux que le widget ouvert seul (hors iframe) se referme correctement sans écho de la page hôte, afin de pouvoir le développer isolément.
37. En tant que développeur, je veux tester chaque transition du tunnel sans DOM, sans serveur et sans dépendre de la date du jour.
38. En tant que développeur, je veux pouvoir simuler n'importe quelle réponse de l'API (succès, refus, 429, absence de réponse, réponse lente), afin de couvrir les cas dégradés par des tests rapides plutôt qu'en cliquant dans la page de contrôle du faux serveur.
39. En tant que développeur, je veux que chaque règle du tunnel (borne des places, filtre des créneaux, effacement de la saisie) soit écrite à un seul endroit.

## Décisions d'implémentation

- **Un nouveau module tunnel** possède l'état du tunnel (écran courant et ses données, cours, créneaux, saisie, erreurs, nombre de places, verrou d'envoi, confirmation en attente) et toutes ses transitions, y compris les appels réseau et l'abandon des réponses périmées.
- **Création** : le tunnel est créé avec l'atelier déjà chargé et trois dépendances injectées : l'API, l'hôte et l'horloge. Il n'importe aucune de ces dépendances lui-même.
- **Adapter API** : expose les opérations déjà présentes (liste des cours, créneaux d'un cours sur une période, création d'une réservation) et renvoie le résultat actuel « ok ou erreur ». Deux adapters : le module d'API existant en production, une fausse API scriptable dans les tests.
- **Adapter hôte** : sait demander l'ouverture et la fermeture. Deux adapters : l'iframe (envoie `expand`/`collapse` à la page hôte et attend l'écho `closed`) et l'autonome (confirme la fermeture immédiatement, pour le développement hors iframe). Le choix de l'adapter se fait une seule fois au démarrage ; la vérification « suis-je dans une iframe » disparaît de la logique de fermeture.
- **Horloge** : une fonction qui renvoie l'instant présent, utilisée pour filtrer les créneaux passés et calculer la fenêtre de 90 jours.
- **Interface du tunnel** : un état en lecture, une fonction d'abonnement appelée à chaque changement, et douze actions : `ouvrir`, `fermer`, `hoteAFerme`, `choisirCours`, `choisirCreneau`, `revenir`, `changerPlaces`, `saisir`, `envoyer`, `terminer`, `voirToutesLesDates`, `reessayer`.
- **Le tunnel ne touche jamais au DOM.** La couche de rendu s'abonne et redessine ; c'est elle qui place le focus sur le premier champ en erreur quand des erreurs apparaissent.
- **Démarrage hors tunnel** : chargement de l'atelier, application de la couleur, écoute d'Échap (qui appelle `fermer`), écoute de l'écho `closed` (qui appelle `hoteAFerme`) et envoi de `ready` restent dans le point d'entrée. Si l'atelier ne se charge pas, le tunnel n'est pas créé et le widget n'affiche rien, comme aujourd'hui.
- **Règles de créneaux et de places absorbées** : borne des places (minimum entre le plafond de l'atelier et les places restantes, au moins 1), filtre des créneaux passés et tri, fenêtre de 90 jours, alternatives après refus (les trois prochains créneaux disponibles). Chacune n'existe qu'une fois.
- **Chargements séparés** : la liste des cours et la liste des créneaux ont chacune leur propre état (en chargement, prête, en erreur). Une réponse de créneaux qui ne correspond plus au cours affiché est ignorée.
- **Nombre de places** : conservé et ramené au plafond quand on change de créneau dans le même cours ; remis à 1 quand on change de cours.
- **Saisie** : gardée par le tunnel, avec la validation et l'exigence de téléphone. Elle survit aux refus et aux fermetures. Elle n'est effacée qu'à la fin d'une réservation (`terminer`, ou `fermer` depuis l'écran de confirmation).
- **`fermer`** est ignoré pendant l'envoi.
- **`ouvrir`** affiche la confirmation en attente s'il y en a une ; l'écran d'attente si un envoi n'a pas encore reçu sa réponse ; sinon la liste des cours, qu'il ne charge qu'à la première ouverture.
- **Confirmation en attente** : si l'hôte referme le tunnel pendant l'envoi et que la réservation réussit, le tunnel garde la confirmation et la montre à la prochaine ouverture ; il ne redemande pas l'ouverture de lui-même.
- **Textes d'erreur** : repris tels quels de l'implémentation actuelle (traitement des échecs d'envoi et textes d'erreur de chargement). Leur réorganisation appartient à un chantier ultérieur.
- **Livraison par tranches verticales** : le widget reste fonctionnel après chaque tranche. Première tranche : Vitest, plus un tunnel squelette qui gère `ouvrir`, `fermer`, `hoteAFerme` et le chargement des cours, branché sur le vrai rendu.

## Décisions de test

- **Un seul seam de test : l'interface du tunnel.** Les tests déclenchent des actions et vérifient l'état observé. Ils ne lisent aucun détail interne et ne testent pas les fonctions privées.
- **Trois adapters de test** : une fausse API dont chaque réponse est scriptée par le test (y compris une réponse qui n'arrive jamais et des réponses dans le désordre), un faux hôte qui enregistre les demandes d'ouverture et de fermeture et peut déclencher `closed`, et une horloge fixe.
- **Un bon test** décrit un comportement de la personne qui réserve, par exemple « la place est partie pendant la saisie : l'écran devient place-partie avec 1 place restante, et la saisie est intacte ». Il survit à une réécriture interne du tunnel.
- **On vérifie le type d'écran et ses données**, pas les phrases exactes des messages, qui seront revues dans un chantier ultérieur.
- **Chaque bug corrigé** (réponse périmée, chargements partagés, saisie conservée après la confirmation, « Voir toutes les dates » non rafraîchi, confirmation perdue) commence par un test qui échoue.
- **Aucun test du rendu des écrans** dans ce chantier.
- **Outil** : Vitest, sous Node, sans environnement DOM.
- **Prior art** : aucun. Le repo n'a pas de tests ; ce chantier pose la première convention.

## Hors périmètre

- La traduction des réponses de l'API en issues de réservation, avec une liste fermée et un timeout. Les bugs connus qui en dépendent restent ouverts : 403 `origin_not_allowed` affiché comme une panne, absence de timeout pendant l'envoi, `too_many_seats` qui se base sur un plafond périmé.
- Le contrat du pont entre le loader et le widget, et sa vérification des deux côtés.
- Le décalage de fuseau dans le calcul des dates de la période demandée à l'API.
- Les textes affichés qui disent « atelier » pour un cours.
- Les tests du rendu des écrans et du loader.
- Sortir le calcul de contraste du point d'entrée.

## Notes

- Les termes suivent `GLOSSARY.md` : atelier, cours, créneau, tunnel, refus, confirmation en attente.
- Origine : la piste 1 de la revue d'architecture (`/improve-codebase-architecture`), puis une session de grilling avec 18 décisions.
- L'API n'a ni clé d'idempotence ni moyen de vérifier une réservation : la règle « ne jamais réessayer tout seul après une absence de réponse » doit rester visible dans le tunnel.
