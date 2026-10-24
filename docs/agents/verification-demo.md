# Vérifier le widget à la main dans la démo

Recette pour la case « Vérifié à la main dans la démo » des tickets.

## Lancer

Avant de lancer : si les trois ports écoutent déjà, réutiliser la démo, car Vite sert le code à jour. Lire le scénario actif (`curl -s http://localhost:3001/__mock | grep 'Scénario actif'`) et le remettre à `ok` s'il ne l'est pas.

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

  Dans le widget seul, sans page hôte, la simuler par script : `window.dispatchEvent(new Event('daisy:hote-ferme'))`. Tout ce qui suit une fermeture par la page hôte se vérifie alors par script ; le site de démo ne sert plus qu'au rendu.

Après chaque fermeture, rouvrir : le tunnel repart de la liste des cours. Trois exceptions, après une fermeture par la page hôte pendant l'envoi : rouvert avant la réponse, il remet l'écran d'attente ; après une réservation réussie, il montre la confirmation ; après un envoi resté sans réponse, il montre les coordonnées avec l'avertissement « sans réponse ». Pour produire ce dernier cas, choisir le scénario `drop`, qui coupe la connexion au lieu de répondre, et non `hang`, qui fait attendre la requête indéfiniment faute de délai maximal sur l'envoi.

## Le faux serveur

Sa page de contrôle, http://localhost:3001/__mock, choisit le scénario de réponse (refus, annulation, téléphone exigé, 429…) ; la liste fait foi dans `SCENARIOS` de `mock/server.mjs`. Un agent change de scénario sans navigateur : `curl "http://localhost:3001/__mock/set?scenario=<nom>"` (réponse 302), entre deux essais, jamais depuis un script exécuté dans la page. Un script interrompu laisse le serveur sur son dernier scénario, et l'essai suivant échoue sans raison apparente. Le scénario actif est rappelé dans la sortie de `npm run demo` (`[mock] ⚠  scénario « … » actif`) à chaque appel. Remettre `ok` avant d'arrêter la démo. Le `POST /bookings` met toujours 1,5 à 4 s, quel que soit le scénario : de quoi fermer ou rouvrir pendant l'envoi. `slow` ne ralentit que les GET. Les tests du tunnel couvrent ces cas plus vite ; la démo sert à voir le rendu.

## Piloter le widget

- **Widget seul : par script.** La page est servie par le widget lui-même : un agent la pilote en JavaScript, plus vite et plus sûrement qu'au clic. Remplir un champ, c'est poser `value` puis déclencher `new Event('input')`, sinon le tunnel ne voit pas la saisie. Envoyer, c'est `form.requestSubmit()`. Échap, c'est `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`. C'est là qu'on vérifie la logique et les scénarios du faux serveur.
- **Sites de démo : au clic seulement.** L'iframe (5173) n'est pas sur l'origine de la page hôte (4000) : aucun script de la page hôte n'y entre, et `find` ou `read_page` n'y voient rien. On y clique sur des coordonnées lues sur une capture. Un Tab dans un texte tapé part comme un caractère : cliquer sur chaque champ avant de le remplir. Faire défiler la page déplace les boutons : reprendre une capture avant de cliquer. On y vérifie le rendu et l'écho `closed`.
- **Double-clic** : un vrai double-clic de souris (`double_click`), pas deux `requestSubmit()`. Compter ensuite les `POST /bookings` dans les requêtes réseau de l'onglet.

