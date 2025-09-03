const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticateToken } = require('../middleware/auth');
const {
  getAllNews,
  createNews,
  updateNews,
  deleteNews,
  updateNewsOrder
} = require('../controllers/newsController');

const router = express.Router();

// Configure multer for news image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = process.env.UPLOAD_PATH || './uploads';
    const newsImagesPath = path.join(uploadPath, 'news');
    
    if (!fs.existsSync(newsImagesPath)) {
      fs.mkdirSync(newsImagesPath, { recursive: true });
    }
    
    cb(null, newsImagesPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'news-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit for images
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// All news endpoints are protected
router.use(authenticateToken);

// Get all news items
router.get('/', getAllNews);

// Create news item
router.post('/', upload.single('image'), createNews);

// Update news item
router.put('/:id', upload.single('image'), updateNews);

// Delete news item
router.delete('/:id', deleteNews);

// Update news order
router.post('/reorder', updateNewsOrder);

module.exports = router;
