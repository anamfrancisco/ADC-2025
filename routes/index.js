// routes/index.js
const express = require('express');
const router = express.Router();

router.use('/', require('./auth'));
router.use('/', require('./profile'));
router.use('/', require('./worksheets'));

router.get('/', (req, res) => res.render('welcome'));

module.exports = router;
