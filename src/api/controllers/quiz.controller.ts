import { Request, Response } from 'express';
import { QuizGenerationFlow } from '../../flows/quiz-generation.flow';
import { QuizGenerationConfig, DifficultyDistribution, Difficulty } from '../../models/quiz.model';
import { MemoryService } from '../../services/memory.service';
import { defaultQuizConfig, validateQuizConfig, getQuizConfigForLevel, difficultyPresets } from '../../config/quiz.config';
import { ModelConfigService } from '../../services/model-config.service';
import { ModelAdapterService } from '../../services/model-adapter.service';
import { QuizGeneratorAgent } from '../../agents/quiz-generator.agent';
import { PromptBuilderAgent } from '../../agents/prompt-builder.agent';

export class QuizController {
  private flow: QuizGenerationFlow;
  private memory: MemoryService;

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
    this.memory = new MemoryService();
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
      const { topic, difficulty, numQuestions = 10 } = req.body;

      // Validate topic
      if (!topic || typeof topic !== 'string') {
        res.status(400).json({ error: 'Topic must be a non-empty string' });
        return;
      }

      // Validate and set difficulty
      const validatedDifficulty = this.validateDifficulty(difficulty);

      // Create config object
      const config: QuizGenerationConfig = {
        multipleChoiceCount: numQuestions,
        codingQuestionCount: 0,
        difficultyDistribution: {
          basic: validatedDifficulty === 'basic' ? 7 : 2,
          intermediate: validatedDifficulty === 'intermediate' ? 7 : 2,
          advanced: validatedDifficulty === 'advanced' ? 7 : 2
        },
        typeDistribution: {
          multipleChoice: 1,
          coding: 0
        },
        includeHints: true,
        maxAttempts: 3
      };

      const quiz = await this.flow.generateQuiz(topic, config);
      res.json(quiz);
    } catch (error) {
      console.error('Error generating quiz:', error);
      res.status(500).json({ error: 'Failed to generate quiz' });
    }
  };

  // Get all quizzes
  getAllQuizzes = async (req: Request, res: Response): Promise<void> => {
    try {
      const sessions = await this.memory.getAllSessions();
      
      if (!sessions || !Array.isArray(sessions)) {
        res.status(200).json([]);
        return;
      }
      
      const quizzes = sessions.map(session => ({
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

  // Get quiz by ID
  getQuizById = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      
      if (!id) {
        res.status(400).json({ error: 'Quiz ID is required' });
        return;
      }
      
      const session = await this.memory.getSession(id);
      
      if (!session) {
        res.status(404).json({ error: 'Quiz not found' });
        return;
      }
      
      const response = {
        id: session.id,
        topic: session.topic,
        quiz: session.quiz,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        evaluation: session.evaluation,
        similarTopics: session.similarTopics
      };
      
      res.status(200).json(response);
    } catch (error) {
      console.error('Error retrieving quiz:', error);
      res.status(500).json({ error: 'Failed to retrieve quiz' });
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
      
      const sessions = await this.memory.getSessionsByTopic(topic);
      
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
      
      const sessions = await this.memory.getSessionsBySubtopic(subtopic);
      
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

  // Evaluate quiz
  evaluateQuiz = async (req: Request, res: Response): Promise<void> => {
    try {
      const { quizId, topic } = req.body;
      
      if (!quizId) {
        res.status(400).json({ error: 'Quiz ID is required' });
        return;
      }
      
      if (!topic) {
        res.status(400).json({ error: 'Topic is required for evaluation' });
        return;
      }
      
      const session = await this.memory.getSession(quizId);
      
      if (!session || !session.quiz) {
        res.status(404).json({ error: 'Quiz not found' });
        return;
      }
      
      const evaluation = await this.flow.evaluateQuiz(session.quiz, topic);
      
      await this.memory.updateSession(quizId, {
        evaluation,
        updatedAt: new Date()
      });
      
      res.status(200).json(evaluation);
    } catch (error) {
      console.error('Error evaluating quiz:', error);
      res.status(500).json({ error: 'Failed to evaluate quiz' });
    }
  };

  private isValidConfigStructure(config: any): boolean {
    return (
      typeof config === 'object' &&
      config !== null &&
      typeof config.multipleChoiceCount !== 'undefined' &&
      typeof config.difficultyDistribution === 'object' &&
      config.difficultyDistribution !== null &&
      typeof config.difficultyDistribution.basic !== 'undefined' &&
      typeof config.difficultyDistribution.intermediate !== 'undefined' &&
      typeof config.difficultyDistribution.advanced !== 'undefined'
    );
  }
} 