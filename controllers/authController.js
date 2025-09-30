// controllers/authController.js
const axios = require('axios');
const crypto = require('crypto');
const { admin, db } = require('../config/firebase');
const isValidPassword = (pwd) => pwd && pwd.length >= 8 && /[A-Za-z]/.test(pwd) && /\d/.test(pwd);

exports.showLogin = (req, res) => res.render('login');
exports.showRegister = (req, res) => res.render('register');
exports.logoutSuccess = (req, res) => res.render('logout-success');

exports.register = async (req, res) => {
  try {
    const usersSnapshot = await db.collection('users').get();
    const filteredUsers = usersSnapshot.docs.filter(doc => doc.data().username !== 'root');

    if (filteredUsers.length >= 4) {
      return res.status(400).json({ error: 'Limite de 4 contas atingido.' });
    }

    const {
      username, email, name, telephone,
      password, confirmPassword, profile,
      occupation, workplace, address, postal_code, nif, photo
    } = req.body;

    if (!username || !email || !name || !telephone || !password || !confirmPassword) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }

    if (!isValidPassword(password)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters, include a number and a letter.' });
    }

    const userRecord = await admin.auth().createUser({ email, password, displayName: name });

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
      role: 'ENDUSER',
      status: 'DESATIVADA',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(201).json({ message: 'User registered successfully. Await activation.' });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  const API_KEY = process.env.API_KEY;

  try {
    const response = await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
      { email, password, returnSecureToken: true }
    );

    const { localId: uid } = response.data;
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) return res.status(401).send('User profile not found.');

    const userData = userDoc.data();
    if (userData.status !== 'ATIVADA') return res.status(403).send('Account not active.');

    const now = new Date();
    const expires = new Date(now.getTime() + 30 * 60 * 1000);
    const verificador = crypto.randomBytes(16).toString('hex');

    const sessionToken = {
      USER: userData.email,
      ROLE: userData.role,
      VALIDITY: { VALID_FROM: now.toISOString(), VALID_TO: expires.toISOString(), VERIF: verificador }
    };

    req.session.user = {
      uid,
      email: userData.email,
      name: userData.name,
      role: userData.role,
      username: userData.username,
      token: sessionToken
    };

    res.redirect('/profile');
  } catch (error) {
    console.error('Login error:', error.response?.data || error.message);
    // keep behavior from original file
    res.render('login-error');
  }
};

exports.logout = (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Erro ao terminar sessão:', err);
      return res.status(500).send('Erro ao terminar sessão.');
    }
    res.redirect('/logout-success');
  });
};

exports.changePassword = async (req, res) => {
  const currentUser = req.session.user;
  const { currentPassword, newPassword, confirmPassword } = req.body;
  const API_KEY = process.env.API_KEY;

  if (!currentUser) return res.status(401).send("Não autenticado.");
  if (!currentPassword || !newPassword || !confirmPassword) return res.status(400).send("Todos os campos são obrigatórios.");
  if (newPassword !== confirmPassword) return res.status(400).send("A nova password e a confirmação não coincidem.");

  try {
    const authRes = await axios.post(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
      email: currentUser.email,
      password: currentPassword,
      returnSecureToken: true
    });

    const idToken = authRes.data.idToken;
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
};
