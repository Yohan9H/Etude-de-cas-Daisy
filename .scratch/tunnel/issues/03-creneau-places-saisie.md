# 03 : Choisir un créneau, le nombre de places et saisir ses coordonnées

Status: ready-for-agent
Blocked by: 02
Spec : `.scratch/tunnel/spec.md`

**Ce qu'il faut construire :** la personne choisit un créneau disponible, règle le nombre de places dans les limites permises, saisit ses coordonnées, et peut revenir aux créneaux sans perdre sa saisie.

- [ ] `choisirCreneau` affiche l'écran des coordonnées ; un créneau complet ne peut pas être choisi
- [ ] Le nombre de places est borné par le plafond de l'atelier et par les places restantes du créneau, avec un minimum de 1 ; cette borne n'existe qu'à un seul endroit
- [ ] `changerPlaces` applique cette borne
- [ ] Changer de créneau dans le même cours garde le nombre de places, ramené au nouveau plafond ; changer de cours le remet à 1
- [ ] `saisir` met à jour un champ de la saisie ; le téléphone n'est demandé que si l'atelier l'exige
- [ ] `revenir` depuis les coordonnées ramène aux créneaux du même cours, saisie intacte
- [ ] Les champs de l'ancien état global remplacés sont supprimés
- [ ] Vérifié à la main dans la démo
