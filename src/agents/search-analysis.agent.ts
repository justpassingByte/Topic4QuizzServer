import axios from 'axios';
import { ModelConfigService } from '../services/model-config.service';
import { ModelAdapterService } from '../services/model-adapter.service';
import { AgentType } from '../services/model-config.service';

export interface WebSearchResult {
  title: string;
  link: string;
  snippet: string;
  source?: string;
  publishedDate?: string;
}

export interface AIAnalysisOutput {
  mainSummary: string;
  importantPoints: string[];
  topicRelevanceScore: number;
  sourceQuality?: {
    credibility: number;
    recency: number;
    diversity: number;
  };
  recommendations?: string[];
}

export interface SearchAnalysisConfig {
  searchResultLimit?: number;
  maxTokens?: number;
  temperature?: number;
}

export class SearchAnalysisAgent {
  constructor(
    private readonly modelConfigService: ModelConfigService,
    private readonly modelAdapterService: ModelAdapterService,
    private readonly serperApiKey: string
  ) {}

  async searchAndAnalyze(searchQuery: string, config?: SearchAnalysisConfig): Promise<AIAnalysisOutput> {
    // console.log(`Searching and analyzing: "${searchQuery}"`);
    
    // Get search results
    const webResults = await this.fetchWebResults(searchQuery);
    if (webResults.length === 0) {
      return {
        mainSummary: 'No search results found',
        importantPoints: [],
        topicRelevanceScore: 0
      };
    }

    // Analyze results
    return this.analyze(webResults, config);
  }

  private async analyze(searchResults: WebSearchResult[], config?: SearchAnalysisConfig): Promise<AIAnalysisOutput> {
    const modelConfig = this.modelConfigService.getModelConfigForAgent(AgentType.SEARCH_ANALYSIS_AGENT);
    
    const analysisPrompt = `Analyze these search results and provide a comprehensive summary:

Sources:
${searchResults.slice(0, config?.searchResultLimit || 5).map((r, i) => 
  `[${i+1}] "${r.title}"
  URL: ${r.link}
  Summary: ${r.snippet}
  ${r.publishedDate ? `Date: ${r.publishedDate}` : ''}`
).join('\n\n')}

Provide your analysis in this exact JSON format:
{
  "mainSummary": "Comprehensive overview of the topic",
  "importantPoints": [
    "Key point 1 with specific details",
    "Key point 2 with specific details"
  ],
  "topicRelevanceScore": 0.95, // Score between 0-1 based on result relevance
  "sourceQuality": {
    "credibility": 0.9, // Score based on source authority
    "recency": 0.8,    // Score based on publication dates
    "diversity": 0.85  // Score based on variety of sources
  },
  "recommendations": [
    "Specific recommendation based on findings"
  ]
}`;

    // console.log('Sending analysis prompt to model...');
    const response = await this.modelAdapterService.generateText({
      ...modelConfig,
      maxTokens: config?.maxTokens || 1000,
      temperature: config?.temperature || 0.3,
      prompt: analysisPrompt
    });

    try {
      const parsedResult = this.modelAdapterService.parseJSON<AIAnalysisOutput>(response.content);
      if (parsedResult) {
        return {
          mainSummary: parsedResult.mainSummary || 'Analysis failed',
          importantPoints: Array.isArray(parsedResult.importantPoints) ? parsedResult.importantPoints : [],
          topicRelevanceScore: typeof parsedResult.topicRelevanceScore === 'number' ? parsedResult.topicRelevanceScore : 0.5,
          sourceQuality: parsedResult.sourceQuality,
          recommendations: Array.isArray(parsedResult.recommendations) ? parsedResult.recommendations : undefined
        };
      }
    } catch (error) {
      console.error('Failed to parse analysis response:', error);
    }

    // Fallback response
    return {
      mainSummary: response.content.slice(0, 200),
      importantPoints: [response.content.slice(0, 100)],
      topicRelevanceScore: 0.5
    };
  }

  private async fetchWebResults(searchQuery: string): Promise<WebSearchResult[]> {
    if (!this.serperApiKey) {
      console.error('Serper API key not provided');
      return [];
    }

    const trimmedQuery = searchQuery.trim().substring(0, 100);
    
    try {
      // console.log(`Fetching web results for: "${trimmedQuery}"`);
      
      const response = await axios.get('https://google.serper.dev/search', {
        headers: {
          'X-API-KEY': this.serperApiKey,
          'Content-Type': 'application/json'
        },
        params: {
          q: trimmedQuery,
          num: 5,
          gl: 'us',
          hl: 'en'
        },
        timeout: 10000
      });

      if (!response.data?.organic || !Array.isArray(response.data.organic)) {
        console.error('Invalid Serper API response:', 
          JSON.stringify(response.data || {}, null, 2).substring(0, 500));
        return [];
      }

      return response.data.organic.map((result: any) => ({
        title: result.title || '',
        link: result.link || '',
        snippet: result.snippet || '',
        source: result.source,
        publishedDate: result.date
      }));

    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('Serper API error:', {
          status: error.response?.status,
          data: error.response?.data,
          message: error.message
        });
      } else {
        console.error('Error fetching search results:', error);
      }
      return [];
    }
  }
} 