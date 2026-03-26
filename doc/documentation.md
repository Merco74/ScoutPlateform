# ScoutPlateform — Documentation Technique

**Version 5.0 — Mars 2026**
**URL de production : https://scoutplateform.onrender.com**
**GitHub : https://github.com/Merco74/ScoutPlateform**

---

## 1. Présentation du projet

ScoutPlateform est une application web d'inscription en ligne pour les Scouts & Guides de Cluses. Elle permet aux parents d'inscrire leurs enfants pour l'année scoute ou pour les camps, de gérer les fiches sanitaires, et de signer numériquement les autorisations légales.

### Objectifs

- Permettre l'inscription en ligne des scouts, guides et louveteaux
- Remplacer les formulaires papier par des formulaires numériques avec signature électronique
- Générer automatiquement les PDFs d'autorisation et les fiches sanitaires
- Stocker tous les fichiers de manière permanente sur Cloudinary
- Permettre aux encadrants de consulter les listes d'inscrits par catégorie
- Donner à l'administrateur un tableau de bord complet de gestion

### Stack technique

| Composant | Technologie | Version |
|---|---|---|
| Backend | Node.js + Express | 22.x / 4.x |
| Base de données | MongoDB + Mongoose | Atlas M0 / 8.x |
| Vues | EJS (Embedded JS) | 3.x |
| CSS | Bootstrap 5.3 + styles custom | 5.3.3 |
| PDF | PDFKit | 0.15.x |
| Stockage fichiers | Cloudinary | 2.x |
| Upload fichiers | Multer + multer-storage-cloudinary | 1.4.x / 4.x |
| Sessions | express-session + connect-mongo | 1.18 / 5.x |
| Authentification | bcrypt | 5.x |
| Hébergement | Render (plan gratuit) | — |

---

## 2. Architecture du projet

### 2.1 Structure des fichiers

```
ScoutPlateform/
├── app.js                        ← Serveur principal, toutes les routes
├── package.json
├── .env                          ← Variables d'environnement (jamais sur GitHub)
├── .env.template                 ← Modèle pour créer .env
├── .gitignore
├── models/
│   ├── utilisateur.js            ← Compte unifié (parent, encadrant, admin)
│   ├── enfant.js                 ← Profil enfant + fiche sanitaire
│   ├── inscription.js            ← Inscription annuelle ou camp
│   └── config.js                 ← Configuration globale (fenêtres, cotisations)
├── views/
│   ├── partials/
│   │   ├── _header.ejs           ← Navbar commune (gère les rôles)
│   │   └── _footer.ejs           ← Footer commun
│   ├── index.ejs                 ← Accueil public
│   ├── inscription.ejs           ← Création de compte
│   ├── connexion.ejs             ← Connexion
│   ├── espace-parent.ejs         ← Tableau de bord parent
│   ├── profil-parent.ejs         ← Modification du profil
│   ├── enfant-form.ejs           ← Ajout / modification enfant
│   ├── inscription-annuelle.ejs  ← Formulaire d'inscription (année ou camp)
│   ├── inscription-confirmee.ejs ← Confirmation après inscription
│   ├── historique-inscription.ejs← Historique des versions
│   ├── espace-encadrant.ejs      ← Liste des inscrits (encadrant)
│   ├── admin.ejs                 ← Tableau de bord admin
│   ├── admin-encadrant.ejs       ← Détail d'un encadrant
│   ├── list.ejs                  ← Liste inscrits par catégorie (admin)
│   ├── mentions-legales.ejs
│   └── erreur.ejs
└── public/
    ├── css/styles.css            ← Thème vert scouts
    └── images/logo-scouts.png    ← Logo (à placer manuellement)
```

> ℹ️ Les dossiers `uploads/` et `public/pdfs/` n'existent plus. Tous les fichiers sont stockés sur Cloudinary.

### 2.2 Stockage des fichiers

Tous les fichiers sont stockés sur **Cloudinary** (plan gratuit : 25 Go). Plus aucun fichier n'est écrit sur le disque du serveur, ce qui résout le problème d'éphémérité de Render (fichiers perdus à chaque redémarrage).

#### Organisation sur Cloudinary

```
scoutplateform/
├── uploads/     ← fichiers uploadés par les utilisateurs
│   └── [uuid].pdf   (vaccins, BAFA, casier judiciaire, ordonnances...)
└── pdfs/        ← PDFs générés par l'application
    ├── [uuid]-auth.pdf      (autorisation droit image + transport)
    └── [uuid]-sanitary.pdf  (fiche sanitaire)
```

#### Conversion automatique en PDF

Tous les fichiers uploadés sont **automatiquement convertis en PDF** par Cloudinary, quelle que soit leur format d'origine :

| Format envoyé | Traitement | Stocké en |
|---|---|---|
| `.pdf` | Stocké directement (`resource_type: raw`) | PDF |
| `.jpg` / `.jpeg` | Converti en PDF par Cloudinary (`format: 'pdf'`) | PDF |
| `.png` | Converti en PDF par Cloudinary (`format: 'pdf'`) | PDF |

Avantages : homogénéité des fichiers, réduction de l'espace de stockage, ouverture universelle.

#### Ce qui est stocké en base MongoDB

Les URLs Cloudinary (`https://res.cloudinary.com/...`) sont stockées dans MongoDB. Elles sont permanentes et ne changent jamais, même après un redéploiement ou un redémarrage du serveur.

### 2.3 Modèles de données

#### Utilisateur (`models/utilisateur.js`)

Modèle unifié pour tous les types de comptes. Un utilisateur peut cumuler plusieurs rôles.

- **Authentification** : email (unique), motDePasse (hashé bcrypt coût 12)
- **Rôles** : `['parent', 'encadrant', 'admin']` — cumulables dans un tableau
- **Coordonnées** : nom, prénom, adresse, ville, codePostal, telPortable, telDomicile
- **Profil parent** : responsable2 (optionnel), medecinTraitant
- **Profil encadrant** (embarqué) : categories[], bafaScan (URL Cloudinary), casierJudiciaire (URL Cloudinary), autresDocuments[], statut (`en_attente` / `valide` / `refuse`)
- **Méthode** : `verifierMotDePasse(motDePasseClair)` → bcrypt.compare

#### Enfant (`models/enfant.js`)

Profil permanent de l'enfant. La fiche sanitaire est stockée ici.

- **Identité** : nom, prénom, dateNaissance, sexe, categorie (`louveteau` / `scout` / `guide`)
- **Lien** : parentId → référence Utilisateur
- **Adresse** : optionnelle, hérite du parent si vide
- **Contacts d'urgence** : principal (obligatoire) et secondaire (optionnel)
- **Fiche sanitaire** : vaccinsObligatoires, vaccinsRecommandes, traitementMedical, allergies, problemeSante, recommandationsParents
- **Fichiers** : vaccinScan, medicationScan, otherDocuments[] — tous des URLs Cloudinary permanentes

#### Inscription (`models/inscription.js`)

Une inscription par enfant par période. Contient uniquement ce qui doit être refait chaque année.

- **Liens** : utilisateurId, enfantId
- **Type** : `typeInscription` (`annee` ou `camp`), `anneeScoute`
- **Mineur/Majeur** : `estMajeur` et `ageAuRemplissage` calculés à la date de remplissage
- **Permis de conduire** : possede, categories[], numero — visible uniquement si majeur
- **Autorisations** : droitImage, droitDiffusion, autorisationTransport, autorisationHospitalisation (mineurs), autorisationActivitesAutonomes (mineurs)
- **Signatures** : signatureDroitImage, signatureSanitaire, signatureActivitesAutonomes (base64)
- **Consentements** : luEtApprouveDroitImageText, bonPourAccordActivitesAutonomesText
- **Cotisation** : montant, statut, modePaiement, reference
- **Statut** : `brouillon` → `soumise` → `validee` / `refusee` → `archivee`
- **Historique** : version (Number), versionPrecedente (référence à l'inscription archivée)
- **Validation admin** : commentaireAdmin, dateValidation, validePar
- **PDFs** : pdfPath, sanitaryPdfPath — URLs Cloudinary permanentes

#### Config (`models/config.js`)

Document unique en base (`cle: 'global'`). Géré par l'admin via le tableau de bord.

- **Année** : inscriptionOuverte, inscriptionAnneeActive, inscriptionDebutDate, inscriptionFinDate, cotisationAnnee
- **Camp** : campOuvert, campNom, campDebutDate, campFinDate, cotisationCamp

---

## 3. Routes de l'application

### Routes publiques

| Route | Méthode | Description |
|---|---|---|
| `/` | GET | Page d'accueil publique |
| `/mentions-legales` | GET | Mentions légales |
| `/inscription` | GET/POST | Création de compte |
| `/connexion` | GET/POST | Connexion utilisateur |
| `/deconnexion` | GET | Déconnexion |

### Routes parent (auth requise)

| Route | Méthode | Description |
|---|---|---|
| `/espace` | GET | Redirection selon le rôle |
| `/espace-parent` | GET | Tableau de bord parent |
| `/profil` | GET/POST | Modifier le profil |
| `/ajouter-enfant` | GET/POST | Créer un profil enfant |
| `/modifier-enfant/:id` | GET/POST | Modifier un profil enfant |
| `/inscrire-enfant/:id` | GET/POST | Formulaire d'inscription (`?type=annee` ou `?type=camp`) |
| `/historique-inscription/:id` | GET | Historique des versions |

### Routes admin

| Route | Méthode | Description |
|---|---|---|
| `/admin` | GET | Tableau de bord admin |
| `/admin/inscrits/:categorie` | GET | Liste des inscrits (scouts / guides / louveteaux) |
| `/admin/inscription/:id/valider` | POST | Valider ou refuser un formulaire |
| `/admin/config` | POST | Modifier la configuration |
| `/admin/encadrant/:id` | GET | Détail d'un encadrant |
| `/admin/encadrant/:id/statut` | POST | Valider ou révoquer un encadrant |

### Routes encadrant

| Route | Méthode | Description |
|---|---|---|
| `/espace-encadrant` | GET | Liste des inscrits de ses catégories |

---

## 4. Fonctionnalités détaillées

### 4.1 Gestion des comptes

- Création avec email + mot de passe (8 caractères minimum, hashé bcrypt coût 12)
- Validation en temps réel des champs côté client (email, téléphone, code postal, mot de passe)
- Option encadrant à la création : upload BAFA + casier judiciaire → convertis en PDF sur Cloudinary, validation admin requise
- Rôles cumulables : un même compte peut être parent ET encadrant
- Compte admin créé directement en base de données (pas de formulaire public)
- Sessions stockées en MongoDB via `connect-mongo`, expiration 8h

### 4.2 Inscription d'un enfant

- Deux types d'inscription indépendants : année scoute ou camp
- Distinction automatique mineur/majeur à la date de remplissage du formulaire
- Permis de conduire : visible uniquement pour les majeurs (18+)
- Autorisation hospitalisation : visible uniquement pour les mineurs
- Autorisation activités autonomes : section complète avec texte réglementaire, second pad de signature, mention "Bon pour accord"
- Brouillon : enregistrement sans signature, reprise depuis l'espace parent
- Workflow : soumission → validation admin → notification statut dans l'espace parent
- Si refusé : commentaire admin visible, correction et re-soumission possibles (nouvelle version archivée)

### 4.3 Signatures électroniques

- 3 signatures distinctes par inscription : droit image/transport, fiche sanitaire, activités autonomes
- Canvas redimensionné dynamiquement avec `devicePixelRatio` (corrige le décalage souris/trait)
- Conformité eIDAS : valeur légale de la signature électronique
- Stockage en base64 dans MongoDB, apposée dans les PDFs générés

### 4.4 Génération et stockage des PDFs

Les PDFs sont générés en mémoire via PDFKit puis uploadés sur Cloudinary sans jamais toucher le disque :

```
PDFKit → Buffer en mémoire → upload_stream Cloudinary → URL permanente → MongoDB
```

**PDF d'autorisation** : identité, représentant légal, autorisations signées, activités autonomes (si accordées), permis de conduire (si majeur).

**Fiche sanitaire** : données médicales complètes, contacts d'urgence, médecin traitant, signature sanitaire.

### 4.5 Réinscription annuelle

Les données parent et enfant sont pré-remplies automatiquement. Seules les signatures et la cotisation doivent être refaites. La catégorie peut changer d'une année sur l'autre selon l'âge.

### 4.6 Historique des versions

Quand un formulaire refusé est corrigé, l'ancienne version passe au statut `archivee` et une nouvelle version est créée avec `version + 1`. L'historique complet est accessible via `/historique-inscription/:id`.

---

## 5. Déploiement et infrastructure

### 5.1 Variables d'environnement

| Variable | Obligatoire | Description |
|---|---|---|
| `MONGODB_URI` | Oui | URI de connexion MongoDB Atlas |
| `SESSION_SECRET` | Oui | Clé secrète pour les sessions |
| `CLOUDINARY_CLOUD_NAME` | Oui | Nom du cloud Cloudinary |
| `CLOUDINARY_API_KEY` | Oui | Clé API Cloudinary |
| `CLOUDINARY_API_SECRET` | Oui | Secret API Cloudinary |
| `NODE_ENV` | Recommandé | `production` en production |
| `PORT` | Non | Défaut 3000, Render utilise 10000 automatiquement |

### 5.2 Configurer Cloudinary

1. Créer un compte sur **https://cloudinary.com** (plan gratuit : 25 Go)
2. Dans le Dashboard, récupérer `Cloud name`, `API Key`, `API Secret`
3. Ajouter les 3 variables dans Render (Settings → Environment Variables)

### 5.3 Créer le compte admin

```bash
node -e "
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
mongoose.connect('URI_ATLAS')
  .then(async () => {
    const hash = await bcrypt.hash('MOT_DE_PASSE', 12);
    await mongoose.connection.collection('utilisateurs').insertOne({
      email: 'admin@scouts-cluses.fr',
      motDePasse: hash,
      roles: ['admin', 'parent'],
      nom: 'Admin',
      prenom: 'Scout',
      telPortable: '0600000000',
      dateCreation: new Date()
    });
    console.log('Admin créé !');
    process.exit(0);
  });
"
```

### 5.4 Déploiements automatiques

```bash
git add .
git commit -m "description des changements"
git push
```

Render redéploie automatiquement en 2-3 minutes.

> ⚠️ Plan gratuit Render : le serveur s'endort après 15 min d'inactivité. Le premier accès prend ~30 secondes.

### 5.5 Sécurité

- Mots de passe hashés avec bcrypt (coût 12)
- Sessions stockées en MongoDB avec expiration 8h
- Sanitisation de toutes les entrées utilisateur
- Connexion MongoDB chiffrée TLS/SSL (Atlas)
- Toutes les clés API en variables d'environnement, jamais dans le code
- Fichiers uploadés : vérification MIME type + extension (PDF, JPG, PNG, max 10 Mo)
- `.env` exclu du dépôt Git via `.gitignore`

---

## 6. Maintenance et évolutions

### 6.1 Corriger les vulnérabilités npm

```bash
npm audit fix
```

### 6.2 Sauvegardes

**MongoDB Atlas** : sauvegardes automatiques incluses dans M0. Export manuel :

```bash
mongodump --uri="URI_ATLAS" --out=backup/
```

**Cloudinary** : fichiers permanents. Consultables dans le Dashboard → Media Library.

### 6.3 Surveiller l'espace Cloudinary

Plan gratuit : 25 Go de stockage, 25 crédits de transformation/mois. À surveiller dans le Dashboard Cloudinary.

### 6.4 Évolutions prévues

- Intégration HelloAsso API pour le paiement de la cotisation camp
- Notifications email lors de la validation/refus d'une inscription
- Nom de domaine personnalisé (ex: inscription.scouts-cluses.fr)
- Import de formulaires des années précédentes

### 6.5 Ajouter le logo dans les PDFs

Placer `logo-scouts.png` dans `public/images/`. Il sera automatiquement affiché dans les PDFs générés.