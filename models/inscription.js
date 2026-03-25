// models/inscription.js
const mongoose = require('mongoose');

const inscriptionSchema = new mongoose.Schema({

  // === LIENS ===
  utilisateurId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Utilisateur',
    required: true,
    index: true
  },
  enfantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Enfant',
    required: true,
    index: true
  },

  // === TYPE D'INSCRIPTION ===
  typeInscription: {
    type: String,
    required: true,
    enum: ['annee', 'camp'],
    default: 'annee'
  },

  // === PÉRIODE ===
  // Pour type 'annee' : ex "2025-2026"
  // Pour type 'camp'  : ex "Camp été 2026"
  anneeScoute: {
    type: String,
    required: true
  },

  // === CATÉGORIE AU MOMENT DE L'INSCRIPTION ===
  categorie: {
    type: String,
    required: true,
    enum: ['louveteau', 'scout', 'guide']
  },

  // === MINEUR / MAJEUR (calculé à la date de remplissage) ===
  estMajeur: { type: Boolean, required: true, default: false },
  ageAuRemplissage: { type: Number, required: true },

  // === PERMIS DE CONDUIRE (majeurs uniquement) ===
  permisConduire: {
    possede:    { type: Boolean, default: false },
    categories: [String], // B, BE, D...
    numero:     String
  },

  // === AUTORISATIONS ===
  droitImage:               { type: Boolean, default: false },
  droitDiffusion:           { type: Boolean, default: false },
  autorisationTransport:    { type: Boolean, default: false },
  // Autorisation hospitalisation (mineurs uniquement)
  autorisationHospitalisation: { type: Boolean, default: false },
  // Autorisation activités autonomes (mineurs uniquement)
  autorisationActivitesAutonomes: { type: Boolean, default: false },

  // === CONSENTEMENTS ===
  luEtApprouveDroitImageText:          { type: String, enum: ['Lu et approuvé'] },
  luEtApprouveInscriptionText:         { type: String, enum: ['Lu et approuvé'] },
  bonPourAccordActivitesAutonomesText: { type: String, enum: ['Bon pour accord'] },

  // === SIGNATURES ===
  signatureDroitImage:             String,
  signatureDroitImageDate:         Date,
  signatureActivitesAutonomes:     String,
  signatureActivitesAutonomesDate: Date,
  signatureInscription:     String,
  signatureInscriptionDate: Date,
  signatureSanitaire:       String,
  signatureSanitaireDate:   Date,
  lieuInscription:          String,

  // === COTISATION ===
  cotisation: {
    montant:      { type: Number, min: 0 },
    statut:       { type: String, enum: ['en_attente', 'payee', 'echelonnee'], default: 'en_attente' },
    datePaiement: Date,
    modePaiement: { type: String, enum: ['cheque', 'especes', 'virement', 'helloasso', null] },
    reference:    String
  },

  // === PDFs GÉNÉRÉS ===
  pdfPath:         String,
  sanitaryPdfPath: String,

  // === STATUT DE VALIDATION ===
  statut: {
    type:    String,
    enum:    ['brouillon', 'soumise', 'validee', 'refusee'],
    default: 'brouillon'
  },
  // Commentaire admin en cas de refus
  commentaireAdmin: String,
  dateValidation:   Date,
  validePar:        { type: mongoose.Schema.Types.ObjectId, ref: 'Utilisateur' },

  // === HISTORIQUE DES VERSIONS ===
  // Quand un formulaire validé est édité → nouveau formulaire créé, l'ancien est archivé ici
  version:    { type: Number, default: 1 },
  versionPrecedente: { type: mongoose.Schema.Types.ObjectId, ref: 'Inscription' },

  // === MÉTADONNÉES ===
  dateInscription:   { type: Date, default: Date.now },
  dateDerniereModif: { type: Date, default: Date.now }

}, { collection: 'inscriptions' });

// Pas d'index unique strict : on peut avoir plusieurs versions pour le même enfant/année
// On contrôle le doublon en applicatif (en ignorant les versions archivées)
inscriptionSchema.index({ enfantId: 1, anneeScoute: 1, typeInscription: 1 });

inscriptionSchema.pre('save', function (next) {
  this.dateDerniereModif = new Date();
  next();
});

module.exports = mongoose.model('Inscription', inscriptionSchema);
