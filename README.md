# Alertes billetterie FC Lorient

Ce service surveille la [billetterie officielle du FC Lorient](https://billetterie.fclorient.bzh/fr/matchs/billets-packs) et envoie une notification ntfy lorsqu'un nouveau match passe en vente.

## Fonctionnement

- GitHub Actions vérifie la page toutes les cinq minutes.
- Le premier passage enregistre les ventes existantes sans envoyer d'alerte.
- Chaque nouveau lien de match produit une notification avec un accès direct à l'achat.
- Les ventes déjà signalées sont conservées dans `seen.json` sur la branche `state`.
- Une erreur de billetterie ou de notification ne crée pas de faux positif.
- Un battement mensuel maintient les tâches planifiées actives sur le dépôt public.

GitHub peut retarder une exécution programmée en période de forte charge. L'alerte officielle du club reste donc un complément utile.

En fonctionnement normal, une vente n'est signalée qu'une fois. Une répétition reste exceptionnellement possible si GitHub interrompt la tâche juste après l'envoi ntfy mais avant l'enregistrement de l'état.

Le service ne réserve et n'achète aucun billet. Il ne se connecte pas à un compte FCL et ne surveille aucune plateforme de revente non officielle.

## Secret requis

Le sujet ntfy est stocké dans le secret GitHub `NTFY_TOPIC` et ne figure jamais dans le dépôt :

```bash
gh secret set NTFY_TOPIC --repo simsam56/fcl-billetterie-alertes
```

La commande demande la valeur de manière interactive. Ne placez pas le sujet dans un fichier versionné ou dans la ligne de commande.

## Commandes locales

```bash
npm test
node scripts/run-monitor.mjs inspect
```

`inspect` effectue une lecture réelle et affiche les liens détectés sans envoyer de notification et sans modifier l'état.

## Exploitation GitHub

La branche technique `state` contient un fichier `seen.json` conforme à cette structure initiale :

```json
{
  "version": 1,
  "initializedAt": null,
  "updatedAt": null,
  "seen": []
}
```

Le premier contrôle remplit cette référence sans notifier les ventes déjà ouvertes.

Consulter les dernières exécutions :

```bash
gh run list --workflow monitor.yml --limit 10 --repo simsam56/fcl-billetterie-alertes
```

Lancer un contrôle manuel :

```bash
gh workflow run monitor.yml -f mode=check --repo simsam56/fcl-billetterie-alertes
```

Tester uniquement le trajet GitHub vers ntfy :

```bash
gh workflow run monitor.yml -f mode=test-notification --repo simsam56/fcl-billetterie-alertes
```

## Changer le canal ntfy

Relancer la commande `gh secret set NTFY_TOPIC`, saisir le nouveau sujet puis exécuter le mode `test-notification`.

## Réinitialisation annuelle

La réinitialisation n'est nécessaire que si les adresses de matchs sont réutilisées lors d'une nouvelle saison. Modifier volontairement `seen.json` sur la branche `state` pour remettre `initializedAt` et `updatedAt` à `null`, et `seen` à une liste vide. Le contrôle suivant constituera une nouvelle référence sans alerte.

Avant toute réinitialisation, vérifier qu'aucune ouverture de vente n'est en cours afin de ne pas la classer silencieusement dans la nouvelle référence.
