const mongoose = require('mongoose');

const scoutSchema = new mongoose.Schema({
    nom: { type: String, required: true },
    prenom: { type: String, required: true },
    dateNaissance: { type: Date, required: true },
    sexe: { type: String, enum: ['Masculin', 'Féminin'], required: true },
    age: { type: Number, required: true, min: 11, max: 17 },
    adresse: { type: String, required: true },
    ville: { type: String, required: true },
    codePostal: { type: String, required: true },
    email: { type: String, required: true },
    telDomicile: { type: String },
    telPortable: { type: String, required: true },
    contactUrgence: {
        nom: { type: String, required: true },
        prenom: { type: String, required: true },
        telPortable: { type: String, required: true },
        sexe: { type: String, enum: ['Homme', 'Femme'], required: true },
        lien: { type: String, enum: ['Parents', 'Famille', 'Tuteur légal'], required: true }
    },
    contactUrgenceSecondaire: {
        nom: { type: String },
        prenom: { type: String },
        telPortable: { type: String },
        sexe: { type: String, enum: ['Homme', 'Femme', null] },
        lien: { type: String, enum: ['Parents', 'Famille', 'Tuteur légal', null] }
    },
    autreClub: { type: Boolean, required: true },
    nomAutreClub: { type: String },
    parentNomPrenom: { type: String, required: true },
    parentAdresse: { type: String, required: true },
    parentEmail: { type: String, required: true },
    droitImage: { type: Boolean, required: true },
    droitDiffusion: { type: Boolean, required: true },
    autorisationTransport: { type: Boolean, required: true },
    luEtApprouveDroitImageText: { 
        type: String, 
        required: true,
        validate: {
            validator: function(v) {
                return v === 'Lu et approuvé';
            },
            message: 'Le champ doit contenir exactement "Lu et approuvé"'
        }
    },
    luEtApprouveInscriptionText: { 
        type: String, 
        required: true,
        validate: {
            validator: function(v) {
                return v === 'Lu et approuvé';
            },
            message: 'Le champ doit contenir exactement "Lu et approuvé"'
        }
    },
    signatureDroitImage: { type: String, required: true },
    signatureDroitImageDate: { type: Date, required: true },
    signatureInscription: { type: String, required: true },
    signatureInscriptionDate: { type: Date, required: true },
    lieuInscription: { type: String, required: true },
    dateInscription: { type: Date, default: Date.now },
    // Champs de la fiche sanitaire
    vaccinsObligatoires: { type: Boolean, required: true },
    vaccinsRecommandes: {
        diphtérie: { type: String },
        coqueluche: { type: String },
        tétanos: { type: String },
        haemophilus: { type: String },
        poliomyélite: { type: String },
        rougeole: { type: String },
        pneumocoque: { type: String },
        bcg: { type: String },
        autres: { type: String }
    },
    traitementMedical: { type: Boolean, required: true },
    allergiesAlimentaires: { type: Boolean, required: true },
    allergiesMedicament: { type: Boolean, required: true },
    allergiesAutres: { type: Boolean, required: true, default: false },
    allergiesDetails: { type: String },
    problemeSante: { type: Boolean, required: true },
    problemeSanteDetails: { type: String },
    recommandationsParents: { type: String },
    responsable1Nom: { type: String, required: true },
    responsable1Prenom: { type: String, required: true },
    responsable1Adresse: { type: String, required: true },
    responsable1TelDomicile: { type: String },
    responsable1TelTravail: { type: String },
    responsable1TelPortable: { type: String, required: true },
    responsable2Nom: { type: String },
    responsable2Prenom: { type: String },
    responsable2Adresse: { type: String },
    responsable2TelDomicile: { type: String },
    responsable2TelTravail: { type: String },
    responsable2TelPortable: { type: String },
    medecinTraitant: { type: String },
    signatureSanitaire: { type: String, required: true },
    signatureSanitaireDate: { type: Date, required: true },
    // Remarques des parents par section
    remarqueSection1: { type: String },
    remarqueSection2: { type: String },
    remarqueSection3: { type: String },
    remarqueSection4: { type: String },
    remarqueSection5: { type: String },
    // Fichiers uploadés
    vaccinScan: { type: String },
    medicationScan: { type: String },
    recommendationMedicalScan: { type: String },
    otherDocuments: { type: [String] }, // Array pour plusieurs fichiers
    pdfPath: { type: String }, // PDF droit image
    sanitaryPdfPath: { type: String } // PDF fiche sanitaire
});

module.exports = mongoose.model('Scout', scoutSchema, 'scouts');