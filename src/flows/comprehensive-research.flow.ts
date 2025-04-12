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

  async analyze(topic: string): Promise<ComprehensiveAnalysis> {
    // console.log(`Starting comprehensive analysis for topic: ${topic}`);

    // Step 1: Analyze context to identify subtopics
    // console.log('Step 1: Analyzing context...');
    const contextAnalysis = await this.contextAnalyzer.analyze(topic);
    // console.log(`Found ${contextAnalysis.keyConcepts.length} key concepts and ${contextAnalysis.suggestedTopics?.length || 0} suggested topics`);

    // Step 2: Select and prioritize subtopics
    // console.log('Step 2: Selecting priority subtopics...');
    const prioritizedSubtopics = this.prioritizeSubtopics(
      contextAnalysis.keyConcepts.map(c => c.name),
      contextAnalysis.suggestedTopics || []
    );

    // Step 3: Search and analyze web content for each subtopic
    // console.log(`Step 3: Analyzing ${prioritizedSubtopics.length} selected subtopics...`);
    const subtopicAnalyses: SubtopicAnalysis[] = [];
    
    for (const subtopic of prioritizedSubtopics) {
      // console.log(`Analyzing web content for subtopic: ${subtopic}`);
      
      // Perform web search analysis
      const searchQuery = `${topic} ${subtopic}`;
      const searchAnalysis = await this.searchAnalysisAgent.searchAndAnalyze(searchQuery, {
        searchResultLimit: 5,
        maxTokens: 1000,
        temperature: 0.3
      });

      subtopicAnalyses.push({
        name: subtopic,
        searchAnalysis
      });
    }

    // Step 4: Calculate overall metrics
    const overallDifficulty = this.calculateOverallDifficulty(
      contextAnalysis.difficulty,
      subtopicAnalyses
    );

    const estimatedStudyTime = this.calculateEstimatedStudyTime(
      contextAnalysis.estimatedTime || 0,
      subtopicAnalyses
    );

    return {
      mainTopic: topic,
      contextAnalysis,
      subtopicAnalyses,
      overallDifficulty,
      estimatedStudyTime
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
} 