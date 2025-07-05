import { 
  Quiz,
  QuizConfig,
  QuizSession,
  QuizGenerationConfig,
  PromptFeedback as QuizPromptFeedback,
  PromptHistory,
  QuizEvaluation,
  DifficultyDistribution,
  SubtopicAnalysis,
  MultipleChoiceQuestion,
  CodingQuestion,
  Difficulty
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
import { ModelConfigService, AgentType } from '../services/model-config.service';
import { ModelAdapterService } from '../services/model-adapter.service';
import { ComprehensiveResearchFlow, ComprehensiveAnalysis } from './comprehensive-research.flow';
import { v4 as uuidv4 } from 'uuid';
import { PromptFeedback } from '../agents/prompt-builder.agent';
import { ContextAnalyzer } from '../agents/context-analyzer.agent';
import { CONTEXT_ANALYZER_PROMPT } from '../agents/prompts/context-analyzer.prompt';
import { buildDynamicQuizPrompt, QUIZ_GENERATOR_TEMPLATE } from '../agents/prompts/quiz-generator.prompt';

import { extractSlug } from '../agents/context-analyzer.agent';


interface QuizGenerationOptions extends QuizGenerationConfig {
  difficulty: Difficulty;
  numberOfQuestions: number;
  topics: string[];
}


export class QuizGenerationFlow {

  private readonly DEFAULT_QUESTIONS_PER_SUBTOPIC = 5;
  private memory: MemoryService;
  private promptHistory: Map<string, string>;
  private quizEvaluator: QuizEvaluatorAgent;
  private comprehensiveResearch: ComprehensiveResearchFlow;
  private contextAnalyzer: ContextAnalyzer;

  constructor(
    private readonly modelAdapterService: ModelAdapterService,
    private readonly modelConfigService: ModelConfigService,
    private readonly quizGenerator: QuizGeneratorAgent,
    private readonly promptBuilder: PromptBuilderAgent
  ) {
    this.memory = new MemoryService();
    this.promptHistory = new Map();
    
    const serperApiKey = process.env.SERPER_API_KEY || '';
    
    this.quizEvaluator = new QuizEvaluatorAgent(
      this.modelConfigService,
      this.modelAdapterService,
      this.memory
    );
    
    this.comprehensiveResearch = new ComprehensiveResearchFlow(
      this.modelConfigService,
      this.modelAdapterService,
      serperApiKey
    );

    this.contextAnalyzer = new ContextAnalyzer(this.modelConfigService, this.modelAdapterService);
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
  /**
   * Generate a quiz by first classifying the user input topic to a topicSlug using AI, then generating the quiz for that slug.
   * @param userInputTopic The topic as entered by the user (free-form)
   * @param config Quiz generation config
   * @param slugList Array of valid topic slugs
   * @returns Quiz object with topicSlug and topicName
   */
  async generateQuiz(userInputTopic: string, config: QuizGenerationConfig, slugList: string[]): Promise<Quiz & { topicSlug: string; topicName: string }> {
    try {
      // 1. Use AI to classify user input to topicSlug
      const prompt = CONTEXT_ANALYZER_PROMPT
        .replace("<user's topic input>", userInputTopic)
        .replace("<list of available slugs>", slugList.join(', '));
      const modelConfig = this.modelConfigService.getModelConfigForAgent(AgentType.CONTEXT_ANALYZER);
      const response = await this.modelAdapterService.generateText({
        ...modelConfig,
        prompt,
        maxTokens: 10,
        temperature: 0.1,
      });
      const topicSlug = response.content.trim();
      const topicName = userInputTopic.trim();

      // 2. Generate quiz for topicSlug
      const options: QuizGenerationOptions = {
        ...config,
        difficulty: this.getDifficultyLevel(config),
        numberOfQuestions: config.multipleChoiceCount + config.codingQuestionCount,
        topics: [topicSlug],
      };

      // Web search and analysis for topicSlug
      const searchAnalysisAgent = this.comprehensiveResearch.getSearchAnalysisAgent();
      const searchAnalysis = await searchAnalysisAgent.searchAndAnalyze(topicSlug, {
        searchResultLimit: 5,
        maxTokens: 1000,
        temperature: 0.3
      });

      // Lấy context analysis (có similarTopics)
      const contextAnalysis = await this.contextAnalyzer.analyzeContext(userInputTopic, topicSlug, slugList);
      const safeTopicSlug = extractSlug(contextAnalysis.topicSlug);
      const similarTopics = contextAnalysis.similarTopics;

      // Tạo prompt chi tiết cho quiz
      const quizPrompt = buildDynamicQuizPrompt(QUIZ_GENERATOR_TEMPLATE, {
        topicSlug: safeTopicSlug,
        questionCount: config.multipleChoiceCount + config.codingQuestionCount,
        difficultyDistribution: config.difficultyDistribution,
        includeHints: config.includeHints,
      });

      // Tạo quiz với prompt chi tiết
      const mainQuiz = await this.quizGenerator.generate(safeTopicSlug, {
        ...config
      }, quizPrompt);

      const finalQuiz = {
        ...mainQuiz,
        id: uuidv4(),
        questions: this.convertQuestions(mainQuiz.questions),
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
        },
        topicSlug: safeTopicSlug,
        topicName,
        similarTopics // Lưu vào quiz
      };

      await this.memory.saveQuiz(finalQuiz);
      await this.saveQuizSession(finalQuiz, safeTopicSlug, { suggestedTopics: similarTopics, similarTopics }, undefined);
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

  private async saveQuizSession(quiz: Quiz, topic: string, context: any, evaluation?: QuizEvaluation): Promise<void> {
    try {
      // Create basic session first
      const session = await this.memory.createSession(topic, quiz);
      
      // Get prompt history
      const promptHistory = await this.memory.getPromptHistory(topic);
      
      // Then update session with context, evaluation and prompt history
      const sessionUpdates: Partial<QuizSession> = {
        similarTopics: context?.suggestedTopics || [],
        evaluation: evaluation,
        promptHistory: promptHistory ? {
          attempts: promptHistory.attempts,
          successfulPrompts: promptHistory.successfulPrompts,
          failedPrompts: promptHistory.failedPrompts,
          averageScore: promptHistory.averageScore
        } : undefined,
        updatedAt: new Date()
      };
      await this.memory.updateSession(session.id, sessionUpdates);
      
      // Save subtopics if available
      if (context?.subtopics) {
        await this.memory.saveSubtopics(session.id, context.subtopics);
      }

      console.log(`Quiz session saved successfully. ID: ${session.id}`);
    } catch (error) {
      console.error('Error saving quiz session:', error);
      throw error;
    }
  }


  private convertQuestions(questions: any[]): (MultipleChoiceQuestion | CodingQuestion)[] {
    return questions;  // No conversion needed since questions are already in the correct format
  }

  /**
   * Evaluates a quiz and returns detailed feedback and scores
   * @param quiz The quiz to evaluate
   * @param topic The topic of the quiz (used for prompt feedback)
   * @returns A QuizEvaluation object with scores and feedback
   */
  async evaluateQuiz(quiz: Quiz, topic: string): Promise<QuizEvaluation> {
    try {
      console.log('\n=== Starting Detailed Quiz Evaluation ===');
      
      const result = await this.quizEvaluator.evaluate(quiz, {
        strictMode: true,
        evaluationCriteria: {
          technicalAccuracy: true,
          difficultyBalance: true,
          clarity: true,
          coverage: true
        }
      });
      
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

      console.log('\n📝 Evaluation Details:');
      console.log(`Quiz ID: ${evaluation.quizId}`);
      console.log(`Overall Score: ${evaluation.score.toFixed(2)}`);
      console.log('\nFeedback Breakdown:');
      Object.entries(evaluation.feedback).forEach(([category, score]) => {
        console.log(`${category}: ${score.toFixed(2)}`);
      });

      if (evaluation.issues.length > 0) {
        console.log('\n⚠️ Identified Issues:');
        evaluation.issues.forEach(issue => {
          const severityIcon = {
            low: '🟡',
            medium: '🟠',
            high: '🔴'
          }[issue.severity] || '⚪';
          console.log(`${severityIcon} [${issue.severity.toUpperCase()}] ${issue.description}`);
        });
      }

      if (evaluation.suggestions.length > 0) {
        console.log('\n💡 Improvement Suggestions:');
        evaluation.suggestions.forEach((suggestion, index) => {
          console.log(`${index + 1}. ${suggestion}`);
        });
      }

      console.log('\n=== End of Detailed Quiz Evaluation ===\n');

      // Store feedback for prompt improvement
      await this.quizEvaluator.provideFeedback(topic, quiz, {
        strictMode: true,
        evaluationCriteria: {
          technicalAccuracy: true,
          difficultyBalance: true,
          clarity: true,
          coverage: true,
          promptQuality: true
        }
      });

      return evaluation;
    } catch (error) {
      console.error('Failed to evaluate quiz:', error);
      throw error;
    }
  }

  // Helper methods for evaluation
  private extractCriteriaScore(result: EvaluationResult, criteriaName: string): number {
    // Add null/undefined checks for all properties
    if (!result || !result.metadata || !result.metadata.criteriaUsed || !Array.isArray(result.metadata.criteriaUsed)) {
      // console.log(`Missing metadata.criteriaUsed for criteria: ${criteriaName}`);
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
      // console.log('Missing questionEvaluations in calculateQualityScore');
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
      console.log(`Updating prompt history for topic: ${topic}`);
      
      // Get existing history or create a new one
      let history = await this.memory.getPromptHistory(topic) || {
        topic,
        attempts: 0,
        successfulPrompts: [],
        failedPrompts: [],
        averageScore: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      // Update history
      history.attempts++;
      history.updatedAt = new Date();
      
      // Create a prompt feedback object from the evaluation
      const promptFeedback: QuizPromptFeedback = {
        prompt: await this.promptBuilder.getLastGeneratedPrompt(topic),
        score: evaluation.score,
        timestamp: new Date(),
        feedback: {
          strengths: evaluation.feedback.quality >= 0.7 ? ['Good quality questions'] : [],
          weaknesses: evaluation.issues.map(issue => issue.description),
          suggestions: evaluation.suggestions
        }
      };
      
      // Add to successful or failed prompts
      if (evaluation.score >= 0.7) {
        history.successfulPrompts.push(promptFeedback);
        console.log(`Added successful prompt with score: ${evaluation.score}`);
      } else {
        history.failedPrompts.push(promptFeedback);
        console.log(`Added failed prompt with score: ${evaluation.score}`);
      }
      
      // Calculate new average score
      const allPrompts = [...history.successfulPrompts, ...history.failedPrompts];
      history.averageScore = allPrompts.reduce((sum, pf) => sum + pf.score, 0) / allPrompts.length;
      
      // Save updated history
      await this.memory.savePromptHistory(topic, history);
      console.log(`Successfully updated prompt history for topic: ${topic}`);
      console.log(`New average score: ${history.averageScore}`);
      console.log(`Total attempts: ${history.attempts}`);
    } catch (error) {
      console.error('Error updating prompt history with evaluation:', error);
      throw error; // Re-throw to handle at higher level
    }
  }

  // Thêm phương thức để truy cập MemoryService từ bên ngoài
  public getMemoryService(): MemoryService {
    return this.memory;
  }

  private getDifficultyDistribution(difficulty: 'basic' | 'intermediate' | 'advanced'): DifficultyDistribution {
    const distributions: { [key: string]: DifficultyDistribution } = {
      basic: { basic: 60, intermediate: 30, advanced: 10 },
      intermediate: { basic: 30, intermediate: 50, advanced: 20 },
      advanced: { basic: 10, intermediate: 40, advanced: 50 }
    };
    return distributions[difficulty] || distributions.intermediate;
  }

  private async buildQuizConfig(topic: string, subtopic: SubtopicAnalysis): Promise<QuizGenerationConfig> {
    const defaultSourceQuality = {
      credibility: 0.5,
      recency: 0.5,
      diversity: 0.5
    };

    const config: QuizGenerationConfig = {
      multipleChoiceCount: Math.round(this.DEFAULT_QUESTIONS_PER_SUBTOPIC * 0.7),
      codingQuestionCount: Math.round(this.DEFAULT_QUESTIONS_PER_SUBTOPIC * 0.3),
      questionCount: this.DEFAULT_QUESTIONS_PER_SUBTOPIC,
      difficulty: subtopic.difficulty || 'intermediate',
      difficultyDistribution: this.getDifficultyDistribution(subtopic.difficulty || 'intermediate'),
      typeDistribution: {
        multipleChoice: 0.7,
        coding: 0.3
      },
      includeHints: true,
      maxAttempts: 3
    };

    // Only add analysisResults if we have valid data
    if (subtopic.searchAnalysis) {
      config.analysisResults = {
        mainSummary: subtopic.searchAnalysis.mainSummary || '',
        importantPoints: subtopic.searchAnalysis.importantPoints || [],
        topicRelevanceScore: subtopic.searchAnalysis.topicRelevanceScore || 0.5,
        sourceQuality: subtopic.searchAnalysis.sourceQuality || defaultSourceQuality,
        recommendations: subtopic.searchAnalysis.recommendations || []
      };
    }

    return config;
  }
} 