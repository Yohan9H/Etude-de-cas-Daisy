# Vérifier le widget à la main dans la démo

Recette pour la case « Vérifié à la main dans la démo » des tickets.

## Lancer

`npm run demo` lance les trois serveurs : le widget et le loader (5173), le faux serveur (3001), les sites de démo (4000). Un agent le lance en tâche de fond, puis attend que les trois ports écoutent (`lsof -i :5173 -i :3001 -i :4000 | grep LISTEN`) : les serveurs démarrent en une à deux secondes, un contrôle immédiat les croit absents. Relancer alors que les ports sont pris échoue en `EADDRINUSE`.

Arrêter : `lsof -ti :5173 -ti :3001 -ti :4000 | xargs kill`.

## Les trois contextes

| Contexte | URL | Hôte utilisé |
| --- | --- | --- |
| Site hostile | http://localhost:4000/hostile.html | iframe |
| Site sobre | http://localhost:4000/normal.html | iframe |
| Widget seul | http://localhost:5173/?studio=std_pk_7f2a9c | autonome |

Le site hostile met le CSS de la page hôte à l'épreuve ; le widget seul exerce l'hôte autonome, qui confirme la fermeture sans écho `closed`.

## Les trois façons de fermer

- **Croix** : le bouton `Fermer` de l'en-tête du tunnel.
- **Échap** : la touche, focus dans l'iframe.
- **Page hôte** : le loader referme de lui-même et renvoie `closed`. Sur un site de démo, exécuter dans la page hôte :

  ```js
  document.querySelector('dialog').dispatchEvent(new Event('cancel', { cancelable: true }))
  ```

  Le loader traite `cancel` comme une fermeture par la page (voir `public/v1.js`). `dialog.open` vaut encore `true` juste après l'appel ; vérifier sur une capture que le widget est revenu au bouton.

Après chaque fermeture, rouvrir : le tunnel repart de la liste des cours.

## Le faux serveur

Sa page de contrôle, http://localhost:3001/__mock, choisit le scénario de réponse (refus, annulation, téléphone exigé, 429…) ; la liste fait foi dans `SCENARIOS` de `mock/server.mjs`. Les tests du tunnel couvrent ces cas plus vite ; la démo sert à voir le rendu.
