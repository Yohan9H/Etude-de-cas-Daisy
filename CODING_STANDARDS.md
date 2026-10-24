# Standards de code

Règles appliquées en revue. Elles demandent du jugement ; ce qu'un outil vérifie (`npm run check`) n'y figure pas.

## Vocabulaire

Les identifiants nouveaux suivent `GLOSSARY.md` : `atelier`, `cours`, `creneau`, `tunnel`, `refus`. Les noms anglais de l'API (`Studio`, `Course`, `Slot`, `getCourses`…) restent à la frontière : dans `src/api.ts` et dans les types qu'on en importe, jamais dans un nom de variable, de paramètre ou de dépendance écrit hors de `api.ts`.

Exception : les méthodes de `ApiTunnel` (`getCourses`, `getSlots`…) reprennent le nom des fonctions de `api.ts`. Le point d'entrée passe ces fonctions telles quelles au tunnel (`api: { getCourses, getSlots }`) : les renommer obligerait à écrire un adapter qui ne ferait que traduire des noms. L'exception s'arrête au type `ApiTunnel` et à son branchement ; les variables et paramètres du tunnel restent en français.

Un terme renommé dans le glossaire l'est partout dans le diff : identifiants, titres de test, aides de test, spec. Un usage gardé exprès est justifié dans le `## Answer` du ticket.

## Tunnel

`src/tunnel.ts` possède l'état du parcours et ses transitions. Il importe seulement des types et reçoit l'API, l'hôte et l'horloge à la création. Le DOM, `window` et `postMessage` vivent dans `main.ts`, `pont.ts` et `hote.ts`. Une transition produit un seul changement d'état, donc un seul redessin.

## Tests

- Un test passe par l'interface du tunnel (`creerTunnel`, `etat`, `abonner`, les actions) et vérifie l'état observé : le type d'écran et ses données, jamais le texte exact d'un message.
- Doublures : celles de `src/tunnel.test.ts`, c'est-à-dire une fausse API dont le test résout chaque réponse quand il veut, un faux hôte qui note les demandes et une horloge fixe.
- Le nom d'un test décrit un comportement de la personne qui réserve, dans le vocabulaire du glossaire.
- Un bug corrigé commence par un test qui échoue.

## Commentaires

Un commentaire dit pourquoi, pas ce que fait la ligne, au ton de `src/main.ts`. Un code transitoire, laissé en place le temps d'une migration, le dit et nomme ce qui le fera disparaître.
