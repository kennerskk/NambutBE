const express = require('express');
const router = express.Router();
const cardController = require('../controllers/cardController');
const { authenticateToken } = require('../middlewares/auth');

router.get('/cards', authenticateToken, cardController.getMyCards);
router.get('/card/:id', cardController.getCardById);
router.post('/card/:id', authenticateToken, cardController.saveCard);

module.exports = router;
