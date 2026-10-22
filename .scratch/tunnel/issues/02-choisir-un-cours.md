# 02 : Choisir un cours et voir ses créneaux

Status: ready-for-agent
Blocked by: 01
Spec : `.scratch/tunnel/spec.md`

**Ce qu'il faut construire :** la personne choisit un cours et voit ses créneaux des 90 prochains jours, triés par date, sans les créneaux passés. Si elle change de cours pendant un chargement, elle voit toujours les créneaux du dernier cours choisi. Le chargement ou l'erreur des créneaux ne s'affiche que sur la liste des créneaux. Elle peut revenir à la liste des cours et réessayer un chargement en erreur.

Corrige deux bugs : la réponse de créneaux périmée qui écrase la bonne, et l'état de chargement partagé entre cours et créneaux.

- [ ] `choisirCours` affiche l'écran des créneaux de ce cours et charge ses créneaux sur une fenêtre de 90 jours calculée avec l'horloge injectée
- [ ] Les créneaux passés sont retirés et la liste est triée par date ; cette règle n'existe qu'à un seul endroit
- [ ] La liste des créneaux a son propre état de chargement, indépendant de celui des cours
- [ ] Une réponse de créneaux qui ne correspond plus au cours affiché est ignorée (test qui échoue d'abord)
- [ ] Revenir aux cours pendant un chargement de créneaux n'affiche ni chargement ni erreur sur la liste des cours (test qui échoue d'abord)
- [ ] `revenir` depuis les créneaux ramène à la liste des cours
- [ ] `reessayer` relance un chargement de créneaux en erreur
- [ ] Les champs de l'ancien état global remplacés sont supprimés
- [ ] Vérifié à la main dans la démo, y compris un scénario d'erreur via la page de contrôle du faux serveur
