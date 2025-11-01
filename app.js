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
const session = require('express-session');

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
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'scouts-cluses-2025',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: 'auto', maxAge: 24 * 60 * 60 * 1000 }
}));

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

// Modèle unique
const Scout = require('./models/Scout');

// === UTILITAIRES ===
function getAge(birthDate) {
  return moment().diff(birthDate, 'years');
}

function sanitizeInput(str) {
  return String(str).trim().replace(/[<>&"']/g, '');
}

function isAuthenticated(req, res, next) {
  res.locals.isAuthenticated = !!req.session.isAuthenticated;
  next();
}
app.use(isAuthenticated);

function requireAuth(req, res, next) {
  if (req.session.isAuthenticated) return next();
  res.redirect('/login');
}

// === ROUTES ===

// ACCUEIL (public)
app.get('/', (req, res) => {
  res.render('index');
});

// CONNEXION (encadrants)
app.get('/login', (req, res) => {
  if (req.session.isAuthenticated) return res.redirect('/');
  res.render('login', { error: null });
});

app.post('/login', (req, res) => {
  const { password } = req.body;
  const ADMIN_PASSWORD = 'JaimeLeScoutisme123SauflesSDF';

  if (password === ADMIN_PASSWORD) {
    req.session.isAuthenticated = true;
    return res.redirect('/');
  }
  res.render('login', { error: 'Mot de passe incorrect' });
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// FORMULAIRE D'INSCRIPTION → PUBLIC
app.get('/inscription', (req, res) => {
  res.render('create');
});

// MENTIONS LÉGALES
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

// LISTES DES INSCRITS → PROTÉGÉES
app.get('/:categorie', requireAuth, async (req, res) => {
  const categories = {
    scouts: 'Scouts',
    guides: 'Guides',
    louveteaux: 'Louveteaux'
  };
  const cat = req.params.categorie;
  if (!categories[cat]) return res.status(404).send('Catégorie inconnue');

  const titre = categories[cat];
  const inscriptions = await Scout.find({ categorie: titre }).sort({ nom: 1 });

  res.render('list', { titre, inscriptions });
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

      const categorie = body.categorie;
      const birthDate = new Date(body.dateNaissance);
      const age = getAge(birthDate);

      const ageLimits = {
        Louveteaux: { min: 8, max: 11 },
        Scouts: { min: 11, max: 17 },
        Guides: { min: 11, max: 17 }
      };
      const catLimits = ageLimits[categorie];
      if (!catLimits || age < catLimits.min || age > catLimits.max) {
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
        adresse: clean('adresse'),
        ville: clean('ville'),
        codePostal: clean('codePostal'),
        email: clean('email') || clean('parentEmail'),
        telPortable: clean('telPortable'),
        contactUrgence: {
          nom: clean('contactUrgenceNom'),
          prenom: clean('contactUrgencePrenom'),
          telPortable: clean('contactUrgenceTel'),
          sexe: body.contactUrgenceSexe,
          lien: body.contactUrgenceLien
        },
        categorie,
        autreClub: cleanBool('autreClub'),
        nomAutreClub: clean('nomAutreClub'),
        parentNomPrenom: `${clean('responsable1Nom')} ${clean('responsable1Prenom')}`,
        parentAdresse: clean('responsable1Adresse'),
        parentEmail: clean('parentEmail'),
        droitImage: true,
        droitDiffusion: true,
        autorisationTransport: true,
        luEtApprouveDroitImageText: 'Lu et approuvé',
        luEtApprouveInscriptionText: 'Lu et approuvé',
        signatureDroitImage: body.signatureDroitImage,
        signatureDroitImageDate: new Date(),
        signatureInscription: body.signatureSanitaire,
        signatureInscriptionDate: new Date(),
        lieuInscription: 'Cluses',
        dateInscription: new Date(),

        // Fiche sanitaire
        vaccinsObligatoires: true,
        vaccinsRecommandes: {
          diphtérie: 'OK',
          coqueluche: 'OK',
          tétanos: 'OK',
          haemophilus: 'OK',
          poliomyélite: 'OK',
          rougeole: 'OK',
          pneumocoque: 'OK',
          bcg: 'OK',
          autres: clean('vaccinsAutres')
        },
        traitementMedical: cleanBool('traitementMedical'),
        allergiesAlimentaires: cleanBool('allergiesAlimentaires'),
        allergiesMedicament: cleanBool('allergiesMedicament'),
        allergiesAutres: cleanBool('allergiesAutres'),
        allergiesDetails: clean('allergiesDetails'),
        problemeSante: cleanBool('problemeSante'),
        problemeSanteDetails: clean('problemeSanteDetails'),
        medecinTraitant: clean('medecinTraitant'),
        responsable1Nom: clean('responsable1Nom'),
        responsable1Prenom: clean('responsable1Prenom'),
        responsable1Adresse: clean('responsable1Adresse'),
        responsable1TelPortable: clean('responsable1TelPortable'),
        signatureSanitaire: body.signatureSanitaire,
        signatureSanitaireDate: new Date(),

        vaccinScan: files.vaccinScan?.[0]?.filename,
        medicationScan: files.medicationScan?.[0]?.filename,
        otherDocuments: files.otherDocuments?.map(f => f.filename) || []
      };

      const inscrit = new Scout(data);

      // === GÉNÉRATION PDF ===
      const pdfId = uuidv4();
      const authPdfPath = path.join(PDF_DIR, `${pdfId}-autorisation.pdf`);
      const sanitaryPdfPath = path.join(PDF_DIR, `${pdfId}-sanitaire.pdf`);

      await generateAuthPdf(data, authPdfPath);
      await generateSanitaryPdf(data, sanitaryPdfPath);

      inscrit.pdfPath = `/pdfs/${path.basename(authPdfPath)}`;
      inscrit.sanitaryPdfPath = `/pdfs/${path.basename(sanitaryPdfPath)}`;
      await inscrit.save();

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      res.json({
        success: true,
        message: 'Inscription réussie !',
        pdfUrl: baseUrl + inscrit.pdfPath,
        sanitaryPdfUrl: baseUrl + inscrit.sanitaryPdfPath
      });

    } catch (err) {
      console.error('Erreur:', err);
      res.status(500).json({ success: false, message: 'Erreur serveur.' });
    }
  }
);

// === PDF GÉNÉRATION ===
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

    doc.fontSize(20).text('AUTORISATION DE DROIT À L\'IMAGE ET DE TRANSPORT', 0, 120, { align: 'center' });
    doc.moveDown(2);

    doc.fontSize(14).text('IDENTITÉ DE L\'ENFANT', { underline: true });
    doc.fontSize(12)
      .text(`Nom : ${data.nom}`)
      .text(`Prénom : ${data.prenom}`)
      .text(`Né(e) le : ${moment(data.dateNaissance).format('DD/MM/YYYY')} (${data.age} ans)`)
      .text(`Catégorie : ${data.categorie}`)
      .moveDown();

    doc.fontSize(14).text('REPRÉSENTANT LÉGAL', { underline: true });
    doc.fontSize(12)
      .text(`Nom et prénom : ${data.parentNomPrenom}`)
      .text(`Adresse : ${data.parentAdresse}`)
      .text(`Téléphone : ${data.responsable1TelPortable}`)
      .text(`Email : ${data.parentEmail}`)
      .moveDown();

    doc.fontSize(14).text('DROIT À L\'IMAGE', { underline: true });
    doc.fontSize(11).text(
      `J'autorise les Scouts & Guides de Cluses à prendre des photos et vidéos de mon enfant lors des activités. ` +
      `J'autorise leur diffusion sur le site web, les réseaux sociaux et la presse locale, à des fins de communication associative. ` +
      `Cette autorisation est donnée à titre gracieux, pour une durée illimitée, dans le respect du RGPD.`
    );
    doc.moveDown();

    doc.fontSize(14).text('TRANSPORT', { underline: true });
    doc.fontSize(11).text(
      `J'autorise mon enfant à être transporté dans des véhicules conduits par des responsables bénévoles encadrés.`
    );
    doc.moveDown(2);

    if (data.signatureDroitImage) {
      const imgData = data.signatureDroitImage.replace(/^data:image\/\w+;base64,/, '');
      doc.image(Buffer.from(imgData, 'base64'), 70, doc.y, { width: 200 });
    }

    doc.fontSize(10)
      .text(`Fait à : ${data.lieuInscription}`, 70, doc.y + 70)
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

    doc.fontSize(20).text('FICHE SANITAIRE DE CONTACT', 0, 120, { align: 'center' });
    doc.moveDown(2);

    doc.fontSize(12)
      .text(`Enfant : ${data.prenom} ${data.nom} - ${data.age} ans`)
      .text(`Responsable : ${data.parentNomPrenom}`)
      .text(`Téléphone : ${data.responsable1TelPortable}`)
      .moveDown();

    doc.fontSize(14).text('SANTÉ', { underline: true });
    doc.fontSize(11)
      .text(`Traitement médical : ${data.traitementMedical ? 'Oui' : 'Non'}`)
      .text(`Allergies : ${data.allergiesDetails || 'Aucune'}`)
      .text(`Problème de santé : ${data.problemeSante ? data.problemeSanteDetails : 'Aucun'}`)
      .text(`Médecin traitant : ${data.medecinTraitant || 'Non précisé'}`)
      .moveDown();

    doc.fontSize(14).text('CONTACT D\'URGENCE', { underline: true });
    doc.fontSize(11)
      .text(`${data.contactUrgence.nom} ${data.contactUrgence.prenom}`)
      .text(`Lien : ${data.contactUrgence.lien}`)
      .text(`Téléphone : ${data.contactUrgence.telPortable}`)
      .moveDown(2);

    if (data.signatureSanitaire) {
      const imgData = data.signatureSanitaire.replace(/^data:image\/\w+;base64,/, '');
      doc.image(Buffer.from(imgData, 'base64'), 70, doc.y, { width: 200 });
    }

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

// === 404 ===
app.use((req, res) => {
  res.status(404).send('Page non trouvée');
});

// === LANCEMENT ===
app.listen(PORT, () => {
  console.log(`Serveur sur http://localhost:${PORT}`);
});

