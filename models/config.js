// models/config.js
// Configuration globale de l'application (fenêtre d'inscription, etc.)
// Un seul document en base, mis à jour par l'admin.
const mongoose = require('mongoose');

const configSchema = new mongoose.Schema({
  cle: { type: String, required: true, unique: true },

  // Fenêtre d'ouverture des inscriptions
  inscriptionOuverte:     { type: Boolean, default: false },
  inscriptionDebutDate:   Date,   // ex: mi-avril
  inscriptionFinDate:     Date,   // ex: fin mai
  inscriptionAnneeActive: String, // ex: "2025-2026"

  // Fenêtre d'ouverture des inscriptions camp
  campOuvert:      { type: Boolean, default: false },
  campNom:         String, // ex: "Camp été 2026"
  campDebutDate:   Date,
  campFinDate:     Date,

  // Montants cotisations
  cotisationAnnee: { type: Number, default: 20 },
  cotisationCamp:  { type: Number, default: 50 }

}, { collection: 'config' });

module.exports = mongoose.model('Config', configSchema);
