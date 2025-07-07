import { Request, Response } from 'express';
import { QuizGenerationFlow } from '../../flows/quiz-generation.flow';
import { QuizGenerationConfig, DifficultyDistribution, Difficulty, QuizEvaluation, QuizFeedback, Question, MultipleChoiceQuestion, CodingQuestion } from '../../models/quiz.model';
import { QuizService } from '../../services/quiz.service';
import { UserService } from '../../services/user.service';
import { defaultQuizConfig, validateQuizConfig, getQuizConfigForLevel, difficultyPresets } from '../../config/quiz.config';
import { ModelConfigService } from '../../services/model-config.service';
import { ModelAdapterService } from '../../services/model-adapter.service';
import { QuizGeneratorAgent } from '../../agents/quiz-generator.agent';
import { PromptBuilderAgent } from '../../agents/prompt-builder.agent';
import { ContextAnalyzer } from '../../agents/context-analyzer.agent';
import { QuizResult } from '../../models/user.model';
import { AgentType } from '../../services/model-config.service';


export class QuizController {
  private flow: QuizGenerationFlow;
  private quizService: QuizService;
  private userService: UserService;
  private contextAnalyzer: ContextAnalyzer;

  constructor(private readonly modelConfigService: ModelConfigService) {
    const modelAdapterService = new ModelAdapterService();
    const quizGenerator = new QuizGeneratorAgent(modelAdapterService, modelConfigService);
    const promptBuilder = new PromptBuilderAgent(modelAdapterService, modelConfigService);
    this.contextAnalyzer = new ContextAnalyzer(modelConfigService, modelAdapterService);
    
    this.flow = new QuizGenerationFlow(
      modelAdapterService,
      modelConfigService,
      quizGenerator,
      promptBuilder
    );
    this.quizService = new QuizService();
    this.userService = new UserService();
    this.userService.init();
  }

  // Health check endpoint
  healthCheck = async (req: Request, res: Response): Promise<void> => {
    res.status(200).json({ status: 'ok', version: '1.0.0' });
  };

  private async standardizeTopic(userInputTopic: string): Promise<string> {
    // Assume this function returns a valid slug for the topic
    // (You can implement your own logic or use a mapping)
    return userInputTopic.trim().toLowerCase().replace(/\s+/g, '-');
  }

  private validateDifficulty(difficulty: string): Difficulty {
    const validDifficulties: Difficulty[] = ['intermediate', 'advanced', 'basic'];
    return validDifficulties.includes(difficulty as Difficulty) 
      ? difficulty as Difficulty 
      : 'intermediate';
  }

  // Create a new quiz
  createQuiz = async (req: Request, res: Response): Promise<void> => {
    try {
      const { topic: userInputTopic, difficulty, config, userId } = req.body;

      // Validate topic
      if (!userInputTopic || typeof userInputTopic !== 'string') {
        res.status(400).json({ error: 'Topic must be a non-empty string' });
        return;
      }

      // Validate and set difficulty
      const validatedDifficulty = this.validateDifficulty(difficulty);
      let finalDifficulty = validatedDifficulty;
      if (userId) {
        const stats = await this.userService.getUserStatistics(userId);
        if (stats) {
          finalDifficulty = stats.recommendedDifficulty;
        }
      }

      let finalConfig: QuizGenerationConfig;
      if (config) {
        finalConfig = {
          multipleChoiceCount: config.multipleChoiceCount ?? 5,
          codingQuestionCount: 0,
          difficultyDistribution: config.difficultyDistribution ?? {
            basic: finalDifficulty === 'basic' ? 7 : 2,
            intermediate: finalDifficulty === 'intermediate' ? 7 : 2,
            advanced: finalDifficulty === 'advanced' ? 7 : 2
          },
          typeDistribution: { multipleChoice: 1, coding: 0 },
          includeHints: config.includeHints ?? true,
          maxAttempts: config.maxAttempts ?? 3
        };
      } else {
        finalConfig = {
          multipleChoiceCount: 10,
          codingQuestionCount: 0,
          difficultyDistribution: {
            basic: finalDifficulty === 'basic' ? 7 : 2,
            intermediate: finalDifficulty === 'intermediate' ? 7 : 2,
            advanced: finalDifficulty === 'advanced' ? 7 : 2
          },
          typeDistribution: { multipleChoice: 1, coding: 0 },
          includeHints: true,
          maxAttempts: 3
        };
      }

      // Danh sách slug đầy đủ, đồng bộ với frontend
      const slugList = [
        // Khoa học & Công nghệ
        'physics', 'chemistry', 'biology', 'ai', 'robotics', 'cs', 'tech-trends', 'sci-fi', 'math', 'astronomy', 'earth-science', 'engineering', 'environment', 'medicine', 'science',
        // Lịch sử & Xã hội
        'history', 'countries', 'economics', 'geography', 'politics', 'law', 'culture', 'philosophy', 'education', 'sociology', 'religion',
        // Nghệ thuật & Văn hóa
        'art', 'music', 'literature', 'fiction', 'drama', 'photography', 'celebrities', 'movies', 'animation', 'fashion', 'design',
        // Ngôn ngữ
        'english', 'spanish', 'chinese', 'french', 'german', 'japanese', 'korean', 'vietnamese',
        // Sức khỏe & Đời sống
        'health', 'yoga', 'nutrition', 'psychology', 'wildlife', 'food', 'lifestyle', 'travel',
        // Giải trí & Thể thao
        'sports', 'football', 'basketball', 'tennis', 'cricket', 'quiz', 'wonders', 'games', 'esports', 'boardgames',
        // Kinh doanh & Công việc
        'business', 'finance', 'marketing', 'startup', 'management', 'career', 'productivity',
        // Khác
        'algebra', 'logic', 'puzzle', 'random'
      ];

      // Use the new flow: classify user input to slug, then generate quiz
      const quiz = await this.flow.generateQuiz(userInputTopic, finalConfig, slugList);
      const { topicSlug, topicName } = quiz;

      // Create a session, using the standardized slug and display name
      const session = await this.quizService.createSession(topicSlug, topicName, quiz, []);

      // Always suggest topicRecommendation if userId is provided
      let topicRecommendation = null;
      if (userId) {
        topicRecommendation = {
          message: "Would you like to add this topic to your favorites?",
          topic: topicSlug,
          topicName: topicName
        };
      }
      // Remove 'prompt' from quiz before sending response
      const quizWithoutPrompt = { ...quiz };
      delete (quizWithoutPrompt as any).prompt;
      // Remove 'prompt' from session.quiz if present
      const sessionObj = { ...session, quiz: { ...session.quiz } };
      delete (sessionObj.quiz as any).prompt;
      res.json({
        ...sessionObj,
        topicSlug,
        topicName,
        topicRecommendation,
        quiz: quizWithoutPrompt
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
      // Lọc trùng topicSlug, chỉ lấy quiz mới nhất cho mỗi topicSlug
      const topicMap = new Map<string, any>();
      sessions.forEach(session => {
        const prev = topicMap.get(session.topicSlug);
        if (!prev || new Date(session.createdAt) > new Date(prev.createdAt)) {
          topicMap.set(session.topicSlug, session);
        }
      });
      const quizzes = Array.from(topicMap.values()).map(session => ({
        id: session.id,
        topicSlug: session.topicSlug,
        topicName: session.topicName,
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
        topicSlug: session.topicSlug,
        topicName: session.topicName,
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
        topicSlug: session.topicSlug,
        topicName: session.topicName,
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

  // Get recommended quizzes for a user
  getRecommendedQuizzes = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      if (!userId) {
        res.status(400).json({ error: 'User ID is required' });
        return;
      }
      const quizzes = await this.userService.getQuizzesByUserPreferences(userId);
      if (!quizzes || quizzes.length === 0) {
        res.status(200).json({ message: 'No recommended quizzes found. Explore some topics to get started!', quizzes: [] });
        return;
      }
      res.status(200).json({
        count: quizzes.length,
        quizzes: quizzes.map(q => ({
          ...q,
          topicSlug: q.topicSlug,
          topicName: q.topicName
        }))
      });
    } catch (error) {
      console.error('Error retrieving recommended quizzes:', error);
      res.status(500).json({ error: 'Failed to retrieve recommended quizzes' });
    }
  };

  // Get a single quiz by ID
  getQuizById = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ error: 'Quiz ID is required' });
        return;
      }
      // Thử tìm ở sessions trước
      let session = await this.quizService.getSession(id);
      if (session) {
        res.status(200).json({
          ...session,
          topicSlug: session.topicSlug,
          topicName: session.topicName
        });
        return;
      }
      // Nếu không có, thử tìm ở quizzes
      const quiz = await this.quizService.getQuiz(id);
      if (quiz) {
        res.status(200).json({
          ...quiz,
          topicSlug: quiz.topicSlug,
          topicName: quiz.topicName
        });
        return;
      }
      res.status(404).json({ error: 'Quiz not found' });
    } catch (error) {
      console.error('Error retrieving quiz by ID:', error);
      res.status(500).json({ error: 'Failed to retrieve quiz' });
    }
  };

  // Evaluate a quiz
  evaluateQuiz = async (req: Request, res: Response): Promise<void> => {
    try {
      const { quizId, userId, answers } = req.body;
      if (!quizId || !userId || !answers) {
        res.status(400).json({ error: 'Quiz ID, User ID, and answers are required' });
        return;
      }
      const session = await this.quizService.getSession(quizId);
      if (!session || !session.quiz) {
        res.status(404).json({ error: 'Quiz not found' });
        return;
      }
      const quiz = session.quiz;
      let score = 0;
      let correctAnswers = 0;
      const processedAnswers: QuizResult['answers'] = [];
      quiz.questions.forEach((question: Question) => {
        const userAnswer = answers[question.id];
        let isCorrect = false;
        if (userAnswer !== undefined) {
          if (question.type === 'multiple-choice') {
            const mcq = question as MultipleChoiceQuestion;
            const correctOption = mcq.answers?.find((o: { id: string; text: string; correct: boolean }) => o.correct);
            if (correctOption && correctOption.id === userAnswer) {
              isCorrect = true;
            }
          } else if (question.type === 'coding') {
            const cq = question as CodingQuestion;
            if (typeof userAnswer === 'string' && userAnswer.trim() === cq.solution) {
              isCorrect = true;
            }
          }
        }
        if (isCorrect) {
          score += 10;
          correctAnswers++;
        }
        processedAnswers.push({
          questionId: question.id,
          userAnswer: userAnswer,
          correct: isCorrect,
        });
      });
      const coinsEarned = score;
      const xpEarned = score;
      // Save quiz result
      const quizResult: QuizResult = {
        userId,
        quizId,
        answers: processedAnswers,
        score,
        topicSlug: session.topicSlug,
        topicName: session.topicName,
        difficulty: quiz.metadata.difficulty,
        completedAt: new Date(),
      };
      await this.userService.saveQuizResult(quizResult);
      await this.userService.updateUserScore(userId, score);
      const updatedUser = await this.userService.getUserById(userId);
      // Danh sách slug đầy đủ, đồng bộ với createQuiz
      const slugList = [
        'physics', 'chemistry', 'biology', 'ai', 'robotics', 'cs', 'tech-trends', 'sci-fi', 'math', 'astronomy', 'earth-science', 'engineering', 'environment', 'medicine', 'science',
        'history', 'countries', 'economics', 'geography', 'politics', 'law', 'culture', 'philosophy', 'education', 'sociology', 'religion',
        'art', 'music', 'literature', 'fiction', 'drama', 'photography', 'celebrities', 'movies', 'animation', 'fashion', 'design',
        'english', 'spanish', 'chinese', 'french', 'german', 'japanese', 'korean', 'vietnamese',
        'health', 'yoga', 'nutrition', 'psychology', 'wildlife', 'food', 'lifestyle', 'travel',
        'sports', 'football', 'basketball', 'tennis', 'cricket', 'quiz', 'wonders', 'games', 'esports', 'boardgames',
        'business', 'finance', 'marketing', 'startup', 'management', 'career', 'productivity',
        'algebra', 'logic', 'puzzle', 'random'
      ];
      const analysis = await this.contextAnalyzer.analyze(session.topicSlug, slugList);
      const suggestedTopics = analysis.similarTopics || [];
      const evaluation: QuizEvaluation = {
        quizId,
        score,
        feedback: {
          coverage: 0,
          difficulty: 0,
          uniqueness: 0,
          clarity: 0,
          practicality: 0,
          quality: 0,
        },
        issues: [],
        suggestions: suggestedTopics,
        timestamp: new Date()
      };
      await this.quizService.updateSession(quizId, { evaluation });
      res.status(200).json({
        message: 'Quiz evaluation completed',
        score,
        correctAnswers,
        totalQuestions: quiz.questions.length,
        coinsEarned,
        xpEarned,
        suggestedTopics,
        newTotalScore: updatedUser?.score ?? updatedUser?.score,
      });
    } catch (error) {
      console.error('Error evaluating quiz:', error);
      res.status(500).json({ error: 'Failed to evaluate quiz' });
    }
  };

  submitResult = async (req: Request, res: Response): Promise<void> => {
    try {
      const { quizId, userId, answers } = req.body;
      if (!quizId || !userId || !answers) {
        res.status(400).json({ error: 'Quiz ID, User ID, and answers are required' });
        return;
      }
      let session = await this.quizService.getSession(quizId);
      let quiz = session?.quiz;
      let topicSlug = session?.topicSlug;
      let topicName = session?.topicName;
      // Nếu không có session, thử tìm quiz ở bảng quizzes
      if (!quiz) {
        const foundQuiz = await this.quizService.getQuiz(quizId);
        quiz = foundQuiz || undefined;
        topicSlug = foundQuiz?.topicSlug;
        topicName = foundQuiz?.topicName;
      }
      if (!quiz) {
        res.status(404).json({ error: 'Quiz not found' });
        return;
      }
      let score = 0;
      const processedAnswers: QuizResult['answers'] = [];
      quiz.questions.forEach((question: any) => {
        const userAnswerData = answers.find((a: any) => a.questionId === question.id);
        const userAnswer = userAnswerData?.userAnswer;
        let isCorrect = false;
        if (userAnswer !== undefined) {
          if (question.type === 'multiple-choice') {
            const mcq = question;
            const correctOption = mcq.answers?.find((o: { id: string; text: string; correct: boolean }) => o.correct);
            if (correctOption && correctOption.id === userAnswer) {
              isCorrect = true;
            }
          } else if (question.type === 'coding') {
            if (typeof userAnswer === 'string' && userAnswer.trim() === question.solution) {
              isCorrect = true;
            }
          }
        }
        if (isCorrect) {
          score += 10;
        }
        processedAnswers.push({
          questionId: question.id,
          userAnswer: userAnswer,
          correct: isCorrect,
        });
      });
      // Save quiz result with server-calculated score
      const quizResult: QuizResult = {
        userId,
        quizId,
        answers: processedAnswers,
        score,
        topicSlug: topicSlug || '',
        topicName: topicName || '',
        difficulty: quiz.metadata?.difficulty || 'intermediate',
        completedAt: new Date(),
      };
      await this.userService.saveQuizResult(quizResult);
      await this.userService.updateUserScore(userId, score);
      const updatedUser = await this.userService.getUserById(userId);
      const suggestedTopics = ["React Hooks", "State Management", "React Router"];
      res.status(200).json({
        message: "Quiz submitted successfully",
        score,
        correctAnswers: processedAnswers.filter(a => a.correct).length,
        totalQuestions: quiz.questions.length,
        coinsEarned: score,
        xpEarned: score,
        suggestedTopics,
        newTotalScore: updatedUser?.score ?? (updatedUser?.score ?? 0) + score,
      });
    } catch (error) {
      if (error instanceof Error) {
        console.error('Error submitting quiz result:', error.message);
      } else {
        console.error('Error submitting quiz result:', error);
      }
      res.status(500).json({ error: 'Failed to submit quiz result' });
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
          topic: session.topicSlug,
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
        topic: session.topicSlug,
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
