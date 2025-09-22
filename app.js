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

// Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SECRET
});

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.set('view engine', 'ejs');

// Multer configuration for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Type de fichier non autorisé (PDF, JPEG, PNG uniquement)'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Session configuration with MongoDB store
app.use(session({
  secret: process.env.SESSION_SECRET || 'ton-secret-super-securise',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    ttl: 14 * 24 * 60 * 60, // 14 days
    autoRemove: 'native' // Remove expired sessions
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production', // true for HTTPS on Railway
    maxAge: 14 * 24 * 60 * 60 * 1000, // 14 days
    httpOnly: true,
    sameSite: 'lax' // Helps with CSRF and cross-site requests
  }
}));

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connecté à MongoDB'))
  .catch(err => console.error('Erreur MongoDB:', err));

// Debug MongoStore errors
const sessionStore = MongoStore.create({ mongoUrl: process.env.MONGODB_URI });
sessionStore.on('error', err => console.error('MongoStore error:', err));

// Middleware for authentication
const requireAuth = (req, res, next) => {
  console.log('Checking auth:', req.session);
  if (req.session.isAuthenticated) {
    return next();
  }
  res.redirect('/login');
};

// Function to generate PDF buffer
const generatePdfBuffer = async (formData, type) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    const bannerImagePath = path.join(__dirname, 'images', 'scouts-cluses-banner.jpg');
    if (!fs.existsSync(bannerImagePath)) {
      reject(new Error(`Image de bannière introuvable à ${bannerImagePath}`));
      return;
    }

    if (type === 'auth') {
      doc.image(bannerImagePath, 50, 45, { width: 50 })
        .fontSize(20)
        .text('Autorisation de Droit à l\'Image et de Transport', { align: 'center' })
        .image(bannerImagePath, 500, 45, { width: 50 })
        .moveDown(2);

      doc.fontSize(14).text('IDENTITÉ', { underline: true });
      doc.fontSize(12)
        .text('Je soussigné(e) :')
        .text(`Nom : ${formData.nom || '-'}`)
        .text(`Prénom : ${formData.prenom || '-'}`)
        .text('Demeurant :')
        .text(formData.parentAdresse || '-')
        .text('Adresse email :')
        .text(formData.parentEmail || '-');
      doc.moveDown(2);

      doc.fontSize(14).text('DROIT À L\'IMAGE', { underline: true });
      doc.fontSize(12)
        .text('J\'accorde aux Scouts et Guides de Cluses l\'autorisation d\'effectuer des prises de vue photographiques ou des enregistrements audiovisuels sur lesquels mon enfant pourrait apparaître.')
        .moveDown();
      let yPos = doc.y;
      doc.rect(50, yPos, 10, 10).stroke();
      if (formData.droitImage === 'on') doc.rect(51, yPos + 1, 8, 8).fill();
      doc.text('1. Autorisation des prises de vue photographiques ou enregistrements audiovisuels.', 70, yPos);
      yPos += 20;
      doc.rect(50, yPos, 10, 10).stroke();
      if (formData.droitDiffusion === 'on') doc.rect(51, yPos + 1, 8, 8).fill();
      doc.text('2. Autorisation de diffusion sur réseaux (interne, Internet, presse locale).', 70, yPos);
      doc.moveDown();
      doc.text('Ces autorisations sont consenties à titre gracieux, pour un territoire illimité et sans limitation de durée, dans le respect de la législation sur le droit à l\'image et la vie privée.');
      doc.moveDown(2);

      doc.fontSize(14).text('AUTORISATION DE TRANSPORT', { underline: true });
      doc.fontSize(12)
        .text('Je consens à ce que mon enfant effectue des trajets dans le cadre du camp des Scouts et Guides de Cluses, d\'ordre médical ou organisationnel, dans des véhicules personnels ou de l\'association conduits par un encadrant.')
        .moveDown();
      yPos = doc.y;
      doc.rect(50, yPos, 10, 10).stroke();
      if (formData.autorisationTransport === 'on') doc.rect(51, yPos + 1, 8, 8).fill();
      doc.text('1. Autorisation des trajets dans les conditions décrites ci-dessus.', 70, yPos);
      doc.moveDown();
      doc.text('Sans cette autorisation, mon enfant ne pourra être transporté que par des véhicules de secours.');
      doc.moveDown(2);

      doc.fontSize(14).text('SIGNATURE', { underline: true });
      doc.fontSize(12).text('Veuillez apposer votre signature ci-dessous :', 50, doc.y);
      doc.rect(50, doc.y + 20, 500, 100).stroke();
      if (formData.signatureDroitImage) {
        const signatureData = formData.signatureDroitImage.replace(/^data:image\/png;base64,/, '');
        doc.image(Buffer.from(signatureData, 'base64'), 60, doc.y + 30, { width: 150 });
      }
      doc.moveDown(4);

      doc.fontSize(10)
        .text(`Fait à : ${formData.lieuInscription || '-'}`, 50, 700)
        .text(`Date : ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`, 50, 720);
    } else if (type === 'sanitary') {
      doc.image(bannerImagePath, 50, 45, { width: 50 })
        .fontSize(20)
        .text('Fiche Sanitaire', { align: 'center' })
        .image(bannerImagePath, 500, 45, { width: 50 })
        .moveDown(2);

      doc.fontSize(14).text('IDENTITÉ', { underline: true });
      doc.fontSize(12)
        .text(`Nom : ${formData.nom || '-'}`)
        .text(`Prénom : ${formData.prenom || '-'}`)
        .text(`Âge : ${formData.age || '-'}`)
        .text(`Contact : ${formData.telPortable || '-'}`);
      doc.moveDown(2);

      doc.fontSize(14).text('INFORMATIONS MÉDICALES', { underline: true });
      doc.fontSize(12)
        .text(`Vaccins obligatoires : ${formData.vaccinsObligatoires === 'on' ? 'Oui' : 'Non'}`)
        .text(`Vaccins recommandés : ${Object.entries(formData.vaccinsRecommandes || {}).map(([key, value]) => value ? `${key}: ${value}` : '').filter(v => v).join(', ') || '-'}`)
        .text(`Traitement médical : ${formData.traitementMedical === 'on' ? 'Oui' : 'Non'}`)
        .text(`Médecin traitant : ${formData.medecinTraitant || '-'}`);
      doc.moveDown(2);

      doc.fontSize(14).text('ALLERGIES', { underline: true });
      doc.fontSize(12)
        .text(`Alimentaires : ${formData.allergiesAlimentaires === 'on' ? 'Oui' : 'Non'}`)
        .text(`Médicamenteuses : ${formData.allergiesMedicament === 'on' ? 'Oui' : 'Non'}`)
        .text(`Autres : ${formData.allergiesAutres === 'on' ? 'Oui' : 'Non'}`)
        .text(`Détails : ${formData.allergiesDetails || '-'}`);
      doc.moveDown(2);

      doc.fontSize(14).text('SANTÉ', { underline: true });
      doc.fontSize(12)
        .text(`Problème de santé : ${formData.problemeSante === 'on' ? 'Oui' : 'Non'}`)
        .text(`Détails : ${formData.problemeSanteDetails || '-'}`)
        .text(`Recommandations parents : ${formData.recommandationsParents || '-'}`);
      doc.moveDown(2);

      doc.fontSize(14).text('CONTACTS', { underline: true });
      doc.fontSize(12)
        .text(`Responsable 1 : ${(formData.responsable1Nom || '-') + ' ' + (formData.responsable1Prenom || '-') + ' (' + (formData.responsable1TelPortable || '-') + ')'}`)
        .text(`Responsable 2 : ${(formData.responsable2Nom || '-') + ' ' + (formData.responsable2Prenom || '-') + ' (' + (formData.responsable2TelPortable || '-') + ')'}`)
        .text(`Contact urgence : ${(formData.contactUrgenceNom || '-') + ' ' + (formData.contactUrgencePrenom || '-') + ' (' + (formData.contactUrgenceTel || '-') + ')'}`);
      doc.moveDown(2);

      doc.fontSize(14).text('SIGNATURE', { underline: true });
      doc.fontSize(12).text('Veuillez apposer votre signature ci-dessous :', 50, doc.y);
      doc.rect(50, doc.y + 20, 500, 100).stroke();
      if (formData.signatureSanitaire) {
        const signatureData = formData.signatureSanitaire.replace(/^data:image\/png;base64,/, '');
        doc.image(Buffer.from(signatureData, 'base64'), 60, doc.y + 30, { width: 150 });
      }
      doc.moveDown(4);

      doc.fontSize(10)
        .text(`Fait à : ${formData.lieuInscription || '-'}`, 50, 700)
        .text(`Date : ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`, 50, 720);
    }
    doc.end();
  });
};

// Routes publiques
app.get('/', (req, res) => {
  console.log('Homepage session:', req.session);
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

    // Validate form data
    if (!formData.nom || !formData.prenom || !formData.categorie) {
      return res.status(400).json({ message: 'Nom, prénom et catégorie sont requis.' });
    }
    const nameRegex = /^[A-Za-zÀ-ÿ\s'-]{2,}$/;
    if (!nameRegex.test(formData.nom)) {
      return res.status(400).json({ message: 'Le nom doit contenir au moins 2 lettres et ne peut inclure que des lettres, espaces, apostrophes ou tirets.' });
    }
    if (!nameRegex.test(formData.prenom)) {
      return res.status(400).json({ message: 'Le prénom doit contenir au moins 2 lettres et ne peut inclure que des lettres, espaces, apostrophes ou tirets.' });
    }
    if (formData.luEtApprouveDroitImageText !== 'Lu et approuvé' || formData.luEtApprouveInscriptionText !== 'Lu et approuvé') {
      return res.status(400).json({ message: 'Veuillez saisir "Lu et approuvé" dans les champs correspondants.' });
    }
    if (!formData.signatureDroitImage || !formData.signatureSanitaire) {
      return res.status(400).json({ message: 'Les signatures sont requises.' });
    }
    if (!['scout', 'guide', 'louveteau'].includes(formData.categorie)) {
      return res.status(400).json({ message: 'Catégorie invalide.' });
    }

    // Upload files to Cloudinary
    const uploadToCloudinary = async (file, folder, resourceType = 'raw') => {
      if (!file) return '';
      return new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          {
            resource_type: resourceType,
            folder: `scouts-cluses/${folder}`,
            public_id: `${Date.now()}_${file.originalname || 'document'}`
          },
          (error, result) => {
            if (error) {
              console.error(`Erreur lors de l'upload sur Cloudinary (${folder}):`, error);
              return reject(error);
            }
            resolve(result.secure_url);
          }
        ).end(file.buffer);
      });
    };

    // Process file uploads
    formData.vaccinScan = files.vaccinScan ? await uploadToCloudinary(files.vaccinScan[0], 'uploads', 'auto') : '';
    formData.medicationScan = files.medicationScan ? await uploadToCloudinary(files.medicationScan[0], 'uploads', 'auto') : '';
    formData.recommendationMedicalScan = files.recommendationMedicalScan ? await uploadToCloudinary(files.recommendationMedicalScan[0], 'uploads', 'auto') : '';
    formData.otherDocuments = files.otherDocuments ? await Promise.all(files.otherDocuments.map(file => uploadToCloudinary(file, 'uploads', 'auto'))) : [];

    // Generate and upload PDFs
    formData.vaccinsRecommandes = {
      diphtérie: formData.vaccinsDiphtérie || '',
      coqueluche: formData.vaccinsCoqueluche || '',
      tétanos: formData.vaccinsTétanos || '',
      haemophilus: formData.vaccinsHaemophilus || '',
      poliomyélite: formData.vaccinsPoliomyélite || '',
      rougeole: formData.vaccinsRougeole || '',
      pneumocoque: formData.vaccinsPneumocoque || '',
      bcg: formData.vaccinsBCG || '',
      autres: formData.vaccinsAutres || ''
    };

    const authPdfBuffer = await generatePdfBuffer(formData, 'auth');
    const authPdfUrl = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          resource_type: 'raw',
          folder: 'scouts-cluses/pdfs',
          public_id: `autorisation_${formData.nom}_${Date.now()}.pdf`
        },
        (error, result) => {
          if (error) {
            console.error('Erreur lors de l\'upload du PDF d\'autorisation:', error);
            return reject(error);
          }
          resolve(result.secure_url);
        }
      ).end(authPdfBuffer);
    });

    const sanitaryPdfBuffer = await generatePdfBuffer(formData, 'sanitary');
    const sanitaryPdfUrl = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          resource_type: 'raw',
          folder: 'scouts-cluses/pdfs',
          public_id: `fiche_sanitaire_${formData.nom}_${Date.now()}.pdf`
        },
        (error, result) => {
          if (error) {
            console.error('Erreur lors de l\'upload du PDF sanitaire:', error);
            return reject(error);
          }
          resolve(result.secure_url);
        }
      ).end(sanitaryPdfBuffer);
    });

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
        return res.status(400).json({ message: 'Catégorie invalide.' });
    }

    const inscription = new Model({
      nom: formData.nom,
      prenom: formData.prenom,
      dateNaissance: new Date(formData.dateNaissance),
      sexe: formData.sexe,
      age: Number(formData.age),
      adresse: formData.adresse,
      ville: formData.ville,
      codePostal: formData.codePostal,
      email: formData.email,
      telDomicile: formData.telDomicile || '',
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
      signatureInscription: formData.signatureSanitaire,
      signatureInscriptionDate: new Date(),
      lieuInscription: formData.lieuInscription,
      vaccinsObligatoires: formData.vaccinsObligatoires === 'on',
      vaccinsRecommandes: formData.vaccinsRecommandes,
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
      responsable1TelDomicile: formData.responsable1TelDomicile || '',
      responsable1TelTravail: formData.responsable1TelTravail || '',
      responsable1TelPortable: formData.responsable1TelPortable,
      responsable2Nom: formData.responsable2Nom || '',
      responsable2Prenom: formData.responsable2Prenom || '',
      responsable2Adresse: formData.responsable2Adresse || '',
      responsable2TelDomicile: formData.responsable2TelDomicile || '',
      responsable2TelTravail: formData.responsable2TelTravail || '',
      responsable2TelPortable: formData.responsable2TelPortable || '',
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
      pdfPath: authPdfUrl,
      sanitaryPdfPath: sanitaryPdfUrl
    });

    await inscription.save();
    res.json({
      message: 'Inscription enregistrée avec succès !',
      pdfUrl: authPdfUrl,
      sanitaryPdfUrl: sanitaryPdfUrl
    });
  } catch (err) {
    console.error('Erreur lors de l’inscription:', err);
    res.status(400).json({ message: `Erreur lors de l’inscription : ${err.message || err}` });
  }
});

// Route de login
app.get('/login', (req, res) => {
  console.log('GET /login session:', req.session);
  res.render('login', { error: null });
});

app.post('/login', (req, res) => {
  const password = req.body.password;
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'scout123';
  console.log('Login attempt:', { password, ADMIN_PASSWORD });
  if (password === ADMIN_PASSWORD) {
    req.session.isAuthenticated = true;
    req.session.save(err => {
      if (err) {
        console.error('Erreur lors de la sauvegarde de la session:', err);
        return res.status(500).json({ message: 'Erreur serveur lors de la connexion' });
      }
      console.log('Session after login:', req.session);
      res.redirect('/');
    });
  } else {
    console.log('Login failed: Incorrect password');
    res.render('login', { error: 'Mot de passe incorrect' });
  }
});

// Route de logout
app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Erreur lors de la déconnexion:', err);
      return res.status(500).json({ message: 'Erreur serveur lors de la déconnexion' });
    }
    res.redirect('/');
  });
});

// Routes protégées
app.get('/scouts', requireAuth, async (req, res) => {
  try {
    const scouts = await Scout.find();
    res.render('list', { inscriptions: scouts, titre: 'Scouts' });
  } catch (err) {
    console.error('Erreur lors de la récupération des scouts:', err);
    res.status(500).json({ message: 'Erreur lors de la récupération des scouts.' });
  }
});

app.get('/guides', requireAuth, async (req, res) => {
  try {
    const guides = await Guide.find();
    res.render('list', { inscriptions: guides, titre: 'Guides' });
  } catch (err) {
    console.error('Erreur lors de la récupération des guides:', err);
    res.status(500).json({ message: 'Erreur lors de la récupération des guides.' });
  }
});

app.get('/louveteaux', requireAuth, async (req, res) => {
  try {
    const louveteaux = await Louveteau.find();
    res.render('list', { inscriptions: louveteaux, titre: 'Louveteaux' });
  } catch (err) {
    console.error('Erreur lors de la récupération des louveteaux:', err);
    res.status(500).json({ message: 'Erreur lors de la récupération des louveteaux.' });
  }
});

// Test route for Cloudinary
app.get('/test-cloudinary', async (req, res) => {
  try {
    const result = await cloudinary.uploader.upload('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==', {
      folder: 'scouts-cluses/test',
      resource_type: 'image'
    });
    res.json({ success: true, url: result.secure_url });
  } catch (err) {
    console.error('Erreur lors du test Cloudinary:', err);
    res.status(500).json({ message: 'Erreur lors du test Cloudinary : ' + (err.message || err) });
  }
});

app.listen(port, () => {
  console.log(`Serveur lancé sur le port ${port}`);
});