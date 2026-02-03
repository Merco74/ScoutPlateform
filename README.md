# Inscription Scouts & Guides de Cluses

Site d’inscription en ligne pour les parents qui veulent inscrire leur enfant chez les **Scouts**, **Guides** ou **Louveteaux** de Cluses.

C’est simple, rapide, légal et tout est imprimable.

## Ce que fait le site (en vrai)

- Les parents remplissent un gros formulaire (identité enfant, responsables, sanitaire, autorisations…)
- Ils signent électroniquement deux documents (canvas SignaturePad)
- Le serveur génère **deux PDF propres** :
  - Autorisation droit à l’image + transport
  - Fiche sanitaire complète
- Les PDF + les scans (carnet vaccins, ordonnances…) sont uploadés sur **Cloudinary**
- Toutes les infos sont sauvegardées dans **MongoDB** (collections séparées : scouts / guides / louveteaux)
- Les encadrants se connectent avec **un seul mot de passe commun** et accèdent aux listes complètes
- Les listes sont protégées (pas de connexion = pas de listes)

## Stack technique (ce qu’il y a derrière)

| Partie                | Technologie                          | Pourquoi ?                                                                 |
|-----------------------|--------------------------------------|----------------------------------------------------------------------------|
| Backend               | Node.js + Express                    | Rapide à développer, tout le monde connaît                                 |
| Base de données       | MongoDB + Mongoose                   | Flexible, JSON-like, facile avec les uploads Cloudinary                    |
| Stockage fichiers     | Cloudinary                           | Gratuit jusqu’à un certain volume, CDN intégré, urls permanentes           |
| Génération PDF        | pdfkit                               | Contrôle total sur le layout, signatures en image, logo en haut            |
| Signature             | Signature Pad (canvas)               | Simple, pas de dépendance lourde, fonctionne sur mobile                    |
| Auth encadrants       | express-session + bcryptjs           | Mot de passe unique haché, pas besoin de compte par personne               |
| Templates             | EJS                                  | Rapide, pas de build React/Vue inutile pour ce projet                      |
| Upload fichiers       | Multer (memory) + Cloudinary         | Pas de stockage disque serveur, tout dans le cloud                         |
| Variables d’environnement | dotenv                           | Obligatoire pour Railway / secrets                                         |
| Déploiement           | Railway (recommandé)                 | Gratuit pour ce volume, MongoDB intégré, déploiement Git en 1 clic         |

## Prérequis pour lancer en local

- Node.js 18 ou plus récent
- npm (ou yarn si tu préfères)
- Compte **Cloudinary** (gratuit suffit largement)
- Base **MongoDB** (Railway, Atlas, ou Mongo local via Docker)

## Installation locale (étape par étape)


# 1. Récupère le projet
git clone https://github.com/ton-compte/scouts-cluses-inscription.git
cd scouts-cluses-inscription

# 2. Installe tout
npm install

# 3. Crée le .env
cp .env.example .env

# 4. Remplis le .env (très important !)
Contenu minimal du .env :
env# ────────────────────────────────────────────────
#  MongoDB (Railway ou Atlas)
MONGODB_URI=mongodb+srv://user:password@cluster0.xxx.mongodb.net/scouts_cluses?retryWrites=true&w=majority

# ────────────────────────────────────────────────
#  Cloudinary (obligatoire pour les uploads & PDF)
CLOUDINARY_NAME=ton_cloud_name
CLOUDINARY_KEY=ton_api_key
CLOUDINARY_SECRET=ton_api_secret

# ────────────────────────────────────────────────
#  Port local (change si besoin)
PORT=3000

# ────────────────────────────────────────────────
#  Secret session (change-le vraiment !)
SESSION_SECRET=une_très_longue_chaine_aléatoire_et_secrète_ici

# ────────────────────────────────────────────────
#  Mot de passe unique encadrants (haché)
#  → voir section "Changer le mot de passe encadrants"
MOT_DE_PASSE_HACHE=$2a$10$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Lancer le projet en local
Bash# Option 1 : simple
node app.js

# Option 2 : avec rechargement auto (recommandé)
npm install -g nodemon
nodemon app.js

# Puis ouvre ton navigateur :
http://localhost:3000
