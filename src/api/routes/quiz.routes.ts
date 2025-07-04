import { Router } from 'express';
import { QuizController } from '../controllers/quiz.controller';
import { ModelConfigService } from '../../services/model-config.service';

const router = Router();

// Middleware log tất cả request method và path
router.use((req, res, next) => {
  console.log('API called:', req.method, req.originalUrl);
  next();
});

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
router.post('/quizzes/submit-result', quizController.submitResult);
router.get('/recommended/:userId', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
}, quizController.getRecommendedQuizzes);

// Quiz feedback and evaluation routes
router.post('/quizzes/:quizId/feedback', quizController.submitQuizFeedback);
router.get('/quizzes/:quizId/feedback', quizController.getQuizFeedback);
router.put('/quizzes/:quizId/questions/:questionId', quizController.updateQuizQuestion);
router.get('/quizzes/:quizId/revisions', quizController.getQuizRevisions);

// Quiz update management routes
router.post('/quizzes/schedule-update', quizController.scheduleQuizUpdate);
router.get('/quizzes/updates', quizController.getQuizzesNeedingUpdate);
router.get('/quizzes/review', quizController.getQuizzesNeedingReview);

export default router; 