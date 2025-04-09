import { 
  Quiz,
  QuizConfig,
  QuizSession,
  QuizGenerationConfig,
  PromptFeedback as QuizPromptFeedback,
  PromptHistory,
  QuizEvaluation,

  MultipleChoiceQuestion,
  CodingQuestion
} from '../models/quiz.model';
import {
  EvaluationResult,
  EvaluationCriteria,
  EvaluationConfig
} from '../models/evaluation.model';
import { PromptBuilderAgent } from '../agents/prompt-builder.agent';
import { QuizGeneratorAgent } from '../agents/quiz-generator.agent';
import { QuizEvaluatorAgent } from '../agents/quiz-evaluator.agent';
import { MemoryService } from '../services/memory.service';
import { ModelConfigService } from '../services/model-config.service';
import { ModelAdapterService } from '../services/model-adapter.service';
import { ComprehensiveResearchFlow, ComprehensiveAnalysis } from './comprehensive-research.flow';
import { v4 as uuidv4 } from 'uuid';
import { PromptFeedback } from '../agents/prompt-builder.agent';


interface QuizGenerationOptions extends QuizGenerationConfig {
  difficulty: 'basic' | 'intermediate' | 'advanced';
  numberOfQuestions: number;
  topics: string[];
}


export class QuizGenerationFlow {

  private quizGenerator: QuizGeneratorAgent;
  private quizEvaluator: QuizEvaluatorAgent;
  private memory: MemoryService;
  private promptBuilder: PromptBuilderAgent;
  private promptHistory: Map<string, PromptHistory>;
  private modelConfigService: ModelConfigService;
  private modelAdapterService: ModelAdapterService;
  private comprehensiveResearch: ComprehensiveResearchFlow;

  constructor(modelConfig: ModelConfigService) {
    // Initialize services first
    this.modelConfigService = modelConfig;
    this.modelAdapterService = new ModelAdapterService();
    this.memory = new MemoryService();
    this.promptHistory = new Map();

    // Initialize agents with required dependencies
    const serperApiKey = process.env.SERPER_API_KEY || '';

    this.comprehensiveResearch = new ComprehensiveResearchFlow(
      this.modelConfigService,
      this.modelAdapterService,
      serperApiKey
    );

    
    this.promptBuilder = new PromptBuilderAgent(
      this.modelConfigService,
      this.modelAdapterService
    );
    
    this.quizGenerator = new QuizGeneratorAgent(
      this.modelConfigService,
      this.modelAdapterService
    );
    
    this.quizEvaluator = new QuizEvaluatorAgent(
      this.modelConfigService,
      this.modelAdapterService
    );
  }

  private getDefaultConfig(): QuizGenerationConfig {
    return {
      multipleChoiceCount: 10,
      codingQuestionCount: 0,
      difficultyDistribution: {
        basic: 7,
        intermediate: 2,
        advanced: 1
      },
      typeDistribution: {
        multipleChoice: 10,
        coding: 0
      },
      includeHints: true,
      maxAttempts: 3
    };
  }
  async generateQuiz(topic: string, config: QuizGenerationConfig): Promise<Quiz> {
    try {
      // Convert QuizGenerationConfig to QuizGenerationOptions
      const options: QuizGenerationOptions = {
        ...config,
        difficulty: this.getDifficultyLevel(config),
        numberOfQuestions: config.multipleChoiceCount + config.codingQuestionCount,
        topics: [topic],
      };

      console.log(`Starting quiz generation for topic: ${topic}`);

      // Step 1: Comprehensive Research
      console.log('Step 1: Performing comprehensive research...');
      const analysis = await this.comprehensiveResearch.analyze(topic);
      
      // Step 2: Generate questions for main topic and subtopics
      console.log('Step 2: Generating questions...');
      const mainTopicCount = Math.ceil((options.numberOfQuestions || 5) * 0.4); // 40% for main topic
      const subtopicCount = Math.floor((options.numberOfQuestions || 5) * 0.6); // 60% for subtopics

      // Generate main topic questions
      const mainQuiz = await this.quizGenerator.generateFromSearchResults(topic, {
        analysisResults: {
         
          mainSummary: analysis.contextAnalysis.keyConcepts[0].description,
          importantPoints: analysis.contextAnalysis.keyConcepts.map(c => c.description),
          topicRelevanceScore: 1,
          sourceQuality: {
            credibility: 1,
            recency: 1,
            diversity: 1
          },
          recommendations: analysis.contextAnalysis.suggestedTopics
        },
        difficulty: options.difficulty,
        questionCount: mainTopicCount
      });

      // Generate subtopic questions
      const subtopicQuestions: (MultipleChoiceQuestion | CodingQuestion)[] = [];
      const questionsPerSubtopic = Math.max(1, Math.floor(subtopicCount / analysis.subtopicAnalyses.length));
      
      for (const subtopic of analysis.subtopicAnalyses) {
        const subtopicQuiz = await this.quizGenerator.generateFromSearchResults(
          `${topic} ${subtopic.name}`,
          {
            analysisResults: {
              mainSummary: subtopic.searchAnalysis.mainSummary,
              importantPoints: subtopic.searchAnalysis.importantPoints,
              topicRelevanceScore: subtopic.searchAnalysis.topicRelevanceScore,
              sourceQuality: subtopic.searchAnalysis.sourceQuality,
              recommendations: subtopic.searchAnalysis.recommendations
            },
            difficulty: options.difficulty,
            questionCount: questionsPerSubtopic
          }
        );
        subtopicQuestions.push(...this.convertQuestions(subtopicQuiz.questions));
      }

      // Combine all questions
      const allQuestions = [...this.convertQuestions(mainQuiz.questions), ...subtopicQuestions];
      
      // Create final quiz
      const finalQuiz = {
        id: uuidv4(),
        questions: allQuestions,
        createdAt: new Date(),
        config: {
          multipleChoiceCount: config.multipleChoiceCount,
          codingQuestionCount: config.codingQuestionCount,
          difficultyDistribution: config.difficultyDistribution,
          typeDistribution: config.typeDistribution,
          includeHints: config.includeHints,
          maxAttempts: config.maxAttempts
        },
        metadata: {
          difficulty: options.difficulty,
          totalQuestions: options.numberOfQuestions,
          generatedAt: new Date().toISOString(),
          estimatedTime: 30
        }
      } as Quiz;

      // Evaluate the quiz
      const quizEvaluation = await this.evaluateQuiz(finalQuiz, topic);

      // Save the session with the evaluation
      await this.saveQuizSession(finalQuiz, topic, analysis.contextAnalysis, quizEvaluation);

      return finalQuiz;
    } catch (error) {
      console.error('Error in quiz generation flow:', error);
      throw error;
    }
  }


  private getDifficultyLevel(config: QuizConfig): 'basic' | 'intermediate' | 'advanced' {
    const { difficultyDistribution } = config;
    const maxDifficulty = Object.entries(difficultyDistribution)
      .reduce((a, b) => a[1] > b[1] ? a : b)[0];
    
    return maxDifficulty as 'basic' | 'intermediate' | 'advanced';
  }

  private async saveQuizSession(quiz: Quiz, topic: string, context: any, evaluation: QuizEvaluation): Promise<void> {
    try {
      // Create a session object
      const session: QuizSession = {
        id: quiz.id,
        quiz,
        topic,
        createdAt: new Date(),
        updatedAt: new Date(),
        similarTopics: context.suggestedTopics || [],
        evaluation: evaluation // Use evaluation directly since we now have it in the interface
      };

      // Save the session
      await this.memory.saveSession(session);
      
      // Update the prompt history with this evaluation
      await this.updatePromptHistoryWithEvaluation(topic, evaluation);
      
      console.log(`Quiz session saved with ID: ${quiz.id}`);
    } catch (error) {
      console.error('Error saving quiz session:', error);
    }
  }


  private convertQuestions(questions: any[]): (MultipleChoiceQuestion | CodingQuestion)[] {
    return questions.map(q => {
      if (q.type === 'coding') {
        return {
          id: uuidv4(),
          type: 'coding',
          difficulty: q.difficulty,
          text: q.text || q.question,
          solution: q.solution || q.correctAnswer,
          testCases: [],
          severity: 'error',
          explanation: q.explanation || ''
        } as CodingQuestion;
      } else {
        return {
          id: uuidv4(),
          type: 'multiple-choice',
          difficulty: q.difficulty,
          text: q.text || q.question,
          choices: (q.choices || q.options || []).map((opt: string, idx: number) => ({
            id: uuidv4(),
            text: opt,
            isCorrect: idx === Number(q.correctAnswer)
          }))
        } as MultipleChoiceQuestion;
      }
    });
  }

  /**
   * Evaluates a quiz and returns detailed feedback and scores
   * @param quiz The quiz to evaluate
   * @param topic The topic of the quiz (used for prompt feedback)
   * @returns A QuizEvaluation object with scores and feedback
   */
  async evaluateQuiz(quiz: Quiz, topic: string): Promise<QuizEvaluation> {
    try {
      // Get current evaluation result from the evaluator agent
      const result = await this.quizEvaluator.evaluate(quiz, {
        strictMode: true,
        evaluationCriteria: {
          technicalAccuracy: true,
          difficultyBalance: true,
          clarity: true,
          coverage: true
        }
      });
      
      // Map the EvaluationResult to QuizEvaluation
      const evaluation: QuizEvaluation = {
        quizId: quiz.id,
        score: result.overallScore,
        feedback: {
          coverage: this.extractCriteriaScore(result, 'coverage'),
          difficulty: this.extractCriteriaScore(result, 'difficultyBalance'),
          uniqueness: this.extractCriteriaScore(result, 'uniqueness'),
          clarity: this.extractCriteriaScore(result, 'clarity'),
          practicality: this.extractCriteriaScore(result, 'practicality'),
          quality: this.calculateQualityScore(result)
        },
        issues: result.questionEvaluations.map(qe => ({
          type: 'question',
          description: qe.issues.join(', '),
          severity: this.determineSeverity(qe.score),
          questionId: qe.questionId
        })),
        suggestions: result.feedback.suggestions,
        timestamp: new Date()
      };

      // Create prompt feedback for the prompt builder agent
      const promptFeedback: PromptFeedback = {
        score: result.overallScore,
        issues: this.extractIssuesFromResult(result),
        suggestions: result.feedback.suggestions,
        successfulElements: this.extractSuccessfulElementsFromResult(result)
      };
      
      // Provide feedback to the prompt builder agent
      const quizTopic = typeof topic === 'string' ? topic : 'unknown';
      await this.promptBuilder.provideFeedback(quizTopic, promptFeedback);
      
      // Save this evaluation
      await this.updateSessionWithEvaluation(quiz.id, evaluation);
      
      return evaluation;
    } catch (error) {
      console.error('Error evaluating quiz:', error);
      
      // Return a basic evaluation in case of failure
      return {
        quizId: quiz.id,
        score: 0.5,
        feedback: {
          coverage: 0.5,
          difficulty: 0.5,
          uniqueness: 0.5,
          clarity: 0.5,
          practicality: 0.5,
          quality: 0.5
        },
        issues: [{
          type: 'system',
          description: 'Failed to evaluate quiz properly',
          severity: 'high'
        }],
        suggestions: ['Try generating a new quiz'],
        timestamp: new Date()
      };
    }
  }

  // Helper methods for evaluation
  private extractCriteriaScore(result: EvaluationResult, criteriaName: string): number {
    // Add null/undefined checks for all properties
    if (!result || !result.metadata || !result.metadata.criteriaUsed || !Array.isArray(result.metadata.criteriaUsed)) {
      console.log(`Missing metadata.criteriaUsed for criteria: ${criteriaName}`);
      return 0.8; // Return default score
    }
    
    // Look for criteria in metadata
    const criteriaIndex = result.metadata.criteriaUsed.findIndex(
      criteria => criteria && typeof criteria === 'string' && criteria.toLowerCase().includes(criteriaName.toLowerCase())
    );
    
    if (criteriaIndex >= 0 && Array.isArray(result.questionEvaluations)) {
      // Use question evaluations to estimate a score for this criteria
      const relevantEvaluations = result.questionEvaluations.filter(qe => 
        qe && qe.issues && Array.isArray(qe.issues) && 
        qe.issues.some(issue => 
          issue && typeof issue === 'string' && issue.toLowerCase().includes(criteriaName.toLowerCase())
        )
      );
      
      if (relevantEvaluations.length > 0) {
        // Use the average score of questions with issues in this criteria
        return 1 - (relevantEvaluations.reduce((sum, qe) => sum + (1 - (qe.score || 0)), 0) / relevantEvaluations.length);
      }
    }
    
    // Default to a good score if no specific issues found
    return 0.8;
  }
  
  private calculateQualityScore(result: EvaluationResult): number {
    // Add null/undefined check for questionEvaluations
    if (!result || !result.questionEvaluations || !Array.isArray(result.questionEvaluations)) {
      console.log('Missing questionEvaluations in calculateQualityScore');
      return 0.7; // Default quality score
    }
    
    // Overall quality is a weighted average of other scores and the overall score
    const avgQuestionScore = result.questionEvaluations.reduce(
      (sum, qe) => sum + (qe && typeof qe.score === 'number' ? qe.score : 0), 0
    ) / Math.max(1, result.questionEvaluations.length);
    
    const overallScore = typeof result.overallScore === 'number' ? result.overallScore : 0.7;
    return (overallScore * 0.7) + (avgQuestionScore * 0.3);
  }
  
  private determineSeverity(score: number): 'low' | 'medium' | 'high' {
    // Ensure score is a valid number
    if (typeof score !== 'number' || isNaN(score)) return 'medium';
    
    if (score >= 0.7) return 'low';
    if (score >= 0.4) return 'medium';
    return 'high';
  }
  
  private extractIssuesFromResult(result: EvaluationResult): string[] {
    // Defensive programming - check for null/undefined
    if (!result) return [];
    
    // Extract unique issues from result feedback and question evaluations
    const issues = new Set<string>();
    
    // Handle potential undefined feedback or weaknesses
    if (result.feedback && result.feedback.weaknesses && Array.isArray(result.feedback.weaknesses)) {
      result.feedback.weaknesses.forEach(weakness => {
        if (weakness && typeof weakness === 'string') {
          issues.add(weakness);
        }
      });
    }
    
    // Handle potential undefined questionEvaluations or issues
    if (result.questionEvaluations && Array.isArray(result.questionEvaluations)) {
      result.questionEvaluations.forEach(qe => {
        if (qe && qe.issues && Array.isArray(qe.issues)) {
          qe.issues.forEach(issue => {
            if (issue && typeof issue === 'string') {
              issues.add(issue);
            }
          });
        }
      });
    }
    
    return Array.from(issues);
  }
  
  private extractSuccessfulElementsFromResult(result: EvaluationResult): string[] {
    // Defensive programming - check for null/undefined
    if (!result || !result.feedback) return [];
    
    // Extract strengths as successful elements, with null/undefined check
    const strengths = result.feedback.strengths;
    
    if (strengths && Array.isArray(strengths)) {
      // Filter out any non-string values
      return strengths.filter(item => item && typeof item === 'string');
    }
    
    return [];
  }

  // Update the session with the evaluation
  private async updateSessionWithEvaluation(quizId: string, evaluation: QuizEvaluation): Promise<void> {
    try {
      const session = await this.memory.getSession(quizId);
      if (session) {
        // Evaluation is now part of the QuizSession interface
        const sessionData: Partial<QuizSession> = { 
          evaluation: evaluation,
          updatedAt: new Date()
        };
        await this.memory.updateSession(quizId, sessionData);
        console.log(`Updated session ${quizId} with evaluation, score: ${evaluation.score}`);
      } else {
        console.warn(`Cannot update evaluation for session ${quizId} - session not found`);
      }
    } catch (error) {
      console.error('Error updating session with evaluation:', error);
    }
  }

  // Add this method to update prompt history with evaluations
  private async updatePromptHistoryWithEvaluation(topic: string, evaluation: QuizEvaluation): Promise<void> {
    try {
      // Get existing history or create a new one
      let history = await this.memory.getPromptHistory(topic) || {
        attempts: 0,
        successfulPrompts: [],
        failedPrompts: [],
        averageScore: 0
      };
      
      // Update history
      history.attempts++;
      
      // Create a prompt feedback object from the evaluation
      const promptFeedback: QuizPromptFeedback = {
        prompt: '', // Will be filled by the prompt builder
        score: evaluation.score,
        feedback: {
          strengths: evaluation.feedback.quality >= 0.7 ? ['Good quality questions'] : [],
          weaknesses: evaluation.issues.map(issue => issue.description),
          suggestions: evaluation.suggestions
        }
      };
      
      // Add to successful or failed prompts
      if (evaluation.score >= 0.7) {
        history.successfulPrompts.push(promptFeedback);
      } else {
        history.failedPrompts.push(promptFeedback);
      }
      
      // Calculate new average score
      const allPrompts = [...history.successfulPrompts, ...history.failedPrompts];
      history.averageScore = allPrompts.reduce((sum, pf) => sum + pf.score, 0) / allPrompts.length;
      
      // Save updated history
      await this.memory.savePromptHistory(topic, history);
    } catch (error) {
      console.error('Error updating prompt history with evaluation:', error);
    }
  }

  // Thêm phương thức để truy cập MemoryService từ bên ngoài
  public getMemoryService(): MemoryService {
    return this.memory;
  }
} 