# Scouts & Guides de Cluses — Application d'inscription

## Installation

```bash
npm install
cp .env.template .env
# Éditez .env et remplissez MONGODB_URI et SESSION_SECRET
node app.js
```

L'application tourne sur **http://localhost:3000**

---

## Créer un compte admin

```bash
# Générer un hash bcrypt pour votre mot de passe
node -e "require('bcrypt').hash('votreMotDePasse', 12).then(console.log)"
```

Puis dans MongoDB Compass ou Shell, insérez dans la collection `utilisateurs` :
```json
{
  "email": "admin@scouts-cluses.fr",
  "motDePasse": "<HASH_BCRYPT>",
  "roles": ["admin", "parent"],
  "nom": "Admin",
  "prenom": "Scout",
  "telPortable": "0600000000",
  "dateCreation": { "$date": "2025-01-01T00:00:00Z" }
}
```

---

## Structure

```
├── app.js
├── models/
│   ├── utilisateur.js   ← parent + encadrant + admin (rôles cumulables)
│   ├── enfant.js        ← profil enfant + fiche sanitaire
│   └── inscription.js   ← inscription annuelle (signatures + cotisation)
├── views/
│   ├── partials/        ← _header.ejs, _footer.ejs
│   ├── inscription.ejs          ← création de compte
│   ├── connexion.ejs
│   ├── espace-parent.ejs
│   ├── profil-parent.ejs
│   ├── enfant-form.ejs
│   ├── inscription-annuelle.ejs
│   ├── inscription-confirmee.ejs
│   ├── espace-encadrant.ejs     ← voit sa/ses catégorie(s)
│   ├── admin.ejs                ← voit tout + valide encadrants
│   ├── admin-encadrant.ejs
│   ├── list.ejs
│   ├── mentions-legales.ejs
│   └── erreur.ejs
└── public/css/styles.css
```

---

## Parcours

| Rôle | Accès |
|------|-------|
| **Parent** | Créer compte → Ajouter enfants → Inscrire chaque année |
| **Encadrant** | Même compte, cocher "encadrant" → Attendre validation admin → Voir ses catégories |
| **Admin** | Compte en base → Voir tous les inscrits + valider/révoquer encadrants |

Un compte peut cumuler les rôles **parent + encadrant** ou **parent + admin**.
