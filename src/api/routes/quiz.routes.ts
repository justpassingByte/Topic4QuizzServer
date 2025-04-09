import { Router } from 'express';
import { QuizController } from '../controllers/quiz.controller';
import { ModelConfigService } from '../../services/model-config.service';

const router = Router();
const quizController = new QuizController(new ModelConfigService());

// Create a new quiz
router.post('/quizzes', quizController.createQuiz);

// Get a quiz by ID
router.get('/quizzes/:id', quizController.getQuiz);

// Find quizzes by topic
router.get('/quizzes/topic/:topic', quizController.findQuizzesByTopic);

// Get quiz history by topic
router.get('/quizzes/history/:topic', quizController.getTopicHistory);

export default router; 