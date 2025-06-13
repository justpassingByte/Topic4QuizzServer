import { ContextAnalyzer, ContextAnalysisData } from '../agents/context-analyzer.agent';
import { SearchAnalysisAgent } from '../agents/search-analysis.agent';
import { AIAnalysisOutput } from '../agents/search-analysis.agent';
import { ModelConfigService } from '../services/model-config.service';
import { ModelAdapterService } from '../services/model-adapter.service';

export interface SubtopicAnalysis {
  name: string;
  searchAnalysis: AIAnalysisOutput;
}

export interface ComprehensiveAnalysis {
  mainTopic: string;
  contextAnalysis: ContextAnalysisData;
  subtopicAnalyses: SubtopicAnalysis[];
  overallDifficulty: 'basic' | 'intermediate' | 'advanced';
  estimatedStudyTime: number;
}

export class ComprehensiveResearchFlow {
  private contextAnalyzer: ContextAnalyzer;
  private searchAnalysisAgent: SearchAnalysisAgent;
  private readonly MAX_SUBTOPICS = 3; // Maximum number of subtopics to research

  constructor(
    private readonly modelConfigService: ModelConfigService,
    private readonly modelAdapterService: ModelAdapterService,
    private readonly serperApiKey: string
  ) {
    this.contextAnalyzer = new ContextAnalyzer(
      modelConfigService,
      modelAdapterService
    );
    this.searchAnalysisAgent = new SearchAnalysisAgent(
      modelConfigService,
      modelAdapterService,
      serperApiKey
    );
  }

  async analyze(topic: string): Promise<ComprehensiveAnalysis & { searchAnalysis: AIAnalysisOutput }> {
    // Chỉ thực hiện bước search web cho topic chính, bỏ context analysis và subtopic
    // const contextAnalysis = await this.contextAnalyzer.analyze(topic);
    // const prioritizedSubtopics = this.prioritizeSubtopics(
    //   contextAnalysis.keyConcepts.map(c => c.name),
    //   contextAnalysis.suggestedTopics || []
    // );

    // Search and analyze web content for the main topic
    const searchAnalysis = await this.searchAnalysisAgent.searchAndAnalyze(topic, {
      searchResultLimit: 5,
      maxTokens: 1000,
      temperature: 0.3
    });

    // Không còn subtopic, context analysis, chỉ trả về kết quả search cho topic chính
    return {
      mainTopic: topic,
      contextAnalysis: undefined as any, // hoặc null nếu cần
      subtopicAnalyses: [],
      overallDifficulty: 'intermediate', // hoặc lấy từ searchAnalysis nếu có
      estimatedStudyTime: 30, // hoặc lấy từ searchAnalysis nếu có
      searchAnalysis // Thêm trường searchAnalysis vào kết quả trả về
    };
  }

  private prioritizeSubtopics(keyConcepts: string[], suggestedTopics: string[]): string[] {
    // Prioritize key concepts first
    const prioritizedTopics = [...keyConcepts];

    // If we have space for more topics, add suggested topics until we reach MAX_SUBTOPICS
    if (prioritizedTopics.length < this.MAX_SUBTOPICS) {
      const remainingSlots = this.MAX_SUBTOPICS - prioritizedTopics.length;
      const additionalTopics = suggestedTopics
        .filter(topic => !prioritizedTopics.includes(topic))
        .slice(0, remainingSlots);
      
      prioritizedTopics.push(...additionalTopics);
    }

    return prioritizedTopics.slice(0, this.MAX_SUBTOPICS);
  }

  private calculateOverallDifficulty(
    contextDifficulty: 'basic' | 'intermediate' | 'advanced',
    analyses: SubtopicAnalysis[]
  ): 'basic' | 'intermediate' | 'advanced' {
    // Convert difficulties to numbers for averaging
    const difficultyScores = {
      'basic': 1,
      'intermediate': 2,
      'advanced': 3
    };

    // Get average relevance-weighted score
    const totalScore = analyses.reduce((sum, analysis) => {
      return sum + (analysis.searchAnalysis.topicRelevanceScore * difficultyScores[contextDifficulty]);
    }, 0);

    const averageScore = totalScore / analyses.length;

    // Convert back to difficulty level
    if (averageScore <= 1.5) return 'basic';
    if (averageScore <= 2.5) return 'intermediate';
    return 'advanced';
  }

  private calculateEstimatedStudyTime(
    baseTime: number,
    analyses: SubtopicAnalysis[]
  ): number {
    // Base time from context analysis
    let totalTime = baseTime;

    // Add time based on subtopic complexity and relevance
    analyses.forEach(analysis => {
      const relevanceFactor = analysis.searchAnalysis.topicRelevanceScore;
      const complexityFactor = analysis.searchAnalysis.importantPoints.length / 5; // Normalize by assuming 5 points is average
      
      totalTime += 15 * relevanceFactor * complexityFactor; // 15 minutes base per subtopic
    });

    return Math.ceil(totalTime);
  }

  public getSearchAnalysisAgent(): SearchAnalysisAgent {
    return this.searchAnalysisAgent;
  }
} 