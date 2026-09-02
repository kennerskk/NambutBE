require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./src/routes/authRoutes');
const cardRoutes = require('./src/routes/cardRoutes');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check / Wake-up ping
app.get('/api/ping', (req, res) => {
  res.json({ status: 'ok', message: 'Server is awake' });
});

// Routes
app.use('/api', authRoutes);
app.use('/api', cardRoutes);

const PORT = process.env.PORT || 3001;

// Only start listening if run directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
