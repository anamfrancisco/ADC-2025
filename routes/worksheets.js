// routes/worksheets.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const worksheetController = require('../controllers/worksheetController');
const { authorizeRoles } = require('../middleware/auth');

router.get('/worksheets', authorizeRoles(['BACKOFFICE','ADMIN']), worksheetController.list);

router.get('/worksheets/import', authorizeRoles(['BACKOFFICE','ADMIN']), worksheetController.importForm);
router.post('/worksheets/import', authorizeRoles(['BACKOFFICE','ADMIN']), upload.single('geojson'), worksheetController.import);

router.get('/worksheets/:id', authorizeRoles(['BACKOFFICE','ADMIN']), worksheetController.view);
router.get('/worksheets/:id/edit', authorizeRoles(['BACKOFFICE','ADMIN']), worksheetController.editForm);
router.post('/worksheets/:id/edit', authorizeRoles(['BACKOFFICE','ADMIN']), worksheetController.edit);
router.post('/worksheets/:id/features/:fid/delete', authorizeRoles(['BACKOFFICE','ADMIN']), worksheetController.deleteFeature);
router.post('/worksheets/:id/delete', authorizeRoles(['BACKOFFICE','ADMIN']), worksheetController.deleteWorksheet);

module.exports = router;
