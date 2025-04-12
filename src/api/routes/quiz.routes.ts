import { Router } from 'express';
import { QuizController } from '../controllers/quiz.controller';
import { ModelConfigService } from '../../services/model-config.service';

const router = Router();
const quizController = new QuizController(new ModelConfigService());

// Health check
router.get('/health', quizController.healthCheck);

// Quiz routes
router.post('/create', quizController.createQuiz);
router.get('/quizzes', quizController.getAllQuizzes);
router.get('/quizzes/topic/:topic', quizController.getQuizzesByTopic);
router.get('/quizzes/subtopic/:subtopic', quizController.getQuizzesBySubtopic);
router.get('/quizzes/:id', quizController.getQuizById);
router.post('/quizzes/evaluate', quizController.evaluateQuiz);

export default router; 