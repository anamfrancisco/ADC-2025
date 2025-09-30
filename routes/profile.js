// routes/profile.js
const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');
const { isAuthenticated } = require('../middleware/auth');

router.get('/profile', isAuthenticated, profileController.showProfile);
router.post('/change-role/:uid', isAuthenticated, profileController.changeRole);
router.post('/change-status/:uid', isAuthenticated, profileController.changeStatus);
router.post('/delete-user/:uid', isAuthenticated, profileController.deleteUser);
router.post('/edit-user/:uid', isAuthenticated, profileController.editUser);

module.exports = router;
