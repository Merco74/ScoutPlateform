// models/utilisateur.js
// Modèle unifié : un compte peut être parent, encadrant ou les deux.
const mongoose = require('mongoose');
const bcrypt   = require('bcrypt');

const utilisateurSchema = new mongoose.Schema({

  // === AUTHENTIFICATION ===
  email:      { type: String, required: true, unique: true, lowercase: true, trim: true },
  motDePasse: { type: String, required: true },

  // === RÔLES ===
  // Un utilisateur peut cumuler plusieurs rôles
  roles: {
    type: [String],
    enum: ['parent', 'encadrant', 'admin'],
    default: ['parent'],
    required: true
  },

  // === IDENTITÉ ===
  nom:    { type: String, required: true, trim: true },
  prenom: { type: String, required: true, trim: true },

  // === COORDONNÉES ===
  adresse:     { type: String, trim: true },
  ville:       { type: String, trim: true },
  codePostal:  { type: String, match: /^\d{5}$/ },
  telDomicile: String,
  telPortable: { type: String, required: true, match: /^0[6-7]\d{8}$/ },

  // === SECOND RESPONSABLE (rôle parent uniquement) ===
  responsable2: {
    nom:         String,
    prenom:      String,
    adresse:     String,
    telDomicile: String,
    telTravail:  String,
    telPortable: String
  },

  // === MÉDECIN TRAITANT (rôle parent, partagé entre les enfants) ===
  medecinTraitant: String,

  // === PROFIL ENCADRANT (rôle encadrant uniquement) ===
  encadrant: {
    // Catégories qu'il encadre (peut en gérer plusieurs)
    categories: {
      type: [String],
      enum: ['louveteau', 'scout', 'guide']
    },
    // Documents justificatifs
    bafaScan:        String, // nom du fichier uploadé
    casierJudiciaire: String,
    autresDocuments: [String],
    // Statut de validation par l'admin
    statut: {
      type: String,
      enum: ['en_attente', 'valide', 'refuse'],
      default: 'en_attente'
    },
    dateValidation: Date,
    noteAdmin:      String
  },

  // === MÉTADONNÉES ===
  dateCreation:      { type: Date, default: Date.now },
  derniereConnexion: Date

}, { collection: 'utilisateurs' });

// Hash automatique du mot de passe avant toute sauvegarde
utilisateurSchema.pre('save', async function (next) {
  if (!this.isModified('motDePasse')) return next();
  this.motDePasse = await bcrypt.hash(this.motDePasse, 12);
  next();
});

// Vérification du mot de passe
utilisateurSchema.methods.verifierMotDePasse = function (motDePasseClair) {
  return bcrypt.compare(motDePasseClair, this.motDePasse);
};

// Helpers de rôle
utilisateurSchema.methods.estParent     = function () { return this.roles.includes('parent'); };
utilisateurSchema.methods.estEncadrant  = function () { return this.roles.includes('encadrant'); };
utilisateurSchema.methods.estAdmin      = function () { return this.roles.includes('admin'); };

module.exports = mongoose.model('Utilisateur', utilisateurSchema);
