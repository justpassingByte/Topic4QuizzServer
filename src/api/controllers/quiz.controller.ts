import { Request, Response } from 'express';
import { QuizGenerationFlow } from '../../flows/quiz-generation.flow';
import { QuizGenerationConfig, DifficultyDistribution } from '../../models/quiz.model';
import { MemoryService } from '../../services/memory.service';
import { defaultQuizConfig, validateQuizConfig, getQuizConfigForLevel, difficultyPresets } from '../../config/quiz.config';

import { ModelConfigService } from '../../services/model-config.service';
export class QuizController {
  private flow: QuizGenerationFlow;
  private memory: MemoryService;

  constructor(private readonly modelConfigService: ModelConfigService) {
    this.flow = new QuizGenerationFlow(modelConfigService);
    this.memory = new MemoryService();
  }

  createQuiz = async (req: Request, res: Response): Promise<void> => {
    try {
      const { topic, config, level } = req.body;

      // Validate topic
      if (!topic || typeof topic !== 'string' || topic.trim().length === 0) {
        res.status(400).json({ error: 'Topic is required and must be a non-empty string' });
        return;
      }

      let quizConfig: QuizGenerationConfig;
      
      if (level && typeof level === 'string' && ['beginner', 'intermediate', 'advanced'].includes(level)) {
        // Use preset config based on level
        quizConfig = getQuizConfigForLevel(level as 'beginner' | 'intermediate' | 'advanced');
      } else if (config && typeof config === 'object') {
        // Validate and convert difficulty distribution
        if (!this.isValidConfigStructure(config)) {
          res.status(400).json({ 
            error: 'Invalid quiz configuration structure. Required fields: multipleChoiceCount (number), and difficultyDistribution (object with basic, intermediate, advanced)' 
          });
          return;
        }

        // Convert difficulty distribution to correct type
        const difficultyDistribution: DifficultyDistribution = {
          basic: Number(config.difficultyDistribution.basic),
          intermediate: Number(config.difficultyDistribution.intermediate),
          advanced: Number(config.difficultyDistribution.advanced)
        };

        quizConfig = {
          ...config,
          difficultyDistribution,
          typeDistribution: {
            multipleChoice: Number(config.typeDistribution?.multipleChoice || config.multipleChoiceCount),
            coding: Number(config.typeDistribution?.coding || config.codingQuestionCount)
          },
          multipleChoiceCount: Number(config.multipleChoiceCount),
          codingQuestionCount: Number(config.codingQuestionCount),
          includeHints: Boolean(config.includeHints),
          maxAttempts: Number(config.maxAttempts || 3)
        };
      } else {
        // Use default config
        quizConfig = defaultQuizConfig;
      }

      // Validate config values
      try {
        const validation = validateQuizConfig(quizConfig);
        if (!validation.isValid) {
          res.status(400).json({ error: validation.errors.join(', ') });
          return;
        }
      } catch (validationError) {
        if (validationError instanceof Error) {
          res.status(400).json({ error: validationError.message });
          return;
        }
      }

      // Generate quiz
      const quiz = await this.flow.generateQuiz(topic.trim(), quizConfig);
      res.status(201).json(quiz);
    } catch (error) {
      console.error('Error creating quiz:', error);
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  };

  getQuiz = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const session = await this.memory.getSession(id);

      if (!session || !session.quiz) {
        res.status(404).json({ error: 'Quiz not found' });
        return;
      }

      res.json(session.quiz);
    } catch (error) {
      console.error('Error getting quiz:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  findQuizzesByTopic = async (req: Request, res: Response): Promise<void> => {
    try {
      const { topic } = req.params;
      const quizzes = await this.memory.findSimilarQuizzes(topic);
      
      if (quizzes.length > 0) {
        // Trả về quiz đầu tiên tìm thấy
        res.json(quizzes[0]);
      } 
      
        const quiz = await this.flow.generateQuiz(topic.trim(), defaultQuizConfig);
        res.json(quiz);
      
    } catch (error) {
      console.error('Error finding quiz:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  getTopicHistory = async (req: Request, res: Response): Promise<void> => {
    try {
      const { topic } = req.params;
      const history = await this.memory.getTopicHistory(topic);
      res.json(history);
    } catch (error) {
      console.error('Error getting topic history:', error);
      res.status(500).json({ error: 'Internal server error' });
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