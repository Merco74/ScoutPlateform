// models/Scout.js
const mongoose = require('mongoose');

const guideSchema = new mongoose.Schema({
  nom: { type: String, required: true, trim: true },
  prenom: { type: String, required: true, trim: true },
  dateNaissance: { type: Date, required: true },
  sexe: { type: String, enum: ['Masculin', 'Féminin'], required: true },
  age: { type: Number, required: true, min: 11, max: 17 },
  adresse: { type: String, required: true },
  ville: { type: String, required: true },
  codePostal: { type: String, required: true, match: /^\d{5}$/ },
  email: { type: String, required: true, lowercase: true },
  telDomicile: String,
  telPortable: { type: String, required: true, match: /^0[6-7]\d{8}$/ },
  contactUrgence: {
    nom: { type: String, required: true },
    prenom: { type: String, required: true },
    telPortable: { type: String, required: true },
    sexe: { type: String, enum: ['Homme', 'Femme'], required: true },
    lien: { type: String, enum: ['Parents', 'Famille', 'Tuteur légal'], required: true }
  },
  contactUrgenceSecondaire: {
    nom: String, prenom: String, telPortable: String,
    sexe: { type: String, enum: ['Homme', 'Femme', null] },
    lien: { type: String, enum: ['Parents', 'Famille', 'Tuteur légal', null] }
  },
  autreClub: { type: Boolean, required: true },
  nomAutreClub: String,
  parentNomPrenom: { type: String, required: true },
  parentAdresse: { type: String, required: true },
  parentEmail: { type: String, required: true, lowercase: true },
  droitImage: { type: Boolean, required: true },
  droitDiffusion: { type: Boolean, required: true },
  autorisationTransport: { type: Boolean, required: true },
  luEtApprouveDroitImageText: { type: String, required: true, enum: ['Lu et approuvé'] },
  luEtApprouveInscriptionText: { type: String, required: true, enum: ['Lu et approuvé'] },
  signatureDroitImage: { type: String, required: true },
  signatureDroitImageDate: { type: Date, required: true },
  signatureInscription: { type: String, required: true },
  signatureInscriptionDate: { type: Date, required: true },
  lieuInscription: { type: String, required: true },
  dateInscription: { type: Date, default: Date.now },

  vaccinsObligatoires: { type: Boolean, required: true },
  vaccinsRecommandes: {
    diphtérie: String, coqueluche: String, tétanos: String,
    haemophilus: String, poliomyélite: String, rougeole: String,
    pneumocoque: String, bcg: String, autres: String
  },
  traitementMedical: { type: Boolean, required: true },
  allergiesAlimentaires: { type: Boolean, required: true },
  allergiesMedicament: { type: Boolean, required: true },
  allergiesAutres: { type: Boolean, required: true, default: false },
  allergiesDetails: String,
  problemeSante: { type: Boolean, required: true },
  problemeSanteDetails: String,
  recommandationsParents: String,
  responsable1Nom: { type: String, required: true },
  responsable1Prenom: { type: String, required: true },
  responsable1Adresse: { type: String, required: true },
  responsable1TelDomicile: String,
  responsable1TelTravail: String,
  responsable1TelPortable: { type: String, required: true, match: /^0[6-7]\d{8}$/ },
  responsable2Nom: String, responsable2Prenom: String,
  responsable2Adresse: String, responsable2TelDomicile: String,
  responsable2TelTravail: String, responsable2TelPortable: String,
  medecinTraitant: String,
  signatureSanitaire: { type: String, required: true },
  signatureSanitaireDate: { type: Date, required: true },

  vaccinScan: String,
  medicationScan: String,
  otherDocuments: [String],

  pdfPath: String,
  sanitaryPdfPath: String
}, { collection: 'guides' });

module.exports = mongoose.model('Guide', guideSchema);