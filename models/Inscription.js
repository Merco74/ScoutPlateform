const mongoose = require('mongoose');

const inscriptionSchema = new mongoose.Schema({
    nom: { type: String, required: true },
    prenom: { type: String, required: true },
    age: { type: Number, required: true, min: 6, max: 18 },
    emailParent: { type: String, required: true },
    dateInscription: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Inscription', inscriptionSchema);