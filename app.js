const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const { Buffer } = require('buffer');
const Scout = require('./models/Scout');
const Guide = require('./models/Guide');
const Louveteau = require('./models/Louveteau');

const app = express();
const port = process.env.PORT || 3000;

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
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Configuration des sessions
app.use(session({
    secret: 'ton-secret-super-securise',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
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

app.get('/mentions-legales', (req, res) => {
    res.render('mentions-legales', { isAuthenticated: req.session.isAuthenticated || false });
});

app.post('/inscription', upload.fields([
    { name: 'vaccinScan', maxCount: 1 },
    { name: 'medicationScan', maxCount: 1 },
    { name: 'recommendationMedicalScan', maxCount: 1 },
    { name: 'otherDocuments', maxCount: 10 }
]), async (req, res) => {
    try {
        const formData = req.body;
        const files = req.files;

        // Process file paths
        formData.vaccinScan = files.vaccinScan ? files.vaccinScan[0].path : '';
        formData.medicationScan = files.medicationScan ? files.medicationScan[0].path : '';
        formData.recommendationMedicalScan = files.recommendationMedicalScan ? files.recommendationMedicalScan[0].path : '';
        formData.otherDocuments = files.otherDocuments ? files.otherDocuments.map(file => file.path) : [];

        // Generate Authorization PDF
        const authPdfPath = path.join(__dirname, 'public/uploads', `autorisation_${formData.nom}_${Date.now()}.pdf`);
        const docAuth = new PDFDocument({ margin: 50, size: 'A4' });
        docAuth.pipe(fs.createWriteStream(authPdfPath));

        docAuth.image('images/scouts-cluses-banner.jpg', 50, 45, { width: 50 })
            .fontSize(20)
            .text('Autorisation de Droit à l\'Image et de Transport', { align: 'center' })
            .image('images/scouts-cluses-banner.jpg', 500, 45, { width: 50 })
            .moveDown(2);

        docAuth.fontSize(14).text('IDENTITÉ', { underline: true });
        docAuth.fontSize(12)
            .text('Je soussigné(e) :')
            .text(`Nom : ${formData.nom}`)
            .text(`Prénom : ${formData.prenom}`)
            .text('Demeurant :')
            .text(`${formData.parentAdresse}`)
            .text('Adresse email :')
            .text(`${formData.parentEmail}`);
        docAuth.moveDown(2);

        docAuth.fontSize(14).text('DROIT À L\'IMAGE', { underline: true });
        docAuth.fontSize(12)
            .text('J\'accorde aux Scouts et Guides de Cluses l\'autorisation d\'effectuer des prises de vue photographiques ou des enregistrements audiovisuels sur lesquels mon enfant pourrait apparaître.')
            .moveDown();
        let yPos = docAuth.y;
        docAuth.rect(50, yPos, 10, 10).stroke();
        if (formData.droitImage === 'on') docAuth.rect(51, yPos + 1, 8, 8).fill();
        docAuth.text('1. Autorisation des prises de vue photographiques ou enregistrements audiovisuels.', 70, yPos);
        yPos += 20;
        docAuth.rect(50, yPos, 10, 10).stroke();
        if (formData.droitDiffusion === 'on') docAuth.rect(51, yPos + 1, 8, 8).fill();
        docAuth.text('2. Autorisation de diffusion sur réseaux (interne, Internet, presse locale).', 70, yPos);
        docAuth.moveDown();
        docAuth.text('Ces autorisations sont consenties à titre gracieux, pour un territoire illimité et sans limitation de durée, dans le respect de la législation sur le droit à l\'image et la vie privée.');
        docAuth.moveDown(2);

        docAuth.fontSize(14).text('AUTORISATION DE TRANSPORT', { underline: true });
        docAuth.fontSize(12)
            .text('Je consens à ce que mon enfant effectue des trajets dans le cadre du camp des Scouts et Guides de Cluses, d\'ordre médical ou organisationnel, dans des véhicules personnels ou de l\'association conduits par un encadrant.')
            .moveDown();
        yPos = docAuth.y;
        docAuth.rect(50, yPos, 10, 10).stroke();
        if (formData.autorisationTransport === 'on') docAuth.rect(51, yPos + 1, 8, 8).fill();
        docAuth.text('1. Autorisation des trajets dans les conditions décrites ci-dessus.', 70, yPos);
        docAuth.moveDown();
        docAuth.text('Sans cette autorisation, mon enfant ne pourra être transporté que par des véhicules de secours.');
        docAuth.moveDown(2);

        docAuth.fontSize(14).text('SIGNATURE', { underline: true });
        docAuth.fontSize(12).text('Veuillez apposer votre signature ci-dessous :', 50, docAuth.y);
        docAuth.rect(50, docAuth.y + 20, 500, 100).stroke();
        if (formData.signatureDroitImage || formData.signatureSanitaire) {
            const signatureData = (formData.signatureDroitImage || formData.signatureSanitaire).replace(/^data:image\/png;base64,/, '');
            docAuth.image(Buffer.from(signatureData, 'base64'), 60, docAuth.y + 30, { width: 150 });
        }
        docAuth.moveDown(4);

        docAuth.fontSize(10)
            .text(`Fait à : ${formData.lieuInscription}`, 50, 700)
            .text('Date : 17/09/2025 à 12:15', 50, 720);
        docAuth.end();

        // Generate Sanitary PDF
        const sanitaryPdfPath = path.join(__dirname, 'public/uploads', `fiche_sanitaire_${formData.nom}_${Date.now()}.pdf`);
        const docSanitary = new PDFDocument({ margin: 50, size: 'A4' });
        docSanitary.pipe(fs.createWriteStream(sanitaryPdfPath));

        docSanitary.image('images/scouts-cluses-banner.jpg', 50, 45, { width: 50 })
            .fontSize(20)
            .text('Fiche Sanitaire', { align: 'center' })
            .image('images/scouts-cluses-banner.jpg', 500, 45, { width: 50 })
            .moveDown(2);

        docSanitary.fontSize(14).text('IDENTITÉ', { underline: true });
        docSanitary.fontSize(12)
            .text('Nom : ' + (formData.nom || '-'))
            .text('Prénom : ' + (formData.prenom || '-'))
            .text('Âge : ' + (formData.age || '-'))
            .text('Contact : ' + (formData.telPortable || '-'));
        docSanitary.moveDown(2);

        docSanitary.fontSize(14).text('INFORMATIONS MÉDICALES', { underline: true });
        docSanitary.fontSize(12)
            .text('Vaccins obligatoires : ' + (formData.vaccinsObligatoires === 'on' ? 'Oui' : 'Non'))
            .text('Vaccins recommandés : ' + (Object.entries(formData.vaccinsRecommandes || {}).map(([key, value]) => value ? `${key}: ${value}` : '').filter(v => v).join(', ') || '-'))
            .text('Traitement médical : ' + (formData.traitementMedical === 'on' ? 'Oui' : 'Non'))
            .text('Médecin traitant : ' + (formData.medecinTraitant || '-'));
        docSanitary.moveDown(2);

        docSanitary.fontSize(14).text('ALLERGIES', { underline: true });
        docSanitary.fontSize(12)
            .text('Alimentaires : ' + (formData.allergiesAlimentaires === 'on' ? 'Oui' : 'Non'))
            .text('Médicamenteuses : ' + (formData.allergiesMedicament === 'on' ? 'Oui' : 'Non'))
            .text('Autres : ' + (formData.allergiesAutres === 'on' ? 'Oui' : 'Non'))
            .text('Détails : ' + (formData.allergiesDetails || '-'));
        docSanitary.moveDown(2);

        docSanitary.fontSize(14).text('SANTÉ', { underline: true });
        docSanitary.fontSize(12)
            .text('Problème de santé : ' + (formData.problemeSante === 'on' ? 'Oui' : 'Non'))
            .text('Détails : ' + (formData.problemeSanteDetails || '-'))
            .text('Recommandations parents : ' + (formData.recommandationsParents || '-'));
        docSanitary.moveDown(2);

        docSanitary.fontSize(14).text('CONTACTS', { underline: true });
        docSanitary.fontSize(12)
            .text('Responsable 1 : ' + (formData.responsable1Nom + ' ' + formData.responsable1Prenom + ' (' + formData.responsable1TelPortable + ')') || '-')
            .text('Responsable 2 : ' + (formData.responsable2Nom + ' ' + formData.responsable2Prenom + ' (' + formData.responsable2TelPortable + ')') || '-')
            .text('Contact urgence : ' + (formData.contactUrgenceNom + ' ' + formData.contactUrgencePrenom + ' (' + formData.contactUrgenceTel + ')') || '-');
        docSanitary.moveDown(2);

        docSanitary.fontSize(14).text('SIGNATURE', { underline: true });
        docSanitary.fontSize(12).text('Veuillez apposer votre signature ci-dessous :', 50, docSanitary.y);
        docSanitary.rect(50, docSanitary.y + 20, 500, 100).stroke();
        if (formData.signatureSanitaire) {
            const signatureData = formData.signatureSanitaire.replace(/^data:image\/png;base64,/, '');
            docSanitary.image(Buffer.from(signatureData, 'base64'), 60, docSanitary.y + 30, { width: 150 });
        }
        docSanitary.moveDown(4);

        docSanitary.fontSize(10)
            .text(`Fait à : ${formData.lieuInscription}`, 50, 700)
            .text('Date : 17/09/2025 à 12:15', 50, 720);
        docSanitary.end();

        // Save to MongoDB
        let Model;
        switch (formData.categorie) {
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
            nom: formData.nom[0] || formData.nom,
            prenom: formData.prenom[0] || formData.prenom,
            dateNaissance: new Date(formData.dateNaissance),
            sexe: formData.sexe,
            age: Number(formData.age),
            adresse: formData.adresse,
            ville: formData.ville,
            codePostal: formData.codePostal,
            email: formData.email,
            telDomicile: formData.telDomicile,
            telPortable: formData.telPortable,
            contactUrgence: {
                nom: formData.contactUrgenceNom,
                prenom: formData.contactUrgencePrenom,
                telPortable: formData.contactUrgenceTel,
                sexe: formData.contactUrgenceSexe,
                lien: formData.contactUrgenceLien
            },
            contactUrgenceSecondaire: {
                nom: formData.contactUrgenceSecondaireNom || null,
                prenom: formData.contactUrgenceSecondairePrenom || null,
                telPortable: formData.contactUrgenceSecondaireTel || null,
                sexe: formData.contactUrgenceSecondaireSexe || null,
                lien: formData.contactUrgenceSecondaireLien || null
            },
            autreClub: formData.autreClub === 'true',
            nomAutreClub: formData.autreClub === 'true' ? formData.nomAutreClub : null,
            parentNomPrenom: formData.parentNomPrenom,
            parentAdresse: formData.parentAdresse,
            parentEmail: formData.parentEmail,
            droitImage: formData.droitImage === 'on',
            droitDiffusion: formData.droitDiffusion === 'on',
            autorisationTransport: formData.autorisationTransport === 'on',
            luEtApprouveDroitImageText: formData.luEtApprouveDroitImageText,
            luEtApprouveInscriptionText: formData.luEtApprouveInscriptionText,
            signatureDroitImage: formData.signatureDroitImage,
            signatureDroitImageDate: new Date(),
            signatureInscription: formData.signatureSanitaire || '',
            signatureInscriptionDate: new Date(),
            lieuInscription: formData.lieuInscription,
            vaccinsObligatoires: formData.vaccinsObligatoires === 'on',
            vaccinsRecommandes: {
                diphtérie: formData.vaccinsDiphtérie || '',
                coqueluche: formData.vaccinsCoqueluche || '',
                tétanos: formData.vaccinsTétanos || '',
                haemophilus: formData.vaccinsHaemophilus || '',
                poliomyélite: formData.vaccinsPoliomyélite || '',
                rougeole: formData.vaccinsRougeole || '',
                pneumocoque: formData.vaccinsPneumocoque || '',
                bcg: formData.vaccinsBCG || '',
                autres: formData.vaccinsAutres || ''
            },
            traitementMedical: formData.traitementMedical === 'on',
            allergiesAlimentaires: formData.allergiesAlimentaires === 'on',
            allergiesMedicament: formData.allergiesMedicament === 'on',
            allergiesAutres: formData.allergiesAutres === 'on',
            allergiesDetails: formData.allergiesDetails || '',
            problemeSante: formData.problemeSante === 'on',
            problemeSanteDetails: formData.problemeSanteDetails || '',
            recommandationsParents: formData.recommandationsParents || '',
            responsable1Nom: formData.responsable1Nom,
            responsable1Prenom: formData.responsable1Prenom,
            responsable1Adresse: formData.responsable1Adresse,
            responsable1TelDomicile: formData.responsable1TelDomicile,
            responsable1TelTravail: formData.responsable1TelTravail,
            responsable1TelPortable: formData.responsable1TelPortable,
            responsable2Nom: formData.responsable2Nom,
            responsable2Prenom: formData.responsable2Prenom,
            responsable2Adresse: formData.responsable2Adresse,
            responsable2TelDomicile: formData.responsable2TelDomicile,
            responsable2TelTravail: formData.responsable2TelTravail,
            responsable2TelPortable: formData.responsable2TelPortable,
            medecinTraitant: formData.medecinTraitant || '',
            signatureSanitaire: formData.signatureSanitaire,
            signatureSanitaireDate: new Date(),
            remarqueSection1: formData.remarqueSection1 || '',
            remarqueSection2: formData.remarqueSection2 || '',
            remarqueSection3: formData.remarqueSection3 || '',
            remarqueSection4: formData.remarqueSection4 || '',
            remarqueSection5: formData.remarqueSection5 || '',
            vaccinScan: formData.vaccinScan,
            medicationScan: formData.medicationScan,
            recommendationMedicalScan: formData.recommendationMedicalScan,
            otherDocuments: formData.otherDocuments,
            pdfPath: authPdfPath,
            sanitaryPdfPath: sanitaryPdfPath
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
    const ADMIN_PASSWORD = 'scout123';
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
    console.log(`Serveur lancé sur le port ${port}`);

});


