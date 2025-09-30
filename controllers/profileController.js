// controllers/profileController.js
const { db, admin } = require('../config/firebase');
const applyDefaults = require('../utils/applyDefaults');

exports.showProfile = async (req, res) => {
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
        (currentUser.role === 'ENDUSER' && user.uid === currentUser.uid) ||
        (currentUser.role === 'ENDUSER' && user.role === 'ENDUSER' && user.status === 'ATIVADA' && user.profile === 'Público');

      if (canSee && !allUsers.has(user.uid)) allUsers.set(user.uid, applyDefaults(user));
    });

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
};

exports.changeRole = async (req, res) => {
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
    if (currentRole === 'ADMIN') canChange = true;
    else if (currentRole === 'BACKOFFICE') {
      const validChanges = (
        (targetRole === 'ENDUSER' && newRole === 'PARTNER') ||
        (targetRole === 'PARTNER' && newRole === 'ENDUSER')
      );
      canChange = validChanges;
    }

    if (!canChange) return res.status(403).send("Sem permissão para alterar este role.");

    await db.collection('users').doc(uid).update({ role: newRole });
    res.redirect('/profile');
  } catch (error) {
    res.status(500).send("Erro ao alterar role: " + error.message);
  }
};

exports.changeStatus = async (req, res) => {
  const { uid } = req.params;
  const currentUser = req.session.user;

  try {
    const targetDoc = await db.collection('users').doc(uid).get();
    if (!targetDoc.exists) return res.status(404).send("Utilizador não encontrado.");
    const targetUser = targetDoc.data();

    const currentRole = currentUser.role;
    const canChange = currentRole === 'ADMIN' || currentRole === 'BACKOFFICE';
    if (!canChange) return res.status(403).send("Sem permissão para alterar o estado desta conta.");

    const newStatus = targetUser.status === 'ATIVADA' ? 'DESATIVADA' : 'ATIVADA';
    await db.collection('users').doc(uid).update({ status: newStatus });

    res.redirect('/profile');
  } catch (error) {
    res.status(500).send("Erro ao mudar estado da conta: " + error.message);
  }
};

exports.deleteUser = async (req, res) => {
  const currentUser = req.session.user;
  const targetUid = req.params.uid;
  if (!currentUser) return res.status(401).send('Não autenticado.');

  try {
    const targetDoc = await db.collection('users').doc(targetUid).get();
    if (!targetDoc.exists) return res.status(404).send("Utilizador não encontrado.");
    const targetUser = targetDoc.data();
    const isSelf = currentUser.uid === targetUid;

    let canDelete = false;
    if (currentUser.role === 'ADMIN') canDelete = true;
    else if (currentUser.role === 'BACKOFFICE' && (targetUser.role === 'ENDUSER' || targetUser.role === 'PARTNER')) canDelete = true;

    if (!canDelete) return res.status(403).send("Sem permissão para remover este utilizador.");

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
};

exports.editUser = async (req, res) => {
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
    if (currentUser.role === 'ADMIN') {
      allowedFields = Object.keys(updates);
    } else if (isSelf && ['ENDUSER', 'BACKOFFICE'].includes(currentUser.role)) {
      allowedFields = Object.keys(updates).filter(key => !['username', 'email', 'name', 'role', 'status'].includes(key));
    } else if (currentUser.role === 'BACKOFFICE' && ['ENDUSER', 'PARTNER'].includes(targetRole)) {
      if (targetStatus !== 'ATIVADA') return res.status(403).send("Só pode editar contas ATIVADAS.");
      allowedFields = Object.keys(updates).filter(key => !['username', 'email'].includes(key));
    } else if (currentUser.role === 'ENDUSER' && isSelf) {
      allowedFields = Object.keys(updates).filter(key => !['username', 'email', 'name', 'role', 'status'].includes(key));
    } else {
      return res.status(403).send("Sem permissão para editar este utilizador.");
    }

    const filteredUpdates = {};
    for (const key of allowedFields) {
      if (updates[key] !== undefined) filteredUpdates[key] = updates[key];
    }
    if (Object.keys(filteredUpdates).length === 0) return res.status(400).send("Nenhum campo autorizado para atualização.");

    await db.collection('users').doc(uid).update(filteredUpdates);
    res.redirect(`/profile?editUserId=${uid}`);
  } catch (err) {
    console.error("Erro ao editar utilizador:", err);
    res.status(500).send("Erro ao atualizar atributos: " + err.message);
  }
};
