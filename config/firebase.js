// config/firebase.js
const admin = require('firebase-admin');

if (!admin.apps.length) {
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
}

const db = admin.firestore();

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

module.exports = { admin, db, createRootUser };
