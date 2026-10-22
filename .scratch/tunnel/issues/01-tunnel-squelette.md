# 01 : Tunnel squelette : ouvrir, fermer, liste des cours

Status: ready-for-agent
Blocked by: None (can start immediately)
Spec : `.scratch/tunnel/spec.md`

**Ce qu'il faut construire :** la personne ouvre le tunnel, voit la liste des cours, et le referme par la croix, par Échap ou parce que la page hôte l'a fermé ; le widget revient alors au bouton. Derrière ce comportement inchangé, c'est le premier morceau du module tunnel qui le porte, testé par son interface.

Ce ticket pose le seam pour tous les suivants : le tunnel est créé avec l'atelier déjà chargé et trois dépendances injectées (API, hôte, horloge), expose un état en lecture et une fonction d'abonnement, et ne touche jamais au DOM. Les écrans « bouton » et « cours » lisent le tunnel ; le reste du widget continue de fonctionner comme aujourd'hui.

- [ ] Vitest est installé, tourne sous Node sans DOM, et un script lance la suite de tests
- [ ] Le tunnel est créé avec l'atelier, une API, un hôte et une horloge, sans importer lui-même ces dépendances
- [ ] Deux adapters hôte existent : iframe (envoie `expand`/`collapse`, attend l'écho `closed`) et autonome (confirme la fermeture immédiatement) ; le choix se fait une fois au démarrage
- [ ] `ouvrir` demande l'ouverture à l'hôte et affiche la liste des cours ; la liste n'est chargée qu'à la première ouverture
- [ ] La liste des cours a son propre état de chargement (en chargement, prête, en erreur) ; `reessayer` relance un chargement en erreur
- [ ] `fermer` demande la fermeture à l'hôte ; `hoteAFerme` ramène au bouton
- [ ] Le démarrage (chargement de l'atelier, couleur, Échap → `fermer`, écho `closed` → `hoteAFerme`, envoi de `ready`) reste hors du tunnel
- [ ] Les tests passent par l'interface du tunnel avec une fausse API, un faux hôte et une horloge fixe
- [ ] Les champs de l'ancien état global remplacés par le tunnel sont supprimés
- [ ] Vérifié à la main dans la démo (site hostile et site sobre) : ouvrir, voir les cours, fermer de chaque façon
