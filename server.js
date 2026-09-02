const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const JWT_SECRET = 'super-secret-jwt-key-for-local-dev';

// Default Card Template
const getDefaultCard = () => ({
  settings: {
    backgroundColor: '#ffffff',
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

// Middleware to verify JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token == null) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Wake up / Ping endpoint for Render
app.get('/api/ping', (req, res) => {
  res.json({ status: 'ok', message: 'Server is awake' });
});

// --- Auth Routes ---
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await db.query(
      'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username',
      [username, hashedPassword]
    );
    
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    
    res.json({ token, user: { id: user.id, username: user.username } });
  } catch (err) {
    console.error(err);
    if (err.code === '23505') { // Unique violation
      return res.status(400).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await db.query('SELECT * FROM users WHERE username = $1', [username]);
    
    if (result.rows.length === 0) return res.status(400).json({ error: 'Invalid credentials' });
    
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(400).json({ error: 'Invalid credentials' });
    
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, username: user.username } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/me', authenticateToken, async (req, res) => {
  res.json({ user: req.user });
});

// --- Card Routes ---
app.get('/api/cards', authenticateToken, async (req, res) => {
  try {
    const result = await db.query('SELECT id, title, updated_at FROM cards WHERE user_id = $1 ORDER BY updated_at DESC', [req.user.id]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// API for getting card data (public view or editor)
app.get('/api/card/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT * FROM cards WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      // If it doesn't exist, we return a default structure so FE can start building 
      // (it will only be saved when they hit save)
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
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// API for saving card data (Requires Auth)
app.post('/api/card/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, settings, desktopElements, tabletElements, mobileElements } = req.body;
    
    // Check if card exists and belongs to another user
    const existing = await db.query('SELECT user_id FROM cards WHERE id = $1', [id]);
    if (existing.rows.length > 0 && existing.rows[0].user_id !== req.user.id && existing.rows[0].user_id !== null) {
      return res.status(403).json({ error: 'Not authorized to edit this card' });
    }

    if (existing.rows.length === 0) {
      await db.query(`
        INSERT INTO cards (id, user_id, title, settings, desktop_elements, tablet_elements, mobile_elements) 
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [id, req.user.id, title || 'My Card', settings, JSON.stringify(desktopElements), JSON.stringify(tabletElements), JSON.stringify(mobileElements)]);
    } else {
      await db.query(`
        UPDATE cards SET title = $1, settings = $2, desktop_elements = $3, tablet_elements = $4, mobile_elements = $5, updated_at = CURRENT_TIMESTAMP
        WHERE id = $6
      `, [title || 'My Card', settings, JSON.stringify(desktopElements), JSON.stringify(tabletElements), JSON.stringify(mobileElements), id]);
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// We are migrating away from WebSockets to simple HTTP saving to better support Serverless / Render sleeping behavior.
// Sockets on sleeping services often drop. For a business card editor, HTTP is cleaner.

// Expose state and IO for MCP server
module.exports = {
  db,
  server,
  app
};

const PORT = process.env.PORT || 3001;

// Only start listening if run directly
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}
