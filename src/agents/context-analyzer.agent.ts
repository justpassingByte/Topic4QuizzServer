import { ApiKeyService } from '../services/api-key.service';
import { ModelConfigService, AgentType } from '../services/model-config.service';
import { ModelAdapterService, ModelProvider } from '../services/model-adapter.service';
import { CONTEXT_ANALYZER_PROMPT } from './prompts/context-analyzer.prompt';

export interface ContextAnalysisData {
  keyConcepts: Array<{
    name: string;
    description: string;
    relationships?: string[];
    prerequisites?: string[];
  }>;
  suggestedTopics?: string[];
  difficulty: 'basic' | 'intermediate' | 'advanced';
  estimatedTime?: number;  // in minutes
  keyAreas?: string[];     // Added for backward compatibility
}

export interface AnalyzerConfig {
  maxTokens?: number;
}

export class ContextAnalyzer {
  private apiKeyService: ApiKeyService;

  constructor(
    private readonly modelConfigService: ModelConfigService,
    private readonly modelAdapter: ModelAdapterService
  ) {
    this.apiKeyService = new ApiKeyService();
  }

  async analyze(topic: string): Promise<ContextAnalysisData> {
    console.log(`ANALYZER: Starting analysis for topic "${topic}"...`);
    return this.analyzeContext(topic, topic);
  }

  async analyzeContext(
    content: string,
    topic: string
  ): Promise<ContextAnalysisData> {
    console.log('=== ANALYZING CONTEXT ===');
    
    try {
      // Clean content to prevent prompt injection and limit size
      // const cleanedContent = this.cleanContent(content);
      // console.log('Cleaned content (first 200 chars):', 
      //   cleanedContent.substring(0, 200) + (cleanedContent.length > 200 ? '...' : ''));
      console.log(content);
      const prompt = `${CONTEXT_ANALYZER_PROMPT}
      
Context: 
${content}

Topic: ${topic}

Produce only valid JSON following the structure above. Do not include comments, explanations, or additional text.`;

      const modelConfig = this.modelConfigService.getModelConfigForAgent(AgentType.CONTEXT_ANALYZER);
      
      // Generate the analysis
      const response = await this.modelAdapter.generateText({
        ...modelConfig,
        prompt,
        maxTokens: 1000,
        temperature: 0.3
      });
      
      // Parse the response
      const analysisData = this.modelAdapter.parseJSON<ContextAnalysisData>(response.content);
      
      // Log basic details about what was found
      console.log('=== PARSED CONTEXT ANALYSIS ===');
      if (analysisData) {
        console.log('Key Concepts:', analysisData.keyConcepts?.length || 0);
        console.log('Concepts:', analysisData.keyConcepts?.filter(c => !!c.name).length || 0);
        console.log('Difficulty:', analysisData.difficulty || 'unknown');
        console.log('Prerequisites Count:', analysisData.keyConcepts?.reduce((acc, c) => acc + (c.prerequisites?.length || 0), 0) || 0);
        console.log('Suggested Topics:', analysisData.suggestedTopics?.length || 0);
        console.log('Key Areas:', analysisData.keyAreas?.length || 0);
        console.log('Estimated Time:', analysisData.estimatedTime || 'unknown');
        
        return this.ensureValidAnalysis(analysisData, topic);
      } else {
        // Create a basic analysis if null
        return this.createFallbackAnalysis(topic, '');
      }
    } catch (error) {
      console.error('Context analysis failed:', error);
      
      // Return a minimal valid response
      return this.createFallbackAnalysis(topic, '');
    }
  }
  
  /**
   * Ensures the analysis data meets the required format
   */
  private ensureValidAnalysis(data: Partial<ContextAnalysisData> | null, topic: string): ContextAnalysisData {
    // Ensure we have a valid object
    if (!data || typeof data !== 'object') {
      return this.createFallbackAnalysis(topic, '');
    }
    
    // Ensure keyConcepts is an array
    if (!Array.isArray(data.keyConcepts) || data.keyConcepts.length === 0) {
      data.keyConcepts = [{
        name: topic,
        description: `The main topic being analyzed.`
      }];
    }
    
    // Clean up and ensure each concept has required fields
    data.keyConcepts = data.keyConcepts.map(concept => ({
      name: concept.name || 'Unknown concept',
      description: concept.description || `A concept related to ${topic}`,
      relationships: Array.isArray(concept.relationships) ? concept.relationships : [],
      prerequisites: Array.isArray(concept.prerequisites) ? concept.prerequisites : []
    }));
    
    // Ensure valid difficulty level
    if (!['basic', 'intermediate', 'advanced'].includes(data.difficulty || '')) {
      data.difficulty = 'intermediate';
    }
    
    // Ensure estimatedTime is a number
    if (typeof data.estimatedTime !== 'number' || isNaN(data.estimatedTime) || data.estimatedTime <= 0) {
      data.estimatedTime = 30; // Default 30 minutes
    }
    
    // Ensure suggestedTopics is an array
    if (!Array.isArray(data.suggestedTopics)) {
      data.suggestedTopics = [];
    }
    
    // Ensure keyAreas is an array (for backward compatibility)
    if (!Array.isArray(data.keyAreas)) {
      data.keyAreas = data.keyConcepts?.map(c => c.name) || [topic];
    }
    
    return data as ContextAnalysisData;
  }

  /**
   * Creates a fallback analysis when the normal process fails
   */
  private createFallbackAnalysis(topic: string, content: string): ContextAnalysisData {
    const topicWords = topic.split(' ');
    let mainTopic = topicWords[0];
    if (topicWords.length > 1) {
      mainTopic = topicWords.slice(0, 2).join(' ');
    }
    
    return {
      keyConcepts: [
        {
          name: topic,
          description: `The main topic covering ${mainTopic} concepts and applications.`,
          relationships: [],
          prerequisites: []
        }
      ],
      suggestedTopics: [],
      difficulty: 'intermediate',
      estimatedTime: 30,
      keyAreas: [topic]
    };
  }

  /**
   * Clean and prepare the content for analysis
   */
  private cleanContent(content: string): string {
    if (!content) return '';
    
    // Limit size to prevent excessive token usage
    let cleanedContent = content;
    if (cleanedContent.length > 10000) {
      cleanedContent = cleanedContent.substring(0, 10000) + '... (content truncated)';
    }
    
    // Remove any potential prompt injection attempts
    cleanedContent = cleanedContent
      .replace(/```/g, '')                                  // Remove code block markers
      .replace(/you are|you're an AI|as an AI/gi, '[X]')    // Remove potential prompt engineering
      .replace(/\[.*?\]\(.*?\)/g, '')                      // Remove markdown links
      .replace(/<.*?>/g, '');                              // Remove HTML tags
    
    return cleanedContent.trim();
  }

} 
