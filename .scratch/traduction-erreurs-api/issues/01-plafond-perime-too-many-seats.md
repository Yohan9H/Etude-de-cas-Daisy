# 01 : `too_many_seats` se base sur un plafond périmé

Status: needs-triage
Type: bug

## Ce qu'on voit

Dans la démo, avec le scénario `too_many_seats` actif sur la page de contrôle du faux serveur, une réservation d'**1 place** affiche :

> Cet atelier accepte au maximum 4 places par réservation. Votre demande a été ramenée à 1.

Le message ne correspond pas à la situation : on n'a jamais demandé plus de 4 places, et rien n'a été « ramené ».

## Pourquoi

- Le scénario du faux serveur renvoie `422 too_many_seats` quelle que soit la demande (`mock/server.mjs`, branche `scenario === 'too_many_seats'`). Hors scénario, il ne refuse qu'au-delà de `max_seats_per_booking`.
- Le formulaire empêche déjà de choisir plus que le plafond connu du client. En réalité, le serveur ne renvoie donc cette erreur que si l'atelier a **baissé son plafond depuis le chargement de la page**.
- Le client calcule pourtant le message et la nouvelle valeur avec le plafond chargé au départ (`src/main.ts`, `traiterEchec`). Avec ce plafond périmé, `min(places, plafond)` ne change rien, et le message affiche un faux maximum.

Le scénario du faux serveur reproduit donc fidèlement le seul cas réel où cette erreur arrive.

## État

- Connu et laissé **hors périmètre** de la spec du tunnel (`.scratch/tunnel/spec.md`, section « Hors périmètre »). Il dépend de la traduction des réponses de l'API en issues de réservation.
- Le ticket 06 du tunnel reprend ce comportement **tel quel**. Pendant la vérification dans la démo du ticket 06, ce message incohérent est attendu : ce n'est pas une régression.

## Pour plus tard

À reprendre après le ticket 07 du tunnel, avec `/grill-with-docs`, en même temps que les autres bugs du même chantier :

- 403 `origin_not_allowed` affiché comme une panne ;
- pas de délai maximal pendant l'envoi.

Piste à creuser pendant l'entretien : sur `too_many_seats`, recharger la politique de l'atelier pour connaître le vrai plafond, ou expliquer le refus sans annoncer de chiffre.
