import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import quizRoutes from './api/routes/quiz.routes';
import userRoutes from './api/routes/user.routes';
import authRoutes from './api/routes/auth.routes';

// Load environment variables
dotenv.config();

const app = express();
// const PORT = process.env.PORT || 3000;
const PORT = 3000;
const HOST = '192.168.1.5';
// Middleware
app.use(cors());
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json());

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