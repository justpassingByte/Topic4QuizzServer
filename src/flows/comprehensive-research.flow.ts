import { ContextAnalyzer, ContextAnalysisData } from '../agents/context-analyzer.agent';
import { ResearchAgent, ResearchData, TopicResearchResult, SubtopicResearchData } from '../agents/research-agent';
import { SearchAnalysisAgent } from '../agents/search-analysis-agent';
import { AIAnalysisOutput, WebSearchResult } from '../interfaces/search-analysis.interface';
import { ModelConfigService } from '../services/model-config.service';
import { ModelAdapterService } from '../services/model-adapter.service';

export interface SubtopicAnalysis {
  name: string;
  research: ResearchData;
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
  private researchAgent: ResearchAgent;
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
    this.researchAgent = new ResearchAgent(
      modelConfigService,
      modelAdapterService,
      serperApiKey
    );
    this.searchAnalysisAgent = new SearchAnalysisAgent(
      modelConfigService,
      modelAdapterService,
      serperApiKey
    );
  }

  async analyze(topic: string): Promise<ComprehensiveAnalysis> {
    console.log(`Starting comprehensive analysis for topic: ${topic}`);

    // Step 1: Analyze context to identify subtopics
    console.log('Step 1: Analyzing context...');
    const contextAnalysis = await this.contextAnalyzer.analyze(topic);
    console.log(`Found ${contextAnalysis.keyConcepts.length} key concepts and ${contextAnalysis.suggestedTopics?.length || 0} suggested topics`);

    // Step 2: Select and prioritize subtopics
    console.log('Step 2: Selecting priority subtopics...');
    const prioritizedSubtopics = this.prioritizeSubtopics(
      contextAnalysis.keyConcepts.map(c => c.name),
      contextAnalysis.suggestedTopics || []
    );

    // Step 3: Research all subtopics in relation to the main topic
    console.log(`Step 3: Researching ${prioritizedSubtopics.length} selected subtopics...`);
    
    // 3.1: Perform detailed research on all subtopics together
    const topicResearch = await this.researchAgent.researchSubtopics(
      topic,
      prioritizedSubtopics,
      { includeReferences: true }
    );
    console.log(`Completed research on ${topicResearch.subtopicResearch.length} subtopics`);
    
    // 3.2: Search and analyze web content for each subtopic
    const subtopicAnalyses: SubtopicAnalysis[] = [];
    
    for (const subtopicData of topicResearch.subtopicResearch) {
      console.log(`Analyzing web content for subtopic: ${subtopicData.subtopic}`);
      
      // Perform web search analysis
      const searchQuery = `${topic} ${subtopicData.subtopic}`;
      const searchAnalysis = await this.searchAnalysisAgent.searchAndAnalyzeWithMixtral(searchQuery);

      subtopicAnalyses.push({
        name: subtopicData.subtopic,
        research: subtopicData.research,
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