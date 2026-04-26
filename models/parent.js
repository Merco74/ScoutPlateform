// models/Parent.js
const mongoose = require('mongoose');
const bcrypt   = require('bcrypt');

const parentSchema = new mongoose.Schema({

  // === AUTHENTIFICATION ===
  email:      { type: String, required: true, unique: true, lowercase: true, trim: true },
  motDePasse: { type: String, required: true }, // stocké hashé via bcrypt

  // === IDENTITÉ ===
  nom:    { type: String, required: true, trim: true },
  prenom: { type: String, required: true, trim: true },

  // === COORDONNÉES (pré-remplies dans les formulaires enfant) ===
  adresse:     { type: String, required: true, trim: true },
  ville:       { type: String, required: true, trim: true },
  codePostal:  { type: String, required: true, match: /^\d{5}$/ },
  telDomicile: String,
  telPortable: { type: String, required: true, match: /^(06\d{8}|07\d{8}|\+33\d{9}|\+41\d{9})$/ },

  // === SECOND RESPONSABLE (optionnel) ===
  responsable2: {
    nom:         String,
    prenom:      String,
    adresse:     String,
    telDomicile: String,
    telTravail:  String,
    telPortable: String
  },

  // === MÉDECIN TRAITANT (partagé entre tous les enfants, surchargeable par enfant) ===
  medecinTraitant: String,

  // === MÉTADONNÉES ===
  dateCreation:      { type: Date, default: Date.now },
  derniereConnexion: Date

}, { collection: 'parents' });

// Hash automatique du mot de passe avant toute sauvegarde
parentSchema.pre('save', async function (next) {
  if (!this.isModified('motDePasse')) return next();
  this.motDePasse = await bcrypt.hash(this.motDePasse, 12);
  next();
});

// Vérification du mot de passe (utilisé dans la route de login)
parentSchema.methods.verifierMotDePasse = function (motDePasseClair) {
  return bcrypt.compare(motDePasseClair, this.motDePasse);
};

module.exports = mongoose.model('Parent', parentSchema);
