// app.js
require('dotenv').config();
const express        = require('express');
const mongoose       = require('mongoose');
const multer         = require('multer');
const path           = require('path');
const fs             = require('fs');
const bcrypt         = require('bcrypt');
const session        = require('express-session');
const MongoStore     = require('connect-mongo');
const PDFDocument    = require('pdfkit');
const { v4: uuidv4 } = require('uuid');
const moment         = require('moment');

const app = express();

// ============================================================
// CONFIGURATION
// ============================================================
const PORT           = process.env.PORT || 3000;
const MONGODB_URI    = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/scouts_cluses';
const SESSION_SECRET = process.env.SESSION_SECRET || 'scouts-cluses-secret-dev';
const UPLOAD_DIR     = path.join(__dirname, 'uploads');
const PDF_DIR        = path.join(__dirname, 'public', 'pdfs');

[UPLOAD_DIR, PDF_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ============================================================
// MONGOOSE
// ============================================================
mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ MongoDB connecté'))
  .catch(err => { console.error('❌ MongoDB erreur:', err); process.exit(1); });

const Utilisateur = require('./models/utilisateur');
const Enfant      = require('./models/enfant');
const Inscription = require('./models/inscription');
const Config      = require('./models/config');

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: MONGODB_URI }),
  cookie: { maxAge: 1000 * 60 * 60 * 8 }
}));

// Inject session data into all views
app.use((req, res, next) => {
  res.locals.utilisateurConnecte = !!req.session.utilisateurId;
  res.locals.roles               = req.session.roles || [];
  res.locals.nomUtilisateur      = req.session.nomUtilisateur || '';
  next();
});

// ============================================================
// MULTER
// ============================================================
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename:    (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`)
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const okExt  = /\.(pdf|jpeg|jpg|png)$/i;
    const okMime = /^(application\/pdf|image\/(jpeg|png))$/;
    if (okExt.test(file.originalname) && okMime.test(file.mimetype)) cb(null, true);
    else cb(new Error('Fichier non autorisé. PDF, JPG ou PNG uniquement.'));
  }
});

// ============================================================
// UTILITAIRES
// ============================================================
const sanitize = str => String(str || '').trim().replace(/[<>&"']/g, '');
const getAge   = date => moment().diff(moment(date), 'years');

/** Calcule l'âge à une date précise (date de remplissage du formulaire) */
const getAgeAt = (dateNaissance, dateRef) =>
  moment(dateRef).diff(moment(dateNaissance), 'years');

const getAnneeScoute = () => {
  const now = moment();
  const y   = now.month() >= 8 ? now.year() : now.year() - 1;
  return `${y}-${y + 1}`;
};

/** Récupère ou initialise la config globale */
async function getConfig() {
  let config = await Config.findOne({ cle: 'global' });
  if (!config) {
    config = await Config.create({
      cle: 'global',
      inscriptionAnneeActive: getAnneeScoute()
    });
  }
  return config;
}

// ---- Middlewares d'accès ----
function requireAuth(req, res, next) {
  if (!req.session.utilisateurId) return res.redirect('/connexion');
  next();
}
function requireEncadrant(req, res, next) {
  if (!req.session.utilisateurId) return res.redirect('/connexion');
  const r = req.session.roles || [];
  if (!r.includes('encadrant') && !r.includes('admin'))
    return res.status(403).render('erreur', { message: 'Accès réservé aux encadrants.' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.utilisateurId) return res.redirect('/connexion');
  if (!(req.session.roles || []).includes('admin'))
    return res.status(403).render('erreur', { message: 'Accès réservé aux administrateurs.' });
  next();
}

// ============================================================
// ROUTES PUBLIQUES
// ============================================================
app.get('/', async (req, res) => {
  const config = await getConfig();
  res.render('index', { config });
});
app.get('/mentions-legales', (req, res) => res.render('mentions-legales'));

// ============================================================
// AUTHENTIFICATION
// ============================================================
app.get('/inscription', (req, res) => res.render('inscription', { erreur: null }));

app.post('/inscription',
  upload.fields([
    { name: 'bafaScan',         maxCount: 1 },
    { name: 'casierJudiciaire', maxCount: 1 },
    { name: 'autresDocuments',  maxCount: 5 }
  ]),
  async (req, res) => {
    try {
      const { email, motDePasse, motDePasseConfirm, nom, prenom,
              telPortable, telDomicile, adresse, ville, codePostal,
              medecinTraitant, demandeEncadrant } = req.body;
      const files = req.files || {};

      if (!email || !motDePasse || !nom || !prenom || !telPortable)
        return res.render('inscription', { erreur: 'Champs obligatoires manquants.' });
      if (motDePasse !== motDePasseConfirm)
        return res.render('inscription', { erreur: 'Les mots de passe ne correspondent pas.' });
      if (motDePasse.length < 8)
        return res.render('inscription', { erreur: 'Mot de passe trop court (8 caractères min.).' });
      if (await Utilisateur.findOne({ email: email.toLowerCase() }))
        return res.render('inscription', { erreur: 'Un compte existe déjà avec cet email.' });

      const roles = ['parent'];
      if (demandeEncadrant === 'on') roles.push('encadrant');

      const utilisateur = await Utilisateur.create({
        email: sanitize(email).toLowerCase(), motDePasse, roles,
        nom: sanitize(nom), prenom: sanitize(prenom),
        adresse: sanitize(adresse), ville: sanitize(ville),
        codePostal: sanitize(codePostal),
        telPortable: sanitize(telPortable), telDomicile: sanitize(telDomicile),
        medecinTraitant: sanitize(medecinTraitant),
        responsable2: req.body.resp2Nom ? {
          nom: sanitize(req.body.resp2Nom), prenom: sanitize(req.body.resp2Prenom),
          adresse: sanitize(req.body.resp2Adresse),
          telDomicile: sanitize(req.body.resp2TelDomicile),
          telTravail: sanitize(req.body.resp2TelTravail),
          telPortable: sanitize(req.body.resp2TelPortable)
        } : undefined,
        encadrant: demandeEncadrant === 'on' ? {
          categories: req.body.categoriesEncadrant
            ? [].concat(req.body.categoriesEncadrant) : [],
          bafaScan:         files.bafaScan?.[0]?.filename,
          casierJudiciaire: files.casierJudiciaire?.[0]?.filename,
          autresDocuments:  files.autresDocuments?.map(f => f.filename) || [],
          statut: 'en_attente'
        } : undefined
      });

      req.session.utilisateurId  = utilisateur._id;
      req.session.roles          = utilisateur.roles;
      req.session.nomUtilisateur = `${utilisateur.prenom} ${utilisateur.nom}`;
      res.redirect('/espace');

    } catch (err) {
      console.error('Erreur inscription:', err);
      res.render('inscription', { erreur: 'Erreur serveur.' });
    }
  }
);

app.get('/connexion', (req, res) => {
  if (req.session.utilisateurId) return res.redirect('/espace');
  res.render('connexion', { erreur: null });
});

app.post('/connexion', async (req, res) => {
  try {
    const { email, motDePasse } = req.body;
    if (!email || !motDePasse)
      return res.render('connexion', { erreur: 'Email et mot de passe requis.' });
    const u = await Utilisateur.findOne({ email: email.toLowerCase() });
    if (!u || !(await u.verifierMotDePasse(motDePasse)))
      return res.render('connexion', { erreur: 'Email ou mot de passe incorrect.' });
    u.derniereConnexion = new Date();
    await u.save();
    req.session.utilisateurId  = u._id;
    req.session.roles          = u.roles;
    req.session.nomUtilisateur = `${u.prenom} ${u.nom}`;
    res.redirect('/espace');
  } catch (err) {
    console.error('Erreur connexion:', err);
    res.render('connexion', { erreur: 'Erreur serveur.' });
  }
});

app.get('/deconnexion', (req, res) => req.session.destroy(() => res.redirect('/')));

// ============================================================
// ESPACE UNIFIÉ
// ============================================================
app.get('/espace', requireAuth, (req, res) => {
  const r = req.session.roles || [];
  if (r.includes('admin'))     return res.redirect('/admin');
  if (r.includes('encadrant')) return res.redirect('/espace-encadrant');
  return res.redirect('/espace-parent');
});

// ============================================================
// ESPACE PARENT
// ============================================================
app.get('/espace-parent', requireAuth, async (req, res) => {
  try {
    const utilisateur = await Utilisateur.findById(req.session.utilisateurId);
    const enfants     = await Enfant.find({ parentId: req.session.utilisateurId });
    const config      = await getConfig();
    const anneeScoute = config.inscriptionAnneeActive || getAnneeScoute();

    const enfantsAvecStatut = await Promise.all(enfants.map(async enfant => {
      // Récupère la dernière inscription active (non archivée) pour chaque type
      const [inscAnnee, inscCamp] = await Promise.all([
        Inscription.findOne({ enfantId: enfant._id, anneeScoute, typeInscription: 'annee',
          statut: { $ne: 'archivee' } }).sort({ version: -1 }),
        Inscription.findOne({ enfantId: enfant._id, anneeScoute, typeInscription: 'camp',
          statut: { $ne: 'archivee' } }).sort({ version: -1 })
      ]);
      return {
        ...enfant.toObject(),
        inscriptionAnnee: inscAnnee || null,
        inscriptionCamp:  inscCamp  || null,
        age: getAge(enfant.dateNaissance),
        estMajeur: getAge(enfant.dateNaissance) >= 18
      };
    }));

    res.render('espace-parent', {
      parent: utilisateur, enfants: enfantsAvecStatut, anneeScoute, config
    });
  } catch (err) {
    console.error('Erreur espace parent:', err);
    res.status(500).render('erreur', { message: 'Erreur lors du chargement de votre espace.' });
  }
});

app.get('/profil', requireAuth, async (req, res) => {
  const utilisateur = await Utilisateur.findById(req.session.utilisateurId);
  res.render('profil-parent', { parent: utilisateur, erreur: null, succes: null });
});

app.post('/profil', requireAuth, async (req, res) => {
  try {
    const u = await Utilisateur.findById(req.session.utilisateurId);
    Object.assign(u, {
      nom: sanitize(req.body.nom), prenom: sanitize(req.body.prenom),
      adresse: sanitize(req.body.adresse), ville: sanitize(req.body.ville),
      codePostal: sanitize(req.body.codePostal),
      telPortable: sanitize(req.body.telPortable),
      telDomicile: sanitize(req.body.telDomicile),
      medecinTraitant: sanitize(req.body.medecinTraitant)
    });
    if (req.body.resp2Nom) {
      u.responsable2 = {
        nom: sanitize(req.body.resp2Nom), prenom: sanitize(req.body.resp2Prenom),
        adresse: sanitize(req.body.resp2Adresse),
        telDomicile: sanitize(req.body.resp2TelDomicile),
        telTravail: sanitize(req.body.resp2TelTravail),
        telPortable: sanitize(req.body.resp2TelPortable)
      };
    }
    if (req.body.nouveauMotDePasse) {
      if (req.body.nouveauMotDePasse.length < 8)
        return res.render('profil-parent', { parent: u, erreur: 'Mot de passe trop court.', succes: null });
      if (req.body.nouveauMotDePasse !== req.body.confirmMotDePasse)
        return res.render('profil-parent', { parent: u, erreur: 'Mots de passe différents.', succes: null });
      u.motDePasse = req.body.nouveauMotDePasse;
    }
    await u.save();
    req.session.nomUtilisateur = `${u.prenom} ${u.nom}`;
    res.render('profil-parent', { parent: u, erreur: null, succes: 'Profil mis à jour.' });
  } catch (err) {
    const u = await Utilisateur.findById(req.session.utilisateurId);
    res.render('profil-parent', { parent: u, erreur: 'Erreur serveur.', succes: null });
  }
});

// ============================================================
// GESTION DES ENFANTS
// ============================================================
app.get('/ajouter-enfant', requireAuth, async (req, res) => {
  const parent = await Utilisateur.findById(req.session.utilisateurId);
  res.render('enfant-form', { parent, enfant: null, erreur: null });
});

app.post('/ajouter-enfant',
  requireAuth,
  upload.fields([
    { name: 'vaccinScan',     maxCount: 1 },
    { name: 'medicationScan', maxCount: 5 },
    { name: 'otherDocuments', maxCount: 5 }
  ]),
  async (req, res) => {
    try {
      const parent    = await Utilisateur.findById(req.session.utilisateurId);
      const files     = req.files || {};
      const dateNaiss = new Date(req.body.dateNaissance);
      const age       = getAge(dateNaiss);
      const categorie = sanitize(req.body.categorie).toLowerCase();

      if (!['louveteau', 'scout', 'guide'].includes(categorie))
        return res.render('enfant-form', { parent, enfant: null, erreur: 'Catégorie invalide.' });

      const ageLimits = { louveteau: [8, 11], scout: [11, 17], guide: [11, 17] };
      const [min, max] = ageLimits[categorie];
      if (age < min || age > max)
        return res.render('enfant-form', { parent, enfant: null,
          erreur: `Âge (${age} ans) non conforme pour ${categorie} (${min}-${max} ans).` });

      const enfant = await Enfant.create({
        parentId: req.session.utilisateurId,
        nom: sanitize(req.body.nom), prenom: sanitize(req.body.prenom),
        dateNaissance: dateNaiss, sexe: req.body.sexe, categorie,
        autreClub: req.body.autreClub === 'on',
        nomAutreClub: sanitize(req.body.nomAutreClub),
        medecinTraitant: sanitize(req.body.medecinTraitant) || parent.medecinTraitant,
        contactUrgence: {
          nom: sanitize(req.body.contactUrgenceNom),
          prenom: sanitize(req.body.contactUrgencePrenom),
          telPortable: sanitize(req.body.contactUrgenceTel),
          sexe: req.body.contactUrgenceSexe, lien: req.body.contactUrgenceLien
        },
        contactUrgenceSecondaire: req.body.contactUrgenceSecondaireNom ? {
          nom: sanitize(req.body.contactUrgenceSecondaireNom),
          prenom: sanitize(req.body.contactUrgenceSecondairePrenom),
          telPortable: sanitize(req.body.contactUrgenceSecondaireTel),
          sexe: req.body.contactUrgenceSecondaireSexe,
          lien: req.body.contactUrgenceSecondaireLien
        } : undefined,
        vaccinsObligatoires: true,
        vaccinsRecommandes: {
          diphtérie: req.body.vaccinDiphterie || 'OK',
          coqueluche: req.body.vaccinCoqueluche || 'OK',
          tétanos: req.body.vaccinTetanos || 'OK',
          haemophilus: req.body.vaccinHaemophilus || 'OK',
          poliomyélite: req.body.vaccinPoliomyelite || 'OK',
          rougeole: req.body.vaccinRougeole || 'OK',
          pneumocoque: req.body.vaccinPneumocoque || 'OK',
          bcg: req.body.vaccinBcg || 'OK',
          autres: sanitize(req.body.vaccinsAutres)
        },
        traitementMedical:     req.body.traitementMedical     === 'on',
        allergiesAlimentaires: req.body.allergiesAlimentaires === 'on',
        allergiesMedicament:   req.body.allergiesMedicament   === 'on',
        allergiesAutres:       req.body.allergiesAutres       === 'on',
        allergiesDetails:      sanitize(req.body.allergiesDetails),
        problemeSante:         req.body.problemeSante         === 'on',
        problemeSanteDetails:  sanitize(req.body.problemeSanteDetails),
        recommandationsParents: sanitize(req.body.recommandationsParents),
        vaccinScan:      files.vaccinScan?.[0]?.filename,
        medicationScan:  files.medicationScan?.[0]?.filename,
        otherDocuments:  files.otherDocuments?.map(f => f.filename) || []
      });

      res.redirect(`/inscrire-enfant/${enfant._id}`);
    } catch (err) {
      console.error('Erreur ajout enfant:', err);
      const parent = await Utilisateur.findById(req.session.utilisateurId);
      res.render('enfant-form', { parent, enfant: null, erreur: 'Erreur serveur.' });
    }
  }
);

app.get('/modifier-enfant/:id', requireAuth, async (req, res) => {
  try {
    const enfant = await Enfant.findOne({ _id: req.params.id, parentId: req.session.utilisateurId });
    if (!enfant) return res.redirect('/espace-parent');
    const parent = await Utilisateur.findById(req.session.utilisateurId);
    res.render('enfant-form', { parent, enfant, erreur: null });
  } catch { res.redirect('/espace-parent'); }
});

app.post('/modifier-enfant/:id',
  requireAuth,
  upload.fields([
    { name: 'vaccinScan',     maxCount: 1 },
    { name: 'medicationScan', maxCount: 5 },
    { name: 'otherDocuments', maxCount: 5 }
  ]),
  async (req, res) => {
    try {
      const enfant = await Enfant.findOne({ _id: req.params.id, parentId: req.session.utilisateurId });
      if (!enfant) return res.redirect('/espace-parent');
      const files = req.files || {};
      Object.assign(enfant, {
        nom: sanitize(req.body.nom), prenom: sanitize(req.body.prenom),
        dateNaissance: new Date(req.body.dateNaissance),
        sexe: req.body.sexe,
        categorie: sanitize(req.body.categorie).toLowerCase(),
        autreClub: req.body.autreClub === 'on',
        nomAutreClub: sanitize(req.body.nomAutreClub),
        medecinTraitant: sanitize(req.body.medecinTraitant),
        contactUrgence: {
          nom: sanitize(req.body.contactUrgenceNom),
          prenom: sanitize(req.body.contactUrgencePrenom),
          telPortable: sanitize(req.body.contactUrgenceTel),
          sexe: req.body.contactUrgenceSexe, lien: req.body.contactUrgenceLien
        },
        contactUrgenceSecondaire: req.body.contactUrgenceSecondaireNom ? {
          nom: sanitize(req.body.contactUrgenceSecondaireNom),
          prenom: sanitize(req.body.contactUrgenceSecondairePrenom),
          telPortable: sanitize(req.body.contactUrgenceSecondaireTel),
          sexe: req.body.contactUrgenceSecondaireSexe,
          lien: req.body.contactUrgenceSecondaireLien
        } : undefined,
        traitementMedical:     req.body.traitementMedical     === 'on',
        allergiesAlimentaires: req.body.allergiesAlimentaires === 'on',
        allergiesMedicament:   req.body.allergiesMedicament   === 'on',
        allergiesAutres:       req.body.allergiesAutres       === 'on',
        allergiesDetails:      sanitize(req.body.allergiesDetails),
        problemeSante:         req.body.problemeSante         === 'on',
        problemeSanteDetails:  sanitize(req.body.problemeSanteDetails),
        recommandationsParents: sanitize(req.body.recommandationsParents)
      });
      if (files.vaccinScan?.[0])        enfant.vaccinScan     = files.vaccinScan[0].filename;
      if (files.medicationScan?.[0])    enfant.medicationScan = files.medicationScan[0].filename;
      if (files.otherDocuments?.length) enfant.otherDocuments = files.otherDocuments.map(f => f.filename);
      await enfant.save();
      res.redirect('/espace-parent');
    } catch (err) {
      console.error('Erreur modification enfant:', err);
      res.redirect('/espace-parent');
    }
  }
);

// ============================================================
// INSCRIPTION ANNUELLE / CAMP
// ============================================================
app.get('/inscrire-enfant/:id', requireAuth, async (req, res) => {
  try {
    const enfant = await Enfant.findOne({ _id: req.params.id, parentId: req.session.utilisateurId });
    if (!enfant) return res.redirect('/espace-parent');

    const parent      = await Utilisateur.findById(req.session.utilisateurId);
    const config      = await getConfig();
    const anneeScoute = config.inscriptionAnneeActive || getAnneeScoute();
    const typeInscription = req.query.type === 'camp' ? 'camp' : 'annee';

    // Vérifie si la fenêtre d'inscription est ouverte
    const now = new Date();
    if (typeInscription === 'annee' && !config.inscriptionOuverte)
      return res.render('erreur', { message: `Les inscriptions pour l'année ${anneeScoute} ne sont pas encore ouvertes.` });
    if (typeInscription === 'camp' && !config.campOuvert)
      return res.render('erreur', { message: `Les inscriptions pour le camp ne sont pas encore ouvertes.` });

    const periodeLabel = typeInscription === 'camp'
      ? (config.campNom || 'Camp')
      : anneeScoute;

    // Cherche une inscription existante (non archivée)
    const existante = await Inscription.findOne({
      enfantId: enfant._id,
      anneeScoute: periodeLabel,
      typeInscription,
      statut: { $ne: 'archivee' }
    }).sort({ version: -1 });

    // Si refusée → on permet de modifier (nouvelle version)
    if (existante && existante.statut === 'refusee') {
      return res.render('inscription-annuelle', {
        enfant, parent, anneeScoute: periodeLabel,
        typeInscription, config,
        inscriptionExistante: existante,
        estModification: true,
        erreur: null
      });
    }

    // Si déjà soumise ou validée → confirmation
    if (existante) {
      return res.render('inscription-confirmee', {
        enfant, inscription: existante, parent
      });
    }

    // Calcul mineur/majeur à la date de remplissage
    const ageAuRemplissage = getAgeAt(enfant.dateNaissance, now);
    const estMajeur        = ageAuRemplissage >= 18;

    res.render('inscription-annuelle', {
      enfant, parent, anneeScoute: periodeLabel,
      typeInscription, config,
      inscriptionExistante: null,
      estModification: false,
      ageAuRemplissage, estMajeur,
      erreur: null
    });
  } catch (err) {
    console.error('Erreur page inscription:', err);
    res.redirect('/espace-parent');
  }
});

app.post('/inscrire-enfant/:id', requireAuth, async (req, res) => {
  try {
    const enfant = await Enfant.findOne({ _id: req.params.id, parentId: req.session.utilisateurId });
    if (!enfant) return res.status(403).json({ success: false, message: 'Accès refusé.' });

    const parent         = await Utilisateur.findById(req.session.utilisateurId);
    const config         = await getConfig();
    const typeInscription = req.body.typeInscription || 'annee';
    const anneeScoute    = req.body.anneeScoute || config.inscriptionAnneeActive || getAnneeScoute();
    const estBrouillon   = req.body.action === 'brouillon';

    if (!req.body.signatureDroitImage && !estBrouillon)
      return res.status(400).json({ success: false, message: 'Signature manquante.' });

    const now              = new Date();
    const ageAuRemplissage = getAgeAt(enfant.dateNaissance, now);
    const estMajeur        = ageAuRemplissage >= 18;

    // Gestion de la version : si inscription refusée existante → nouvelle version
    const ancienne = await Inscription.findOne({
      enfantId: enfant._id, anneeScoute, typeInscription, statut: 'refusee'
    }).sort({ version: -1 });

    const nouvelleVersion = ancienne ? ancienne.version + 1 : 1;
    if (ancienne) {
      ancienne.statut = 'archivee';
      await ancienne.save();
    }

    // Construction des données permis (majeurs uniquement)
    const permisConduire = estMajeur && req.body.permisConduire === 'on' ? {
      possede:    true,
      categories: [].concat(req.body.permisCategories || []),
      numero:     sanitize(req.body.permisNumero)
    } : { possede: false };

    const inscription = await Inscription.create({
      utilisateurId:  req.session.utilisateurId,
      enfantId:       enfant._id,
      anneeScoute,
      typeInscription,
      categorie:      enfant.categorie,
      estMajeur,
      ageAuRemplissage,
      permisConduire,
      droitImage:               req.body.droitImage               === 'on',
      droitDiffusion:           req.body.droitDiffusion           === 'on',
      autorisationTransport:    req.body.autorisationTransport    === 'on',
      autorisationHospitalisation: !estMajeur
        ? req.body.autorisationHospitalisation === 'on'
        : undefined,
      luEtApprouveDroitImageText:  'Lu et approuvé',
      luEtApprouveInscriptionText: 'Lu et approuvé',
      signatureDroitImage:      req.body.signatureDroitImage || null,
      signatureDroitImageDate:  req.body.signatureDroitImage ? now : undefined,
      signatureInscription:     req.body.signatureDroitImage || null,
      signatureInscriptionDate: req.body.signatureDroitImage ? now : undefined,
      signatureSanitaire:       req.body.signatureSanitaire  || null,
      signatureSanitaireDate:   req.body.signatureSanitaire  ? now : undefined,
      lieuInscription: sanitize(req.body.lieuInscription) || 'Cluses',
      cotisation: {
        montant: Number(req.body.montantCotisation) ||
          (typeInscription === 'camp' ? config.cotisationCamp : config.cotisationAnnee) || 20,
        statut:       'en_attente',
        modePaiement: req.body.modePaiement || null
      },
      statut:  estBrouillon ? 'brouillon' : 'soumise',
      version: nouvelleVersion,
      versionPrecedente: ancienne?._id || undefined
    });

    // Génération PDF uniquement si soumise (pas brouillon)
    if (!estBrouillon) {
      const pdfId           = uuidv4();
      const authPdfPath     = path.join(PDF_DIR, `${pdfId}-auth.pdf`);
      const sanitaryPdfPath = path.join(PDF_DIR, `${pdfId}-sanitary.pdf`);
      const data            = buildDataForPdf(parent, enfant, inscription);
      await generateAuthPdf(data, authPdfPath);
      await generateSanitaryPdf(data, sanitaryPdfPath);
      inscription.pdfPath         = `/pdfs/${path.basename(authPdfPath)}`;
      inscription.sanitaryPdfPath = `/pdfs/${path.basename(sanitaryPdfPath)}`;
      await inscription.save();
    }

    res.json({
      success:        true,
      statut:         inscription.statut,
      message:        estBrouillon
        ? 'Brouillon enregistré.'
        : `Inscription de ${enfant.prenom} soumise pour validation !`,
      pdfUrl:         inscription.pdfPath         || null,
      sanitaryPdfUrl: inscription.sanitaryPdfPath || null
    });

  } catch (err) {
    console.error('Erreur inscription annuelle:', err);
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
});

// Historique des versions d'une inscription
app.get('/historique-inscription/:id', requireAuth, async (req, res) => {
  try {
    const inscription = await Inscription.findById(req.params.id);
    if (!inscription) return res.redirect('/espace-parent');

    const enfant = await Enfant.findOne({
      _id: inscription.enfantId, parentId: req.session.utilisateurId
    });
    if (!enfant) return res.redirect('/espace-parent');

    // Remonte toutes les versions précédentes
    const versions = [inscription];
    let current = inscription;
    while (current.versionPrecedente) {
      current = await Inscription.findById(current.versionPrecedente);
      if (!current) break;
      versions.push(current);
    }

    res.render('historique-inscription', { enfant, versions });
  } catch (err) {
    res.redirect('/espace-parent');
  }
});

// ============================================================
// ESPACE ENCADRANT
// ============================================================
app.get('/espace-encadrant', requireEncadrant, async (req, res) => {
  try {
    const utilisateur = await Utilisateur.findById(req.session.utilisateurId);
    const config      = await getConfig();
    const anneeScoute = config.inscriptionAnneeActive || getAnneeScoute();
    const categories  = utilisateur.encadrant?.categories || [];

    const inscriptions = await Inscription.find({
      categorie: { $in: categories }, anneeScoute,
      statut: { $in: ['soumise', 'validee'] }
    }).populate('utilisateurId').populate('enfantId').lean();

    const inscritsParCategorie = {};
    categories.forEach(cat => {
      inscritsParCategorie[cat] = inscriptions
        .filter(i => i.categorie === cat)
        .map(i => buildDataForPdf(i.utilisateurId, i.enfantId, i));
    });

    res.render('espace-encadrant', {
      encadrant: utilisateur, inscritsParCategorie, anneeScoute,
      statut: utilisateur.encadrant?.statut || 'en_attente'
    });
  } catch (err) {
    res.status(500).render('erreur', { message: 'Erreur lors du chargement.' });
  }
});

// ============================================================
// ESPACE ADMIN
// ============================================================
app.get('/admin', requireAdmin, async (req, res) => {
  try {
    const config      = await getConfig();
    const anneeScoute = config.inscriptionAnneeActive || getAnneeScoute();
    const encadrants  = await Utilisateur.find({ roles: 'encadrant' }).lean();

    const statsInscrits = await Inscription.aggregate([
      { $match: { anneeScoute, statut: { $in: ['soumise', 'validee'] } } },
      { $group: { _id: '$categorie', total: { $sum: 1 } } }
    ]);
    const stats = { louveteau: 0, scout: 0, guide: 0 };
    statsInscrits.forEach(s => { stats[s._id] = s.total; });

    // Formulaires en attente de validation
    const enAttente = await Inscription.find({ statut: 'soumise' })
      .populate('utilisateurId').populate('enfantId')
      .sort({ dateInscription: 1 }).lean();

    res.render('admin', { encadrants, stats, anneeScoute, config, enAttente });
  } catch (err) {
    res.status(500).render('erreur', { message: 'Erreur lors du chargement.' });
  }
});

// Valider / refuser un formulaire
app.post('/admin/inscription/:id/valider', requireAdmin, async (req, res) => {
  try {
    const { action, commentaire } = req.body; // action: 'valider' | 'refuser'
    if (!['valider', 'refuser'].includes(action))
      return res.status(400).json({ success: false, message: 'Action invalide.' });

    const inscription = await Inscription.findById(req.params.id);
    if (!inscription)
      return res.status(404).json({ success: false, message: 'Inscription introuvable.' });

    inscription.statut           = action === 'valider' ? 'validee' : 'refusee';
    inscription.commentaireAdmin = sanitize(commentaire || '');
    inscription.dateValidation   = new Date();
    inscription.validePar        = req.session.utilisateurId;
    await inscription.save();

    res.json({ success: true, statut: inscription.statut });
  } catch (err) {
    console.error('Erreur validation inscription:', err);
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
});

// Liste des inscrits par catégorie
app.get('/admin/inscrits/:categorie(scouts|guides|louveteaux)', requireAdmin, async (req, res) => {
  try {
    const categorieMap = { scouts: 'scout', guides: 'guide', louveteaux: 'louveteau' };
    const categorie    = categorieMap[req.params.categorie];
    const config       = await getConfig();
    const anneeScoute  = config.inscriptionAnneeActive || getAnneeScoute();

    const inscriptions = await Inscription.find({ categorie, anneeScoute,
      statut: { $in: ['soumise', 'validee', 'refusee'] } })
      .populate('utilisateurId').populate('enfantId')
      .sort({ dateInscription: 1 }).lean();

    res.render('list', {
      titre:        req.params.categorie.charAt(0).toUpperCase() + req.params.categorie.slice(1),
      inscriptions: inscriptions.map(i => ({
        ...buildDataForPdf(i.utilisateurId, i.enfantId, i),
        statut: i.statut,
        commentaireAdmin: i.commentaireAdmin
      })),
      anneeScoute, isAdmin: true
    });
  } catch (err) {
    res.status(500).render('erreur', { message: 'Erreur lors du chargement de la liste.' });
  }
});

// Configuration fenêtre d'inscription
app.post('/admin/config', requireAdmin, async (req, res) => {
  try {
    const config = await getConfig();
    Object.assign(config, {
      inscriptionOuverte:     req.body.inscriptionOuverte     === 'on',
      inscriptionAnneeActive: sanitize(req.body.inscriptionAnneeActive),
      inscriptionDebutDate:   req.body.inscriptionDebutDate   ? new Date(req.body.inscriptionDebutDate) : null,
      inscriptionFinDate:     req.body.inscriptionFinDate     ? new Date(req.body.inscriptionFinDate)   : null,
      campOuvert:             req.body.campOuvert             === 'on',
      campNom:                sanitize(req.body.campNom),
      campDebutDate:          req.body.campDebutDate          ? new Date(req.body.campDebutDate)        : null,
      campFinDate:            req.body.campFinDate            ? new Date(req.body.campFinDate)          : null,
      cotisationAnnee:        Number(req.body.cotisationAnnee) || 20,
      cotisationCamp:         Number(req.body.cotisationCamp)  || 50
    });
    await config.save();
    res.json({ success: true });
  } catch (err) {
    console.error('Erreur config:', err);
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
});

// Validation encadrant
app.post('/admin/encadrant/:id/statut', requireAdmin, async (req, res) => {
  try {
    const { statut, noteAdmin } = req.body;
    if (!['valide', 'refuse'].includes(statut))
      return res.status(400).json({ success: false, message: 'Statut invalide.' });
    await Utilisateur.findByIdAndUpdate(req.params.id, {
      'encadrant.statut':         statut,
      'encadrant.dateValidation': new Date(),
      'encadrant.noteAdmin':      sanitize(noteAdmin)
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
});

app.get('/admin/encadrant/:id', requireAdmin, async (req, res) => {
  try {
    const encadrant = await Utilisateur.findById(req.params.id);
    if (!encadrant) return res.redirect('/admin');
    res.render('admin-encadrant', { encadrant });
  } catch { res.redirect('/admin'); }
});

// ============================================================
// UTILITAIRE PDF
// ============================================================
function buildDataForPdf(parent, enfant, inscription) {
  return {
    nom: enfant.nom, prenom: enfant.prenom,
    dateNaissance: enfant.dateNaissance,
    sexe: enfant.sexe, age: getAge(enfant.dateNaissance),
    ageAuRemplissage: inscription.ageAuRemplissage,
    estMajeur: inscription.estMajeur,
    categorie: inscription.categorie,
    typeInscription: inscription.typeInscription,
    adresse:    enfant.adresse    || parent.adresse,
    ville:      enfant.ville      || parent.ville,
    codePostal: enfant.codePostal || parent.codePostal,
    contactUrgence:           enfant.contactUrgence,
    contactUrgenceSecondaire: enfant.contactUrgenceSecondaire,
    autreClub: enfant.autreClub, nomAutreClub: enfant.nomAutreClub,
    parentNomPrenom: `${parent.prenom} ${parent.nom}`,
    parentAdresse: parent.adresse, parentEmail: parent.email,
    telPortable: parent.telPortable, telDomicile: parent.telDomicile,
    responsable2: parent.responsable2,
    medecinTraitant: enfant.medecinTraitant || parent.medecinTraitant,
    vaccinsObligatoires:    enfant.vaccinsObligatoires,
    vaccinsRecommandes:     enfant.vaccinsRecommandes,
    traitementMedical:      enfant.traitementMedical,
    allergiesAlimentaires:  enfant.allergiesAlimentaires,
    allergiesMedicament:    enfant.allergiesMedicament,
    allergiesAutres:        enfant.allergiesAutres,
    allergiesDetails:       enfant.allergiesDetails,
    problemeSante:          enfant.problemeSante,
    problemeSanteDetails:   enfant.problemeSanteDetails,
    recommandationsParents: enfant.recommandationsParents,
    droitImage:              inscription.droitImage,
    droitDiffusion:          inscription.droitDiffusion,
    autorisationTransport:   inscription.autorisationTransport,
    autorisationHospitalisation: inscription.autorisationHospitalisation,
    permisConduire:          inscription.permisConduire,
    signatureDroitImage:     inscription.signatureDroitImage,
    signatureSanitaire:      inscription.signatureSanitaire,
    lieuInscription:         inscription.lieuInscription,
    anneeScoute:             inscription.anneeScoute,
    dateInscription:         inscription.dateInscription,
    cotisation:              inscription.cotisation,
    statut:                  inscription.statut,
    commentaireAdmin:        inscription.commentaireAdmin,
    version:                 inscription.version,
    pdfPath:         inscription.pdfPath,
    sanitaryPdfPath: inscription.sanitaryPdfPath,
    vaccinScan:      enfant.vaccinScan,
    medicationScan:  enfant.medicationScan,
    otherDocuments:  enfant.otherDocuments
  };
}

// ============================================================
// GÉNÉRATION PDF
// ============================================================
async function generateAuthPdf(data, outputPath) {
  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ margin: 50, size: 'A4' });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);
    const logoPath = path.join(__dirname, 'public', 'images', 'logo-scouts.png');
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 50, 30, { width: 60 });
      doc.image(logoPath, 480, 30, { width: 60 });
    }
    const titre = data.typeInscription === 'camp'
      ? `AUTORISATION — CAMP ${data.anneeScoute}`
      : "AUTORISATION DE DROIT À L'IMAGE ET DE TRANSPORT";
    doc.fontSize(16).text(titre, 0, 110, { align: 'center' });
    doc.fontSize(12).text(`Année scoute : ${data.anneeScoute}`, { align: 'center' }).moveDown(2);
    doc.fontSize(14).text("IDENTITÉ", { underline: true });
    doc.fontSize(12)
      .text(`${data.prenom} ${data.nom} — né(e) le ${moment(data.dateNaissance).format('DD/MM/YYYY')} (${data.ageAuRemplissage} ans)`)
      .text(`Statut : ${data.estMajeur ? 'Majeur(e)' : 'Mineur(e)'}`)
      .text(`Catégorie : ${data.categorie}`)
      .moveDown();
    doc.fontSize(14).text('REPRÉSENTANT LÉGAL', { underline: true });
    doc.fontSize(12)
      .text(`${data.parentNomPrenom} — Tél : ${data.telPortable}`)
      .text(`Email : ${data.parentEmail}`)
      .moveDown();
    doc.fontSize(14).text("AUTORISATIONS", { underline: true });
    doc.fontSize(11)
      .text(`Droit à l'image : ${data.droitImage ? '✓ Autorisé' : '✗ Refusé'}`)
      .text(`Transport : ${data.autorisationTransport ? '✓ Autorisé' : '✗ Refusé'}`);
    if (!data.estMajeur) {
      doc.text(`Hospitalisation : ${data.autorisationHospitalisation ? '✓ Autorisé' : '✗ Refusé'}`);
    }
    if (data.estMajeur && data.permisConduire?.possede) {
      doc.fontSize(14).moveDown().text('PERMIS DE CONDUIRE', { underline: true });
      doc.fontSize(11)
        .text(`Catégories : ${data.permisConduire.categories?.join(', ') || 'Non précisé'}`)
        .text(`N° : ${data.permisConduire.numero || 'Non précisé'}`);
    }
    doc.moveDown(3);
    if (data.signatureDroitImage) {
      try {
        const imgData = data.signatureDroitImage.replace(/^data:image\/\w+;base64,/, '');
        doc.image(Buffer.from(imgData, 'base64'), 70, doc.y, { width: 180 });
      } catch {}
    }
    const sigY = doc.y + 10;
    doc.fontSize(10)
      .text(`Fait à : ${data.lieuInscription}`, 70, sigY)
      .text(`Le : ${moment(data.dateInscription).format('DD/MM/YYYY')}`, 70, sigY + 15);
    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

async function generateSanitaryPdf(data, outputPath) {
  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ margin: 50, size: 'A4' });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);
    doc.fontSize(18).text('FICHE SANITAIRE DE LIAISON', 0, 80, { align: 'center' });
    doc.fontSize(12).text(`${data.anneeScoute} — ${data.typeInscription === 'camp' ? 'Camp' : 'Année'}`, { align: 'center' }).moveDown(2);
    doc.fontSize(14).text('ENFANT', { underline: true });
    doc.fontSize(12)
      .text(`${data.prenom} ${data.nom} — né(e) le ${moment(data.dateNaissance).format('DD/MM/YYYY')} (${data.ageAuRemplissage} ans)`)
      .text(`Statut : ${data.estMajeur ? 'Majeur(e)' : 'Mineur(e)'} — Catégorie : ${data.categorie}`)
      .moveDown();
    doc.fontSize(14).text('RESPONSABLE', { underline: true });
    doc.fontSize(12)
      .text(`${data.parentNomPrenom} — Tél : ${data.telPortable}`)
      .text(`Médecin traitant : ${data.medecinTraitant || 'Non renseigné'}`)
      .moveDown();
    doc.fontSize(14).text('CONTACT URGENCE', { underline: true });
    if (data.contactUrgence) {
      doc.fontSize(12).text(
        `${data.contactUrgence.prenom} ${data.contactUrgence.nom} — ${data.contactUrgence.lien} — Tél : ${data.contactUrgence.telPortable}`
      );
    }
    doc.moveDown();
    doc.fontSize(14).text('SANTÉ', { underline: true });
    doc.fontSize(11)
      .text(`Traitement en cours : ${data.traitementMedical ? 'Oui' : 'Non'}`)
      .text(`Allergies alimentaires : ${data.allergiesAlimentaires ? 'Oui' : 'Non'}`)
      .text(`Allergies médicaments : ${data.allergiesMedicament ? 'Oui' : 'Non'}`)
      .text(data.allergiesDetails ? `Détails : ${data.allergiesDetails}` : '')
      .text(`Problème de santé : ${data.problemeSante ? `Oui — ${data.problemeSanteDetails || ''}` : 'Non'}`)
      .text(data.recommandationsParents ? `Recommandations : ${data.recommandationsParents}` : '')
      .moveDown(2);
    if (data.signatureSanitaire) {
      try {
        const imgData = data.signatureSanitaire.replace(/^data:image\/\w+;base64,/, '');
        doc.image(Buffer.from(imgData, 'base64'), 70, doc.y, { width: 180 });
      } catch {}
    }
    const sigY = doc.y + 10;
    doc.fontSize(10)
      .text(`Fait à : ${data.lieuInscription}`, 70, sigY)
      .text(`Le : ${moment(data.dateInscription).format('DD/MM/YYYY')}`, 70, sigY + 15);
    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

// ============================================================
// ERREURS
// ============================================================
app.use((req, res) => res.status(404).render('erreur', { message: 'Page introuvable.' }));
app.use((err, req, res, next) => {
  console.error('Erreur non gérée:', err);
  if (err.code === 'LIMIT_FILE_SIZE')
    return res.status(400).json({ success: false, message: 'Fichier trop volumineux (max 10 Mo).' });
  res.status(500).render('erreur', { message: 'Erreur serveur inattendue.' });
});

// ============================================================
// LANCEMENT
// ============================================================
app.listen(PORT, () => console.log(`🚀 Serveur sur http://localhost:${PORT}`));
