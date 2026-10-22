# Docs du domaine

Comment les skills d'ingénierie doivent utiliser la documentation du domaine de ce repo lorsqu'ils explorent le code.

## Avant d'explorer, lire

- **`GLOSSARY.md`** à la racine du repo, ou
- **`GLOSSARY-MAP.md`** à la racine s'il existe : il pointe vers un `GLOSSARY.md` par contexte. Lire chacun de ceux qui concernent le sujet.
- **`docs/adr/`** : lire les ADR qui touchent la zone sur laquelle on s'apprête à travailler. Dans un repo multi-contexte, regarder aussi `src/<context>/docs/adr/` pour les décisions propres à un contexte.

Si l'un de ces fichiers n'existe pas, **continuer sans rien dire**. Ne pas signaler leur absence, ne pas proposer de les créer d'avance. Le skill `/domain-modeling` (atteint via `/grill-with-docs` et `/improve-codebase-architecture`) les crée au fil de l'eau, quand des termes ou des décisions sont effectivement tranchés.

## Structure des fichiers

Repo single-context (la plupart des repos, dont celui-ci) :

```
/
├── GLOSSARY.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

Repo multi-contexte (présence de `GLOSSARY-MAP.md` à la racine) :

```
/
├── GLOSSARY-MAP.md
├── docs/adr/                          ← décisions à l'échelle du système
└── src/
    ├── ordering/
    │   ├── GLOSSARY.md
    │   └── docs/adr/                  ← décisions propres au contexte
    └── billing/
        ├── GLOSSARY.md
        └── docs/adr/
```

## Utiliser le vocabulaire du glossaire

Quand une production nomme un concept du domaine (titre d'issue, proposition de refacto, hypothèse, nom de test), utiliser le terme tel qu'il est défini dans `GLOSSARY.md`. Ne pas glisser vers des synonymes que le glossaire écarte explicitement.

Si le concept nécessaire n'est pas encore dans le glossaire, c'est un signal : soit on invente un vocabulaire que le projet n'utilise pas (à reconsidérer), soit il y a un vrai manque (à noter pour `/domain-modeling`).

## Signaler les conflits avec un ADR

Si une production contredit un ADR existant, le signaler explicitement plutôt que de passer outre en silence :

> _Contredit l'ADR-0007 (commandes en event sourcing), mais mérite d'être rouvert parce que…_
