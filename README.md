# Étude de cas Daisy — Sujet B : le widget de réservation

Un widget que l'artisan pose sur son site en collant deux lignes de code, et qui affiche un tunnel de réservation complet : choix du cours, choix du créneau, coordonnées, confirmation.

## Comment lire ce rendu

1. **Mes décisions** : les trois choix qui structurent tout le reste, avec les options que j'ai écartées.
2. **Les quatre questions** de l'énoncé.
3. **Ce que je n'ai pas fait**, et pourquoi.
4. **Le socle commun** (partie 2).

## Comment lancer le projet

Trois processus, dans trois terminaux. Ils doivent tourner sur des ports différents :
le widget et le site de l'artisan **doivent** être sur deux origines distinctes, sinon
l'isolation de l'iframe n'est pas réellement mise à l'épreuve.

```bash
npm install

npm run dev     # le widget et le loader   -> http://localhost:5173
npm run api     # le faux serveur Daisy    -> http://localhost:3001
npm run host    # les sites de démo        -> http://localhost:4000
```

Puis ouvrir **http://localhost:4000** :

| Page | Ce qu'elle montre |
|---|---|
| `/hostile.html` | Un site qui fait tout pour casser le widget : `!important` sur `button` et `input`, colonne de 320 px, conteneur avec un `transform`, barre collante à `z-index: 999999` |
| `/normal.html` | Un site sobre, pour comparer |

### Provoquer les cas d'erreur

Le faux serveur a une page de contrôle : **http://localhost:3001/__mock**

Un clic change le scénario appliqué au prochain appel. C'est ce qui permet de
montrer les états dégradés en direct plutôt que d'en parler :

| Scénario | Ce qu'il provoque |
|---|---|
| `slot_full` | `409` — la dernière place est partie pendant la saisie |
| `slot_full_partial` | `409` avec `available: 1` — il reste moins de places que demandé |
| `slot_cancelled` | `409` — l'artisan a annulé le créneau |
| `no_phone` | L'atelier ne demande pas de téléphone — le champ disparaît du formulaire |
| `branding_pale` | `/studio` renvoie un rose très pâle — montre le calcul de contraste |
| `phone_required`, `too_many_seats` | `422` |
| `rate_limited` | `429` |
| `origin_not_allowed` | `403` — le domaine n'est pas déclaré, le cas d'une installation sur trois |
| `server_error` | `500` sur tous les endpoints |
| `slow` | +3 s sur les lectures |
| `hang` | Le serveur ne répond jamais : teste le délai avant le lien de secours |

Deux comportements sont là en permanence, parce qu'ils sont dans la spec et
qu'ils ne sont pas négociables :

- la création d'une réservation met **1,5 à 4 secondes** à répondre ;
- les places sont réellement décomptées, donc un `409` finit par arriver tout
  seul, sans forcer aucun scénario.

Le catalogue contient **40 cours** avec des descriptions vides, des descriptions
de 800 caractères, des cours sans image et un nom interminable. Les données sont
générées de façon déterministe : la démonstration donne toujours le même résultat.

---

# Mes décisions

## Décision 1 — J'affiche le widget dans une iframe

### Le problème

Le widget est posé sur des sites que Daisy ne contrôle pas. La spec est claire là-dessus : certains sites appliquent des styles à tous les `button`, `input` et `div` de la page, parfois avec `!important`, ce qui écrase tout le reste. Si mon widget partage la page de l'artisan, ses boutons peuvent devenir illisibles, et personne ne s'en apercevra.

Trois autres éléments du contexte ont compté dans ma décision. Le tunnel récupère des données personnelles : nom, email, téléphone, et un champ de commentaire libre. 60 % du trafic vient du mobile, souvent depuis Instagram. Et les 70 ateliers installent le widget seuls, sans aide.

### Ce que j'ai décidé

Le widget est une page servie par Daisy, affichée dans une iframe. Comme cette page n'est pas sur le même domaine que le site de l'artisan, le navigateur interdit aux deux de se toucher. Le CSS de l'artisan n'entre pas dans le widget, et le mien ne sort pas.

Au départ, l'iframe est petite et ne contient qu'un bouton. Elle a une hauteur fixe, connue à l'avance. Quand l'utilisateur clique, le widget passe en plein écran et tout le tunnel se déroule là.

Le loader, c'est-à-dire le petit fichier JavaScript qui vit dans la page de l'artisan, est le seul lien entre les deux. Il transmet très peu de choses : la clé publique de l'atelier, et l'adresse du site sur lequel le widget est posé. Le reste, le widget se le procure lui-même — il mesure sa propre largeur, et son apparence vient de l'API.

### Les autres options, et pourquoi je les ai écartées

**Préfixer toutes mes classes CSS et réinitialiser mes styles.** Ça évite que mes noms de classes entrent en conflit avec ceux du site, mais je reste dans la même page, donc dans la même cascade CSS. Je perds face à un `!important`. La spec dit que ce cas existe chez de vrais clients, donc cette option ne garantit rien du tout.

**Le Shadow DOM**, qui permet de créer une bulle isolée à l'intérieur de la page. Il bloque presque tout le CSS du site hôte, y compris les `!important`. Mais il ne bloque pas les propriétés qui se transmettent de parent à enfant, comme la police ou la couleur du texte : il faut les réinitialiser une par une, et cette liste évolue avec le langage.

Surtout, le Shadow DOM ne protège pas du JavaScript de la page. Mon widget resterait dans la page de l'artisan, donc mon formulaire resterait lisible par n'importe quel script qu'il a installé — y compris un outil de statistiques qui enregistre ce que les visiteurs tapent, sans aucune intention malveillante de sa part. C'est ce point qui m'a décidé. Je ne veux pas que Daisy expose les données personnelles de ses clients depuis le site de l'artisan.

### Ce que ça me coûte

| Ce que je perds | Ce que je fais à la place |
|---|---|
| L'apparence du site ne se transmet plus au widget | C'est voulu. La couleur et le logo de l'artisan viennent de l'API, tels qu'il les a réglés dans Daisy. Je ne recopie pas l'apparence de son site : si je recopiais sa police, je reproduirais à la main ce que l'iframe vient justement d'empêcher. |
| Rien ne peut dépasser du cadre de l'iframe | Pas de menu déroulant dans le bouton d'entrée. En plein écran, la question ne se pose plus. |
| Les règles d'affichage mobile mesurent l'iframe, pas l'écran | En plein écran, l'iframe fait la taille de l'écran, donc c'est juste à nouveau. Le bouton d'entrée a une hauteur fixe et s'adapte en largeur. |
| Il faut synchroniser la hauteur de l'iframe avec son contenu | J'ai supprimé le problème : le bouton d'entrée a une hauteur connue à l'avance. Si un jour il devait afficher les prochaines dates, il faudrait mesurer son contenu en continu et annoncer la hauteur à la page hôte. |
| Je ne peux pas garder d'information dans le navigateur | Safari et le navigateur interne d'Instagram bloquent le stockage des iframes venues d'un autre domaine. Je ne stocke rien, et je ne propose pas de reprendre un tunnel abandonné. |
| Une page de plus à charger | Le bouton d'entrée reste très léger. |
| Le clavier et la touche Échap doivent être gérés des deux côtés | `showModal()` me donne gratuitement le piégeage du focus et la touche Échap côté page hôte. Échap tapé à l'intérieur de l'iframe doit être transmis par un message. |

### Ce que ça ne règle pas

L'iframe protège son intérieur, pas son cadre. L'artisan peut toujours cacher l'emplacement du widget, le mettre dans une colonne trop étroite, ou avoir un site qui interdit les iframes venues d'un autre domaine.

Deux cas précis que je traite quand même :

- Se battre sur les `z-index` contre un thème que je ne connais pas est ingagnable. Et un `position: fixed` ne couvre pas la fenêtre si un élément parent porte un `transform`, ce que beaucoup de thèmes font pour leurs animations. J'utilise un élément `<dialog>` ouvert avec `showModal()` : le navigateur le place dans la **top layer**, au-dessus de tout et avec la zone visible pour repère. Un seul mécanisme règle les deux problèmes.
- Ce `<dialog>` enveloppe l'iframe **dès sa création**, et plus rien ne bouge ensuite dans le DOM. Déplacer une iframe la recharge : le widget repartirait de zéro et l'utilisateur perdrait le formulaire qu'il était en train de remplir. Passer d'un mode à l'autre ne change donc que des styles.

Et si l'iframe ne charge pas du tout, c'est l'objet de la décision suivante.

---

## Décision 2 — Le loader fait le minimum, et prévoit un lien de secours

### Le problème

70 ateliers ont collé deux lignes de code sur leur site. Certains n'ont plus accès à leur site, un l'a fait faire par quelqu'un qu'on ne joint plus. Ces deux lignes ne changeront jamais. Tout ce que je mets dedans devient impossible à corriger ensuite.

Il y a un deuxième problème. L'iframe peut ne pas charger : un site qui interdit les iframes, un bloqueur de publicité, une extension du navigateur. Le résultat par défaut, c'est un espace vide sur le site de l'artisan. Il ne le remarque pas, et pendant ce temps ses clients ne réservent plus.

### Ce que j'ai décidé

Le loader est un fichier JavaScript sans aucune dépendance. Il fait quatre choses, plus un filet de sécurité décrit juste après : trouver l'emplacement marqué dans la page, lire la configuration écrite dans la balise, créer l'iframe en lui passant la clé publique de l'atelier et l'adresse du site hôte, et faire passer les messages d'ouverture et de fermeture. Pas d'appel à l'API, pas de logique de réservation, aucune donnée client.

Son numéro de version est dans son adresse (`/v1.js`).

Si l'iframe n'a pas signalé qu'elle avait démarré au bout de quelques secondes, le loader affiche un lien vers une page de réservation hébergée par Daisy.

### Les autres options, et pourquoi je les ai écartées

**Mettre la logique du tunnel dans le loader.** C'est le code que je ne pourrai jamais corriger chez les 70 artisans. Tout ce qui y entre devient définitif, donc la règle de conception est une règle de soustraction.

**Ne rien prévoir en cas d'échec.** Le résultat par défaut est une perte de toutes les réservations, sans que personne ne le sache. C'est le pire scénario de tout le sujet, et il coûte une dizaine de lignes à éviter.

**Faire passer le loader par un outil de compilation.** C'est défendable, mais je préfère que le fichier livré soit exactement celui que j'ai écrit, pour la seule partie du système que je ne pourrai jamais corriger à distance. Sur un vrai produit avec plusieurs environnements, j'ajouterais cette étape.

### Ce que ça implique

Tout changement incompatible devra passer par un `v2.js`, et `v1.js` devra rester en ligne pendant des années.

Le loader ne doit jamais faire planter la page de l'artisan, et il vérifie l'origine de chaque message qu'il reçoit : n'importe quel script de la page peut envoyer un message, donc sans cette vérification quelqu'un pourrait faire disparaître le widget.

La page de réservation de secours doit exister chez Daisy. Elle n'est pas dans mon rendu, je la signale comme une dépendance.

---

## Décision 3 — Je ne bloque pas la place, je soigne le refus

### Le problème

L'utilisateur voit des places libres, puis passe une à deux minutes à remplir ses coordonnées. Pendant ce temps, la dernière place peut partir. Soit dans Daisy, soit sur une plateforme partenaire, puisque Daisy centralise plusieurs canaux de vente. En plus, la création d'une réservation met de 1,5 à 4 secondes à répondre, ce qui allonge encore la fenêtre.

Et l'API publique ne propose aucun moyen de réserver une place temporairement.

### Ce que j'ai décidé

Je ne bloque rien. Je considère que la disponibilité affichée est une information qui peut être périmée.

Le refus n'est donc pas une erreur technique, c'est un écran normal du tunnel. Les coordonnées déjà saisies sont conservées, le message est clair et sans terme technique, et je propose les prochaines dates du même cours, cliquables. Je distingue deux causes qui renvoient le même code : la place est partie, ou l'artisan a annulé le cours — ce ne sont pas les mêmes messages. Et si la réponse indique qu'il reste des places mais moins que demandé, je propose de réduire le nombre de places au lieu de renvoyer la personne vers une autre date.

### Les autres options, et pourquoi je les ai écartées

**Bloquer la place pendant que l'utilisateur remplit le formulaire.** L'API ne le permet pas, et je ne le ferais pas même si elle le permettait. Avec 60 % d'abandon à cette étape et des cours de 8 places, ces blocages retireraient plus de places qu'ils n'en sauveraient, et l'artisan verrait « complet » alors qu'il a des places libres. Et ce serait une garantie fausse, puisqu'une plateforme partenaire peut vendre la place malgré mon blocage.

**Vérifier la disponibilité en continu pendant la saisie.** Je ne veux pas ajouter d'appels réseau pendant que l'utilisateur remplit son formulaire, pour un gain qui reste partiel : ça réduit le risque sans le supprimer. Et ça fait bouger l'information sous les doigts de quelqu'un en train d'écrire, ce qui est une mauvaise expérience. Si le taux de refus s'avérait élevé une fois en production, la première chose que j'ajouterais serait un avertissement quand il ne reste qu'une place — sans jamais retirer le créneau de l'écran.

### Ce que ça implique

Une partie des utilisateurs verra ce refus. C'est assumé, et c'est l'un des indicateurs que je veux mesurer en priorité.

Le tunnel doit garder les coordonnées saisies même quand il change d'écran.

Le double envoi est un autre problème, que je traite autrement : un verrou empêche un second envoi tant que le premier n'a pas répondu, et l'écran d'attente remplace le formulaire dès le premier clic. Mais je signale une limite que je ne peux pas régler côté widget. L'API ne propose pas de clé d'idempotence, c'est-à-dire un identifiant qui permettrait au serveur de reconnaître qu'il a déjà traité ma demande. Si la réponse se perd alors que la réservation a bien été créée, je ne peux ni le savoir ni le rattraper — il n'y a pas non plus d'endpoint pour vérifier. C'est la question que je poserais à l'équipe qui maintient l'API.

---

# Les quatre questions

## 1. Comment garantir que le widget s'affiche correctement partout, et à quel prix ?

Le mot important de la question est « garantir ». Il écarte deux des trois réponses possibles.

Je peux **atténuer** le problème en préfixant mes classes et en réinitialisant mes styles. Ça élimine les conflits de noms, mais je reste dans la cascade CSS du site hôte, donc je perds face à un `!important` — et la spec dit que ce cas existe chez de vrais clients. Ce n'est pas une garantie.

Je peux **presque** garantir avec un Shadow DOM : le CSS du site n'y entre pas, `!important` compris. Mais les propriétés qui se transmettent de parent à enfant traversent quand même, comme la police et la couleur du texte. Il faut donc les réinitialiser explicitement, sur une liste qui s'allonge avec le langage. Une garantie qui dépend du fait que je n'ai rien oublié aujourd'hui, et que je resterai vigilant dans deux ans, n'est pas une garantie.

Alors **je sors de la page**. Le widget est une page servie par Daisy, affichée dans une iframe sur un autre domaine. La garantie ne vient plus de ma rigueur, elle vient d'une règle de sécurité que le navigateur applique lui-même : deux pages de domaines différents ne peuvent pas se toucher. Le CSS du site hôte n'atteint pas l'intérieur du widget, pas même les propriétés héritées. Et la protection marche dans les deux sens : mon CSS ne peut pas non plus casser la mise en page de l'artisan.

J'ajoute un point qui a pesé autant que le CSS dans ma décision. L'iframe m'isole aussi du **JavaScript** de la page. Mon tunnel récupère un nom, un email, un téléphone et un commentaire libre. Dans la page de l'artisan — même derrière un Shadow DOM — un outil d'analyse de comportement peut lire ce que le visiteur tape, sans que l'artisan l'ait voulu. Avec une iframe sur un autre domaine, c'est impossible par construction.

### Le prix que je paie

**La hauteur.** Une iframe ne connaît pas la hauteur de son contenu. Plutôt que de construire un système de synchronisation, j'ai supprimé le problème : mon bouton d'entrée a une hauteur fixe, et tout le tunnel se déroule en plein écran. Si le bouton devait un jour afficher les prochaines dates, il faudrait mesurer son contenu en continu et l'annoncer à la page hôte, avec les sauts d'affichage que ça implique à chaque étape.

**Le débordement.** Rien ne peut sortir du cadre de l'iframe. Pas d'infobulle qui dépasse, pas de menu flottant, dans le bouton d'entrée. Le plein écran lève la contrainte pour le reste.

**L'affichage mobile.** Dans une iframe, les règles d'affichage mesurent l'iframe et non l'écran. En plein écran ce n'est plus un problème. Pour un bouton d'entrée qui doit tenir dans une colonne de 320 px comme en pleine largeur, il faut raisonner en largeur de conteneur plutôt qu'en largeur d'écran.

**L'intégration visuelle.** Je n'hérite plus rien du site, et je ne cherche pas à le compenser. La couleur principale et le logo de l'artisan viennent de l'API, tels qu'il les a réglés dans Daisy. J'ai écarté l'idée de faire lire au loader la police du site pour la recopier dans le widget : ce serait reproduire à la main exactement ce que l'iframe vient d'empêcher, et un site en Comic Sans donnerait un widget en Comic Sans. Le widget ressemble donc à l'atelier tel qu'il s'est décrit dans Daisy, pas au site sur lequel il est posé — et au passage, il est cohérent avec ses emails de confirmation et son back-office.

**Le clavier.** `showModal()` me donne le piégeage du focus et la touche Échap côté page hôte. Mais Échap tapé à l'intérieur de l'iframe doit être transmis explicitement, parce que mes gestionnaires d'événements ne traversent pas la frontière.

**Le stockage.** Safari et le navigateur interne d'Instagram bloquent le stockage des iframes venues d'un autre domaine. Je n'y stocke rien, et je ne propose donc pas de reprendre un tunnel abandonné.

**Une page de plus à charger**, donc un aller-retour réseau supplémentaire avant le premier affichage, sur un trafic à 60 % mobile.

### Ce que ça ne garantit pas

L'iframe protège son intérieur, pas son cadre. Un site peut cacher mon emplacement, le contraindre en largeur, ou interdire les iframes venues d'ailleurs.

Deux cas que je traite avec un seul mécanisme. Un élément parent portant un `transform` empêcherait un `position: fixed` de couvrir la fenêtre, et une bataille de `z-index` contre un thème inconnu est ingagnable. J'utilise `<dialog>` avec `showModal()` : le navigateur place l'élément dans la top layer, au-dessus de tout et avec la zone visible pour repère, ce qui neutralise les deux d'un coup. Le dialogue enveloppe l'iframe dès le départ, parce que la déplacer dans le DOM la rechargerait et ferait perdre sa saisie à l'utilisateur.

Le cas qui reste, c'est l'iframe qui ne charge pas du tout. Là, la seule réponse utile n'est pas technique : le loader affiche un lien de secours vers une page de réservation hébergée par Daisy. Un widget cassé fait perdre une réservation. Un widget cassé **et silencieux** en fait perdre des dizaines, parce que l'artisan ne le sait pas.

---

## 2. Jusqu'où laisser la potière personnaliser son widget ?

### D'abord, ce sont deux demandes différentes

Elle dit deux choses dans la même phrase, et elles n'ont rien à voir.

« Moche sur mobile » n'est pas une demande de personnalisation. C'est probablement un bug de mon côté. Et s'il existe, il ne touche pas qu'elle : 60 % du trafic est mobile, sur les 70 ateliers. C'est donc une priorité à corriger pour tout le monde, pas quelque chose à lui laisser régler.

« Je veux mes couleurs » est la vraie demande de personnalisation.

Séparer les deux change la réponse. Sinon je risque de lui donner un réglage de couleurs pour un problème qui n'en est pas un, et de laisser le vrai bug chez les 69 autres.

### Ensuite, c'est déjà fait

L'API renvoie déjà la couleur et le logo de l'atelier, dans `GET /studio` :

```json
"branding": { "primary_color": "#C4643A", "logo_url": "..." }
```

L'artisan les règle dans Daisy, et le widget les applique. Je n'ai aucune interface de personnalisation à construire : la plus demandée était prévue par l'API.

Ça lui donne même quelque chose de mieux qu'un réglage dans le widget. Elle règle son apparence une fois, au même endroit, et c'est la même dans le widget, dans ses emails de confirmation et dans son back-office.

### La limite : l'apparence oui, la lisibilité non

L'artisan choisit sa couleur de fond. C'est le widget qui décide de la couleur du texte posé dessus.

Le widget calcule le contraste entre la couleur choisie et deux couleurs de texte possibles, puis garde la plus lisible. Si elle choisit un rose pâle, le texte passe en noir au lieu de rester blanc et de disparaître.

Ce n'est pas de la méfiance envers elle. Elle n'a aucun moyen de prévoir le problème, et c'est elle qui perdrait les réservations.

Ce calcul a d'ailleurs trouvé un défaut que je n'avais pas vu. Sur le terracotta de l'atelier de démonstration, le texte blanc que j'avais mis en dur donnait un contraste de 4,01, en dessous du minimum recommandé de 4,5. Le noir donne 5,23. Le widget faisait donc déjà un peu moins bien que ce que je croyais.

La même règle vaut pour le reste : je ne laisse pas modifier la taille des boutons, l'ordre des étapes, ni les textes d'erreur. Un bouton trop petit sur mobile ou un message mal formulé coûtent des réservations, et c'est l'artisan qui les perd.

### Ce que je n'expose pas, et pourquoi

Je ne donne aucun moyen d'injecter du CSS, et c'est volontaire.

Le jour où je laisse quelqu'un viser un élément de mon widget, je gèle ma structure pour toujours. Si je réorganise le tunnel six mois plus tard, je casse son site. Et avec 70 clients, je ne peux même pas savoir qui j'ai cassé : personne ne me préviendra, ses réservations s'arrêteront simplement.

Chaque réglage que j'ouvre devient aussi quelque chose à maintenir et à expliquer au support, qui est déjà le point faible ici.

Et comme le widget est dans une iframe, c'est de toute façon impossible sans que je l'autorise moi-même. L'isolation me protège aussi de mes propres concessions.

### En pensant aux 70 ateliers

Ma règle tient en une phrase : **ce qui rend le widget reconnaissable comme le sien, oui ; ce qui peut le rendre inutilisable, non.**

Couleur, logo : oui. Disposition, taille des cibles, ordre des étapes, textes : non.

Pour l'artisan qui veut vraiment tout contrôler, il y a une réponse honnête à donner plutôt qu'un refus : l'API publique existe, il peut construire son propre tunnel. C'est d'ailleurs le ticket 6 de la partie 2.

### Ce que je lui répondrais

Que ses couleurs sont déjà prises en compte, et qu'il suffit de les régler dans Daisy.

Que « moche sur mobile » m'intéresse beaucoup plus que la couleur, et que j'aimerais une capture d'écran et le modèle de son téléphone. Si c'est un bug, je le corrige pour tout le monde cette semaine.

Et que je ne lui donnerai pas la main sur la mise en page, parce que c'est elle qui perdrait des réservations si le tunnel devenait difficile à utiliser.

## 3. La dernière place part pendant que l'utilisateur remplit ses coordonnées

### Ce qu'il voit

Trois situations différentes, trois écrans. Les textes ci-dessous sont ceux qui sont réellement dans le code.

**S'il ne reste plus rien :**

> **Cette place vient d'être réservée**
>
> Le créneau du mercredi 7 octobre à 14:00 est complet depuis quelques instants. Vos coordonnées sont conservées.
>
> **Prochaines dates disponibles**
> [ Mercredi 14 octobre · 14:00 · 75 € · Dernière place ]
> [ Samedi 17 octobre · 14:00 · 85 € ]
> [ Mercredi 21 octobre · 14:00 · 75 € ]
>
> [ Voir toutes les dates ]

**S'il reste des places, mais moins qu'il n'en demandait :**

> **Il ne reste qu'une place**
>
> Vous en demandiez 2 pour le créneau du mercredi 7 octobre à 14:00. Les autres viennent d'être réservées. Vos coordonnées sont conservées.
>
> [ **Réserver pour 1 personne** ]
>
> **Prochaines dates disponibles**
> […]

**Si c'est l'atelier qui a annulé le créneau :**

> **Cette séance a été annulée**
>
> L'atelier vient d'annuler ce créneau. Aucune réservation n'a été enregistrée et rien ne vous sera facturé.
>
> [ Choisir une autre date ]

### Pourquoi ces textes-là

**Pas de code technique, et pas le mot « erreur ».** L'utilisateur n'a rien fait de travers. Il a vu une information vraie qui a cessé de l'être pendant qu'il tapait son nom.

**« Vos coordonnées sont conservées » est la phrase la plus importante.** C'est elle qui évite l'abandon. Sans elle, l'utilisateur suppose qu'il va devoir tout retaper, et il part. Et ce n'est pas une promesse en l'air : s'il clique sur une autre date, il retrouve le formulaire déjà rempli, avec le prix du nouveau créneau.

**Une action, tout de suite.** Je ne le laisse pas devant un constat. Les trois dates les plus proches sont proposées et cliquables, et un clic le ramène là où il en était.

**Trois messages et pas un seul**, parce que les situations ne demandent pas la même chose. Dans le premier cas il faut proposer autre chose. Dans le deuxième il n'a pas besoin de changer de date, juste de réduire le nombre de places, donc c'est ça que je propose. Dans le troisième il n'y a pas de place à récupérer, le cours n'a plus lieu, et ce qu'il faut c'est rassurer sur le fait que rien ne sera facturé.

Les deux premiers cas renvoient pourtant le même code `409`. Les distinguer demande de lire le champ `available` du corps de la réponse. Un message unique serait faux une fois sur deux.

### Pourquoi je ne l'empêche pas

Je n'essaie pas de bloquer la place pendant la saisie, et ce n'est pas seulement parce que l'API ne le permet pas.

Daisy centralise plusieurs canaux de vente. Une plateforme partenaire peut vendre la place au même moment. Un blocage côté Daisy donnerait donc une garantie fausse, et une garantie fausse est pire que pas de garantie.

Et avec 60 % d'abandon à cette étape sur des cours de huit places, les blocages retireraient plus de places qu'ils n'en sauveraient. L'artisan verrait « complet » alors qu'il lui reste trois places libres.

Ce que je fais à la place : je raccourcis le temps d'exposition en demandant le moins de champs possible, et je rends le refus récupérable en un clic. La réservation n'est pas perdue, elle est déplacée.

### Ce que ça laisse de côté

Ce cas ne peut pas disparaître. Je peux seulement le rendre rare et le faire bien vivre.

Je ne sais pas à quelle fréquence il se produit, et c'est un des premiers chiffres que je voudrais mesurer. Ça dépend du taux de remplissage : quasi nul sur un cours à moitié vide, fréquent sur les derniers créneaux d'un cours populaire. Je le mesurerais par atelier et par créneau, pas en moyenne.

Si le taux s'avérait élevé, la première chose que j'ajouterais serait un avertissement pendant la saisie quand il ne reste qu'une place. Sans jamais retirer le créneau de l'écran, et sans ajouter d'appels réseau pendant que l'utilisateur écrit.

## 4. Quel indicateur pour savoir si le widget marche ?

### Le point de départ : je suis aveugle

Mon widget tourne sur 70 sites que je ne visite jamais, dans des navigateurs que je n'ai pas testés. Je ne verrai jamais à quoi il ressemble chez un client.

C'est la contrepartie de l'isolation que j'ai choisie. Plus je protège le widget de la page qui l'accueille, moins je peux l'observer de l'extérieur. Il faut donc décider à l'avance ce qu'il va me raconter.

### Le piège, et c'est le point central

Si le widget est cassé chez **un seul** artisan, mon taux d'erreur global reste très bas. Tous les tableaux de bord sont au vert, et pendant ce temps cette personne ne prend plus une réservation.

Ce n'est pas un cas théorique : la spec dit qu'un domaine sur trois n'est pas déclaré à la première installation, et qu'un widget qui ne s'affiche pas est le deuxième motif de contact du support.

D'où la seule règle qui compte vraiment ici : **toute mesure est découpée par site hôte.** Une moyenne sur 70 clients cache exactement le client chez qui c'est cassé.

### L'indicateur que je mettrais en premier

> Le widget s'est chargé chez cet artisan, et aucune réservation n'en est sortie depuis 7 jours.

C'est le seul qui détecte une installation cassée sans qu'il y ait d'erreur technique à voir. Le `403` peut ne jamais remonter jusqu'à moi ; l'absence de réservations, elle, se mesure.

Et c'est aussi le seul qui ferait gagner du temps au support au lieu d'en consommer : on appelle l'artisan avant qu'il n'appelle, et avant qu'il ait perdu trois semaines de réservations.

### Le tunnel, étape par étape

Six événements :

```
widget affiché → cours consulté → créneau choisi → formulaire commencé → envoi → confirmé
```

Ce qui m'intéresse n'est pas les six chiffres, c'est les **cinq taux de passage** entre eux. C'est le seul moyen de répondre à une question comme « 60 % d'abandon à l'étape des coordonnées, personne ne sait pourquoi ». Sans ces événements, cette question n'a pas de réponse.

### La santé technique

Taux de `409`, de `429`, d'échec de chargement de l'iframe, temps de réponse, erreurs JavaScript. Groupés par site hôte et par navigateur.

Le groupement par navigateur compte autant que celui par site : un widget cassé uniquement dans le navigateur interne d'Instagram toucherait une grosse partie du trafic sans jamais apparaître dans mes tests.

### Deux choses à ne pas confondre

Zéro réservation chez un artisan peut vouloir dire deux choses opposées. Soit le widget est cassé, et c'est mon problème. Soit l'atelier n'a ouvert aucun créneau, et c'est le sien.

Une seule mesure mélange les deux. Je veux donc compter séparément les sessions où **il n'y avait rien à réserver**. C'est d'ailleurs une information utile à renvoyer à l'artisan.

### Une discipline que je m'imposerais

Mon widget est sur le site de quelqu'un d'autre. Y glisser un outil de mesure tiers créerait une obligation juridique pour l'artisan, qui n'a rien demandé et devrait peut-être afficher une bannière de consentement.

Donc : des événements anonymes, collectés par Daisy, sans cookie publicitaire et sans tiers. C'est une contrainte, mais c'est aussi quelque chose à dire aux artisans.

### Ce qui n'est pas implémenté

Rien de tout ça n'est implémenté. Il n'y a aucun envoi d'événement dans mon rendu.

C'était un choix de temps : j'ai préféré finir le tunnel et ses cas d'erreur. Si j'avais eu une demi-journée de plus, j'aurais ajouté les six événements du tunnel et l'alerte « chargé mais zéro réservation », parce que ce sont les deux qui répondent à des questions qu'on se pose vraiment.

---

# Ce que je n'ai pas fait

Choix assumés, pour tenir le temps que je m'étais donné.

Une précision d'abord : la synchronisation de hauteur de l'iframe n'est pas dans cette liste. Ce n'est pas un manque, c'est un problème que j'ai supprimé en donnant une hauteur fixe à mon bouton d'entrée. C'est expliqué dans la décision 1.

- **La recherche dans la liste des cours.** Certains ateliers ont plus de 40 cours : mon faux serveur en contient 40 pour que le problème soit visible, mais je ne l'ai pas résolu.
- **La personnalisation au-delà de la couleur et du logo**, que je lis dans l'API. Pas de choix de police, pas de rayon de bordure, pas de disposition.
- **Un état d'attente sur le bouton d'entrée.** Le widget n'affiche rien tant que l'appel à `/studio` n'a pas répondu. Sur une connexion lente, il y a donc un trou à l'emplacement du widget sur le site de l'artisan — visible avec le scénario `slow` du faux serveur, qui ajoute trois secondes aux lectures. Sur un trafic à 60 % mobile, souvent depuis Instagram, ce n'est pas un cas rare. Ce que je ferais : afficher le bouton immédiatement, dans un état désactivé avec un indicateur de chargement, puis l'activer à la réponse.
- **Les indicateurs.** Aucun événement n'est envoyé. J'ai préféré finir le tunnel et ses cas d'erreur. Ce que j'aurais ajouté en premier est décrit dans la réponse 4.
- **Le découpage du code.** `src/main.ts` fait près de 1 400 lignes. Je l'aurais séparé en trois fichiers (l'état et le rendu, les écrans, les appels à l'API) le jour où l'état serait passé en paramètre plutôt que lu globalement. Le découper tel quel obligerait à exporter un état modifiable, ce qui serait pire que le problème.
- **La lisibilité de l'accent sur fond blanc.** Je calcule la couleur du texte posé *sur* la couleur de l'atelier, mais cette couleur sert aussi de texte sur fond blanc dans les boutons secondaires. Un accent très pâle y resterait peu lisible. Il faudrait en dériver une variante assombrie.
- **Les tests automatisés.** Mes cas d'erreur sont reproductibles à la demande grâce aux interrupteurs du faux serveur, ce qui m'a servi de dispositif de test manuel.
- **Le déploiement en ligne.** La démonstration se fait en local, sur deux domaines distincts pour que l'isolation de l'iframe soit réellement mise à l'épreuve.
- **L'accessibilité complète.** J'ai fait le socle : HTML sémantique, libellés liés aux champs, contraste, touche Échap. Il manque au minimum l'annonce des erreurs aux lecteurs d'écran et une vérification complète au clavier.

---

# Partie 2 — Le socle commun

## 1. Mon journal de bord

### Le temps

Environ 18 heures, étalées sur cinq jours : deux heures le mercredi soir, une journée le jeudi, une après-midi le vendredi, et une journée complète le lundi. Rien le week-end.

C'est plus que les 4 à 6 heures annoncées. La raison est simple : je n'avais jamais construit de widget embarquable, et une partie du temps est passée à comprendre le sujet avant de pouvoir décider quoi que ce soit.

### L'ordre dans lequel j'ai attaqué

**Je n'ai pas écrit une ligne de code le premier soir.** J'ai lu la spec en cherchant les pièges, j'ai listé les problèmes du sujet par gravité, et j'ai tranché la question de l'isolation. Les trois décisions de ce README ont été écrites avant le premier fichier.

C'était volontaire : le choix de l'isolation détermine la forme de tout le reste, et revenir dessus au milieu aurait coûté bien plus cher qu'une soirée de réflexion.

**Ensuite le loader et la page hostile, avant toute fonctionnalité.** Je voulais que la démonstration existe avant le produit. Dès le jeudi midi, je pouvais ouvrir une page au CSS volontairement agressif et voir le widget intact au milieu. Tout ce que j'ai construit après s'est vérifié là-dessus.

**Puis le tunnel, écran par écran**, en gardant les cas d'erreur pour la fin. La liste des cours, les créneaux, le formulaire, puis l'envoi et le refus.

### Ce qui m'a bloqué

**Déplacer une iframe dans le DOM la recharge.** C'est ce qui m'a coûté le plus de temps. Mon loader déplaçait l'iframe dans le dialogue au moment de passer en plein écran, ce qui redémarrait le widget : il fallait cliquer deux fois pour ouvrir le tunnel.

Ce qui m'a marqué, c'est que toutes mes vérifications automatiques étaient au vert. La géométrie était bonne, le dialogue bien placé, l'iframe à la bonne taille. Le bug sautait aux yeux au premier clic réel. Je n'ai pas vérifié ce qu'il fallait, j'ai vérifié ce que je savais mesurer.

En cherchant la cause, j'ai découvert que le déplacement était de toute façon inutile : un dialogue modal est placé dans la *top layer*, qui ignore à la fois les `z-index` et un éventuel `transform` sur un élément parent. Un seul mécanisme réglait les deux problèmes que je croyais devoir traiter séparément.

**La touche Échap ne traverse pas l'iframe.** Quand le tunnel est ouvert, le focus est à l'intérieur : la touche part dans le document du widget et n'atteint jamais la page hôte, donc le dialogue ne se ferme pas. Je l'avais annoncé comme un coût de l'isolation dans ma réponse à la question 1, sans réaliser que j'allais devoir le payer le jour même.

**Une hauteur mal choisie.** Avec `min-height: 100dvh`, le tunnel grandissait avec son contenu — près de 5 000 pixels pour 40 cours — et c'était la page entière qui défilait, donc l'en-tête disparaissait vers le haut. Pour qu'un enfant défile, le parent doit avoir une hauteur fixée, pas un minimum.

### Ce que j'ai abandonné, et pourquoi

La recherche dans la liste des 40 cours, les indicateurs, les tests automatisés, le déploiement en ligne, et l'accessibilité au-delà du socle. Tout est détaillé dans la section « ce que je n'ai pas fait », avec ce que chaque manque coûte.

Le principe de mes coupes : **je n'ai jamais coupé ce qui démontre une décision.** La page hostile, le lien de secours et le traitement du refus ont été protégés du début à la fin, même quand le temps manquait.

### Une décision que j'ai changée en route

J'avais d'abord fixé le nombre de places à 1, pour gagner du temps.

En relisant la spec, j'ai réalisé que ce raccourci rendait inatteignables trois choses qu'elle décrit : la limite `max_seats_per_booking`, l'erreur `too_many_seats`, et surtout le cas où il reste des places mais moins que demandé — celui que l'énoncé désigne en précisant que le refus contient le champ `available`.

J'ai donc repris cette coupe le dernier jour. Ça m'a pris plusieurs heures, et ça a transformé l'écran de refus : au lieu de renvoyer la personne vers d'autres dates, il lui propose maintenant de réserver pour le nombre de places encore libres.

## 2. Le tri de tickets

**Du plus au moins d'envie :**

> **8 · 6 · 5 · 3 · 4 · 2 · 7 · 1**

### 8 — Le design system n'existe pas, chaque écran a ses propres boutons

Celui qui me donne le plus envie. Concevoir ce qui restera et deviendra la norme pour tous les écrans suivants est très motivant. Une décision prise qui porte sur tout ce qui viendra après, et chaque correction se fait ensuite une seule fois au lieu de dix.

### 6 — Exposer une API publique propre pour que de futurs partenaires s'intègrent seuls

La même idée, tournée vers l'extérieur. Construire ce que des partenaires utiliseront pour s'intégrer sans nous, c'est décider de la façon dont le produit s'ouvre. Et une API publique ne se corrige pas facilement une fois que des gens s'en servent, donc il faut bien réfléchir avant de la figer.

### 5 — 60 % d'abandon à l'étape des coordonnées, personne ne sait pourquoi

Personne ne sait pourquoi : il faut donc mesurer avant de corriger, formuler des hypothèses et les vérifier. C'est le ticket où j'apprendrais le plus, et il touche tous les ateliers à la fois.

### 3 — Ajouter les paiements sur place par TPE dans le parcours de réservation

Du front et du back, et un vrai besoin des artisans. Un périmètre net, avec un début et une fin.

### 4 — Un filtre par type de cours dans la liste des réservations

J'aime le travail d'interface, et là je réponds à une demande directe. C'est petit, mais c'est utile tout de suite.

### 2 — Le calendrier rame au-delà de 200 cours affichés

L'optimisation n'est pas ce qui m'attire le plus. Mais comprendre d'où vient la lenteur et comment la réduire reste quelque chose que j'ai envie de savoir faire.

### 7 — L'export comptable ne correspond pas aux relevés bancaires

Trois artisans l'ont signalé, mais si le calcul est faux il l'est sans doute pour tout le monde : les autres n'ont pas encore comparé. C'est donc plus grave que ça n'en a l'air, et comme il s'agit d'argent, ça ne peut pas attendre.

Je le place bas pour une raison honnête : la comptabilité n'est pas le domaine qui m'attire, même si je reconnais que c'est un des tickets les plus importants de la liste.

### 1 — Un partenaire a changé le format de ses dates, les réservations n'entrent plus depuis ce matin

Je le prendrais tout de suite, parce qu'un partenaire bloqué, ce sont tous les ateliers qui vendent chez lui qui perdent des réservations pendant qu'on en parle.

Mais avec le moins d'envie, parce qu'il n'y a rien à décider : on comprend le nouveau format, on l'adapte, on repart. C'est sans doute le ticket le plus utile de la liste, et celui où j'apprendrais le moins.

### Ce que ce classement dit de moi

Je préfère les problèmes où il faut d'abord comprendre, et où ce que je décide reste.

Je place l'urgence en bas non pas parce qu'elle compte moins — les tickets 1 et 7 sont probablement les plus coûteux de la liste — mais parce qu'elle ne laisse pas le temps de bien faire.

Je sais que c'est un biais. Dans une équipe de trois avec 70 clients, réparer vite est une compétence à part entière, et c'est celle qui me manque le plus aujourd'hui.

## 3. Mes deux premières semaines

### Les gens d'abord

Je commencerais par les deux développeurs de l'équipe, parce que ce sont eux avec qui je vais travailler tous les jours : comprendre qui s'occupe de quoi, comment on se relit, comment une tâche arrive et comment on décide qu'elle est finie. Dans une équipe de trois, ces habitudes-là ne sont écrites nulle part et on les apprend en demandant.

Mais je voudrais aussi prendre le temps de rencontrer les personnes hors du développement, et savoir qui fait quoi. Dans une entreprise de cette taille, ce sont elles qui parlent aux artisans tous les jours. Le care sait pourquoi une installation sur trois échoue bien avant que ça apparaisse dans un outil de mesure, et je préfère l'entendre d'eux que le découvrir six mois plus tard.


### Puis regarder le produit vivre

Je demanderais à lire les tickets de support des dernières semaines, et à assister à un échange avec un artisan. L'énoncé dit qu'un widget qui ne s'affiche pas est le deuxième motif de contact : j'aimerais entendre comment ça se raconte côté client, pas seulement côté logs.

Si c'est possible, je voudrais voir un atelier utiliser le back-office pendant une demi-heure. Je pense qu'on apprend plus en trente minutes d'observation qu'en deux jours de lecture de code.

### Le code ensuite

Je ferais tourner le projet en local, je suivrais une réservation de bout en bout — depuis le widget jusqu'à la facture — et je noterais tout ce que je ne comprends pas pour poser mes questions en une fois plutôt qu'en continu.

### Ce que je ne toucherais pas

Rien de structurel. Pas de refactorisation, pas de « ça serait mieux comme ça ». Sur un produit de quatre ans qui tourne chez 70 clients, ce que je prendrais pour de la maladresse est souvent une décision que je ne comprends pas encore.

### Ce que je livrerais quand même

Je voudrais mettre quelque chose en production avant la fin des deux semaines, même petit : un bug de la liste du support, ou une amélioration d'un message d'erreur. Pour voir le cycle complet jusqu'au déploiement, et pour ne pas être seulement en lecture pendant deux semaines.

## 4. Ce que je vous demanderais

### La question

`POST /bookings` met 1,5 à 4 secondes à répondre et n'accepte pas de clé d'idempotence, c'est-à-dire un identifiant que j'enverrais avec ma demande et qui permettrait au serveur de reconnaître qu'il l'a déjà traitée. Il n'y a pas non plus d'endpoint pour vérifier qu'une réservation existe.

Résultat : si la réponse se perd alors que la réservation a bien été créée — une coupure réseau, un métro, un téléphone qui change d'antenne — je n'ai aucun moyen de le savoir ni de le rattraper.

**Est-ce un manque assumé, ou quelque chose qui n'a jamais posé problème en pratique ?** La réponse change ce que je dois faire : si le cas est fréquent, il faut une clé d'idempotence ; s'il est rare, le traiter côté widget suffit peut-être.

### Ce que j'ai supposé à la place

Que je ne dois **jamais** réessayer tout seul. Une nouvelle tentative automatique risquerait de créer une deuxième réservation sur un cours de huit places, et l'artisan se retrouverait avec un client fantôme.

Donc, en l'absence de réponse, je dis les choses honnêtement :

> Nous n'avons pas reçu de réponse. Votre réservation a peut-être été enregistrée : vérifiez votre boîte email avant de réessayer, un message de confirmation signifie que votre place est prise.

C'est ce que je peux faire de mieux avec cette API, mais ça reporte sur l'utilisateur un doute que le serveur pourrait lever à ma place.

### Pourquoi celle-là plutôt qu'une autre

Parce qu'elle est née du travail. Je ne l'ai pas trouvée en relisant la spec à la recherche de ce qui manquait, je l'ai rencontrée en traitant les 4 secondes d'attente : j'ai d'abord bloqué le double-clic, puis je me suis demandé ce qui se passait si la réponse n'arrivait jamais. Et là, je n'avais plus de solution propre.

C'est aussi la seule limite de ce rendu que je ne peux pas lever en écrivant du code.
