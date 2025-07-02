import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { ContextAnalysisController } from '../controllers/context-analysis.controller';
import { UserService } from '../../services/user.service';

const router = Router();
const userController = new UserController(new UserService());
const contextAnalysisController = new ContextAnalysisController();

// User management routes
router.post('/users', userController.createUser);
router.get('/users/:id', userController.getUserById);
router.get('/leaderboard', userController.getLeaderboard);
router.put('/users/:id/topics', userController.updateFavoriteTopics);

// Personalization routes
router.get('/users/:id/quizzes', userController.getPersonalizedQuizzes);
router.post('/users/quiz-results', userController.saveQuizResult);
router.get('/users/:id/statistics', userController.getUserStatistics);
router.get('/users/:id/recommendations', userController.getTopicRecommendations);

router.post('/context-analysis', contextAnalysisController.analyze);

export default router; 