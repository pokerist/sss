const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const {
  getAllNews,
  createNews,
  updateNews,
  deleteNews,
  updateNewsOrder
} = require('../controllers/newsController');

const router = express.Router();

// All news endpoints are protected
router.use(authenticateToken);

// Get all news items
router.get('/', getAllNews);

// Create news item
router.post('/', createNews);

// Update news item
router.put('/:id', updateNews);

// Delete news item
router.delete('/:id', deleteNews);

// Update news order
router.post('/reorder', updateNewsOrder);

module.exports = router;
