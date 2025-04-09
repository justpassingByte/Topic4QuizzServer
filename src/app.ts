import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { QuizGenerationFlow } from './flows/quiz-generation.flow';
import { QuizGenerationConfig, DifficultyDistribution } from './models/quiz.model';
import { ModelConfigService } from './services/model-config.service';
import dotenv from 'dotenv';

// Đảm bảo biến môi trường được nạp
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json());

// Initialize services
const modelConfigService = new ModelConfigService();

// Initialize flow with required dependencies
const quizGenerationFlow = new QuizGenerationFlow(modelConfigService);

// Routes
app.post('/api/generate-quiz', async (req, res) => {
  try {
    const { topic, config } = req.body;
    
    if (!topic) {
      return res.status(400).json({ error: 'Topic is required' });
    }

    console.log(`Received quiz generation request for topic: ${topic}`);
    
    // Validate and convert config
    if (config) {
      // Ensure difficultyDistribution is properly formatted
      if (config.difficultyDistribution) {
        const difficultyDistribution: DifficultyDistribution = {
          basic: Number(config.difficultyDistribution.basic),
          intermediate: Number(config.difficultyDistribution.intermediate),
          advanced: Number(config.difficultyDistribution.advanced)
        };

        config.difficultyDistribution = difficultyDistribution;
      }

      // Convert other numeric values
      config.multipleChoiceCount = Number(config.multipleChoiceCount);
      config.codingQuestionCount = Number(config.codingQuestionCount);
      
      if (config.typeDistribution) {
        config.typeDistribution = {
          multipleChoice: Number(config.typeDistribution.multipleChoice),
          coding: Number(config.typeDistribution.coding)
        };
      }

      config.maxAttempts = Number(config.maxAttempts);
      config.includeHints = Boolean(config.includeHints);
    }

    console.log('Processed config:', config);
    
    const result = await quizGenerationFlow.generateQuiz(topic, config as QuizGenerationConfig);
    
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error generating quiz:', error);
    return res.status(500).json({ error: error.message || 'Failed to generate quiz' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', version: '1.0.0' });
});

// Thêm các endpoint về quiz

// Thêm API mới:
// POST /api/evaluate-quiz - Đánh giá một quiz có sẵn
app.post('/api/evaluate-quiz', async (req, res) => {
  try {
    const { quizId, topic } = req.body;
    
    if (!quizId) {
      return res.status(400).json({ error: 'Quiz ID is required' });
    }
    
    if (!topic) {
      return res.status(400).json({ error: 'Topic is required for evaluation' });
    }
    
    // Lấy quiz từ memory service
    const memoryService = quizGenerationFlow.getMemoryService();
    
    if (!memoryService) {
      return res.status(500).json({ error: 'Memory service not initialized' });
    }
    
    const session = await memoryService.getSession(quizId);
    
    if (!session || !session.quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }
    
    // Đánh giá quiz
    const evaluation = await quizGenerationFlow.evaluateQuiz(session.quiz, topic);
    
    // Cập nhật session với đánh giá mới
    await memoryService.updateSession(quizId, {
      evaluation,
      updatedAt: new Date()
    });
    
    return res.status(200).json(evaluation);
  } catch (error: any) {
    console.error('Error evaluating quiz:', error);
    return res.status(500).json({ error: error.message || 'Failed to evaluate quiz' });
  }
});

// Cập nhật thứ tự xử lý route để tránh xung đột
// GET /api/quizzes/topic/:topic và GET /api/quizzes/subtopic/:subtopic phải đi trước GET /api/quizzes/:id

// GET /api/quizzes/topic/:topic - Lấy quiz theo topic
app.get('/api/quizzes/topic/:topic', async (req, res) => {
  try {
    const topic = req.params.topic;
    
    if (!topic) {
      return res.status(400).json({ error: 'Topic is required' });
    }
    
    // Lấy quiz sessions từ memory service theo topic
    const memoryService = quizGenerationFlow.getMemoryService();
    
    if (!memoryService) {
      return res.status(500).json({ error: 'Memory service not initialized' });
    }
    
    const sessions = await memoryService.getSessionsByTopic(topic);
    
    if (!sessions || !Array.isArray(sessions) || sessions.length === 0) {
      return res.status(200).json({ message: 'No quizzes found for this topic', quizzes: [] });
    }
    
    // Chuyển đổi các sessions thành danh sách tóm tắt
    const quizzes = sessions.map(session => ({
      id: session.id,
      topic: session.topic,
      questionCount: session.quiz?.questions?.length || 0,
      createdAt: session.createdAt || new Date(),
      updatedAt: session.updatedAt,
      score: session.evaluation?.score,
      similarTopics: session.similarTopics || []
    }));
    
    return res.status(200).json({
      topic,
      count: quizzes.length,
      quizzes
    });
  } catch (error: any) {
    console.error(`Error retrieving quizzes for topic ${req.params.topic}:`, error);
    return res.status(500).json({ error: error.message || 'Failed to retrieve quizzes by topic' });
  }
});

// GET /api/quizzes/subtopic/:subtopic - Lấy quiz theo subtopic
app.get('/api/quizzes/subtopic/:subtopic', async (req, res) => {
  try {
    const subtopic = req.params.subtopic;
    
    if (!subtopic) {
      return res.status(400).json({ error: 'Subtopic is required' });
    }
    
    // Lấy quiz sessions từ memory service theo subtopic
    const memoryService = quizGenerationFlow.getMemoryService();
    
    if (!memoryService) {
      return res.status(500).json({ error: 'Memory service not initialized' });
    }
    
    const sessions = await memoryService.getSessionsBySubtopic(subtopic);
    
    if (!sessions || !Array.isArray(sessions) || sessions.length === 0) {
      return res.status(200).json({ message: 'No quizzes found for this subtopic', quizzes: [] });
    }
    
    // Chuyển đổi các sessions thành danh sách tóm tắt
    const quizzes = sessions.map(session => ({
      id: session.id,
      topic: session.topic,
      questionCount: session.quiz?.questions?.length || 0,
      createdAt: session.createdAt || new Date(),
      updatedAt: session.updatedAt,
      score: session.evaluation?.score,
      similarTopics: session.similarTopics || []
    }));
    
    return res.status(200).json({
      subtopic,
      count: quizzes.length,
      quizzes
    });
  } catch (error: any) {
    console.error(`Error retrieving quizzes for subtopic ${req.params.subtopic}:`, error);
    return res.status(500).json({ error: error.message || 'Failed to retrieve quizzes by subtopic' });
  }
});

// GET /api/quizzes - Lấy tất cả quiz
app.get('/api/quizzes', async (req, res) => {
  try {
    // Lấy tất cả quiz sessions từ memory service
    const memoryService = quizGenerationFlow.getMemoryService();
    
    if (!memoryService) {
      return res.status(500).json({ error: 'Memory service not initialized' });
    }
    
    const sessions = await memoryService.getAllSessions();
    
    if (!sessions || !Array.isArray(sessions)) {
      return res.status(200).json([]);
    }
    
    // Chuyển đổi các sessions thành danh sách tóm tắt
    const quizzes = sessions.map(session => ({
      id: session.id,
      topic: session.topic,
      questionCount: session.quiz?.questions?.length || 0,
      createdAt: session.createdAt || new Date(),
      updatedAt: session.updatedAt,
      score: session.evaluation?.score
    }));
    
    return res.status(200).json(quizzes);
  } catch (error: any) {
    console.error('Error retrieving quizzes:', error);
    return res.status(500).json({ error: error.message || 'Failed to retrieve quizzes' });
  }
});

// GET /api/quizzes/:id - Lấy quiz theo ID
app.get('/api/quizzes/:id', async (req, res) => {
  try {
    const quizId = req.params.id;
    
    if (!quizId) {
      return res.status(400).json({ error: 'Quiz ID is required' });
    }
    
    // Lấy quiz session từ memory service
    const memoryService = quizGenerationFlow.getMemoryService();
    
    if (!memoryService) {
      return res.status(500).json({ error: 'Memory service not initialized' });
    }
    
    const session = await memoryService.getSession(quizId);
    
    if (!session) {
      return res.status(404).json({ error: 'Quiz not found' });
    }
    
    // Trả về thông tin quiz
    const response = {
      id: session.id,
      topic: session.topic,
      quiz: session.quiz,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      evaluation: session.evaluation,
      similarTopics: session.similarTopics
    };
    
    return res.status(200).json(response);
  } catch (error: any) {
    console.error(`Error retrieving quiz ${req.params.id}:`, error);
    return res.status(500).json({ error: error.message || 'Failed to retrieve quiz' });
  }
});

// Fallback route
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log(`Quiz generation: http://localhost:${PORT}/api/generate-quiz (POST)`);
  console.log(`Quiz evaluation: http://localhost:${PORT}/api/evaluate-quiz (POST)`);
  console.log(`Get all quizzes: http://localhost:${PORT}/api/quizzes (GET)`);
  console.log(`Get quiz by ID: http://localhost:${PORT}/api/quizzes/:id (GET)`);
  console.log(`Get quizzes by topic: http://localhost:${PORT}/api/quizzes/topic/:topic (GET)`);
  console.log(`Get quizzes by subtopic: http://localhost:${PORT}/api/quizzes/subtopic/:subtopic (GET)`);
});