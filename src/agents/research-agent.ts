import axios from 'axios';
import { ModelConfigService } from '../services/model-config.service';
import { ModelAdapterService } from '../services/model-adapter.service';
import { AgentType } from '../services/model-config.service';
import { ResearchAgentConfig } from '../models/config.model';
import { RESEARCH_AGENT_TEMPLATE, buildDynamicResearchPrompt } from './prompts/research-agent.prompt';
import * as dotenv from 'dotenv';

// Ensure environment variables are loaded
dotenv.config();

interface WebSearchResult {
  title: string;
  link: string;
  snippet: string;
}

interface AIAnalysisOutput {
  mainSummary: string;
  importantPoints: string[];
  topicRelevanceScore: number;
}

export interface ResearchData {
  mainContent: string;
  concepts: Array<{
    name: string;
    description: string;
  }>;
  references?: Array<{
    title: string;
    url: string;
  }>;
}

export interface SubtopicResearchData {
  subtopic: string;
  research: ResearchData;
}

export interface TopicResearchResult {
  mainTopic: string;
  subtopicResearch: SubtopicResearchData[];
  relatedConcepts: string[];
}

export interface ResearchConfig {
  maxTokens?: number;
  temperature?: number;
  includeReferences?: boolean;
  focusOnMainTopic?: boolean;
}

export class ResearchAgent {
  constructor(
    private readonly modelConfigService: ModelConfigService,
    private readonly modelAdapterService: ModelAdapterService,
    private readonly serperApiKey: string
  ) {}

  /**
   * Perform research on a single topic
   */
  async performTopicResearch(
    topic: string, 
    context?: string, 
    config?: Partial<ResearchConfig>
  ): Promise<ResearchData> {
    try {
      console.log(`Starting research for topic: "${topic}" ${context ? `in context of "${context}"` : ''}`);
      
      const modelConfig = this.modelConfigService.getModelConfigForAgent(AgentType.RESEARCH_AGENT);
      
      // If we have context (main topic), include it in the prompt
      const contextualPrompt = context ? 
        `Research "${topic}" as a subtopic of "${context}"` : 
        `Research topic: ${topic}`;
      
      const dynamicPrompt = buildDynamicResearchPrompt(RESEARCH_AGENT_TEMPLATE, {
        topic,
        focus: context ? [context] : [],
        isSubtopic: !!context,
      });

      const fullPrompt = `
        ${dynamicPrompt}
        Follow this JSON format:
${RESEARCH_AGENT_TEMPLATE.formatInstructions}
`;

      console.log(`Sending research prompt to model for: "${topic}"`);
      const modelResponse = await this.modelAdapterService.generateText({
        ...modelConfig,
        maxTokens: config?.maxTokens || 1500, // Increase max tokens
        temperature: config?.temperature || 0.7,
        prompt: fullPrompt
      });

      console.log(`Received response of length ${modelResponse.content.length} for: "${topic}"`);
      console.log(`Response preview: ${modelResponse.content.substring(0, 200)}...`);
      
      // Log raw response for debugging
      if (modelResponse.content.length < 1000) {
        console.log(`Full response for debugging: ${modelResponse.content}`);
      }

      let parsedResult: ResearchData | null = null;
      
      try {
        parsedResult = this.modelAdapterService.parseJSON<ResearchData>(modelResponse.content);
        console.log(`Successfully parsed JSON for topic: "${topic}"`);
      } catch (parseError) {
        console.error(`Failed to parse research response for topic "${topic}":`, parseError);
        // Try to extract JSON if it's surrounded by markdown or other text
        try {
          const jsonMatch = modelResponse.content.match(/```(?:json)?([\s\S]*?)```/) ||
                           modelResponse.content.match(/{[\s\S]*}/);
          
          if (jsonMatch) {
            const jsonContent = jsonMatch[0].replace(/```json|```/g, '').trim();
            console.log(`Attempting to parse extracted JSON: ${jsonContent.substring(0, 200)}...`);
            parsedResult = JSON.parse(jsonContent);
            console.log(`Successfully parsed extracted JSON for topic: "${topic}"`);
          }
        } catch (extractError) {
          console.error(`Failed to extract and parse JSON for topic "${topic}":`, extractError);
        }
      }
      
      if (parsedResult && parsedResult.concepts) {
        // Đảm bảo cấu trúc dữ liệu trả về là hợp lệ
        return {
          mainContent: parsedResult.mainContent || modelResponse.content.slice(0, 500),
          concepts: Array.isArray(parsedResult.concepts) 
            ? parsedResult.concepts.filter(c => c && typeof c === 'object' && typeof c.name === 'string')
            : [],
          references: parsedResult.references || (config?.includeReferences ? [] : undefined)
        };
      }

      // Fallback if parsing fails
      console.warn(`Falling back to basic structure for topic "${topic}"`);
      return {
        mainContent: modelResponse.content.slice(0, 500),
        concepts: [],
        references: config?.includeReferences ? [] : undefined
      };
    } catch (error) {
      console.error('Error in research:', error);
      throw error;
    }
  }

  /**
   * Research multiple subtopics in relation to a main topic
   */
  async researchSubtopics(
    mainTopic: string,
    subtopics: string[],
    config?: Partial<ResearchConfig>
  ): Promise<TopicResearchResult> {
    console.log(`Đang nghiên cứu ${subtopics.length} chủ đề phụ cho chủ đề chính: ${mainTopic}`);
    
    // Đảm bảo luôn có subtopics
    if (!subtopics || !Array.isArray(subtopics) || subtopics.length === 0) {
      console.warn(`Không có chủ đề phụ được cung cấp cho "${mainTopic}". Tạo chủ đề phụ tự động.`);
      subtopics = ['overview', 'basics', 'applications'];
    }
    
    // Giới hạn số lượng chủ đề phụ để tối ưu hiệu suất
    const limitedSubtopics = subtopics.slice(0, Math.min(subtopics.length, 5));
    console.log(`Giới hạn xuống ${limitedSubtopics.length} chủ đề phụ: ${limitedSubtopics.join(', ')}`);
    
    // Tạo công việc nghiên cứu cho mỗi chủ đề phụ
    const researchJobs = limitedSubtopics.map(subtopic => ({
      subtopic,
      promise: this.performTopicResearch(
        subtopic, 
        mainTopic, 
        { 
          ...config, 
          focusOnMainTopic: true,
          maxTokens: 800, // Tăng số lượng token để có kết quả tốt hơn
          temperature: 0.5
        }
      ).catch(error => {
        console.error(`Lỗi khi nghiên cứu chủ đề phụ "${subtopic}":`, error);
        // Trả về dữ liệu tối thiểu khi có lỗi, nhưng có concepts để tránh lỗi
        return {
          mainContent: `Không thể nghiên cứu chủ đề phụ: ${subtopic}. Lỗi: ${error.message}`,
          concepts: [
            { 
              name: subtopic, 
              description: `Auto-generated fallback concept for ${subtopic} as part of ${mainTopic}` 
            }
          ]
        };
      })
    }));
    
    // Chạy tất cả các công việc song song
    const allConcepts: Set<string> = new Set();
    allConcepts.add(mainTopic); // Luôn thêm chủ đề chính vào danh sách khái niệm
    const subtopicResearch: SubtopicResearchData[] = [];
    
    // Chờ tất cả các kết quả hoàn thành với xử lý lỗi toàn diện
    try {
      await Promise.all(researchJobs.map(async (job) => {
        let research: ResearchData;
        
        try {
          research = await job.promise;
        } catch (error) {
          console.error(`Lỗi khi chờ kết quả cho "${job.subtopic}":`, error);
          // Tạo dữ liệu fallback nếu promise bị rejected
          research = {
            mainContent: `Không thể hoàn thành nghiên cứu cho: ${job.subtopic}`,
            concepts: [{ name: job.subtopic, description: "Fallback concept due to promise rejection" }]
          };
        }
        
        // Đảm bảo dữ liệu research luôn có cấu trúc hợp lệ
        const validResearch: ResearchData = {
          mainContent: research?.mainContent || `Không có dữ liệu cho chủ đề phụ: ${job.subtopic}`,
          concepts: []
        };
        
        // Đảm bảo concepts luôn là mảng và có ít nhất một khái niệm
        if (Array.isArray(research?.concepts) && research.concepts.length > 0) {
          validResearch.concepts = research.concepts.filter(c => 
            c && typeof c === 'object' && typeof c.name === 'string'
          );
        }
        
        // Nếu không có concepts hợp lệ, thêm một fallback concept
        if (!validResearch.concepts || validResearch.concepts.length === 0) {
          validResearch.concepts = [{ 
            name: job.subtopic, 
            description: `Auto-generated concept for ${job.subtopic} in the context of ${mainTopic}` 
          }];
        }
        
        // Lưu trữ kết quả đã được xác thực
        subtopicResearch.push({
          subtopic: job.subtopic,
          research: validResearch
        });
        
        // Thu thập tất cả các khái niệm hợp lệ
        validResearch.concepts.forEach(concept => {
          if (concept && typeof concept.name === 'string' && concept.name.trim()) {
            allConcepts.add(concept.name.trim());
          }
        });
        
        console.log(`Hoàn thành nghiên cứu cho chủ đề phụ "${job.subtopic}" với ${validResearch.concepts.length} khái niệm`);
      }));
    } catch (error) {
      console.error(`Lỗi nghiêm trọng trong quá trình nghiên cứu các chủ đề phụ:`, error);
      // Ngay cả khi có lỗi, vẫn tiếp tục với bất kỳ dữ liệu nào đã thu thập được
    }
    
    // Đảm bảo có ít nhất một kết quả nghiên cứu
    if (subtopicResearch.length === 0) {
      console.warn(`Không có kết quả nghiên cứu cho bất kỳ chủ đề phụ nào của "${mainTopic}". Tạo dữ liệu giả.`);
      
      // Tạo dữ liệu nghiên cứu giả cho ít nhất một chủ đề phụ
      const fallbackSubtopic = limitedSubtopics[0] || 'overview';
      subtopicResearch.push({
        subtopic: fallbackSubtopic,
        research: {
          mainContent: `Automatic fallback content for ${fallbackSubtopic} as part of ${mainTopic}`,
          concepts: [{ name: fallbackSubtopic, description: `Fallback concept for ${mainTopic}` }]
        }
      });
      
      allConcepts.add(fallbackSubtopic);
    }
    
    // Sắp xếp kết quả theo thứ tự chủ đề phụ ban đầu
    const orderedSubtopicResearch = limitedSubtopics
      .map(subtopic => subtopicResearch.find(item => item.subtopic === subtopic))
      .filter(Boolean) as SubtopicResearchData[];
    
    // Đảm bảo orderedSubtopicResearch có ít nhất một phần tử
    if (orderedSubtopicResearch.length === 0 && subtopicResearch.length > 0) {
      orderedSubtopicResearch.push(subtopicResearch[0]);
    }

    // Thêm một số khái niệm liên quan dựa trên chủ đề chính nếu không đủ
    if (allConcepts.size < 3) {
      console.log(`Không đủ khái niệm thu thập được. Thêm khái niệm mặc định.`);
      ['overview', 'basics', 'applications', 'examples', 'best practices'].forEach(concept => {
        allConcepts.add(`${mainTopic} ${concept}`);
      });
    }

    const result: TopicResearchResult = {
      mainTopic,
      subtopicResearch: orderedSubtopicResearch,
      relatedConcepts: Array.from(allConcepts).slice(0, 10) // Giới hạn 10 khái niệm liên quan
    };
    
    console.log(`Hoàn thành nghiên cứu cho chủ đề "${mainTopic}" với ${result.subtopicResearch.length} chủ đề phụ và ${result.relatedConcepts.length} khái niệm liên quan`);
    
    return result;
  }

  async fetchWebResults(searchQuery: string): Promise<WebSearchResult[]> {
    if (!this.serperApiKey) {
      console.error('Serper API key not provided');
      return [];
    }

    // Optimize query for Serper - keep it concise but specific
    const trimmedQuery = searchQuery.trim().substring(0, 100);
    
    try {
      console.log(`Fetching web results for: "${trimmedQuery}"`);
      const response = await axios.get('https://google.serper.dev/search', {
        headers: {
          'X-API-KEY': this.serperApiKey,
        },
        params: {
          q: trimmedQuery,
          num: 5, // Increase number of results for better coverage
          gl: 'us',
          hl: 'en'
        }
      });

      // Check if response has organic results
      if (!response.data || !response.data.organic || !Array.isArray(response.data.organic)) {
        console.error('Invalid or empty Serper API response format:', JSON.stringify(response.data, null, 2).substring(0, 500));
        return [];
      }

      console.log(`Found ${response.data.organic.length} search results for: ${trimmedQuery}`);
      
      // Extract only the essential information from results
      return response.data.organic.map((result: any) => ({
        title: result.title,
        link: result.link,
        snippet: result.snippet
      }));
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('Serper API error:', error.response?.data || error.message);
        console.error('Status:', error.response?.status);
        console.error('URL:', error.config?.url);
        console.error('Headers:', JSON.stringify(error.config?.headers, null, 2));
      } else {
        console.error('Error fetching search results:', error);
      }
      return [];
    }
  }

  async searchAndAnalyze(searchQuery: string): Promise<AIAnalysisOutput> {
    const webResults = await this.fetchWebResults(searchQuery);
    return this.analyze(webResults);
  }

  private async analyze(searchResults: WebSearchResult[]): Promise<AIAnalysisOutput> {
    if (searchResults.length === 0) {
      return {
        mainSummary: 'No results found',
        importantPoints: [],
        topicRelevanceScore: 0
      };
    }

    const config = this.modelConfigService.getModelConfigForAgent(AgentType.SEARCH_ANALYSIS_AGENT);
    
    // Create a more concise prompt for analysis
    const analysisPrompt = `Analyze these search results briefly:
${searchResults.slice(0, 5).map((r, i) => `${i+1}. "${r.title}": ${r.snippet}`).join('\n')}

Return JSON with:
{
  "mainSummary": "Brief overview",
  "importantPoints": ["key point 1", "key point 2"],
  "topicRelevanceScore": 0.8 // 0 to 1
}`;

    const response = await this.modelAdapterService.generateText({
      ...config,
      maxTokens: 800, // Reduced tokens since we need concise output
      temperature: 0.5, // Lower temperature for more consistent output
      prompt: analysisPrompt
    });

    const parsedResult = this.modelAdapterService.parseJSON<AIAnalysisOutput>(response.content);
    if (parsedResult) {
      return parsedResult;
    }

    // Simplified fallback
    return {
      mainSummary: response.content.slice(0, 200),
      importantPoints: [response.content.slice(0, 100)],
      topicRelevanceScore: 0.5
    };
  }
}