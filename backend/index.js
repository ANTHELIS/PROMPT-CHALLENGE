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

// Middleware
app.use(cors());
app.use(express.json());

// Database Connection
connectDB();

// Routes
app.use('/api/users', userRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/messages', require('./routes/messageRoutes'));
app.use('/uploads', express.static('uploads'));

app.get('/', (req, res) => {
  res.send('Multilingual Mandi API is running');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
