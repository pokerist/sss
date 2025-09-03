const { query } = require('../config/database');
const logger = require('../config/logger');

// Get all latest news
const getAllNews = async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM latest_news ORDER BY order_index ASC'
    );

    res.json(result.rows);
  } catch (error) {
    logger.error('Get news error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Create news item
const createNews = async (req, res) => {
  try {
    const { title, paragraph, image_url, link } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    // Get max order_index
    const maxOrderResult = await query(
      'SELECT COALESCE(MAX(order_index), -1) as max_order FROM latest_news'
    );
    const nextOrder = maxOrderResult.rows[0].max_order + 1;

    const result = await query(
      `INSERT INTO latest_news 
       (title, paragraph, image_url, link, order_index) 
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [title, paragraph, image_url, link, nextOrder]
    );

    logger.info(`News item created: ${result.rows[0].id}`);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Create news error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Update news item
const updateNews = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, paragraph, image_url, link, is_active } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const result = await query(
      `UPDATE latest_news 
       SET title = $1, paragraph = $2, image_url = $3, link = $4, 
           is_active = $5, updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [title, paragraph, image_url, link, is_active, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'News item not found' });
    }

    logger.info(`News item updated: ${id}`);

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Update news error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Delete news item
const deleteNews = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      'DELETE FROM latest_news WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'News item not found' });
    }

    logger.info(`News item deleted: ${id}`);

    res.json({
      success: true,
      message: 'News item deleted successfully'
    });
  } catch (error) {
    logger.error('Delete news error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Update news order
const updateNewsOrder = async (req, res) => {
  try {
    const { orders } = req.body;

    if (!Array.isArray(orders)) {
      return res.status(400).json({ error: 'Orders array is required' });
    }

    // Update each news item's order
    await Promise.all(
      orders.map((item, index) =>
        query(
          'UPDATE latest_news SET order_index = $1 WHERE id = $2',
          [index, item.id]
        )
      )
    );

    logger.info('News order updated');

    res.json({
      success: true,
      message: 'News order updated successfully'
    });
  } catch (error) {
    logger.error('Update news order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  getAllNews,
  createNews,
  updateNews,
  deleteNews,
  updateNewsOrder
};
