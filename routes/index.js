const express = require('express');

const router = express.Router();
const AppController = require('../controllers/AppController');
const { UserController, UsersController } = require('../controllers/UsersController');
const AuthController = require('../controllers/AuthController');

router.get('/status', AppController.getStatus);
router.get('/stats', AppController.getStats);
router.post('/users', UsersController.postNew);
router.get('/connect', AuthController.getConnect);
router.get('/disconnect', AuthController.getDisconnect);
router.get('/users/me', UserController.getMe);

module.exports = router;