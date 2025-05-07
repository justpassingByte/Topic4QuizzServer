import { Router } from 'express';
import { UserController } from '../controllers/user.controller';

const router = Router();
const userController = new UserController();

// User management routes
router.post('/users', userController.createUser);
router.get('/users/:id', userController.getUserById);
router.put('/users/:id/topics', userController.updateFavoriteTopics);

// Personalization routes
router.get('/users/:id/quizzes', userController.getPersonalizedQuizzes);
router.post('/users/quiz-results', userController.saveQuizResult);
router.get('/users/:id/statistics', userController.getUserStatistics);
router.get('/users/:id/recommendations', userController.getTopicRecommendations);

export default router; 