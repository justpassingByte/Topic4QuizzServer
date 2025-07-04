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
    // console.log(`ANALYZER: Starting analysis for topic "${topic}"...`);
    return this.analyzeContext(topic, topic);
  }

  async analyzeContext(
    content: string,
    topic: string
  ): Promise<ContextAnalysisData> {
    // console.log('=== ANALYZING CONTEXT ===');
    
    try {
      const prompt = `${CONTEXT_ANALYZER_PROMPT}
      
Context: 
${content}

Topic: ${topic}

Return a VALID JSON object with this exact structure:
{
  "keyConcepts": [
    {
      "name": string,
      "description": string,
      "relationships": string[],
      "prerequisites": string[]
    }
  ],
  "suggestedTopics": string[],
  "difficulty": "basic" | "intermediate" | "advanced",
  "estimatedTime": number,
  "keyAreas": string[]
}

Do not include any text outside the JSON. Ensure the JSON is properly formatted with all required fields.`;

      const modelConfig = this.modelConfigService.getModelConfigForAgent(AgentType.CONTEXT_ANALYZER);
      
      // Generate the analysis
      const response = await this.modelAdapter.generateText({
        ...modelConfig,
        prompt,
        maxTokens: 1000,
        temperature: 0.3
      });

      // Extract JSON from Hugging Face response
      let jsonContent = '';
      try {
        const huggingFaceResponse = JSON.parse(response.content);
        if (Array.isArray(huggingFaceResponse) && huggingFaceResponse[0]?.generated_text) {
          const text = huggingFaceResponse[0].generated_text;
          // Extract JSON from markdown code block
          const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (match) {
            jsonContent = match[1].trim();
          }
        }
      } catch (e) {
        // If not a Hugging Face response, use raw content
        jsonContent = response.content;
      }
      // Fix malformed JSON
      if (!jsonContent.includes('"keyConcepts"')) {
        // Check if content is just an array of concepts
        if (jsonContent.trim().startsWith('{') && jsonContent.includes('"name"')) {
          // Convert to proper format
          jsonContent = `{
            "keyConcepts": [${jsonContent}],
            "suggestedTopics": [],
            "difficulty": "intermediate",
            "estimatedTime": 30,
            "keyAreas": []
          }`;
        }
      }

      // Clean up any formatting issues
      jsonContent = jsonContent
        .replace(/},\s*}/g, '}}')  // Fix extra comma before closing brace
        .replace(/},\s*(?=})/g, '}')  // Fix trailing comma in objects
        .replace(/\}\s*,\s*(?!\s*[\{\[])/g, '}'); // Fix invalid commas between objects

      // console.log('=== CLEANED JSON CONTENT ===');
      // console.log(jsonContent);

      try {
        // Parse the JSON content
        const analysisData = JSON.parse(jsonContent) as ContextAnalysisData;
        
        // Log parsed data
        // console.log('=== PARSED CONTEXT ANALYSIS ===');
        if (analysisData && analysisData.keyConcepts) {
          // console.log('Key Concepts found:', analysisData.keyConcepts.length);
          // console.log('Analysis Data:', JSON.stringify(analysisData, null, 2));
          return this.ensureValidAnalysis(analysisData, topic);
        }
      } catch (parseError) {
        console.error('Parse error:', parseError);
        // Try to extract concepts array
        try {
          const conceptsMatch = jsonContent.match(/\[\s*(\{[\s\S]*\})\s*\]/);
          if (conceptsMatch) {
            const concepts = JSON.parse(`[${conceptsMatch[1]}]`);
            const analysisData: ContextAnalysisData = {
              keyConcepts: concepts,
              suggestedTopics: [],
              difficulty: 'intermediate',
              estimatedTime: 30,
              keyAreas: concepts.map((c: { name: string }) => c.name)
            };
            return this.ensureValidAnalysis(analysisData, topic);
          }
        } catch (e) {
          console.error('Failed to extract concepts:', e);
        }
      }
      
      console.log('No valid analysis data found, using fallback');
      return this.createFallbackAnalysis(topic, '');
    } catch (error) {
      console.error('Context analysis failed:', error);
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

function cleanAndParseJson(jsonString: string): any {
  // Remove markdown code block fences and trim whitespace
  const cleanedString = jsonString.replace(/^```json\s*/, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(cleanedString);
  } catch (error) {
    console.error("Parse error after cleaning:", error);
    // You might want to add more robust error handling or logging here
    throw new Error(`Failed to parse JSON. Content preview: ${cleanedString.substring(0, 100)}`);
  }
} 
