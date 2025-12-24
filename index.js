// Main server entry (CommonJS)
const express = require('express');
require('dotenv').config();
require('./config/db');
const app = express();
const port = process.env.PORT || 3000;
const cors = require('cors');

// Middleware
app.use(express.json());
app.use(cors());

// Root route
app.get('/', (req, res) => res.send('Server is running!'));

app.use('/api/chat', require('./routes/chatRoutes'));
app.use('/api/conversations', require('./routes/conversationRoutes'));

// Start server
app.listen(port, () => console.log('Server started on port ' + port));
