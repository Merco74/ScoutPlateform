// app.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');

const fs = require('fs');
const PDFDocument = require('pdfkit');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');

const app = express();

// === CONFIGURATION ===
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/scouts_cluses';
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const PDF_DIR = path.join(__dirname, 'public', 'pdfs');

[UPLOAD_DIR, PDF_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// === MIDDLEWARE ===
app.use(express.static('public'));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use('/pdfs', express.static(PDF_DIR));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /pdf|jpeg|jpg|png/;
    const ext = path.extname(file.originalname).toLowerCase();
    const mime = file.mimetype;
    if (allowed.test(ext) && allowed.test(mime)) {
      cb(null, true);
    } else {
      cb(new Error('PDF, JPG, PNG uniquement'));
    }
  }
});

// === MONGOOSE ===
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB connecté'))
  .catch(err => console.error('MongoDB erreur:', err));

// Modèles
const models = {
  scout: require('./models/Scout'),
  guide: require('./models/Guide'),
  louveteau: require('./models/Louveteau')
};

// === UTILITAIRES ===
function getAge(birthDate) {
  return moment().diff(birthDate, 'years');
}

function sanitizeInput(str) {
  return String(str).trim().replace(/[<>&"']/g, '');
}

// === ROUTES ===

app.get('/', (req, res) => {
  res.render('create');
});

app.get('/mentions-legales', (req, res) => {
  res.send(`
    <h1>Mentions légales</h1>
    <p>Association Scouts & Guides de Cluses - RNA W741000XXX</p>
    <p>Responsable : Mathéo D.</p>
    <p>Hébergeur : OVH</p>
    <p>RGPD respecté. Contact : contact@scouts-cluses.fr</p>
    <p><a href="/">Retour</a></p>
  `);
});

// === INSCRIPTION ===
app.post('/inscription',
  upload.fields([
    { name: 'vaccinScan', maxCount: 1 },
    { name: 'medicationScan', maxCount: 5 },
    { name: 'otherDocuments', maxCount: 5 }
  ]),
  async (req, res) => {
    try {
      const body = req.body;
      const files = req.files || {};

      // Validation
      if (!body.nom || !body.prenom || !body.dateNaissance || !body.categorie) {
        return res.status(400).json({ success: false, message: 'Champs obligatoires manquants' });
      }

      const categorie = body.categorie.toLowerCase();
      if (!['scout', 'guide', 'louveteau'].includes(categorie)) {
        return res.status(400).json({ success: false, message: 'Catégorie invalide' });
      }

      const Model = models[categorie];
      const birthDate = new Date(body.dateNaissance);
      const age = getAge(birthDate);

      const ageLimits = {
        scout: { min: 11, max: 17 },
        guide: { min: 11, max: 17 },
        louveteau: { min: 8, max: 11 }
      };
      if (age < ageLimits[categorie].min || age > ageLimits[categorie].max) {
        return res.status(400).json({ success: false, message: `Âge non conforme pour ${categorie}` });
      }

      const clean = (field) => sanitizeInput(body[field] || '');
      const cleanBool = (field) => body[field] === 'on' || body[field] === true;

      const data = {
        nom: clean('nom'),
        prenom: clean('prenom'),
        dateNaissance: birthDate,
        sexe: body.sexe,
        age,
        adresse: clean('adresse') || `${clean('ville')} ${clean('codePostal')}`,
        ville: clean('ville'),
        codePostal: clean('codePostal'),
        email: clean('email') || clean('parentEmail'),
        telDomicile: clean('telDomicile'),
        telPortable: clean('telPortable'),
        contactUrgence: {
          nom: clean('contactUrgenceNom'),
          prenom: clean('contactUrgencePrenom'),
          telPortable: clean('contactUrgenceTel'),
          sexe: body.contactUrgenceSexe,
          lien: body.contactUrgenceLien
        },
        contactUrgenceSecondaire: body.contactUrgenceSecondaireNom ? {
          nom: clean('contactUrgenceSecondaireNom'),
          prenom: clean('contactUrgenceSecondairePrenom'),
          telPortable: clean('contactUrgenceSecondaireTel'),
          sexe: body.contactUrgenceSecondaireSexe,
          lien: body.contactUrgenceSecondaireLien
        } : null,
        autreClub: cleanBool('autreClub'),
        nomAutreClub: clean('nomAutreClub'),
        parentNomPrenom: clean('parentNomPrenom') || `${clean('responsable1Nom')} ${clean('responsable1Prenom')}`,
        parentAdresse: clean('parentAdresse'),
        parentEmail: clean('parentEmail'),
        droitImage: cleanBool('droitImage'),
        droitDiffusion: cleanBool('droitDiffusion') || cleanBool('droitImage'),
        autorisationTransport: cleanBool('autorisationTransport'),
        luEtApprouveDroitImageText: 'Lu et approuvé',
        luEtApprouveInscriptionText: 'Lu et approuvé',
        signatureDroitImage: body.signatureDroitImage,
        signatureDroitImageDate: new Date(),
        signatureInscription: body.signatureDroitImage,
        signatureInscriptionDate: new Date(),
        lieuInscription: clean('lieuInscription') || 'Cluses',
        dateInscription: new Date(),

        // Fiche sanitaire
        vaccinsObligatoires: true,
        vaccinsRecommandes: {
          diphtérie: body.vaccinDiphtérie || 'OK',
          coqueluche: body.vaccinCoqueluche || 'OK',
          tétanos: body.vaccinTétanos || 'OK',
          haemophilus: body.vaccinHaemophilus || 'OK',
          poliomyélite: body.vaccinPoliomyélite || 'OK',
          rougeole: body.vaccinRougeole || 'OK',
          pneumocoque: body.vaccinPneumocoque || 'OK',
          bcg: body.vaccinBcg || 'OK',
          autres: clean('vaccinsAutres')
        },
        traitementMedical: cleanBool('traitementMedical'),
        allergiesAlimentaires: cleanBool('allergiesAlimentaires'),
        allergiesMedicament: cleanBool('allergiesMedicament'),
        allergiesAutres: cleanBool('allergiesAutres'),
        allergiesDetails: clean('allergiesDetails'),
        problemeSante: cleanBool('problemeSante'),
        problemeSanteDetails: clean('problemeSanteDetails'),
        recommandationsParents: clean('recommandationsParents'),
        responsable1Nom: clean('responsable1Nom'),
        responsable1Prenom: clean('responsable1Prenom'),
        responsable1Adresse: clean('responsable1Adresse'),
        responsable1TelDomicile: clean('responsable1TelDomicile'),
        responsable1TelTravail: clean('responsable1TelTravail'),
        responsable1TelPortable: clean('responsable1TelPortable'),
        responsable2Nom: clean('responsable2Nom'),
        responsable2Prenom: clean('responsable2Prenom'),
        responsable2Adresse: clean('responsable2Adresse'),
        responsable2TelDomicile: clean('responsable2TelDomicile'),
        responsable2TelTravail: clean('responsable2TelTravail'),
        responsable2TelPortable: clean('responsable2TelPortable'),
        medecinTraitant: clean('medecinTraitant'),
        signatureSanitaire: body.signatureSanitaire || body.signatureDroitImage,
        signatureSanitaireDate: new Date(),

        vaccinScan: files.vaccinScan?.[0]?.filename,
        medicationScan: files.medicationScan?.[0]?.filename,
        otherDocuments: files.otherDocuments?.map(f => f.filename) || []
      };

      const inscrit = await new Model(data).save();

      // === PDF ===
      const pdfId = uuidv4();
      const authPdfPath = path.join(PDF_DIR, `${pdfId}-auth.pdf`);
      const sanitaryPdfPath = path.join(PDF_DIR, `${pdfId}-sanitary.pdf`);

      await generateAuthPdf(data, authPdfPath);
      await generateSanitaryPdf(data, sanitaryPdfPath);

      inscrit.pdfPath = `/pdfs/${path.basename(authPdfPath)}`;
      inscrit.sanitaryPdfPath = `/pdfs/${path.basename(sanitaryPdfPath)}`;
      await inscrit.save();

      res.json({
        success: true,
        message: 'Inscription réussie ! PDF générés.',
        pdfUrl: inscrit.pdfPath,
        sanitaryPdfUrl: inscrit.sanitaryPdfPath
      });

    } catch (err) {
      console.error('Erreur:', err);
      res.status(500).json({ success: false, message: 'Erreur serveur.' });
    }
  }
);

// === PDF ===
async function generateAuthPdf(data, outputPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    const logoPath = path.join(__dirname, 'public', 'images', 'logo-scouts.png');
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 50, 30, { width: 60 });
      doc.image(logoPath, 480, 30, { width: 60 });
    }

    doc.fontSize(18).text('AUTORISATION DE DROIT À L\'IMAGE ET DE TRANSPORT', 0, 100, { align: 'center' });
    doc.moveDown(2);

    doc.fontSize(14).text('IDENTITÉ DE L\'ENFANT', { underline: true });
    doc.fontSize(12)
      .text(`Nom : ${data.nom}`)
      .text(`Prénom : ${data.prenom}`)
      .text(`Né(e) le : ${moment(data.dateNaissance).format('DD/MM/YYYY')}`)
      .moveDown();

    doc.fontSize(14).text('REPRÉSENTANT LÉGAL', { underline: true });
    doc.fontSize(12)
      .text(`Nom et prénom : ${data.parentNomPrenom}`)
      .text(`Adresse : ${data.parentAdresse}`)
      .text(`Téléphone : ${data.telPortable}`)
      .moveDown();

    doc.fontSize(14).text('DROIT À L\'IMAGE', { underline: true });
    doc.fontSize(11).text(
      `J'autorise les Scouts et Guides de Cluses à réaliser des photos et vidéos de mon enfant dans le cadre des activités. ` +
      `J'autorise leur diffusion interne, sur le site web et les réseaux sociaux, à des fins de communication. ` +
      `Cette autorisation est donnée à titre gracieux, pour une durée illimitée, dans le respect du RGPD.`
    );
    doc.moveDown();

    doc.fontSize(14).text('TRANSPORT', { underline: true });
    doc.fontSize(11).text(
      `J'autorise mon enfant à être transporté dans des véhicules conduits par des responsables bénévoles.`
    );
    doc.moveDown(3);

    if (data.signatureDroitImage) {
      const imgData = data.signatureDroitImage.replace(/^data:image\/\w+;base64,/, '');
      doc.image(Buffer.from(imgData, 'base64'), 70, doc.y, { width: 180 });
    }

    doc.fontSize(10)
      .text(`Fait à : ${data.lieuInscription}`, 70, doc.y + 60)
      .text(`Le : ${moment().format('DD/MM/YYYY')}`, 70, doc.y + 20);

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

async function generateSanitaryPdf(data, outputPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    doc.fontSize(18).text('FICHE SANITAIRE', 0, 100, { align: 'center' });
    doc.moveDown(2);

    doc.fontSize(12)
      .text(`Enfant : ${data.prenom} ${data.nom} - ${data.age} ans`)
      .text(`Responsable : ${data.parentNomPrenom}`)
      .text(`Téléphone : ${data.telPortable}`)
      .moveDown();

    doc.fontSize(14).text('SANTÉ', { underline: true });
    doc.fontSize(11)
      .text(`Traitement : ${data.traitementMedical ? 'Oui' : 'Non'}`)
      .text(`Allergies : ${data.allergiesAlimentaires || data.allergiesMedicament ? 'Oui - ' + data.allergiesDetails : 'Non'}`)
      .text(`Problème : ${data.problemeSante ? 'Oui - ' + data.problemeSanteDetails : 'Non'}`)
      .moveDown();

    if (data.signatureSanitaire) {
      const imgData = data.signatureSanitaire.replace(/^data:image\/\w+;base64,/, '');
      doc.image(Buffer.from(imgData, 'base64'), 70, doc.y, { width: 180 });
    }

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

// === LANCEMENT ===
app.listen(PORT, () => {
  console.log(`Serveur sur http://localhost:${PORT}`);
});
