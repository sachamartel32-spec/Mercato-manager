# Mercato Manager — serveur public

Jeu d'enchères et de coaching de football multijoueur. Aucune dépendance : Node.js 18+ suffit (pas de `npm install`).

## Lancer
    node server.js            # http://localhost:3000
Variables : `PORT` (défaut 3000), `DATA_DIR` (dossier de sauvegarde, défaut ./data).

Tes amis ouvrent l'adresse du site, choisissent un pseudo + un code à 4 chiffres, et jouent. Pas de compte Claude.

## Héberger pour un an
La partie est enregistrée dans `DATA_DIR/game.json` : ce dossier doit être **persistant**.
- **VPS (recommandé, ~4 €/mois)** : copie le dossier, `node server.js` avec pm2 ou systemd, et Caddy pour le HTTPS.
- **Fly.io / Railway** : crée l'app, ajoute un *volume* monté sur `/data` et mets `DATA_DIR=/data`.
- **Render** : disque persistant payant ; sans disque, la partie est effacée à chaque redémarrage.
- **Chez toi** : PC ou Raspberry Pi allumé en permanence + Cloudflare Tunnel (gratuit) pour une adresse publique.
Les offres gratuites sans disque perdent les données et se mettent en veille : à éviter pour une année.

## Comment ça marche
Le serveur est l'arbitre : il gère les enchères (règlement à l'heure exacte), le marché, les matchs de 6 minutes, les budgets et le classement. Les navigateurs interrogent `/api/state` toutes les 2 s.
Fichiers : `server.js` (règles), `data.js` (joueurs, clubs), `public/index.html` (application).
