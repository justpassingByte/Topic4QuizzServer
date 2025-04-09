import axios from 'axios';
import { ModelConfigService } from '../services/model-config.service';
import { ModelAdapterService } from '../services/model-adapter.service';
import { AgentType } from '../services/model-config.service';
import { SearchAnalysisConfig, WebSearchResult, AIAnalysisOutput } from '../interfaces/search-analysis.interface';

const DEFAULT_CONFIG: SearchAnalysisConfig = {
  maxTokens: 2048,
  temperature: 0.3,
  searchResultLimit: 5,
  language: 'en',
  region: 'us',
  includeSourceMetrics: true
};

export class SearchAnalysisAgent {
  private readonly config: SearchAnalysisConfig;

  constructor(
    private readonly modelConfigService: ModelConfigService,
    private readonly modelAdapterService: ModelAdapterService,
    private readonly serperApiKey: string,
    config?: Partial<SearchAnalysisConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async fetchWebResults(searchQuery: string): Promise<WebSearchResult[]> {
    if (!this.serperApiKey) {
      console.error('Serper API key not provided');
      return [];
    }

    let trimmedQuery = searchQuery.trim().substring(0, 100);
    
    if (!trimmedQuery.includes('"') && trimmedQuery.split(' ').length > 1) {
      const mainConcepts = trimmedQuery.split(' ').filter(word => word.length > 3).slice(0, 3);
      if (mainConcepts.length > 1) {
        trimmedQuery = `"${mainConcepts.join(' ')}" ${trimmedQuery}`;
      }
    }

    try {
      const response = await axios.get('https://google.serper.dev/search', {
        headers: {
          'X-API-KEY': this.serperApiKey,
        },
        params: {
          q: trimmedQuery,
          num: this.config.searchResultLimit,
          gl: this.config.region,
          hl: this.config.language
        }
      });

      return response.data.organic
        .filter((result: any) => result.snippet && result.snippet.length > 50)
        .map((result: any) => ({
        title: result.title,
        link: result.link,
        snippet: result.snippet,
        source: new URL(result.link).hostname,
        publishedDate: result.date || 'N/A'
        }))
        .slice(0, 5);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('Serper API error:', error.response?.data || error.message);
      } else {
        console.error('Error fetching search results:', error);
      }
      return [];
    }
  }

  async searchAndAnalyzeWithMixtral(searchQuery: string): Promise<AIAnalysisOutput> {
    console.log(`Analyzing search query: ${searchQuery}`);
    
    const optimizedQuery = this.optimizeSearchQuery(searchQuery);
    console.log(`Optimized query: ${optimizedQuery}`);
    
    const webResults = await this.fetchWebResults(optimizedQuery);
    console.log(`Found ${webResults.length} search results`);
    
    return this.analyzeWithMixtral(webResults, searchQuery);
  }

  private optimizeSearchQuery(query: string): string {
    let optimizedQuery = query.trim();
    
    const advancedKeywords = ['filetype:', 'site:', 'intitle:', 'inurl:'];
    const hasAdvancedSearch = advancedKeywords.some(keyword => optimizedQuery.includes(keyword));
    
    if (!hasAdvancedSearch) {
      const programmingTerms = ['javascript', 'python', 'code', 'programming', 'developer', 'java', 'typescript'];
      const isProgrammingQuery = programmingTerms.some(term => 
        optimizedQuery.toLowerCase().includes(term)
      );
      
      if (isProgrammingQuery && !optimizedQuery.includes('tutorial')) {
        optimizedQuery += ' tutorial best practices';
      }
    }
    
    return optimizedQuery;
  }

  private async analyzeWithMixtral(
    searchResults: WebSearchResult[],
    originalQuery: string
  ): Promise<AIAnalysisOutput> {
    if (searchResults.length === 0) {
      return {
        mainSummary: 'No results found for the given query.',
        importantPoints: [],
        topicRelevanceScore: 0,
        sourceQuality: {
          credibility: 0,
          recency: 0,
          diversity: 0
        },
        recommendations: ['Try modifying the search query', 'Use different keywords']
      };
    }

    const mixtralConfig = this.modelConfigService.getModelConfigForAgent(AgentType.SEARCH_ANALYSIS_AGENT);

    // Cải thiện prompt để yêu cầu rõ ràng hơn về định dạng JSON, bắt buộc mô hình trả về JSON thuần túy
    const analysisPrompt = `Analyze these search results for: "${originalQuery}"

Search Results:
${searchResults.slice(0, 5).map((r, i) => `[${i + 1}] "${r.title}": ${r.snippet.substring(0, 150)}`).join('\n')}

FORMAT INSTRUCTIONS: You MUST respond with a valid JSON object ONLY. Do not include any explanatory text, markdown formatting, or code blocks before or after the JSON. Your entire response should be a single valid JSON object.

Respond with this exact JSON structure:
{
  "mainSummary": "Brief overview of the topic",
  "importantPoints": ["Key point 1", "Key point 2", "Key point 3"],
  "topicRelevanceScore": 0.9,
  "sourceQuality": {"credibility": 0.8, "recency": 0.7, "diversity": 0.9},
  "recommendations": ["Recommendation 1", "Recommendation 2"]
}`;

    try {
      console.log(`Requesting Mixtral analysis for: "${originalQuery}" with ${searchResults.length} results`);
      const mixtralResponse = await this.modelAdapterService.generateText({
        ...mixtralConfig,
        maxTokens: 1200, // Tăng token limit để có kết quả đầy đủ hơn
        temperature: 0.2, // Giảm temperature cho kết quả nhất quán
        prompt: analysisPrompt
      });

      // In ra phản hồi để debug
      console.log(`Mixtral response length: ${mixtralResponse.content.length}`);
      console.log(`Response preview: ${mixtralResponse.content.substring(0, 100)}...`);

      // Thử phân tích JSON
        const parsedResult = this.modelAdapterService.parseJSON<AIAnalysisOutput>(mixtralResponse.content);
      
      // Kiểm tra nếu parsing thành công
      if (parsedResult) {
        return {
          ...parsedResult,
          sourceQuality: parsedResult.sourceQuality || {
            credibility: 0.7,
            recency: 0.7,
            diversity: 0.7
          }
        };
      }
      
      // Log chi tiết về lỗi để debugging
      console.warn(`Failed to parse JSON from Mixtral response. Content preview: "${mixtralResponse.content.substring(0, 200)}..."`);
      
      // Nếu không parse được JSON, tạo đối tượng phân tích từ nội dung văn bản
      console.log('Creating analysis from raw content...');
      return this.createAnalysisFromText(mixtralResponse.content, originalQuery);
      
    } catch (error) {
      console.error('Analysis error:', error);
      
      // Không throw lỗi, trả về kết quả tạm để tiếp tục xử lý
        return {
        mainSummary: `Analysis failed for query "${originalQuery}" but we'll continue with limited data.`,
        importantPoints: [`Information about ${originalQuery}`, 'Check official documentation for more details'],
        topicRelevanceScore: 0.6,
          sourceQuality: {
            credibility: 0.5,
            recency: 0.5,
            diversity: 0.5
          },
        recommendations: ['Try more specific search terms', `Research ${originalQuery} in detail`]
      };
    }
  }
  
  /**
   * Tạo đối tượng phân tích từ nội dung văn bản khi không thể parse JSON
   */
  private createAnalysisFromText(content: string, query: string): AIAnalysisOutput {
    if (!content) {
      return this.createDefaultAnalysis(query);
    }
    
    try {
      console.log('Creating analysis from text content');
      const lines = content.split('\n').map(line => line.trim()).filter(Boolean);
      
      // Tìm tóm tắt chính - improved detection with multiple formats
      let mainSummary = '';
      const summaryRegex = /Brief overview:?|Main Summary:?|Summary:?|Overview:?|Tóm tắt:?/i;
      const summaryIndex = lines.findIndex(line => summaryRegex.test(line));
      
      if (summaryIndex >= 0 && summaryIndex < lines.length - 1) {
        // Check if the summary label and content are on the same line
        const sameLine = lines[summaryIndex].match(new RegExp(`${summaryRegex.source}\\s*(.+)`, 'i'));
        if (sameLine && sameLine[1]) {
          mainSummary = sameLine[1];
        } else {
          // Get summary from next line
          mainSummary = lines[summaryIndex + 1];
          
          // If summary is too short, combine with following lines until we have enough
          // or until we hit a line that looks like a new section
          let currentIndex = summaryIndex + 2;
          while (mainSummary.length < 100 && 
                 currentIndex < lines.length && 
                 !lines[currentIndex].match(/^\s*[A-Z][\w\s]+:/) && 
                 !lines[currentIndex].startsWith('* ') && 
                 !lines[currentIndex].startsWith('- ')) {
            mainSummary += ' ' + lines[currentIndex];
            currentIndex++;
          }
        }
      } else {
        // If we can't find a summary section, use the first paragraph
        // (multiple lines until we hit an empty line or a new section)
        let endIndex = 0;
        while (endIndex < lines.length && 
               !lines[endIndex].match(/^\s*[A-Z][\w\s]+:/) && 
               endIndex < 5) {
          mainSummary += (mainSummary ? ' ' : '') + lines[endIndex];
          endIndex++;
        }
      }
      
      // Tìm các điểm chính - improved with multiple formats
      const importantPoints: string[] = [];
      const keyPointRegex = /Key point|Important point|Main point|Point \d+|Key takeaway|Điểm chính/i;
      const keyPointSectionRegex = /Key points|Important points|Main points|Takeaways|Highlights|Điểm quan trọng/i;
      
      // First check if we have a "Key Points" section
      const keyPointSectionIndex = lines.findIndex(line => keyPointSectionRegex.test(line));
      if (keyPointSectionIndex >= 0) {
        // Collect points until we hit a new section or end of content
        for (let i = keyPointSectionIndex + 1; i < lines.length; i++) {
          const line = lines[i];
          // Stop if we hit what looks like a new section
          if (line.match(/^\s*[A-Z][\w\s]+:/) && !keyPointRegex.test(line)) {
            break;
          }
          
          // Add line if it looks like a bullet point
          if (line.startsWith('* ') || line.startsWith('- ') || line.match(/^\d+\.\s/)) {
            importantPoints.push(line.replace(/^[*\-\d.]\s+/, ''));
          } else if (keyPointRegex.test(line)) {
            // Add if it looks like a key point label
            const pointMatch = line.match(/(?:Key point|Important point|Main point|Point \d+|Key takeaway|Điểm chính)[^:]*:(.*)/i);
            if (pointMatch && pointMatch[1]) {
              importantPoints.push(pointMatch[1].trim());
            } else {
              importantPoints.push(line);
            }
          }
        }
      }
      
      // If no points found yet, check for individual key points throughout the text
      if (importantPoints.length === 0) {
        lines.forEach(line => {
          if (keyPointRegex.test(line)) {
            const pointMatch = line.match(/(?:Key point|Important point|Main point|Point \d+|Key takeaway|Điểm chính)[^:]*:(.*)/i);
            if (pointMatch && pointMatch[1]) {
              importantPoints.push(pointMatch[1].trim());
            } else {
              importantPoints.push(line);
            }
          }
        });
      }
      
      // If still no points found, look for bullet points or numbered lists
      if (importantPoints.length === 0) {
        let inListSection = false;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          
          // Check if this might be the start of a list section
          if (!inListSection && 
              (line.startsWith('* ') || line.startsWith('- ') || line.match(/^\d+\.\s/))) {
            inListSection = true;
          }
          
          // Add points while we're in a list section
          if (inListSection) {
            if (line.startsWith('* ') || line.startsWith('- ') || line.match(/^\d+\.\s/)) {
              importantPoints.push(line.replace(/^[*\-\d.]\s+/, ''));
            } else if (line.match(/^\s*[A-Z][\w\s]+:/) || line === '') {
              // End of list section if we hit a new header or empty line
              inListSection = false;
            }
          }
        }
      }
      
      // Tìm điểm số liên quan - improved score detection
      let topicRelevanceScore = 0.7; // Điểm mặc định
      const scoreRegex = /(?:Topic relevance score|Relevance|Score|Relevance score|Topic score).*?(\d+(?:\.\d+)?)/i;
      lines.some(line => {
        const scoreMatch = line.match(scoreRegex);
        if (scoreMatch && scoreMatch[1]) {
          const score = parseFloat(scoreMatch[1]);
          if (!isNaN(score)) {
            // Normalize to 0-1 scale if needed
            topicRelevanceScore = score > 1 ? score / 10 : score;
            return true;
          }
        }
        return false;
      });
      
      // Check for percentage format (e.g., "80%")
      if (topicRelevanceScore === 0.7) {
        const percentRegex = /(?:Topic relevance|Relevance|Score).*?(\d+)%/i;
        lines.some(line => {
          const percentMatch = line.match(percentRegex);
          if (percentMatch && percentMatch[1]) {
            const percent = parseInt(percentMatch[1], 10);
            if (!isNaN(percent)) {
              topicRelevanceScore = percent / 100;
              return true;
            }
          }
          return false;
        });
      }
      
      // Tìm khuyến nghị - improved recommendation detection
      const recommendations: string[] = [];
      const recommendationRegex = /Recommendations?|Suggestions?|Next steps|Actions|What to do|Advice/i;
      const recommendationIndex = lines.findIndex(line => recommendationRegex.test(line));
      
      if (recommendationIndex >= 0) {
        // Check if the recommendation and content are on the same line
        const sameLine = lines[recommendationIndex].match(new RegExp(`${recommendationRegex.source}\\s*(.+)`, 'i'));
        if (sameLine && sameLine[1]) {
          recommendations.push(sameLine[1]);
        } else {
          // Collect recommendations until we hit a new section
          let inRecommendationSection = true;
          for (let i = recommendationIndex + 1; i < lines.length && inRecommendationSection; i++) {
            const line = lines[i];
            
            // Check if this is a new section
            if (line.match(/^\s*[A-Z][\w\s]+:/) && !line.match(recommendationRegex)) {
              inRecommendationSection = false;
            } else if (line.startsWith('* ') || line.startsWith('- ') || line.match(/^\d+\.\s/)) {
              // Add bullet points or numbered items
              recommendations.push(line.replace(/^[*\-\d.]\s+/, ''));
            } else if (line !== '' && !line.match(recommendationRegex) && recommendations.length === 0) {
              // If no bullet format, add the line as a recommendation if it's not empty
              recommendations.push(line);
            }
          }
        }
      }
      
      // Try to extract source quality metrics if available
      let credibility = 0.7;
      let recency = 0.7;
      let diversity = 0.7;
      
      const qualityRegex = /(?:Source quality|Quality|Credibility).*?(\d+(?:\.\d+)?)/i;
      const credibilityRegex = /(?:Credibility|Reliability).*?(\d+(?:\.\d+)?)/i;
      const recencyRegex = /(?:Recency|Up-to-date|Currency).*?(\d+(?:\.\d+)?)/i;
      const diversityRegex = /(?:Diversity|Variety|Range).*?(\d+(?:\.\d+)?)/i;
      
      lines.forEach(line => {
        // Extract quality scores with normalization
        const extractScore = (regex: RegExp, line: string): number | null => {
          const match = line.match(regex);
          if (match && match[1]) {
            const score = parseFloat(match[1]);
            if (!isNaN(score)) {
              return score > 1 ? score / 10 : score;
            }
          }
          return null;
        };
        
        const credScore = extractScore(credibilityRegex, line);
        if (credScore !== null) credibility = credScore;
        
        const recScore = extractScore(recencyRegex, line);
        if (recScore !== null) recency = recScore;
        
        const divScore = extractScore(diversityRegex, line);
        if (divScore !== null) diversity = divScore;
      });
      
      // Tạo kết quả phân tích
      return {
        mainSummary: mainSummary || `Analysis of ${query}`,
        importantPoints: importantPoints.length > 0 ? importantPoints : [`Information about ${query}`],
        topicRelevanceScore,
        sourceQuality: {
          credibility,
          recency,
          diversity
        },
        recommendations: recommendations.length > 0 ? recommendations : ['Research more about this topic']
      };
    } catch (error) {
      console.error('Error creating analysis from text:', error);
      return this.createDefaultAnalysis(query);
    }
  }
  
  /**
   * Tạo phân tích mặc định khi không có dữ liệu
   */
  private createDefaultAnalysis(query: string): AIAnalysisOutput {
    return {
      mainSummary: `Analysis of ${query}`,
      importantPoints: [
        `${query} is an important topic to research`,
        'Check official documentation for accurate information',
        'Consider exploring related topics for better understanding'
      ],
      topicRelevanceScore: 0.7,
      sourceQuality: {
        credibility: 0.6,
        recency: 0.6,
        diversity: 0.6
      },
      recommendations: [
        'Research this topic in greater depth',
        'Consult multiple sources for comprehensive understanding',
        'Apply knowledge in practical scenarios to reinforce learning'
      ]
    };
  }

  // Phân tích nhiều chủ đề cùng lúc với phương pháp song song
  async analyzeMultipleTopics(topics: string[], limit = 3): Promise<AIAnalysisOutput[]> {
    console.log(`Analyzing ${topics.length} topics (limit: ${limit})`);
    
    // Giới hạn số lượng chủ đề để tránh quá tải
    const limitedTopics = topics.slice(0, limit);
    
    // Thực hiện phân tích song song
    const analysisPromises = limitedTopics.map(topic => 
      this.searchAndAnalyzeWithMixtral(topic)
        .catch(error => {
          console.error(`Error analyzing topic "${topic}":`, error);
          // Trả về kết quả mặc định trong trường hợp lỗi
          return {
            mainSummary: `Failed to analyze: ${topic}`,
            importantPoints: [`Error occurred during analysis`],
            topicRelevanceScore: 0.1,
            sourceQuality: { credibility: 0, recency: 0, diversity: 0 },
            recommendations: ['Try different search terms']
          };
        })
    );
    
    // Đợi tất cả phân tích hoàn thành
    const results = await Promise.all(analysisPromises);
    console.log(`Completed analysis for ${results.length} topics`);

    return results;
  }
  
  // Phân tích nhiều chủ đề liên quan đến một chủ đề chính
  async analyzeRelatedTopics(mainTopic: string, relatedTopics: string[]): Promise<{
    mainTopicAnalysis: AIAnalysisOutput;
    relatedAnalyses: AIAnalysisOutput[];
  }> {
    console.log(`Analyzing main topic "${mainTopic}" with ${relatedTopics.length} related topics`);
    
    // Phân tích chủ đề chính
    const mainAnalysis = await this.searchAndAnalyzeWithMixtral(mainTopic);
    
    // Giới hạn số lượng chủ đề liên quan
    const limitedRelatedTopics = relatedTopics.slice(0, 3);
    
    // Tạo câu truy vấn tìm kiếm cho mỗi chủ đề liên quan kết hợp với chủ đề chính
    const combinedQueries = limitedRelatedTopics.map(
      topic => `${mainTopic} ${topic}`
    );
    
    // Phân tích các chủ đề liên quan
    const relatedAnalyses = await this.analyzeMultipleTopics(combinedQueries);
    
    return {
      mainTopicAnalysis: mainAnalysis,
      relatedAnalyses
    };
  }
}

export default SearchAnalysisAgent;
