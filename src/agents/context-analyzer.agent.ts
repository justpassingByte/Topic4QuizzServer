import { ApiKeyService } from '../services/api-key.service';
import { ModelConfigService, AgentType } from '../services/model-config.service';
import { ModelAdapterService, ModelProvider } from '../services/model-adapter.service';
import { CONTEXT_ANALYZER_PROMPT } from './prompts/context-analyzer.prompt';
import { parseJSON } from '../utils/json-parser.util';

export interface ContextAnalysisData {
  keyConcepts: Array<{
    name: string;
    description: string;
    relationships?: string[];
    prerequisites?: string[];
  }>;
  suggestedTopics?: string[];
  similarTopics?: string[];
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

  async analyze(topic: string, slugList: string[]): Promise<{ topicSlug: string; similarTopics: string[] }> {
    return this.analyzeContext(topic, topic, slugList);
  }

  async analyzeContext(
    content: string,
    topic: string,
    slugList: string[]
  ): Promise<{ topicSlug: string; similarTopics: string[] }> {
    try {
      const prompt = `${CONTEXT_ANALYZER_PROMPT}\n\nInput:\n- userInput: ${topic}\n- slugs: [${slugList.join(', ')}]\n\nOutput:`;
      const modelConfig = this.modelConfigService.getModelConfigForAgent(AgentType.CONTEXT_ANALYZER);
      const response = await this.modelAdapter.generateText({
        ...modelConfig,
        prompt,
        maxTokens: 400,
        temperature: 0.3
      });
      let jsonContent = '';
      try {
        const huggingFaceResponse = JSON.parse(response.content);
        if (Array.isArray(huggingFaceResponse) && huggingFaceResponse[0]?.generated_text) {
          const text = huggingFaceResponse[0].generated_text;
          const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (match) {
            jsonContent = match[1].trim();
          } else {
            jsonContent = text.trim();
          }
        } else {
          jsonContent = response.content;
        }
      } catch (e) {
        jsonContent = response.content;
      }
      // Clean up any formatting issues
      if (jsonContent.trim().startsWith('```')) {
        jsonContent = jsonContent.replace(/^```json|^```|```$/g, '').trim();
      }
      jsonContent = jsonContent
        .replace(/},\s*}/g, '}}')
        .replace(/},\s*(?=})/g, '}')
        .replace(/\}\s*,\s*(?!\s*[\{\[])/g, '}');
      try {
        const result = parseJSON(jsonContent);
        if (result && typeof result === 'object' && 'topicSlug' in result && 'similarTopics' in result) {
          let topicSlug = result.topicSlug;
          let similarTopics = Array.isArray(result.similarTopics) ? result.similarTopics : [];
          // Nếu topicSlug là object (không phải string), lấy topicSlug từ object đó
          while (typeof topicSlug === 'object' && topicSlug !== null) {
            if ('topicSlug' in topicSlug) {
              topicSlug = topicSlug.topicSlug;
            } else {
              topicSlug = topic;
              break;
            }
          }
          // Parse lồng nhiều lớp nếu topicSlug là string chứa code block hoặc JSON
          while (typeof topicSlug === 'string' && (topicSlug.trim().startsWith('```') || topicSlug.trim().startsWith('{'))) {
            let cleaned = topicSlug.trim();
            if (cleaned.startsWith('```')) {
              cleaned = cleaned.replace(/^```json|^```|```$/g, '').trim();
            }
            try {
              const inner = JSON.parse(cleaned);
              if (typeof inner.topicSlug === 'string') {
                topicSlug = inner.topicSlug;
              }
              if (Array.isArray(inner.similarTopics)) {
                similarTopics = inner.similarTopics;
              }
              if (!(typeof topicSlug === 'string' && (topicSlug.trim().startsWith('```') || topicSlug.trim().startsWith('{')))) {
                break;
              }
            } catch {
              break;
            }
          }
          // Sau khi đã parse lồng nhiều lớp, nếu topicSlug vẫn là string chứa JSON, parse tiếp một lần cuối cùng
          if (typeof topicSlug === 'string' && topicSlug.trim().startsWith('{')) {
            try {
              const inner = JSON.parse(topicSlug);
              if (typeof inner.topicSlug === 'string') {
                topicSlug = inner.topicSlug;
              }
              if (Array.isArray(inner.similarTopics)) {
                similarTopics = inner.similarTopics;
              }
            } catch {}
          }
          if (!similarTopics || similarTopics.length === 0) {
            similarTopics = slugList.filter(slug => slug !== topicSlug).slice(0, 5);
          }
          // Đảm bảo topicSlug luôn là string thực sự
          const finalTopicSlug: string = extractSlug(topicSlug) || (typeof topic === 'string' ? topic : String(topic));
          return {
            topicSlug: finalTopicSlug,
            similarTopics: Array.isArray(similarTopics) ? similarTopics : []
          };
        }
        // Nếu không đúng format, fallback
        return {
          topicSlug: topic,
          similarTopics: slugList.filter(slug => slug !== topic).slice(0, 5)
        };
      } catch (parseError) {
        console.error('Parse error:', parseError);
      }
      // Fallback: return topic as topicSlug, 3-5 slug khác
      return {
        topicSlug: topic,
        similarTopics: slugList.filter(slug => slug !== topic).slice(0, 5)
      };
    } catch (error) {
      console.error('Context analysis failed:', error);
      return {
        topicSlug: topic,
        similarTopics: slugList.filter(slug => slug !== topic).slice(0, 5)
      };
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

// Thêm export để có thể sử dụng extractSlug ở nơi khác
export function extractSlug(slug: any): string {
  // Nếu là string, thử parse tiếp nếu là JSON
  while (typeof slug === 'string') {
    const trimmed = slug.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
      try {
        const parsed = JSON.parse(trimmed);
        slug = parsed;
        continue;
      } catch {
        break;
      }
    }
    break;
  }
  // Nếu là object, tiếp tục lấy topicSlug bên trong
  while (typeof slug === 'object' && slug !== null && 'topicSlug' in slug) {
    slug = slug.topicSlug;
  }
  // Đảm bảo trả về string cuối cùng
  return typeof slug === 'string' ? slug : '';
} 
