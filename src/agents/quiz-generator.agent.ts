import { v4 as uuidv4 } from 'uuid';
import { ModelConfigService } from '../services/model-config.service';
import { ModelAdapterService } from '../services/model-adapter.service';
import { AgentType } from '../services/model-config.service';
import { QUIZ_GENERATOR_PROMPT, buildDynamicQuizPrompt, QUIZ_GENERATOR_TEMPLATE } from './prompts/quiz-generator.prompt';
import { 
  Quiz as QuizModel, 
  QuizGenerationConfig, 
  Question as ModelQuestion,
  DifficultyDistribution,
  QuizSession,
  MultipleChoiceQuestion,
  CodingQuestion,
  Choice
} from '../models/quiz.model';

export interface SearchBasedQuizConfig {
  questionCount?: number;
  difficulty?: 'basic' | 'intermediate' | 'advanced';
  analysisResults: AIAnalysisOutput;
  includeSourceInfo?: boolean;
}

export interface AIAnalysisOutput {
  mainSummary: string;
  importantPoints: string[];
  subtopics?: string[];
  keyTerms?: string[];
  sourceQuality?: {
    credibility: number;
    recency: number;
    diversity: number;
  };
  topicRelevanceScore: number;
  recommendations?: string[];
}

export interface QuizGeneratorConfig {
  config: QuizGenerationConfig;
  metadata: {
    difficulty: 'basic' | 'intermediate' | 'advanced';
    totalQuestions: number;
    generatedAt: string;
    estimatedTime: number;
  };
}

export class QuizGeneratorAgent {
  constructor(
    private readonly modelConfigService: ModelConfigService,
    private readonly modelAdapterService: ModelAdapterService
  ) {}

  private mapToModelQuestion(question: any): ModelQuestion {
    const baseQuestion = {
      id: question.id || uuidv4(),
      text: question.question,
      difficulty: question.difficulty,
      explanation: question.explanation
    };

    if (question.type === 'multiple-choice') {
      const choices: Choice[] = (question.options || []).map((option: string, index: number) => ({
        id: uuidv4(),
        text: option,
        isCorrect: index === question.correctAnswer || index === question.correctIndex
      }));

      return {
        ...baseQuestion,
        type: 'multiple-choice',
        choices
      } as MultipleChoiceQuestion;
    } else {
      return {
        ...baseQuestion,
        type: 'coding',
        solution: question.correctAnswer,
        hints: question.hints,
        solutionTemplate: question.solutionTemplate
      } as CodingQuestion;
    }
  }

  async generate(
    topic: string, 
    prompt: any, 
    config: QuizGeneratorConfig 
  ): Promise<QuizModel> {
    const modelConfig = this.modelConfigService.getModelConfigForAgent(AgentType.QUIZ_GENERATOR);
    
    const defaultConfig: QuizGenerationConfig = {
      multipleChoiceCount: 5,
      codingQuestionCount: 2,
      difficultyDistribution: {
        basic: 40,
        intermediate: 40,
        advanced: 20
      },
      typeDistribution: {
        multipleChoice: 0.8,
        coding: 0.2
      },
      includeHints: true,
      maxAttempts: 3
    };

    const finalConfig = { ...defaultConfig, ...config.config };
    
    const promptText = `${QUIZ_GENERATOR_PROMPT}

Topic: ${topic}

${typeof prompt === 'object' && prompt.prompt ? prompt.prompt : prompt}

Configuration:
${JSON.stringify(finalConfig, null, 2)}`;

    const response = await this.modelAdapterService.generateText({
      ...modelConfig,
      maxTokens: 3000,
      temperature: 0.7,
      prompt: promptText
    });

    console.log(`Attempting to parse quiz response for topic: ${topic}`);
    const quizData = this.modelAdapterService.parseJSON<any>(response.content);
    
    if (!quizData) {
      throw new Error('Failed to parse quiz response as JSON');
    }
    
    // Handle both new and old format responses
    const questions = quizData.questions || (Array.isArray(quizData) ? quizData : [quizData]);
    
    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error('Quiz response is missing valid questions array');
    }

    // Add IDs to questions if they don't have one
    const questionsWithIds = questions.map((q: any) => ({
      ...q,
      id: q.id || uuidv4()
    }));
    
    // Map questions to the correct model format
    const modelQuestions = questionsWithIds.map((q: any) => this.mapToModelQuestion(q));

    const quiz: QuizModel = {
      id: uuidv4(),
      questions: modelQuestions,
      createdAt: new Date(),
      config: finalConfig,
      metadata: {
        difficulty: config.metadata.difficulty,
        totalQuestions: modelQuestions.length,
        generatedAt: new Date().toISOString(),
        estimatedTime: config.metadata.estimatedTime
      }
    };

    // Create a QuizSession to store the topic
    const quizSession: QuizSession = {
      id: uuidv4(),
      quiz: quiz,
      topic: topic,
      createdAt: new Date()
    };

    return quiz;
  }

  async generateFromSearchResults(
    topic: string,
    searchConfig: SearchBasedQuizConfig
  ): Promise<QuizModel> {
    console.log(`Generating quiz for topic: ${topic} based on search analysis`);
    
    // Kiểm tra xem có subtopics từ phân tích không
    const hasSubtopics = searchConfig.analysisResults.subtopics && 
                        searchConfig.analysisResults.subtopics.length > 0;
                        
    console.log(`Analysis has subtopics: ${hasSubtopics ? 'Yes' : 'No'}`);
    if (hasSubtopics) {
      console.log(`Subtopics: ${searchConfig.analysisResults.subtopics!.join(', ')}`);
    }

    // Tối ưu cấu hình dựa trên kết quả phân tích
    const topicRelevance = searchConfig.analysisResults.topicRelevanceScore || 0.5;
    const sourceQuality = searchConfig.analysisResults.sourceQuality || 
                         { credibility: 0.5, recency: 0.5, diversity: 0.5 };
    
    // Điều chỉnh số lượng câu hỏi theo độ liên quan của chủ đề
    const baseQuestionCount = searchConfig.questionCount || 5;
    const adjustedQuestionCount = Math.max(3, Math.round(baseQuestionCount * (0.5 + topicRelevance/2)));
    
    // Điều chỉnh phân phối độ khó dựa trên chất lượng nguồn
    const qualityScore = (sourceQuality.credibility + sourceQuality.recency + sourceQuality.diversity) / 3;
    let adjustedDifficulty = searchConfig.difficulty || 'intermediate';
    
    // Nếu chất lượng nguồn cao, tăng độ khó
    if (qualityScore > 0.7 && topicRelevance > 0.7) {
      adjustedDifficulty = 'advanced';
    } 
    // Nếu chất lượng nguồn thấp, giảm độ khó
    else if (qualityScore < 0.4 || topicRelevance < 0.4) {
      adjustedDifficulty = 'basic';
    }
    
    console.log(`Adjusted difficulty: ${adjustedDifficulty} (based on quality score: ${qualityScore.toFixed(2)})`);
    console.log(`Adjusted question count: ${adjustedQuestionCount} (based on relevance: ${topicRelevance.toFixed(2)})`);

    // Chuẩn bị cấu hình quiz dựa trên kết quả tìm kiếm
    const quizConfig: QuizGeneratorConfig = {
      config: {
        multipleChoiceCount: Math.round(adjustedQuestionCount * 0.8),
        codingQuestionCount: Math.round(adjustedQuestionCount * 0.2),
        difficultyDistribution: this.getDifficultyDistribution(adjustedDifficulty as 'basic' | 'intermediate' | 'advanced'),
        typeDistribution: {
          multipleChoice: 0.8,
          coding: 0.2
        },
        includeHints: true,
        maxAttempts: 3
      },
      metadata: {
        difficulty: adjustedDifficulty as 'basic' | 'intermediate' | 'advanced',
        totalQuestions: adjustedQuestionCount,
        generatedAt: new Date().toISOString(),
        estimatedTime: this.calculateEstimatedTime(adjustedQuestionCount)
      }
    };

    // Tạo prompt nâng cao dựa trên phân tích tìm kiếm
    const enhancedPrompt = this.createEnhancedPrompt(topic, searchConfig.analysisResults);
    
    // Tối ưu token nếu prompt quá dài
    const promptLength = enhancedPrompt.length;
    const maxPromptLength = 4000;
    
    let finalPrompt = enhancedPrompt;
    if (promptLength > maxPromptLength) {
      console.log(`Prompt too long (${promptLength} chars), truncating...`);
      
      // Rút gọn các phần không quan trọng, giữ nguyên subtopics và điểm chính
      const lines = enhancedPrompt.split('\n');
      const essentialLines = lines.filter(line => 
        line.includes('subtopic') || 
        line.includes('Key Points') || 
        line.startsWith('-') || 
        line.includes('Topic:') ||
        line.includes('JSON format')
      );
      
      finalPrompt = essentialLines.join('\n');
      console.log(`Truncated prompt to ${finalPrompt.length} chars`);
    }

    return this.generate(topic, finalPrompt, quizConfig);
  }

  /**
   * Tạo quiz với phản hồi từ các lần tạo trước
   * @param topic Chủ đề chính
   * @param searchConfig Kết quả tìm kiếm và phân tích
   * @param feedbackData Dữ liệu phản hồi để cải thiện cho lần tạo tiếp theo
   */
  async generateWithFeedback(
    topic: string,
    searchConfig: SearchBasedQuizConfig,
    feedbackData: {
      strengths?: string[];
      weaknesses?: string[];
      suggestions?: string[];
    }
  ): Promise<QuizModel> {
    console.log(`Generating improved quiz for "${topic}" using feedback`);
    
    // Đảm bảo dữ liệu phản hồi không bị null
    const safeData = {
      strengths: feedbackData.strengths || [],
      weaknesses: feedbackData.weaknesses || [],
      suggestions: feedbackData.suggestions || []
    };
    
    console.log(`Feedback strengths: ${safeData.strengths.length}, weaknesses: ${safeData.weaknesses.length}, suggestions: ${safeData.suggestions.length}`);
    
    // Trích xuất và tối ưu subtopics
    const subtopics = searchConfig.analysisResults.subtopics || 
      searchConfig.analysisResults.importantPoints.map(point => {
        const match = point.match(/^([^.,:;]+)/);
        return match ? match[0].trim() : point.substring(0, 30).trim() + '...';
      })
      .filter(st => st.length > 5)  // Lọc bỏ subtopics quá ngắn
      .slice(0, 5);  // Giới hạn số lượng

    // Tối ưu cấu hình dựa trên phản hồi và kết quả tìm kiếm
    const difficultyFeedback = this.extractDifficultyFeedback(safeData);
    let targetDifficulty = searchConfig.difficulty || 'intermediate';
    
    // Điều chỉnh độ khó dựa trên phản hồi
    if (difficultyFeedback === 'harder') {
      targetDifficulty = this.increaseLevel(targetDifficulty as 'basic' | 'intermediate' | 'advanced');
    } else if (difficultyFeedback === 'easier') {
      targetDifficulty = this.decreaseLevel(targetDifficulty as 'basic' | 'intermediate' | 'advanced');
    }
    
    console.log(`Difficulty adjusted from ${searchConfig.difficulty} to ${targetDifficulty} based on feedback`);
    
    // Chuẩn bị cấu hình quiz
    const quizConfig: QuizGeneratorConfig = {
      config: {
        multipleChoiceCount: Math.round((searchConfig.questionCount || 5) * 0.8),
        codingQuestionCount: Math.round((searchConfig.questionCount || 5) * 0.2),
        difficultyDistribution: this.getDifficultyDistribution(targetDifficulty as 'basic' | 'intermediate' | 'advanced'),
        typeDistribution: {
          multipleChoice: 0.8,
          coding: 0.2
        },
        includeHints: true,
        maxAttempts: 3
      },
      metadata: {
        difficulty: targetDifficulty as 'basic' | 'intermediate' | 'advanced',
        totalQuestions: searchConfig.questionCount || 5,
        generatedAt: new Date().toISOString(),
        estimatedTime: this.calculateEstimatedTime(searchConfig.questionCount || 5)
      }
    };

    // Tạo prompt tối ưu với thông tin phản hồi
    const customPrompt = buildDynamicQuizPrompt(QUIZ_GENERATOR_TEMPLATE, {
      topic: topic,
      subtopics: subtopics,
      includeHints: true,
      feedback: {
        strengths: safeData.strengths.slice(0, 3),  // Giới hạn để tiết kiệm token
        weaknesses: safeData.weaknesses.slice(0, 3),
        suggestions: safeData.suggestions.slice(0, 3)
      }
    });

    // Tạo prompt ngắn gọn nhưng hiệu quả
    const shortFeedbackPrompt = `
${customPrompt}

TOPIC: ${topic}

SUBTOPICS:
${subtopics.map((sub, i) => `${i+1}. ${sub}`).join('\n')}

PREVIOUS QUIZ FEEDBACK:
${safeData.strengths.length > 0 ? `Strengths: ${safeData.strengths.slice(0, 3).join(', ')}` : ''}
${safeData.weaknesses.length > 0 ? `Improve: ${safeData.weaknesses.slice(0, 3).join(', ')}` : ''}
${safeData.suggestions.length > 0 ? `Suggestions: ${safeData.suggestions.slice(0, 3).join(', ')}` : ''}

IMPORTANT POINTS:
${searchConfig.analysisResults.importantPoints.slice(0, 5).map((p, i) => `${i+1}. ${p.length > 100 ? p.substring(0, 100) + '...' : p}`).join('\n')}

INSTRUCTIONS:
1. Create questions for EACH subtopic
2. Apply the feedback suggestions to improve this version
3. Ensure each question clearly relates to its subtopic
4. Include practical examples in questions where relevant
`;

    return this.generate(topic, shortFeedbackPrompt, quizConfig);
  }
  
  /**
   * Trích xuất phản hồi về độ khó từ phản hồi người dùng
   */
  private extractDifficultyFeedback(feedback: {
    strengths?: string[];
    weaknesses?: string[];
    suggestions?: string[];
  }): 'harder' | 'easier' | 'same' {
    // Từ khóa chỉ điều chỉnh độ khó
    const harderKeywords = ['too easy', 'increase difficulty', 'more challenging', 'too simple', 'basic'];
    const easierKeywords = ['too difficult', 'too hard', 'simplify', 'reduce difficulty', 'complex', 'complicated'];
    
    // Kết hợp tất cả phản hồi thành một chuỗi để tìm kiếm
    const allFeedback = [
      ...(feedback.weaknesses || []), 
      ...(feedback.suggestions || [])
    ].join(' ').toLowerCase();
    
    // Kiểm tra xem có từ khóa nào khớp không
    const needsHarder = harderKeywords.some(keyword => allFeedback.includes(keyword));
    const needsEasier = easierKeywords.some(keyword => allFeedback.includes(keyword));
    
    if (needsHarder && !needsEasier) return 'harder';
    if (needsEasier && !needsHarder) return 'easier';
    return 'same';
  }
  
  /**
   * Tăng mức độ khó
   */
  private increaseLevel(level: 'basic' | 'intermediate' | 'advanced'): 'basic' | 'intermediate' | 'advanced' {
    if (level === 'basic') return 'intermediate';
    if (level === 'intermediate') return 'advanced';
    return 'advanced';
  }
  
  /**
   * Giảm mức độ khó
   */
  private decreaseLevel(level: 'basic' | 'intermediate' | 'advanced'): 'basic' | 'intermediate' | 'advanced' {
    if (level === 'advanced') return 'intermediate';
    if (level === 'intermediate') return 'basic';
    return 'basic';
  }

  private createEnhancedPrompt(topic: string, analysis: AIAnalysisOutput): string {
    // Rút trích subtopics từ kết quả phân tích
    const subtopics = analysis.subtopics || 
      analysis.importantPoints.map(point => {
        // Chuyển đổi điểm quan trọng thành định dạng subtopic nếu không có subtopics
        const match = point.match(/^([^.,:;]+)/);
        return match ? match[0].trim() : point.substring(0, 30).trim() + '...';
      }).filter(st => st.length > 5); // Lọc bỏ subtopics quá ngắn
    
    // Giới hạn số lượng subtopics để tránh prompt quá dài
    const limitedSubtopics = subtopics.slice(0, Math.min(subtopics.length, 5));

    // Rút trích thuật ngữ chính cho focus areas
    const focusAreas = analysis.keyTerms || 
      analysis.importantPoints.flatMap(point => {
        // Rút trích thuật ngữ từ điểm quan trọng
        const terms = point.match(/\b([A-Z][a-z]{2,}|[A-Z]{2,}[a-z]*)\b/g); // Đã cải thiện regex
        return terms || [];
      });
    
    // Loại bỏ trùng lặp và chọn những thuật ngữ dài nhất
    const uniqueFocusAreas = Array.from(new Set(focusAreas))
      .filter(term => term.length > 3)  // Loại bỏ các thuật ngữ quá ngắn
      .sort((a, b) => b.length - a.length)  // Sắp xếp theo độ dài giảm dần
      .slice(0, 5);  // Chỉ lấy top 5
    
    // Tìm các thuật ngữ quan trọng trong mainSummary
    const summaryTerms = analysis.mainSummary.match(/\b([A-Z][a-z]{2,}|[A-Z]{2,}[a-z]*)\b/g) || [];
    const additionalTerms = Array.from(new Set(summaryTerms))
      .filter(term => !uniqueFocusAreas.includes(term) && term.length > 3)
      .slice(0, 3);
    
    // Kết hợp tất cả các thuật ngữ quan trọng
    const allFocusAreas = [...uniqueFocusAreas, ...additionalTerms];
    
    // Rút gọn các importantPoints để giảm độ dài prompt
    const shortenedPoints = analysis.importantPoints.map(point => {
      if (point.length > 100) {
        return point.substring(0, 100) + '...';
      }
      return point;
    });

    // Xây dựng prompt tùy chỉnh sử dụng QUIZ_GENERATOR_TEMPLATE
    const customPrompt = buildDynamicQuizPrompt(QUIZ_GENERATOR_TEMPLATE, {
      topic: topic,
      subtopics: limitedSubtopics,
      focusAreas: allFocusAreas,
      includeHints: true,
      // Thêm phản hồi nếu phân tích có chứa đề xuất
      feedback: analysis.recommendations?.length ? {
        weaknesses: [], // Không có điểm yếu để báo cáo ban đầu
        suggestions: analysis.recommendations.slice(0, 3) // Giới hạn số lượng đề xuất
      } : undefined
    });

    // Rút gọn phiên bản mở rộng của prompt
    const shortPrompt = `
${customPrompt}

Topic: ${topic}

Summary: ${analysis.mainSummary.length > 200 ? analysis.mainSummary.substring(0, 200) + '...' : analysis.mainSummary}

Key Points:
${shortenedPoints.map((point: string) => `- ${point}`).join('\n')}

${analysis.sourceQuality ? `Source Quality: Credibility=${analysis.sourceQuality.credibility.toFixed(1)}, Recency=${analysis.sourceQuality.recency.toFixed(1)}, Diversity=${analysis.sourceQuality.diversity.toFixed(1)}` : ''}

Relevance Score: ${analysis.topicRelevanceScore.toFixed(2)}

${analysis.recommendations?.length ? `Recommendations:\n${analysis.recommendations.slice(0, 2).map((rec: string) => `- ${rec}`).join('\n')}` : ''}

Instructions:
1. Create questions based on the subtopics above
2. Include practical examples and applications
3. Ensure coding questions have helpful hints
4. Tag each question with its related subtopic
`;

    return shortPrompt;
  }

  private getDifficultyDistribution(
    difficulty: 'basic' | 'intermediate' | 'advanced' = 'intermediate'
  ): DifficultyDistribution {
    const distributions: { [key in 'basic' | 'intermediate' | 'advanced']: DifficultyDistribution } = {
      basic: {
        basic: 60,
        intermediate: 30,
        advanced: 10
      },
      intermediate: {
        basic: 30,
        intermediate: 50,
        advanced: 20
      },
      advanced: {
        basic: 10,
        intermediate: 40,
        advanced: 50
      }
    };
    return distributions[difficulty];
  }

  private calculateEstimatedTime(questionCount: number): number {
    // Average time per question: 
    // - Multiple choice: 2 minutes
    // - Coding: 5 minutes
    const multipleChoiceTime = Math.ceil(questionCount * 0.6) * 2;
    const codingTime = Math.floor(questionCount * 0.4) * 5;
    return multipleChoiceTime + codingTime;
  }
}
