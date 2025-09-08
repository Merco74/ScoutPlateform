const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const Scout = require('./models/Scout');
const Guide = require('./models/Guide');
const Louveteau = require('./models/Louveteau');
require('dotenv').config();

const app = express();
const port = 3000;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');

// Configuration de multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname)); // Nom unique
    }
});
const upload = multer({ storage: storage });

// Configuration des sessions
app.use(session({
    secret: 'ton-secret-super-securise', // Change par une chaîne aléatoire forte
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Mettre à true si HTTPS
}));

// Connexion MongoDB
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('Connecté à MongoDB local'))
    .catch(err => console.error('Erreur MongoDB:', err));

// Middleware pour vérifier si l'utilisateur est connecté
const requireAuth = (req, res, next) => {
    if (req.session.isAuthenticated) {
        return next();
    }
    res.redirect('/login');
};

// Routes publiques
app.get('/', (req, res) => {
    res.render('index', { isAuthenticated: req.session.isAuthenticated || false });
});

app.get('/inscription', (req, res) => {
    res.render('create', {});
});

app.post('/inscription', upload.fields([
    { name: 'vaccinScan', maxCount: 1 },
    { name: 'medicationScan', maxCount: 1 },
    { name: 'recommendationMedicalScan', maxCount: 1 },
    { name: 'otherDocuments', maxCount: 10 }
]), async (req, res) => {
    try {
        const {
            nom, prenom, dateNaissance, sexe, age, adresse, ville, codePostal, email, telDomicile, telPortable,
            contactUrgenceNom, contactUrgencePrenom, contactUrgenceTel, contactUrgenceSexe, contactUrgenceLien,
            contactUrgenceSecondaireNom, contactUrgenceSecondairePrenom, contactUrgenceSecondaireTel, contactUrgenceSecondaireSexe, contactUrgenceSecondaireLien,
            autreClub, nomAutreClub,
            parentNomPrenom, parentAdresse, parentEmail, droitImage, droitDiffusion, autorisationTransport,
            luEtApprouveDroitImageText, luEtApprouveInscriptionText,
            signatureDroitImage, signatureInscription,
            vaccinsObligatoires, vaccinsDiphtérie, vaccinsCoqueluche, vaccinsTétanos, vaccinsHaemophilus,
            vaccinsPoliomyélite, vaccinsRougeole, vaccinsPneumocoque, vaccinsBCG, vaccinsAutres,
            traitementMedical, allergiesAlimentaires, allergiesMedicament, allergiesAutres, allergiesDetails,
            problemeSante, problemeSanteDetails, recommandationsParents,
            responsable1Nom, responsable1Prenom, responsable1Adresse, responsable1TelDomicile, responsable1TelTravail, responsable1TelPortable,
            responsable2Nom, responsable2Prenom, responsable2Adresse, responsable2TelDomicile, responsable2TelTravail, responsable2TelPortable,
            medecinTraitant, signatureSanitaire, lieuInscription,
            remarqueSection1, remarqueSection2, remarqueSection3, remarqueSection4, remarqueSection5
        } = req.body;

        let Model;
        switch (req.body.categorie) {
            case 'scout':
                Model = Scout;
                break;
            case 'guide':
                Model = Guide;
                break;
            case 'louveteau':
                Model = Louveteau;
                break;
            default:
                return res.status(400).send('Catégorie invalide');
        }

        const inscription = new Model({
            nom,
            prenom,
            dateNaissance: new Date(dateNaissance),
            sexe,
            age: Number(age),
            adresse,
            ville,
            codePostal,
            email,
            telDomicile,
            telPortable,
            contactUrgence: {
                nom: contactUrgenceNom,
                prenom: contactUrgencePrenom,
                telPortable: contactUrgenceTel,
                sexe: contactUrgenceSexe,
                lien: contactUrgenceLien
            },
            contactUrgenceSecondaire: {
                nom: contactUrgenceSecondaireNom || null,
                prenom: contactUrgenceSecondairePrenom || null,
                telPortable: contactUrgenceSecondaireTel || null,
                sexe: contactUrgenceSecondaireSexe || null,
                lien: contactUrgenceSecondaireLien || null
            },
            autreClub: autreClub === 'true',
            nomAutreClub: autreClub === 'true' ? nomAutreClub : null,
            parentNomPrenom,
            parentAdresse,
            parentEmail,
            droitImage: droitImage === 'on',
            droitDiffusion: droitDiffusion === 'on',
            autorisationTransport: autorisationTransport === 'on',
            luEtApprouveDroitImageText,
            luEtApprouveInscriptionText,
            signatureDroitImage,
            signatureDroitImageDate: new Date(),
            signatureInscription,
            signatureInscriptionDate: new Date(),
            lieuInscription,
            // Champs de la fiche sanitaire
            vaccinsObligatoires: vaccinsObligatoires === 'on',
            vaccinsRecommandes: {
                diphtérie: vaccinsDiphtérie || '',
                coqueluche: vaccinsCoqueluche || '',
                tétanos: vaccinsTétanos || '',
                haemophilus: vaccinsHaemophilus || '',
                poliomyélite: vaccinsPoliomyélite || '',
                rougeole: vaccinsRougeole || '',
                pneumocoque: vaccinsPneumocoque || '',
                bcg: vaccinsBCG || '',
                autres: vaccinsAutres || ''
            },
            traitementMedical: traitementMedical === 'on',
            allergiesAlimentaires: allergiesAlimentaires === 'on',
            allergiesMedicament: allergiesMedicament === 'on',
            allergiesAutres: allergiesAutres === 'on',
            allergiesDetails: allergiesDetails || '',
            problemeSante: problemeSante === 'on',
            problemeSanteDetails: problemeSanteDetails || '',
            recommandationsParents: recommandationsParents || '',
            responsable1Nom,
            responsable1Prenom,
            responsable1Adresse,
            responsable1TelDomicile,
            responsable1TelTravail,
            responsable1TelPortable,
            responsable2Nom,
            responsable2Prenom,
            responsable2Adresse,
            responsable2TelDomicile,
            responsable2TelTravail,
            responsable2TelPortable,
            medecinTraitant: medecinTraitant || '',
            signatureSanitaire,
            signatureSanitaireDate: new Date(),
            // Remarques des parents
            remarqueSection1: remarqueSection1 || '',
            remarqueSection2: remarqueSection2 || '',
            remarqueSection3: remarqueSection3 || '',
            remarqueSection4: remarqueSection4 || '',
            remarqueSection5: remarqueSection5 || ''
        });

        await inscription.save();
        res.redirect('/');
    } catch (err) {
        res.status(400).send('Erreur lors de l’inscription : ' + err.message);
    }
});

// Route de login
app.get('/login', (req, res) => {
    res.render('login', { error: null });
});

app.post('/login', (req, res) => {
    const password = req.body.password;
    const ADMIN_PASSWORD = 'scout123'; // Change ce mot de passe !
    if (password === ADMIN_PASSWORD) {
        req.session.isAuthenticated = true;
        res.redirect('/');
    } else {
        res.render('login', { error: 'Mot de passe incorrect' });
    }
});

// Route de logout
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

// Routes protégées
app.get('/scouts', requireAuth, async (req, res) => {
    try {
        const scouts = await Scout.find();
        res.render('list', { inscriptions: scouts, titre: 'Scouts' });
    } catch (err) {
        res.status(500).send('Erreur lors de la récupération');
    }
});

app.get('/guides', requireAuth, async (req, res) => {
    try {
        const guides = await Guide.find();
        res.render('list', { inscriptions: guides, titre: 'Guides' });
    } catch (err) {
        res.status(500).send('Erreur lors de la récupération');
    }
});

app.get('/louveteaux', requireAuth, async (req, res) => {
    try {
        const louveteaux = await Louveteau.find();
        res.render('list', { inscriptions: louveteaux, titre: 'Louveteaux' });
    } catch (err) {
        res.status(500).send('Erreur lors de la récupération');
    }
});

app.listen(port, () => {
    console.log(`Serveur lancé sur http://localhost:${port}`);
});