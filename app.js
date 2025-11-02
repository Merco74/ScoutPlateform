require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const multer = require('multer');
const PDFDocument = require('pdfkit');
const { Buffer } = require('buffer');
const cloudinary = require('cloudinary').v2;
const path = require('path');
const fs = require('fs');
const Scout = require('./models/Scout');
const Guide = require('./models/Guide');
const Louveteau = require('./models/Louveteau');

const app = express();
const port = process.env.PORT || 3000;

// Trust proxy
app.set('trust proxy', 1);

// Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SECRET
});

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Debug session
app.use((req, res, next) => {
  console.log(`Request: ${req.method} ${req.url}, Session:`, req.session);
  next();
});

// Multer
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
    cb(null, allowed.includes(file.mimetype));
  },
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Session
const mongoStore = MongoStore.create({
  mongoUrl: process.env.MONGODB_URI,
  ttl: 14 * 24 * 60 * 60,
  autoRemove: 'native'
});
mongoStore.on('error', err => console.error('MongoStore error:', err));

app.use(session({
  secret: process.env.SESSION_SECRET || 'ton-secret-super-securise',
  resave: false,
  saveUninitialized: false,
  store: mongoStore,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 14 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  }
}));

// === CONNEXION MONGODB (ROBUSTE + LOGS) ===
const connectWithRetry = () => {
  console.log('Tentative de connexion à MongoDB...');
  console.log('URL utilisée :', process.env.MONGODB_URI?.replace(/:[^:@]+@/, ':***@')); // Masque le mot de passe

  mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 5000,
    maxPoolSize: 10,
    retryWrites: true,
    w: 'majority'
  })
  .then(() => {
    console.log('Connecté à MongoDB avec succès !');
  })
  .catch(err => {
    console.error('Échec connexion MongoDB :', err.message);
    console.log('Nouvelle tentative dans 5 secondes...');
    setTimeout(connectWithRetry, 5000);
  });
};

// Démarre la connexion
connectWithRetry();

// Auth middleware
const requireAuth = (req, res, next) => {
  if (req.session.isAuthenticated) return next();
  res.redirect('/login');
};

// PDF Generator
const generatePdfBuffer = async (formData, type) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    const banner = path.join(__dirname, 'images', 'scouts-cluses-banner.jpg');
    if (!fs.existsSync(banner)) return reject(new Error('Bannière manquante'));

    if (type === 'auth') {
      doc.image(banner, 50, 45, { width: 50 })
        .fontSize(20).text('Autorisation Droit à l\'Image & Transport', { align: 'center' })
        .image(banner, 500, 45, { width: 50 }).moveDown(2);

      doc.fontSize(14).text('IDENTITÉ', { underline: true });
      doc.fontSize(12)
        .text(`Je soussigné(e) : ${formData.parentNomPrenom || '-'}`)
        .text(`Adresse : ${formData.parentAdresse || '-'}`)
        .text(`Email : ${formData.parentEmail || '-'}`)
        .moveDown(2);

      doc.fontSize(14).text('DROIT À L\'IMAGE', { underline: true });
      doc.fontSize(12)
        .text('J\'autorise les prises de vue et diffusion :')
        .text(`• Photos/vidéos : ${formData.droitImage ? 'Oui' : 'Non'}`)
        .text(`• Diffusion publique : ${formData.droitDiffusion ? 'Oui' : 'Non'}`)
        .moveDown(2);

      doc.fontSize(14).text('TRANSPORT', { underline: true });
      doc.fontSize(12).text(`Autorisation transport : ${formData.autorisationTransport ? 'Oui' : 'Non'}`)
        .moveDown(2);

      doc.fontSize(14).text('SIGNATURE', { underline: true });
      doc.rect(50, doc.y + 20, 500, 100).stroke();
      if (formData.signatureDroitImage) {
        const img = formData.signatureDroitImage.replace(/^data:image\/png;base64,/, '');
        doc.image(Buffer.from(img, 'base64'), 60, doc.y + 30, { width: 150 });
      }
      doc.moveDown(4);
      doc.fontSize(10)
        .text(`Fait à : ${formData.lieuInscription}`, 50, 700)
        .text(`Le : ${new Date().toLocaleDateString('fr-FR')}`, 50, 720);
    } else if (type === 'sanitary') {
      doc.image(banner, 50, 45, { width: 50 })
        .fontSize(20).text('Fiche Sanitaire', { align: 'center' })
        .image(banner, 500, 45, { width: 50 }).moveDown(2);

      doc.fontSize(14).text('ENFANT', { underline: true });
      doc.fontSize(12)
        .text(`Nom : ${formData.nom} ${formData.prenom}`)
        .text(`Âge : ${formData.age} ans`)
        .text(`Téléphone : ${formData.telPortable}`)
        .moveDown(2);

      doc.fontSize(14).text('SANTÉ', { underline: true });
      doc.fontSize(12)
        .text(`Vaccins obligatoires : ${formData.vaccinsObligatoires ? 'Oui' : 'Non'}`)
        .text(`Traitement : ${formData.traitementMedical ? 'Oui' : 'Non'}`)
        .text(`Allergies : ${formData.allergiesDetails || 'Aucune'}`)
        .text(`Problème santé : ${formData.problemeSante ? formData.problemeSanteDetails : 'Non'}`)
        .moveDown(2);

      doc.fontSize(14).text('CONTACTS', { underline: true });
      doc.fontSize(12)
        .text(`Resp. 1 : ${formData.responsable1Nom} ${formData.responsable1Prenom} (${formData.responsable1TelPortable})`)
        .text(`Urgence : ${formData.contactUrgence.nom} ${formData.contactUrgence.prenom} (${formData.contactUrgence.telPortable})`)
        .moveDown(2);

      doc.fontSize(14).text('SIGNATURE', { underline: true });
      doc.rect(50, doc.y + 20, 500, 100).stroke();
      if (formData.signatureSanitaire) {
        const img = formData.signatureSanitaire.replace(/^data:image\/png;base64,/, '');
        doc.image(Buffer.from(img, 'base64'), 60, doc.y + 30, { width: 150 });
      }
      doc.moveDown(4);
      doc.fontSize(10)
        .text(`Fait à : ${formData.lieuInscription}`, 50, 700)
        .text(`Le : ${new Date().toLocaleDateString('fr-FR')}`, 50, 720);
    }
    doc.end();
  });
};

// === ROUTES ===

app.get('/', (req, res) => {
  res.render('index', { isAuthenticated: req.session.isAuthenticated || false });
});

app.get('/inscription', (req, res) => {
  res.render('create', {});
});

app.get('/mentions-legales', (req, res) => {
  res.render('mentions-legales', { isAuthenticated: req.session.isAuthenticated || false });
});

// === INSCRIPTION ===
app.post('/inscription', upload.fields([
  { name: 'vaccinScan', maxCount: 1 },
  { name: 'medicationScan', maxCount: 1 },
  { name: 'otherDocuments', maxCount: 10 }
]), async (req, res) => {
  try {
    // Vérifie que req.body existe
    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({ message: 'Aucune donnée reçue.' });
    }

    const f = req.body;
    const files = req.files || {};

    // Validation des champs obligatoires
    if (!f.nom || !f.prenom || !f.categorie) {
      return res.status(400).json({ message: 'Nom, prénom et catégorie sont requis.' });
    }

    // Validation nom/prénom
    const nameRegex = /^[A-Za-zÀ-ÿ\s'-]{2,}$/;
    if (!nameRegex.test(f.nom) || !nameRegex.test(f.prenom)) {
      return res.status(400).json({ message: 'Nom ou prénom invalide.' });
    }

    // Vérifie signatures
    if (!f.signatureDroitImage || !f.signatureSanitaire) {
      return res.status(400).json({ message: 'Les deux signatures sont requises.' });
    }

    // --- Uploads Cloudinary ---
    const uploadFile = async (file, folder) => {
      if (!file) return '';
      return new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          { resource_type: 'auto', folder: `scouts-cluses/${folder}`, public_id: `${Date.now()}_${file.originalname}` },
          (err, result) => err ? reject(err) : resolve(result.secure_url)
        ).end(file.buffer);
      });
    };

    const vaccinScan = files.vaccinScan?.[0] ? await uploadFile(files.vaccinScan[0], 'uploads') : '';
    const medicationScan = files.medicationScan?.[0] ? await uploadFile(files.medicationScan[0], 'uploads') : '';
    const otherDocs = files.otherDocuments ? await Promise.all(files.otherDocuments.map(f => uploadFile(f, 'uploads'))) : [];

    // --- Générer PDFs ---
    const authBuffer = await generatePdfBuffer(f, 'auth');
    const sanitaryBuffer = await generatePdfBuffer(f, 'sanitary');

    const authPdfUrl = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { resource_type: 'raw', folder: 'scouts-cluses/pdfs', public_id: `auth_${f.nom}_${Date.now()}.pdf` },
        (err, res) => err ? reject(err) : resolve(res.secure_url)
      ).end(authBuffer);
    });

    const sanitaryPdfUrl = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { resource_type: 'raw', folder: 'scouts-cluses/pdfs', public_id: `sanitary_${f.nom}_${Date.now()}.pdf` },
        (err, res) => err ? reject(err) : resolve(res.secure_url)
      ).end(sanitaryBuffer);
    });

    // --- Construire parentNomPrenom ---
    const parentNomPrenom = `${f.responsable1Nom || ''} ${f.responsable1Prenom || ''}`.trim();

    // --- Choisir le modèle ---
    let Model;
    if (f.categorie === 'scout') Model = Scout;
    else if (f.categorie === 'guide') Model = Guide;
    else if (f.categorie === 'louveteau') Model = Louveteau;
    else return res.status(400).json({ message: 'Catégorie invalide.' });

    // --- Créer l'objet à sauvegarder ---
    const inscription = new Model({
      nom: f.nom,
      prenom: f.prenom,
      dateNaissance: f.dateNaissance ? new Date(f.dateNaissance) : null,
      sexe: f.sexe,
      age: f.age ? Number(f.age) : null,
      adresse: f.adresse,
      ville: f.ville,
      codePostal: f.codePostal,
      email: f.email || '',
      telDomicile: f.telDomicile || '',
      telPortable: f.telPortable,
      contactUrgence: {
        nom: f.contactUrgenceNom,
        prenom: f.contactUrgencePrenom,
        telPortable: f.contactUrgenceTel,
        sexe: f.contactUrgenceSexe,
        lien: f.contactUrgenceLien
      },
      contactUrgenceSecondaire: f.contactUrgenceSecondaireNom ? {
        nom: f.contactUrgenceSecondaireNom || null,
        prenom: f.contactUrgenceSecondairePrenom || null,
        telPortable: f.contactUrgenceSecondaireTel || null,
        sexe: f.contactUrgenceSecondaireSexe || null,
        lien: f.contactUrgenceSecondaireLien || null
      } : null,
      autreClub: f.autreClub === 'on',
      nomAutreClub: f.autreClub === 'on' ? f.nomAutreClub : null,
      parentNomPrenom,
      parentAdresse: f.responsable1Adresse,
      parentEmail: f.parentEmail,
      droitImage: f.droitImage === 'on',
      droitDiffusion: f.droitDiffusion === 'on',
      autorisationTransport: f.autorisationTransport === 'on',
      luEtApprouveDroitImageText: 'Lu et approuvé',
      luEtApprouveInscriptionText: 'Lu et approuvé',
      signatureDroitImage: f.signatureDroitImage,
      signatureDroitImageDate: new Date(),
      signatureInscription: f.signatureSanitaire,
      signatureInscriptionDate: new Date(),
      lieuInscription: f.lieuInscription || 'Cluses',
      vaccinsObligatoires: f.vaccinsObligatoires === 'on',
      vaccinsRecommandes: {
        diphtérie: f.vaccinDiphtérie || '',
        coqueluche: f.vaccinCoqueluche || '',
        tétanos: f.vaccinTétanos || '',
        haemophilus: f.vaccinHaemophilus || '',
        poliomyélite: f.vaccinPoliomyélite || '',
        rougeole: f.vaccinRougeole || '',
        pneumocoque: f.vaccinPneumocoque || '',
        bcg: f.vaccinBcg || '',
        autres: f.vaccinsAutres || ''
      },
      traitementMedical: f.traitementMedical === 'on',
      allergiesAlimentaires: f.allergiesAlimentaires === 'on',
      allergiesMedicament: f.allergiesMedicament === 'on',
      allergiesAutres: f.allergiesAutres === 'on',
      allergiesDetails: f.allergiesDetails || '',
      problemeSante: f.problemeSante === 'on',
      problemeSanteDetails: f.problemeSanteDetails || '',
      recommandationsParents: f.recommandationsParents || '',
      responsable1Nom: f.responsable1Nom,
      responsable1Prenom: f.responsable1Prenom,
      responsable1Adresse: f.responsable1Adresse,
      responsable1TelDomicile: f.responsable1TelDomicile || '',
      responsable1TelTravail: f.responsable1TelTravail || '',
      responsable1TelPortable: f.responsable1TelPortable,
      responsable2Nom: f.responsable2Nom || '',
      responsable2Prenom: f.responsable2Prenom || '',
      responsable2Adresse: f.responsable2Adresse || '',
      responsable2TelDomicile: f.responsable2TelDomicile || '',
      responsable2TelTravail: f.responsable2TelTravail || '',
      responsable2TelPortable: f.responsable2TelPortable || '',
      medecinTraitant: f.medecinTraitant || '',
      signatureSanitaire: f.signatureSanitaire,
      signatureSanitaireDate: new Date(),
      vaccinScan,
      medicationScan,
      otherDocuments: otherDocs,
      pdfPath: authPdfUrl,
      sanitaryPdfPath: sanitaryPdfUrl
    });

    await inscription.save();

    res.json({
      success: true,
      message: 'Inscription enregistrée avec succès !',
      pdfUrl: authPdfUrl,
      sanitaryPdfUrl: sanitaryPdfUrl
    });

  } catch (err) {
    console.error('Erreur inscription:', err);
    res.status(500).json({ message: 'Erreur serveur : ' + err.message });
  }
});

// === LISTES PROTÉGÉES ===
app.get('/scouts', requireAuth, async (req, res) => {
  const scouts = await Scout.find();
  res.render('list', { inscriptions: scouts, titre: 'Scouts' });
});

app.get('/guides', requireAuth, async (req, res) => {
  const guides = await Guide.find();
  res.render('list', { inscriptions: guides, titre: 'Guides' });
});

// === LOGIN ===
app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

const bcrypt = require('bcryptjs');
const MOT_DE_PASSE_HACHE = '$2b$10$K.3n9v8x7c6b5a4Z3Y2X1eWIvUjHmKgLfD.sR1qA0zB9c8V7u6T5s'; // "encadrant2025"

app.post('/login', async (req, res) => {
  const { mot_de_passe } = req.body;
  if (!mot_de_passe) return res.render('login', { error: 'Mot de passe requis.' });

  const match = await bcrypt.compare(mot_de_passe, MOT_DE_PASSE_HACHE);
  if (!match) return res.render('login', { error: 'Mot de passe incorrect.' });

  req.session.isAuthenticated = true;
  res.redirect('/scouts');
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

app.listen(port, () => {
  console.log(`Serveur sur http://localhost:${port}`);
});






