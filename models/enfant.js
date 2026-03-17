// models/Enfant.js
// Profil permanent de l'enfant. Mis à jour chaque année si besoin.
// La fiche sanitaire est stockée ici car elle appartient à l'enfant, pas à l'inscription.
const mongoose = require('mongoose');

const enfantSchema = new mongoose.Schema({

  // === LIEN PARENT ===
  parentId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'Parent',
    required: true,
    index:    true
  },

  // === IDENTITÉ (ne change pas) ===
  nom:           { type: String, required: true, trim: true },
  prenom:        { type: String, required: true, trim: true },
  dateNaissance: { type: Date,   required: true },
  sexe:          { type: String, required: true, enum: ['Masculin', 'Féminin'] },

  // === CATÉGORIE SCOUT ===
  // Déduite de l'âge mais stockée pour pouvoir corriger manuellement si besoin
  categorie: {
    type:     String,
    required: true,
    enum:     ['louveteau', 'scout', 'guide']
  },

  // === ADRESSE (héritée du parent par défaut, surchargeable si différente) ===
  adresse:    String,
  ville:      String,
  codePostal: { type: String, match: /^\d{5}$/ },

  // === CONTACTS D'URGENCE (propres à l'enfant) ===
  contactUrgence: {
    nom:         { type: String, required: true },
    prenom:      { type: String, required: true },
    telPortable: { type: String, required: true },
    sexe:        { type: String, enum: ['Homme', 'Femme'], required: true },
    lien:        { type: String, enum: ['Parents', 'Famille', 'Tuteur légal'], required: true }
  },

  contactUrgenceSecondaire: {
    nom:         String,
    prenom:      String,
    telPortable: String,
    sexe:        { type: String, enum: ['Homme', 'Femme', null] },
    lien:        { type: String, enum: ['Parents', 'Famille', 'Tuteur légal', null] }
  },

  // === AUTRE CLUB ===
  autreClub:    { type: Boolean, default: false },
  nomAutreClub: String,

  // === FICHE SANITAIRE (mise à jour chaque année si besoin) ===
  vaccinsObligatoires: { type: Boolean, default: true },
  vaccinsRecommandes: {
    diphtérie:    String,
    coqueluche:   String,
    tétanos:      String,
    haemophilus:  String,
    poliomyélite: String,
    rougeole:     String,
    pneumocoque:  String,
    bcg:          String,
    autres:       String
  },

  traitementMedical:     { type: Boolean, default: false },
  allergiesAlimentaires: { type: Boolean, default: false },
  allergiesMedicament:   { type: Boolean, default: false },
  allergiesAutres:       { type: Boolean, default: false },
  allergiesDetails:      String,

  problemeSante:        { type: Boolean, default: false },
  problemeSanteDetails: String,
  recommandationsParents: String,

  // Médecin traitant (hérite du parent, surchargeable par enfant)
  medecinTraitant: String,

  // === FICHIERS MÉDICAUX ===
  vaccinScan:     String, // nom du fichier uploadé
  medicationScan: String,
  otherDocuments: [String],

  // === MÉTADONNÉES ===
  dateCreation:       { type: Date, default: Date.now },
  dateDerniereModif:  { type: Date, default: Date.now }

}, { collection: 'enfants' });

// Met à jour dateDerniereModif automatiquement
enfantSchema.pre('save', function (next) {
  this.dateDerniereModif = new Date();
  next();
});

module.exports = mongoose.model('Enfant', enfantSchema);
