import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import quizRoutes from './api/routes/quiz.routes';
import userRoutes from './api/routes/user.routes';
import authRoutes from './api/routes/auth.routes';
import path from 'path';

const app = express();
// const PORT = process.env.PORT || 3000;
const PORT = 3000;
const HOST = '192.168.1.5';
// Middleware
app.use(cors());
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json({ limit: '2mb' }));

// Serve static files for uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
app.use('/api', quizRoutes);
app.use('/api', userRoutes);
app.use('/api/auth', authRoutes);

// Fallback route
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
app.listen(PORT, HOST, () => {
  console.log(`✅ Server running on port ${PORT}`);
});

export { app };