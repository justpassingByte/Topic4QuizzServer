import { Request, Response } from 'express';
import * as bcrypt from 'bcryptjs';
import { User, QuizResult, UserStatistics } from '../../models/user.model';
import { v4 as uuidv4 } from 'uuid';
import { UserService } from '../../services/user.service';
import { Quiz, QuizSession } from '../../models/quiz.model';

export class UserController {
  private userService: UserService;

  constructor(userService: UserService) {
    this.userService = userService;
    this.userService.init();
  }

  // Create or update user
  createUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const { username, email, password, favoriteTopics } = req.body;

      // Validate required fields
      if (!username || !email || !password) {
        res.status(400).json({ error: 'Username, email, and password are required' });
        return;
      }

      // Check if user already exists
      const existingUser = await this.userService.getUserByEmail(email);
      if (existingUser) {
        res.status(409).json({ error: 'User with this email already exists' });
        return;
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10); // Salt rounds = 10

      // Create new user using UserService
      const user = await this.userService.createUser(username, email, hashedPassword, favoriteTopics || []);
      
      // Return user data (exclude password)
      const { password: _, ...userWithoutPassword } = user;
      res.status(201).json(userWithoutPassword);
    } catch (error) {
      console.error('Error creating user:', error);
      res.status(500).json({ error: 'Failed to create user' });
    }
  };

  // Login user
  loginUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, password } = req.body;

      // Validate required fields
      if (!email || !password) {
        res.status(400).json({ error: 'Email and password are required' });
        return;
      }

      // Check if user exists using UserService
      const user = await this.userService.getUserByEmail(email);
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      // Compare password
      const isMatch = await bcrypt.compare(password, user.password || '');
      if (!isMatch) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      // Return user data (exclude password)
      const { password: _, ...userWithoutPassword } = user;
      res.status(200).json(userWithoutPassword);
    } catch (error) {
      console.error('Error logging in user:', error);
      res.status(500).json({ error: 'Failed to login user' });
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
      
      const user = await this.userService.getUserById(id);
      
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      
      const { password: _, ...userWithoutPassword } = user;
      res.status(200).json(userWithoutPassword);
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
      
      if (!id || !topics || !Array.isArray(topics)) {
        res.status(400).json({ error: 'User ID and topics array are required' });
        return;
      }
      
      const user = await this.userService.getUserById(id);
      
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      
      if (action === 'add') {
        await this.userService.addFavoriteTopics(id, topics);
      } else if (action === 'remove') {
        await this.userService.removeFavoriteTopics(id, topics);
      } else {
        await this.userService.updateUserPreferences(id, { favoriteTopics: topics });
      }
      
      const updatedUser = await this.userService.getUserById(id);
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
      
      const quizzes = await this.userService.getQuizzesByUserPreferences(id);
      
      res.status(200).json({
        count: quizzes.length,
        quizzes: quizzes.map((quiz: Quiz) => ({
          id: quiz.id,
          topicSlug: quiz.topicSlug,
          topicName: quiz.topicName,
          questionCount: quiz.questions?.length || 0,
          createdAt: quiz.createdAt,
          updatedAt: quiz.updatedAt
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
      const { userId, quizId, topicSlug, topicName, score, answers, difficulty } = req.body;
      
      if (!userId || !quizId || !topicSlug || !topicName || score === undefined || !answers) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
      }
      
      const user = await this.userService.getUserById(userId);
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      
      const result: QuizResult = {
        userId,
        quizId,
        topicSlug,
        topicName,
        score,
        difficulty: difficulty || 'intermediate',
        completedAt: new Date(),
        answers
      };
      
      await this.userService.saveQuizResult(result);
      await this.userService.updateUserScore(userId, score); // Also update total score
      
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
      
      const statistics = await this.userService.getUserStatistics(id);
      
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

      if (!id) {
        res.status(400).json({ error: 'User ID is required' });
        return;
      }

      const recommendations = await this.userService.getTopicRecommendations(id);
      res.status(200).json(recommendations);
    } catch (error) {
      console.error('Error retrieving topic recommendations:', error);
      res.status(500).json({ error: 'Failed to retrieve topic recommendations' });
    }
  };

  getLeaderboard = async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const leaderboard = await this.userService.getLeaderboard(limit);
      res.status(200).json(leaderboard);
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }
  };
} 