const express = require('express');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');
const multer = require('multer');


admin.initializeApp({
  credential: admin.credential.cert({
    type: process.env.FIREBASE_TYPE,
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: process.env.FIREBASE_AUTH_URI,
    token_uri: process.env.FIREBASE_TOKEN_URI,
    auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
    client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL
  })
});

const db = admin.firestore();
const app = express();

app.use(bodyParser.urlencoded({ extended: false }));
app.set('view engine', 'ejs');
app.use(express.static('public'));

app.get('/', (req, res) => res.render('welcome'));
app.get('/login', (req, res) => res.render('login'));
app.get('/register', (req, res) => res.render('register'));
const session = require('express-session');

app.use(session({
  secret: 'chave-super-secreta',
  resave: false,
  saveUninitialized: false
}));

async function createRootUser() {
  const email = 'root@system.local';
  const password = 'Root123!';
  const uid = 'root-bootstrap-user';

  try {
    let user;
    try {
      user = await admin.auth().getUserByEmail(email);
      console.log('Root user already exists.');
    } catch {
      user = await admin.auth().createUser({
        uid,
        email,
        password,
        displayName: 'System Root',
      });
      console.log('Root user created.');
    }

    const userRef = db.collection('users').doc(user.uid);
    const doc = await userRef.get();

    if (!doc.exists) {
      await userRef.set({
        username: 'root',
        email,
        name: 'System Root',
        telephone: '+351000000000',
        profile: 'Privado',
        occupation: 'Admin',
        workplace: 'System',
        address: 'N/A',
        postal_code: '0000-000',
        nif: '000000000',
        photo: null,
        role: 'ADMIN',
        status: 'ATIVADA',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log('Root user profile initialized.');
    }
  } catch (error) {
    console.error('Error creating root user:', error.message);
  }
}


// Password validation helper (basic example)
function isValidPassword(pwd) {
  return pwd.length >= 8 && /[A-Za-z]/.test(pwd) && /\d/.test(pwd);
}

// POST /register
app.post('/register', async (req, res) => {
  const usersSnapshot = await db.collection('users').get();
  const filteredUsers = usersSnapshot.docs.filter(doc => doc.data().username !== 'root');

  if (filteredUsers.length >= 4) {
    return res.status(400).json({ error: 'Limite de 4 contas atingido.' });
  }

  const {
    username,
    email,
    name,
    telephone,
    password,
    confirmPassword,
    profile,
    occupation,
    workplace,
    address,
    postal_code,
    nif,
    photo
  } = req.body;

  // 1. Validate required fields
  if (!username || !email || !name || !telephone || !password || !confirmPassword) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  // 2. Password match and validation
  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'Passwords do not match.' });
  }

  if (!isValidPassword(password)) {
    return res.status(400).json({ error: 'Password must be at least 8 characters, include a number and a letter.' });
  }

  try {
    // 3. Create Firebase Auth user
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: name,
    });

    // 4. Add user profile to Firestore
    await db.collection('users').doc(userRecord.uid).set({
      username,
      email,
      name,
      telephone,
      profile: profile || null,
      occupation: occupation || null,
      workplace: workplace || null,
      address: address || null,
      postal_code: postal_code || null,
      nif: nif || null,
      photo: photo || null,
      role: 'ENDUSER',          // default
      status: 'DESATIVADA',     // new accounts are inactive
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(201).json({ message: 'User registered successfully. Await activation.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

//Login
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  const API_KEY = process.env.API_KEY; // Web API Key do Firebase

  try {
    // 1. Verifica as credenciais com Firebase Auth REST API
    const response = await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
      {
        email,
        password,
        returnSecureToken: true
      }
    );

    const { localId: uid } = response.data;

    // 2. Vai buscar o perfil no Firestore
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) return res.status(401).send('User profile not found.');

    const userData = userDoc.data();
    if (userData.status !== 'ATIVADA') return res.status(403).send('Account not active.');

    // 3. Criar token de sessão
    const now = new Date();
    const expires = new Date(now.getTime() + 30 * 60 * 1000); // +30 minutos
    const verificador = crypto.randomBytes(16).toString('hex');

    const sessionToken = {
      USER: userData.email,
      ROLE: userData.role,
      VALIDITY: {
        VALID_FROM: now.toISOString(),
        VALID_TO: expires.toISOString(),
        VERIF: verificador
      }
    };

    // 4. Guardar sessão
    req.session.user = {
      uid,
      email: userData.email,
      name: userData.name,
      role: userData.role,
      username: userData.username,
      token: sessionToken
    };

    // 5. Redirecionar para /profile ou /welcome
    res.redirect('/profile');

  } catch (error) {
    const message = error.response?.data?.error?.message || error.message;
    res.status(401).send('Login failed: ' + message);
  }
});

//Profile
app.get('/profile', async (req, res) => {
  const currentUser = req.session.user;
  if (!currentUser) return res.redirect('/login');

  try {
    const currentUserDoc = await db.collection('users').doc(currentUser.uid).get();
    const currentUserData = applyDefaults(currentUserDoc.data());

    const allUsers = new Map();
    allUsers.set(currentUser.uid, { uid: currentUser.uid, ...currentUserData });

    const snapshot = await db.collection('users').get();

    snapshot.forEach(doc => {
      const user = { uid: doc.id, ...doc.data() };

      const canSee =
        currentUser.role === 'ADMIN' ||
        (currentUser.role === 'BACKOFFICE' && ['ENDUSER', 'PARTNER'].includes(user.role)) ||
        (currentUser.role === 'ENDUSER' &&
          user.uid === currentUser.uid) || // self always included
        (currentUser.role === 'ENDUSER' &&
          user.role === 'ENDUSER' &&
          user.status === 'ATIVADA' &&
          user.profile === 'Público');

      if (canSee && !allUsers.has(user.uid)) {
        allUsers.set(user.uid, applyDefaults(user));
      }
    });

    // Determine selected user
    const selectedUserId = req.query.editUserId || currentUser.uid;
    const selectedUser = allUsers.get(selectedUserId) || currentUserData;

    res.render('profile', {
      currentUser,
      selectedUser,
      users: Array.from(allUsers.values())
    });

  } catch (err) {
    console.error('Erro ao carregar perfil:', err);
    res.status(500).send('Erro ao carregar perfil: ' + err.message);
  }
});

/*app.get('/profile', async (req, res) => {
  const currentUser = req.session.user;

  if (!currentUser) return res.redirect('/login');

  try {
    const currentUserDoc = await db.collection('users').doc(currentUser.uid).get();
    const currentUserData = currentUserDoc.data();

    let allUsers = [];
    let selectedUser = currentUserData;

    const snapshot = await db.collection('users').get();

    snapshot.forEach(doc => {
      const user = { uid: doc.id, ...doc.data() };

      const canSee =
        currentUser.role === 'ADMIN' ||
        (currentUser.role === 'BACKOFFICE' && user.role === 'ENDUSER') ||
        (currentUser.role === 'ENDUSER' &&
          user.role === 'ENDUSER' &&
          user.status === 'ATIVADA' &&
          user.profile === 'Público');

      if (canSee) {
        allUsers.push(applyDefaults(user));
      }
    });

    // Se existir query param "editUserId", tenta obter esse utilizador como selecionado
    const editUserId = req.query.editUserId;
    if (editUserId) {
      const selectedDoc = await db.collection('users').doc(editUserId).get();
      if (selectedDoc.exists) {
        selectedUser = applyDefaults({ uid: selectedDoc.id, ...selectedDoc.data() });
      }
    }

    res.render('profile', {
      user: currentUserData,
      currentUser,
      users: allUsers,
      selectedUser
    });

  } catch (err) {
    console.error('Erro ao carregar perfil:', err);
    res.status(500).send('Erro ao carregar perfil: ' + err.message);
  }
});*/


// Função para preencher "NOT DEFINED" em atributos em falta
function applyDefaults(user) {
  const defaults = [
    'username', 'email', 'name', 'telephone',
    'profile', 'occupation', 'workplace', 'address',
    'postal_code', 'nif', 'status', 'role'
  ];

  for (const key of defaults) {
    if (!user[key]) {
      user[key] = "NOT DEFINED";
    }
  }

  return user;
}


//Change roles
app.post('/change-role/:uid', async (req, res) => {
  const { uid } = req.params;
  const { newRole } = req.body;
  const currentUser = req.session.user;

  try {
    const targetDoc = await db.collection('users').doc(uid).get();
    if (!targetDoc.exists) return res.status(404).send("Utilizador não encontrado.");

    const targetUser = targetDoc.data();
    const currentRole = currentUser.role;
    const targetRole = targetUser.role;

    let canChange = false;

    if (currentRole === 'ADMIN') {
      canChange = true; // ADMIN pode tudo
    } else if (currentRole === 'BACKOFFICE') {
      const validChanges = (
        (targetRole === 'ENDUSER' && newRole === 'PARTNER') ||
        (targetRole === 'PARTNER' && newRole === 'ENDUSER')
      );
      canChange = validChanges;
    } else {
      canChange = false; // BACKOFFICE e ENDUSER não podem
    }

    if (!canChange) {
      return res.status(403).send("Sem permissão para alterar este role.");
    }

    await db.collection('users').doc(uid).update({ role: newRole });
    res.redirect('/profile');
    
  } catch (error) {
    res.status(500).send("Erro ao alterar role: " + error.message);
  }
});


//Logout
app.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Erro ao terminar sessão:', err);
      return res.status(500).send('Erro ao terminar sessão.');
    }
    console.log('Sessão destruída com sucesso');
    res.redirect('/logout-success');
  });
});

app.get('/logout-success', (req, res) => {
    res.render('logout-success');
});



//Change status
app.post('/change-status/:uid', async (req, res) => {
  const { uid } = req.params;
  const currentUser = req.session.user;

  try {
    const targetDoc = await db.collection('users').doc(uid).get();
    if (!targetDoc.exists) return res.status(404).send("Utilizador não encontrado.");

    const targetUser = targetDoc.data();

    const currentRole = currentUser.role;

    // Permissões segundo OP4
    const canChange =
      currentRole === 'ADMIN' ||
      currentRole === 'BACKOFFICE'; // OP4: pode mudar qualquer conta entre ATIVADA e DESATIVADA

    if (!canChange) {
      return res.status(403).send("Sem permissão para alterar o estado desta conta.");
    }

    // Alternar entre ATIVADA e DESATIVADA
    const newStatus = targetUser.status === 'ATIVADA' ? 'DESATIVADA' : 'ATIVADA';
    await db.collection('users').doc(uid).update({ status: newStatus });

    res.redirect('/profile');
  } catch (error) {
    res.status(500).send("Erro ao mudar estado da conta: " + error.message);
  }
});



//Remove users
app.post('/delete-user/:uid', async (req, res) => {
  const currentUser = req.session.user;
  const targetUid = req.params.uid;

  if (!currentUser) return res.status(401).send('Não autenticado.');

  try {
    const targetDoc = await db.collection('users').doc(targetUid).get();
    if (!targetDoc.exists) return res.status(404).send("Utilizador não encontrado.");

    const targetUser = targetDoc.data();
    const isSelf = currentUser.uid === targetUid;

    let canDelete = false;

    if (currentUser.role === 'ADMIN') {
      canDelete = true;
    } else if (
      currentUser.role === 'BACKOFFICE' &&
      (targetUser.role === 'ENDUSER' || targetUser.role === 'PARTNER')
    ) {
      canDelete = true;
    }

    if (!canDelete) {
      return res.status(403).send("Sem permissão para remover este utilizador.");
    }

    // Eliminar do Firebase Auth e Firestore
    await admin.auth().deleteUser(targetUid);
    await db.collection('users').doc(targetUid).delete();

    if (isSelf) {
      req.session.destroy((err) => {
        if (err) return res.status(500).send('Conta removida, mas falha ao terminar sessão.');
        return res.redirect('/logout-success');
      });
    } else {
      res.redirect('/profile');
    }

  } catch (err) {
    console.error("Erro ao remover utilizador:", err);
    res.status(500).send("Erro ao remover utilizador: " + err.message);
  }
});

//Change password 
app.post('/change-password', async (req, res) => {
  const currentUser = req.session.user;
  const { currentPassword, newPassword, confirmPassword } = req.body;
  const API_KEY = process.env.API_KEY;

  if (!currentUser) {
    return res.status(401).send("Não autenticado.");
  }

  if (!currentPassword || !newPassword || !confirmPassword) {
    return res.status(400).send("Todos os campos são obrigatórios.");
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).send("A nova password e a confirmação não coincidem.");
  }

  try {
    // Reautenticar o utilizador com a password atual (usando Firebase Auth REST API)
    const axios = require('axios');

    const authRes = await axios.post(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
      email: currentUser.email,
      password: currentPassword,
      returnSecureToken: true
    });

    const idToken = authRes.data.idToken;

    // Se a password estiver correta, altera
    await axios.post(`https://identitytoolkit.googleapis.com/v1/accounts:update?key=${API_KEY}`, {
      idToken,
      password: newPassword,
      returnSecureToken: false
    });

    res.send("Password alterada com sucesso.");
  } catch (err) {
    console.error("Erro ao mudar a password:", err.response?.data || err.message);
    res.status(401).send("Password atual incorreta ou erro ao mudar a password.");
  }
});

// Editar informação de utilizadores
app.post('/edit-user/:uid', async (req, res) => {
  const { uid } = req.params;
  const currentUser = req.session.user;
  const updates = req.body;

  if (!currentUser) return res.redirect('/login');

  try {
    const targetDoc = await db.collection('users').doc(uid).get();
    if (!targetDoc.exists) return res.status(404).send("Utilizador não encontrado.");

    const targetUser = targetDoc.data();
    const isSelf = currentUser.uid === uid;
    const targetRole = targetUser.role;
    const targetStatus = targetUser.status;

    let allowedFields = [];

    // ADMIN pode editar tudo de qualquer conta
    if (currentUser.role === 'ADMIN') {
      allowedFields = Object.keys(updates);

    // BACKOFFICE a editar a própria conta (iguais a ENDUSER)
    } else if (isSelf && ['ENDUSER', 'BACKOFFICE'].includes(currentUser.role)) {
      allowedFields = Object.keys(updates).filter(
        key => !['username', 'email', 'name', 'role', 'status'].includes(key)
      );

    // BACKOFFICE a editar outros (ENDUSER ou PARTNER com conta ativada)
    } else if (currentUser.role === 'BACKOFFICE' && ['ENDUSER', 'PARTNER'].includes(targetRole)) {
      if (targetStatus !== 'ATIVADA') {
        return res.status(403).send("Só pode editar contas ATIVADAS.");
      }
      allowedFields = Object.keys(updates).filter(
        key => !['username', 'email'].includes(key)
      );

    // ENDUSER a editar a própria conta
    } else if (currentUser.role === 'ENDUSER' && isSelf) {
      allowedFields = Object.keys(updates).filter(
        key => !['username', 'email', 'name', 'role', 'status'].includes(key)
      );

    } else {
      return res.status(403).send("Sem permissão para editar este utilizador.");
    }

    const filteredUpdates = {};
    for (const key of allowedFields) {
      if (updates[key] !== undefined) {
        filteredUpdates[key] = updates[key];
      }
    }

    if (Object.keys(filteredUpdates).length === 0) {
      return res.status(400).send("Nenhum campo autorizado para atualização.");
    }

    await db.collection('users').doc(uid).update(filteredUpdates);
    res.redirect(`/profile?editUserId=${uid}`);
  } catch (err) {
    console.error("Erro ao editar utilizador:", err);
    res.status(500).send("Erro ao atualizar atributos: " + err.message);
  }
});


/* WORKSHEETS */

// Middleware para autorizar roles
function authorizeRoles(roles) {
  return (req, res, next) => {
    const user = req.session.user;  
    if (!user) return res.redirect('/login'); // não autenticado
    if (!roles.includes(user.role)) return res.status(403).send("Sem permissão");
    next();
  };
}


app.get("/worksheets", authorizeRoles(["BACKOFFICE", "ADMIN"]), async (req, res) => {
  try {
    const snapshot = await db.collection("worksheets").orderBy("createdAt", "desc").get();
    const worksheets = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Passa também o utilizador logado
    res.render("worksheets", { 
      worksheets, 
      currentUser: req.session.user || null 
    });
  } catch (err) {
    console.error("Erro ao buscar worksheets:", err);
    res.status(500).send("Erro interno ao carregar worksheets");
  }
});


// Configuração do multer para ficheiros em memória
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// --- Formulário de importação ---
app.get("/worksheets/import", authorizeRoles(["BACKOFFICE","ADMIN"]), (req, res) => {
  res.render("worksheets-import", { currentUser: req.session.user, error: null });
});

app.post("/worksheets/import", authorizeRoles(["BACKOFFICE","ADMIN"]), upload.single("geojson"), async (req, res) => {
  try {
    if (!req.file) throw new Error("Ficheiro GeoJSON não enviado.");

    const geojson = JSON.parse(req.file.buffer.toString("utf8"));

    // --- Validação mínima ---
    if (!geojson.metadata) throw new Error("Ficheiro sem 'metadata'.");
    if (!Array.isArray(geojson.features)) throw new Error("Ficheiro sem 'features'.");

    const ops = geojson.metadata.operations || [];
    if (ops.length > 5) throw new Error("Número de operações maior que 5.");

    // --- Prevenir duplicados ---
    const docId = String(geojson.metadata.id || "");
    const ref = docId ? db.collection("worksheets").doc(docId) : db.collection("worksheets").doc();

    if (docId) {
      const existing = await ref.get();
      if (existing.exists) {
        return res.render("worksheets-import", { currentUser: req.session.user, error: `Worksheet com id ${docId} já existe.` });
      }
    }

    // --- Documento principal (sem features) ---
    await ref.set({
      op_code: "IMP-FO",
      operacao: "IMPORTAÇÃO de uma folha de obra",
      descricao: "Importação de GeoJSON com uma folha de obra",
      ref_recom: "MH",
      metadata: geojson.metadata,
      crs: geojson.crs || null,
      createdAt: new Date(),
      createdBy: req.session.user.uid,
      createdByRole: req.session.user.role
    });

    // --- Guardar features em subcoleção ---
    const batch = db.batch();
    geojson.features.forEach((f, idx) => {
      const fRef = ref.collection("features").doc(String(idx));
      batch.set(fRef, f);
    });
    await batch.commit();

    return res.redirect("/worksheets?imported=1");
  } catch (err) {
    console.error("Erro ao importar worksheet:", err);
    res.render("worksheets-import", { currentUser: req.session.user, error: err.message });
  }
});




createRootUser();
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
