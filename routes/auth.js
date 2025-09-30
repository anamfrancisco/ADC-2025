// routes/auth.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.get('/login', authController.showLogin);
router.post('/login', authController.login);
router.get('/register', authController.showRegister);
router.post('/register', authController.register);
router.post('/logout', authController.logout);
router.get('/logout-success', authController.logoutSuccess);
router.post('/change-password', authController.changePassword);

module.exports = router;
