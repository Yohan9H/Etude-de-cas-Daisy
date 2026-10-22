# Tracker d'issues : Markdown local

Les issues et les specs de ce repo sont des fichiers markdown dans `.scratch/`.

## Conventions

- Un dossier par feature : `.scratch/<feature-slug>/`
- La spec est `.scratch/<feature-slug>/spec.md`
- Les tickets d'implémentation sont un fichier par ticket : `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numérotés à partir de `01`, jamais un fichier unique regroupant tous les tickets
- L'état de triage est noté sur une ligne `Status:` en haut de chaque fichier d'issue (voir `triage-labels.md` pour les libellés)
- Les commentaires et l'historique des échanges s'ajoutent en bas du fichier, sous un titre `## Comments`

## Quand un ticket d'implémentation est livré

À la fin de `/implement`, une fois le travail commité :

- passer `Status: resolved` ;
- ajouter en bas du fichier un titre `## Answer` avec le hash du commit et les écarts au ticket (décision prise en route, comportement modifié, point laissé à un ticket suivant) ; « Aucun écart » s'il n'y en a pas.

Un `Blocked by:` est levé quand tous les tickets listés sont `resolved`.

## Quand un skill dit « publish to the issue tracker »

Créer un nouveau fichier sous `.scratch/<feature-slug>/` (en créant le dossier si besoin).

## Quand un skill dit « fetch the relevant ticket »

Lire le fichier au chemin indiqué. L'utilisateur donne normalement le chemin ou le numéro de l'issue directement.

## Opérations de wayfinding

Utilisées par `/wayfinder`. La **carte** est un fichier, avec un fichier **enfant** par ticket.

- **Carte** : `.scratch/<effort>/map.md` (contenu : Notes / Decisions-so-far / Fog).
- **Ticket enfant** : `.scratch/<effort>/issues/NN-<slug>.md`, numéroté à partir de `01`, avec la question dans le corps. Une ligne `Type:` indique le type du ticket (`research`/`prototype`/`grilling`/`task`) ; une ligne `Status:` indique `claimed`/`resolved`.
- **Blocage** : une ligne `Blocked by: NN, NN` en haut du fichier. Un ticket est débloqué quand tous les fichiers listés sont `resolved`.
- **Frontière** : parcourir `.scratch/<effort>/issues/` pour trouver les fichiers ouverts, débloqués et non réclamés ; le plus petit numéro passe en premier.
- **Réclamer** : passer `Status: claimed` et enregistrer avant tout travail.
- **Résoudre** : ajouter la réponse sous un titre `## Answer`, passer `Status: resolved`, puis ajouter un pointeur de contexte (résumé + lien) dans la section Decisions-so-far de `map.md`.
