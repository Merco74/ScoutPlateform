// models/enfant.js
const mongoose = require('mongoose');

const enfantSchema = new mongoose.Schema({

  // === LIEN PARENT ===
  parentId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'Utilisateur',
    required: true,
    index:    true
  },

  // === IDENTITÉ ===
  nom:           { type: String, required: true, trim: true },
  prenom:        { type: String, required: true, trim: true },
  dateNaissance: { type: Date,   required: true },
  sexe:          { type: String, required: true, enum: ['Masculin', 'Féminin'] },
  // Téléphone de l'enfant (optionnel, si l'enfant possède un portable)
  telPortable:   { type: String, match: /^(06\d{8}|07\d{8}|\+33\d{9}|\+41\d{9})?$/ },

  // === CATÉGORIE SCOUT ===
  // Calculée selon l'âge ET le sexe :
  //   Louveteaux/Louvettes : 8-11 ans (tous sexes)
  //   Guides : 11-17 ans (Féminin)
  //   Scouts : 12-18 ans (Masculin)
  categorie: {
    type:     String,
    required: true,
    enum:     ['louveteau', 'scout', 'guide']
  },

  // === ADRESSE (héritée du parent si vide) ===
  adresse:    String,
  ville:      String,
  codePostal: { type: String, match: /^\d{5}$/ },

  // === CONTACTS D'URGENCE ===
  contactUrgence: {
    nom:         { type: String, required: true },
    prenom:      { type: String, required: true },
    // Téléphone FR (06/07) ou Suisse (+41 ou 07x)
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

  // === AUTRE CLUB SPORTIF (scouts de Cluses) ===
  autreClub:    { type: Boolean, default: false },
  // Valeurs : 'karate' | 'judo' | 'natation' | 'ski' | 'ski-randonnee'
  nomAutreClub: String,

  // === FICHE SANITAIRE ===
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

  traitementMedical:      { type: Boolean, default: false },
  traitementMedicalDetails: String,

  allergiesAlimentaires:  { type: Boolean, default: false },
  allergiesAlimentairesDetails: String,

  allergiesMedicament:    { type: Boolean, default: false },
  allergiesMedicamentDetails: String,

  allergiesAutres:        { type: Boolean, default: false },
  allergiesAutresDetails: String,

  problemeSante:          { type: Boolean, default: false },
  problemeSanteDetails:   String,

  // === COMPORTEMENT ET PARTICULARITÉS ===
  // Troubles, comportements, équipements spéciaux
  porteLunettes:    { type: Boolean, default: false },
  porteLentilles:   { type: Boolean, default: false },
  porteProthese:    { type: Boolean, default: false },
  porteProtheseDetails: String, // précision : auditive, dentaire...

  troublesComportement:        { type: Boolean, default: false },
  troublesComportementDetails: String,
  // ex: TDAH, apnée du sommeil, dyspraxie, vertiges, trouble du sommeil...

  recommandationsParents: String,

  // === MÉDECIN TRAITANT (obligatoire) ===
  medecinTraitant:         { type: String, required: true },
  medecinTraitantTel:      { type: String, required: true },
  medecinTraitantAdresse:  String,

  // === FICHIERS MÉDICAUX (URLs Cloudinary) ===
  vaccinScan:     { type: String, required: true }, // obligatoire
  medicationScan: String,
  otherDocuments: [String],

  // === MÉTADONNÉES ===
  dateCreation:      { type: Date, default: Date.now },
  dateDerniereModif: { type: Date, default: Date.now }

}, { collection: 'enfants' });

enfantSchema.pre('save', function (next) {
  this.dateDerniereModif = new Date();
  next();
});

module.exports = mongoose.model('Enfant', enfantSchema);
