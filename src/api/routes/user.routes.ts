import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { ContextAnalysisController } from '../controllers/context-analysis.controller';
import { UserService } from '../../services/user.service';
import multer from 'multer';

const upload = multer({ dest: 'uploads/avatars/' });

const router = Router();
const userController = new UserController(new UserService());
const contextAnalysisController = new ContextAnalysisController();

// User management routes
router.post('/users', userController.createUser);
router.get('/users/:id', userController.getUserById);
router.get('/leaderboard', userController.getLeaderboard);
router.put('/users/:id/topics', userController.updateFavoriteTopics);
router.put('/users/:id', userController.updateUser);

// Personalization routes
router.get('/users/:id/quizzes', userController.getPersonalizedQuizzes);
router.post('/users/quiz-results', userController.saveQuizResult);
router.get('/users/:id/statistics', userController.getUserStatistics);
router.get('/users/:id/recommendations', userController.getTopicRecommendations);

router.post('/context-analysis', contextAnalysisController.analyze);

// Add avatar upload route
router.post('/users/:id/avatar', upload.single('avatar'), userController.uploadAvatar);

export default router; 