const db = require('../config/db');

const getDefaultCard = () => ({
  settings: {
    backgroundColor: '#f8fafc',
    backgroundImage: 'none',
    backgroundSize: 'cover',
    backgroundRepeat: 'no-repeat',
    backgroundAttachment: 'fixed',
    backgroundPosition: 'center',
    textColor: '#1a1a1a'
  },
  desktopElements: [],
  tabletElements: [],
  mobileElements: []
});

const getMyCards = async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, title, updated_at FROM cards WHERE user_id = $1 ORDER BY updated_at DESC', 
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get cards error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getCardById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT * FROM cards WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.json({
        id,
        ...getDefaultCard()
      });
    }
    
    const card = result.rows[0];
    res.json({
      id: card.id,
      title: card.title,
      settings: card.settings,
      desktopElements: card.desktop_elements,
      tabletElements: card.tablet_elements,
      mobileElements: card.mobile_elements,
      userId: card.user_id
    });
  } catch (err) {
    console.error('Get card by id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const saveCard = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, settings, desktopElements, tabletElements, mobileElements } = req.body;
    
    // Authorization check
    const existing = await db.query('SELECT user_id FROM cards WHERE id = $1', [id]);
    if (existing.rows.length > 0 && existing.rows[0].user_id !== req.user.id && existing.rows[0].user_id !== null) {
      return res.status(403).json({ error: 'Not authorized to edit this card' });
    }

    if (existing.rows.length === 0) {
      await db.query(`
        INSERT INTO cards (id, user_id, title, settings, desktop_elements, tablet_elements, mobile_elements) 
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        id, 
        req.user.id, 
        title || 'My Card', 
        settings, 
        JSON.stringify(desktopElements), 
        JSON.stringify(tabletElements), 
        JSON.stringify(mobileElements)
      ]);
    } else {
      await db.query(`
        UPDATE cards 
        SET title = $1, settings = $2, desktop_elements = $3, tablet_elements = $4, mobile_elements = $5, updated_at = CURRENT_TIMESTAMP
        WHERE id = $6
      `, [
        title || 'My Card', 
        settings, 
        JSON.stringify(desktopElements), 
        JSON.stringify(tabletElements), 
        JSON.stringify(mobileElements), 
        id
      ]);
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error('Save card error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  getMyCards,
  getCardById,
  saveCard
};
