import { Request, Response } from 'express';
import { MemoryService } from '../../services/memory.service';
import { User, QuizResult, UserStatistics } from '../../models/user.model';
import { v4 as uuidv4 } from 'uuid';

export class UserController {
  private memory: MemoryService;

  constructor() {
    this.memory = new MemoryService();
  }

  // Create or update user
  createUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const { username, email, favoriteTopics } = req.body;

      // Validate required fields
      if (!username || !email) {
        res.status(400).json({ error: 'Username and email are required' });
        return;
      }

      // Check if user already exists
      const existingUser = await this.memory.getUserByEmail(email);
      if (existingUser) {
        res.status(409).json({ error: 'User with this email already exists' });
        return;
      }

      // Create new user
      const user = await this.memory.createUser(username, email, favoriteTopics || []);
      res.status(201).json(user);
    } catch (error) {
      console.error('Error creating user:', error);
      res.status(500).json({ error: 'Failed to create user' });
    }
  };

  // Get user by ID
  getUserById = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      
      if (!id) {
        res.status(400).json({ error: 'User ID is required' });
        return;
      }
      
      const user = await this.memory.getUserById(id);
      
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      
      res.status(200).json(user);
    } catch (error) {
      console.error('Error retrieving user:', error);
      res.status(500).json({ error: 'Failed to retrieve user' });
    }
  };

  // Update user favorite topics
  updateFavoriteTopics = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { topics, action } = req.body;
      
      if (!id) {
        res.status(400).json({ error: 'User ID is required' });
        return;
      }
      
      if (!topics || !Array.isArray(topics)) {
        res.status(400).json({ error: 'Topics must be an array' });
        return;
      }
      
      const user = await this.memory.getUserById(id);
      
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      
      // Add or remove topics based on action
      if (action === 'add') {
        await this.memory.addFavoriteTopics(id, topics);
      } else if (action === 'remove') {
        await this.memory.removeFavoriteTopics(id, topics);
      } else {
        // Replace all topics
        await this.memory.updateUserPreferences(id, { favoriteTopics: topics });
      }
      
      const updatedUser = await this.memory.getUserById(id);
      res.status(200).json(updatedUser);
    } catch (error) {
      console.error('Error updating favorite topics:', error);
      res.status(500).json({ error: 'Failed to update favorite topics' });
    }
  };

  // Get personalized quizzes for user
  getPersonalizedQuizzes = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      
      if (!id) {
        res.status(400).json({ error: 'User ID is required' });
        return;
      }
      
      const user = await this.memory.getUserById(id);
      
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      
      const quizzes = await this.memory.getQuizzesByUserPreferences(id);
      
      res.status(200).json({
        count: quizzes.length,
        quizzes: quizzes.map(session => ({
          id: session.id,
          topic: session.topic,
          questionCount: session.quiz?.questions?.length || 0,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt
        }))
      });
    } catch (error) {
      console.error('Error retrieving personalized quizzes:', error);
      res.status(500).json({ error: 'Failed to retrieve personalized quizzes' });
    }
  };

  // Save quiz result
  saveQuizResult = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId, quizId, topic, score, correctAnswers, totalQuestions, difficultyBreakdown } = req.body;
      
      // Validate required fields
      if (!userId || !quizId || !topic || score === undefined || !correctAnswers || !totalQuestions || !difficultyBreakdown) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
      }
      
      const user = await this.memory.getUserById(userId);
      
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      
      const result: QuizResult = {
        id: uuidv4(),
        userId,
        quizId,
        topic,
        score,
        correctAnswers,
        totalQuestions,
        difficultyBreakdown,
        completedAt: new Date()
      };
      
      await this.memory.saveQuizResult(result);
      
      res.status(201).json(result);
    } catch (error) {
      console.error('Error saving quiz result:', error);
      res.status(500).json({ error: 'Failed to save quiz result' });
    }
  };

  // Get user statistics
  getUserStatistics = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      
      if (!id) {
        res.status(400).json({ error: 'User ID is required' });
        return;
      }
      
      const user = await this.memory.getUserById(id);
      
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      
      const statistics = await this.memory.getUserStatistics(id);
      
      if (!statistics) {
        res.status(200).json({ message: 'No quiz results found for this user' });
        return;
      }
      
      res.status(200).json(statistics);
    } catch (error) {
      console.error('Error retrieving user statistics:', error);
      res.status(500).json({ error: 'Failed to retrieve user statistics' });
    }
  };

  // Get topic recommendations for user
  getTopicRecommendations = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { limit = 5 } = req.query;
      
      if (!id) {
        res.status(400).json({ error: 'User ID is required' });
        return;
      }
      
      const user = await this.memory.getUserById(id);
      
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      
      const recommendations = await this.memory.getTopicRecommendations(
        id, 
        typeof limit === 'string' ? parseInt(limit, 10) : 5
      );
      
      res.status(200).json({
        count: recommendations.length,
        recommendations
      });
    } catch (error) {
      console.error('Error retrieving topic recommendations:', error);
      res.status(500).json({ error: 'Failed to retrieve topic recommendations' });
    }
  };
} 