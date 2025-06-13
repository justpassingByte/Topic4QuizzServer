import { Request, Response } from 'express';
import { QuizGenerationFlow } from '../../flows/quiz-generation.flow';
import { QuizGenerationConfig, DifficultyDistribution, Difficulty, QuizEvaluation, QuizFeedback } from '../../models/quiz.model';
import { QuizService } from '../../services/quiz.service';
import { UserService } from '../../services/user.service';
import { defaultQuizConfig, validateQuizConfig, getQuizConfigForLevel, difficultyPresets } from '../../config/quiz.config';
import { ModelConfigService } from '../../services/model-config.service';
import { ModelAdapterService } from '../../services/model-adapter.service';
import { QuizGeneratorAgent } from '../../agents/quiz-generator.agent';
import { PromptBuilderAgent } from '../../agents/prompt-builder.agent';

export class QuizController {
  private flow: QuizGenerationFlow;
  private quizService: QuizService;
  private userService: UserService;

  constructor(private readonly modelConfigService: ModelConfigService) {
    const modelAdapterService = new ModelAdapterService();
    const quizGenerator = new QuizGeneratorAgent(modelAdapterService, modelConfigService);
    const promptBuilder = new PromptBuilderAgent(modelAdapterService, modelConfigService);
    
    this.flow = new QuizGenerationFlow(
      modelAdapterService,
      modelConfigService,
      quizGenerator,
      promptBuilder
    );
    this.quizService = new QuizService();
    this.userService = new UserService();
  }

  // Health check endpoint
  healthCheck = async (req: Request, res: Response): Promise<void> => {
    res.status(200).json({ status: 'ok', version: '1.0.0' });
  };

  private validateDifficulty(difficulty: string): Difficulty {
    const validDifficulties: Difficulty[] = ['basic', 'intermediate', 'advanced'];
    return validDifficulties.includes(difficulty as Difficulty) 
      ? difficulty as Difficulty 
      : 'intermediate';
  }

  // Create a new quiz
  createQuiz = async (req: Request, res: Response): Promise<void> => {
    try {
      const { topic, difficulty, numQuestions = 10, userId } = req.body;

      // Validate topic
      if (!topic || typeof topic !== 'string') {
        res.status(400).json({ error: 'Topic must be a non-empty string' });
        return;
      }

      // Validate and set difficulty
      const validatedDifficulty = this.validateDifficulty(difficulty);
      
      // If userId is provided, check user's recommended difficulty
      let finalDifficulty = validatedDifficulty;
      if (userId) {
        const stats = await this.userService.getUserStatistics(userId);
        if (stats) {
          // Suggest user's recommended difficulty if available
          finalDifficulty = stats.recommendedDifficulty;
        }
      }

      // Create config object
      const config: QuizGenerationConfig = {
        multipleChoiceCount: numQuestions,
        codingQuestionCount: 0,
        difficultyDistribution: {
          basic: finalDifficulty === 'basic' ? 7 : 2,
          intermediate: finalDifficulty === 'intermediate' ? 7 : 2,
          advanced: finalDifficulty === 'advanced' ? 7 : 2
        },
        typeDistribution: {
          multipleChoice: 1,
          coding: 0
        },
        includeHints: true,
        maxAttempts: 3
      };

      const quiz = await this.flow.generateQuiz(topic, config);
      
      // Create a session
      const session = await this.quizService.createSession(topic, quiz, []);
      
      // If userId is provided, suggest adding the topic to favorites
      let topicRecommendation = null;
      if (userId) {
        const user = await this.userService.getUserById(userId);
        if (user && !user.preferences.favoriteTopics.includes(topic)) {
          topicRecommendation = {
            message: "Would you like to add this topic to your favorites?",
            topic
          };
        }
      }
      
      res.json({
        ...session,
        topicRecommendation
      });
    } catch (error) {
      console.error('Error generating quiz:', error);
      res.status(500).json({ error: 'Failed to generate quiz' });
    }
  };

  // Get all quizzes
  getAllQuizzes = async (req: Request, res: Response): Promise<void> => {
    try {
      const sessions = await this.quizService.getAllSessions();
      
      if (!sessions || !Array.isArray(sessions)) {
        res.status(200).json([]);
        return;
      }
      // Lọc trùng topic, chỉ lấy quiz mới nhất cho mỗi topic
      const topicMap = new Map<string, any>();
      sessions.forEach(session => {
        const prev = topicMap.get(session.topic);
        if (!prev || new Date(session.createdAt) > new Date(prev.createdAt)) {
          topicMap.set(session.topic, session);
        }
      });
      const quizzes = Array.from(topicMap.values()).map(session => ({
        id: session.id,
        topic: session.topic,
        questionCount: session.quiz?.questions?.length || 0,
        createdAt: session.createdAt || new Date(),
        updatedAt: session.updatedAt,
        score: session.evaluation?.score
      }));
      res.status(200).json(quizzes);
    } catch (error) {
      console.error('Error retrieving quizzes:', error);
      res.status(500).json({ error: 'Failed to retrieve quizzes' });
    }
  };


  // Get quizzes by topic
  getQuizzesByTopic = async (req: Request, res: Response): Promise<void> => {
    try {
      const { topic } = req.params;
      
      if (!topic) {
        res.status(400).json({ error: 'Topic is required' });
        return;
      }
      
      const sessions = await this.quizService.getSessionsByTopic(topic);
      
      if (!sessions || !Array.isArray(sessions) || sessions.length === 0) {
        res.status(200).json({ message: 'No quizzes found for this topic', quizzes: [] });
        return;
      }
      
      const quizzes = sessions.map(session => ({
        id: session.id,
        topic: session.topic,
        questionCount: session.quiz?.questions?.length || 0,
        createdAt: session.createdAt || new Date(),
        updatedAt: session.updatedAt,
        score: session.evaluation?.score,
        similarTopics: session.similarTopics || []
      }));
      
      res.status(200).json({
        topic,
        count: quizzes.length,
        quizzes
      });
    } catch (error) {
      console.error('Error retrieving quizzes by topic:', error);
      res.status(500).json({ error: 'Failed to retrieve quizzes by topic' });
    }
  };

  // Get quizzes by subtopic
  getQuizzesBySubtopic = async (req: Request, res: Response): Promise<void> => {
    try {
      const { subtopic } = req.params;
      
      if (!subtopic) {
        res.status(400).json({ error: 'Subtopic is required' });
        return;
      }
      
      const sessions = await this.quizService.getSessionsBySubtopic(subtopic);
      
      if (!sessions || !Array.isArray(sessions) || sessions.length === 0) {
        res.status(200).json({ message: 'No quizzes found for this subtopic', quizzes: [] });
        return;
      }
      
      const quizzes = sessions.map(session => ({
        id: session.id,
        topic: session.topic,
        questionCount: session.quiz?.questions?.length || 0,
        createdAt: session.createdAt || new Date(),
        updatedAt: session.updatedAt,
        score: session.evaluation?.score,
        similarTopics: session.similarTopics || []
      }));
      
      res.status(200).json({
        subtopic,
        count: quizzes.length,
        quizzes
      });
    } catch (error) {
      console.error('Error retrieving quizzes by subtopic:', error);
      res.status(500).json({ error: 'Failed to retrieve quizzes by subtopic' });
    }
  };

  // Evaluate a quiz
  evaluateQuiz = async (req: Request, res: Response): Promise<void> => {
    try {
      const { quizId, topic } = req.body;
      
      if (!quizId) {
        res.status(400).json({ error: 'Quiz ID is required' });
        return;
      }
      
      const session = await this.quizService.getSession(quizId);
      
      if (!session) {
        res.status(404).json({ error: 'Quiz not found' });
        return;
      }
      
      // If evaluation already exists, return it
      if (session.evaluation) {
        res.status(200).json({
          message: 'Evaluation already exists for this quiz',
          evaluation: session.evaluation
        });
        return;
      }
      
      // Generate evaluation (simplified for now, could be enhanced with AI)
      const evaluation: QuizEvaluation = {
        quizId,
        score: 0.85, // Placeholder score
        feedback: {
          coverage: 0.8,
          difficulty: 0.7,
          uniqueness: 0.9,
          clarity: 0.85,
          practicality: 0.9,
          quality: 0.85
        },
        issues: [],
        suggestions: [
          'Consider adding more examples',
          'Increase difficulty of advanced questions'
        ],
        timestamp: new Date()
      };
      
      // Save evaluation
      await this.quizService.updateSession(quizId, { evaluation });
      
      res.status(200).json({
        message: 'Quiz evaluation completed',
        evaluation
      });
    } catch (error) {
      console.error('Error evaluating quiz:', error);
      res.status(500).json({ error: 'Failed to evaluate quiz' });
    }
  };

  // Submit feedback for a quiz
  submitQuizFeedback = async (req: Request, res: Response): Promise<void> => {
    try {
      const { 
        quizId, 
        userId, 
        isFromAdmin, 
        overallRating, 
        contentAccuracy,
        questionClarity,
        comments,
        questionFeedback
      } = req.body;
      
      if (!quizId || overallRating === undefined) {
        res.status(400).json({ error: 'Quiz ID and rating are required' });
        return;
      }
      
      const session = await this.quizService.getSession(quizId);
      
      if (!session) {
        res.status(404).json({ error: 'Quiz not found' });
        return;
      }
      
      const feedback = await this.quizService.submitQuizFeedback({
        quizId,
        userId,
        isFromAdmin: isFromAdmin || false,
        overallRating,
        contentAccuracy: contentAccuracy || overallRating,
        questionClarity: questionClarity || overallRating,
        comments: comments || '',
        questionFeedback: questionFeedback || []
      });
      
      // If there are issues identified in the feedback that need attention
      if (isFromAdmin && questionFeedback && questionFeedback.some((qf: QuizFeedback['questionFeedback'][0]) => !qf.isCorrect)) {
        // Schedule an update if admin found issues
        await this.quizService.scheduleQuizUpdate({
          quizId,
          topic: session.topic,
          scheduledDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week from now
          reason: 'Admin review indicated content issues',
          priority: 'medium'
        });
      }
      
      res.status(201).json({
        message: 'Feedback submitted successfully',
        feedback
      });
    } catch (error) {
      console.error('Error submitting quiz feedback:', error);
      res.status(500).json({ error: 'Failed to submit feedback' });
    }
  };
  
  // Get feedback for a quiz
  getQuizFeedback = async (req: Request, res: Response): Promise<void> => {
    try {
      const { quizId } = req.params;
      
      if (!quizId) {
        res.status(400).json({ error: 'Quiz ID is required' });
        return;
      }
      
      const feedback = await this.quizService.getQuizFeedback(quizId);
      
      res.status(200).json({
        quizId,
        count: feedback.length,
        feedback
      });
    } catch (error) {
      console.error('Error getting quiz feedback:', error);
      res.status(500).json({ error: 'Failed to get feedback' });
    }
  };
  
  // Update a quiz question
  updateQuizQuestion = async (req: Request, res: Response): Promise<void> => {
    try {
      const { quizId, questionId } = req.params;
      const { updates, changedBy, reason } = req.body;
      
      if (!quizId || !questionId || !updates || !changedBy) {
        res.status(400).json({ error: 'Quiz ID, question ID, updates, and changedBy are required' });
        return;
      }
      
      await this.quizService.updateQuizQuestion(
        quizId,
        questionId,
        updates,
        changedBy,
        reason || 'Content update'
      );
      
      res.status(200).json({
        message: 'Quiz question updated successfully'
      });
    } catch (error) {
      console.error('Error updating quiz question:', error);
      res.status(500).json({ error: 'Failed to update quiz question' });
    }
  };
  
  // Get revisions for a quiz
  getQuizRevisions = async (req: Request, res: Response): Promise<void> => {
    try {
      const { quizId } = req.params;
      
      if (!quizId) {
        res.status(400).json({ error: 'Quiz ID is required' });
        return;
      }
      
      const revisions = await this.quizService.getQuizRevisions(quizId);
      
      res.status(200).json({
        quizId,
        count: revisions.length,
        revisions
      });
    } catch (error) {
      console.error('Error getting quiz revisions:', error);
      res.status(500).json({ error: 'Failed to get revisions' });
    }
  };
  
  // Schedule a quiz update
  scheduleQuizUpdate = async (req: Request, res: Response): Promise<void> => {
    try {
      const { quizId, scheduledDate, reason, priority } = req.body;
      
      if (!quizId || !scheduledDate) {
        res.status(400).json({ error: 'Quiz ID and scheduled date are required' });
        return;
      }
      
      const session = await this.quizService.getSession(quizId);
      
      if (!session) {
        res.status(404).json({ error: 'Quiz not found' });
        return;
      }
      
      const schedule = await this.quizService.scheduleQuizUpdate({
        quizId,
        topic: session.topic,
        scheduledDate: new Date(scheduledDate),
        reason: reason || 'Periodic review',
        priority: priority || 'medium'
      });
      
      res.status(201).json({
        message: 'Quiz update scheduled successfully',
        schedule
      });
    } catch (error) {
      console.error('Error scheduling quiz update:', error);
      res.status(500).json({ error: 'Failed to schedule quiz update' });
    }
  };
  
  // Get quizzes that need updating
  getQuizzesNeedingUpdate = async (req: Request, res: Response): Promise<void> => {
    try {
      const { completed } = req.query;
      const isCompleted = completed === 'true';
      
      const schedules = await this.quizService.getQuizUpdateSchedules(isCompleted);
      
      res.status(200).json({
        count: schedules.length,
        schedules
      });
    } catch (error) {
      console.error('Error getting quizzes needing update:', error);
      res.status(500).json({ error: 'Failed to get quizzes needing update' });
    }
  };
  
  // Get quizzes that need periodic reviews
  getQuizzesNeedingReview = async (req: Request, res: Response): Promise<void> => {
    try {
      const { days = '90' } = req.query;
      const daysSinceLastUpdate = parseInt(days as string, 10);
      
      const quizzes = await this.quizService.getQuizzesNeedingReview(daysSinceLastUpdate);
      
      res.status(200).json({
        count: quizzes.length,
        quizzes: quizzes.map(quiz => ({
          id: quiz.id,
          topic: quiz.prompt,
          questionCount: quiz.questions.length,
          createdAt: quiz.createdAt,
          updatedAt: quiz.updatedAt
        }))
      });
    } catch (error) {
      console.error('Error getting quizzes needing review:', error);
      res.status(500).json({ error: 'Failed to get quizzes needing review' });
    }
  };
} 
