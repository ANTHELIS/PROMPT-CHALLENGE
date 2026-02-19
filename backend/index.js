const express = require('express');
const dotenv = require('dotenv');

// Load environment variables from the root .env file
dotenv.config();

const cors = require('cors');
const connectDB = require('./config/db');
const userRoutes = require('./routes/userRoutes');
const listingRoutes = require('./routes/listingRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// CORS — allow all origins (required for Vercel → Render cross-origin requests)
const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));
app.use(express.json());

// Database Connection
connectDB();

// Routes
app.use('/api/users', userRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/messages', require('./routes/messageRoutes'));
app.use('/uploads', express.static('uploads'));

app.get('/', (req, res) => {
  res.send('SpeakHarvest API is running ✅');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
