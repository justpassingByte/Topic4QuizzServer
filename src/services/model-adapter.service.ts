import { GoogleGenerativeAI } from '@google/generative-ai';
import { Anthropic } from '@anthropic-ai/sdk';
import { ApiKeyService } from './api-key.service';
import { config } from 'dotenv';
import axios from 'axios';
import { parseJSON } from '../utils/json-parser.util';
import { AVAILABLE_QUIZ_MODELS } from './model-config.service';

// Load environment variables
config();

export enum ModelProvider {
  HUGGINGFACE = 'HUGGINGFACE',
  SERPER = 'SERPER',
  GOOGLE = 'GOOGLE'
}

// Model families for specific handling
export enum ModelFamily {
  LLAMA = 'llama',
  MISTRAL = 'mistral',
  MIXTRAL = 'mixtral',
  QWEN = 'qwen',
  BERT = 'bert',
  GPT = 'gpt',
  OTHER = 'other'
}

// Add model configurations
export const MODEL_CONFIGS = {
  // Large Language Models
  'mixtral': {
    family: ModelFamily.MIXTRAL,
    model: 'mistralai/Mixtral-8x7B-Instruct-v0.1',
    maxTokens: 2048,
    temperature: 0.7,
  },
  'mistral': {
    family: ModelFamily.MISTRAL,
    model: 'mistralai/Mistral-7B-Instruct-v0.2',
    maxTokens: 2048,
    temperature: 0.7,
  },
  'qwen': {
    family: ModelFamily.QWEN,
    model: 'Qwen/Qwen1.5-7B-Chat',
    maxTokens: 2048,
    temperature: 0.7,
  },
  
  // BERT Models for specific tasks
  'bert-base': {
    family: ModelFamily.BERT,
    model: 'bert-base-uncased',
    maxTokens: 512,
    temperature: 0.3,
  }
};

export interface ModelRequestOptions {
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  provider?: ModelProvider;
  model?: string;
  retryCount?: number;
  waitBetweenRetries?: number;
}

export interface ModelResponse {
  content: string;
  provider: ModelProvider;
  model: string;
  tokenUsage?: {
    input: number;
    output: number;
    total: number;
  };
}

export class ModelAdapterService {
  private apiKeyService: ApiKeyService;
  private readonly MAX_RETRIES = 3;
  private readonly DEFAULT_WAIT_MS = 20000;
  private readonly MODEL_FALLBACK_ORDER = ['QWEN_OMNI', 'LLAMA_32', 'MIXTRAL', 'MISTRAL'] as const;
  
  constructor() {
    this.apiKeyService = new ApiKeyService();
  }

  private getModelFamily(model: string): ModelFamily {
    const modelLower = model.toLowerCase();
    if (modelLower.includes('llama')) return ModelFamily.LLAMA;
    if (modelLower.includes('mistral')) return ModelFamily.MISTRAL;
    if (modelLower.includes('mixtral')) return ModelFamily.MIXTRAL;
    if (modelLower.includes('qwen')) return ModelFamily.QWEN;
    if (modelLower.includes('bert')) return ModelFamily.BERT;
    if (modelLower.includes('gpt')) return ModelFamily.GPT;
    return ModelFamily.OTHER;
  }
  
  async generateText(options: ModelRequestOptions): Promise<ModelResponse> {
    const { provider = ModelProvider.HUGGINGFACE } = options;

    // Route to the correct provider
    switch (provider) {
      case ModelProvider.GOOGLE:
        return this.callGoogleGemini(options);
      case ModelProvider.HUGGINGFACE:
        return this.callHuggingFaceWithFallback(options);
      case ModelProvider.SERPER:
        return this.callSerper(options);
      default:
        throw new Error(`Provider ${provider} not supported`);
    }
  }

  private async callGoogleGemini(options: ModelRequestOptions): Promise<ModelResponse> {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error('Missing GOOGLE_API_KEY in .env file');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: options.model || 'gemini-pro' });

    console.log(`Calling Google Gemini API for model: ${options.model || 'gemini-pro'}`);

    try {
      const result = await model.generateContent(options.prompt);
      const response = result.response;
      const content = response.text();
      
      return {
        content,
        provider: ModelProvider.GOOGLE,
        model: options.model || 'gemini-pro'
      };
    } catch (error) {
      console.error('Error calling Google Gemini API:', error);
      throw new Error('Failed to get response from Google Gemini API');
    }
  }
  
  private async callHuggingFaceWithFallback(options: ModelRequestOptions): Promise<ModelResponse> {
    const initialModelName = options.model;
    const fallbackOrderKeys = this.MODEL_FALLBACK_ORDER;

    // Create a unique, ordered list of models to try, starting with the requested one.
    const modelsToTry: (keyof typeof AVAILABLE_QUIZ_MODELS)[] = [...new Set([
      ...Object.entries(AVAILABLE_QUIZ_MODELS)
        .filter(([, config]) => config.model === initialModelName)
        .map(([key]) => key as keyof typeof AVAILABLE_QUIZ_MODELS),
      ...fallbackOrderKeys
    ])];

    for (const modelKey of modelsToTry) {
      const modelConfig = AVAILABLE_QUIZ_MODELS[modelKey];
      if (!modelConfig) continue;

      options.model = modelConfig.model;
      
      for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
        try {
          console.log(`Attempt ${attempt + 1}/${this.MAX_RETRIES} calling model: ${options.model}`);
          const result = await this.callHuggingface(options);
          console.log(`Successfully called model: ${options.model}`);
          return result; // Success
        } catch (error: any) {
          console.log(`Error calling ${options.model} on attempt ${attempt + 1}: ${error.message}`);
          if (attempt === this.MAX_RETRIES - 1) {
            console.log(`All retries failed for ${options.model}. Trying next model.`);
          } else {
            const waitTime = this.DEFAULT_WAIT_MS * Math.pow(1.5, attempt);
            console.log(`Retrying in ${waitTime}ms...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
        }
        }
      }
      
    throw new Error('All models in the fallback list failed.');
  }
  
  private async callHuggingface(options: ModelRequestOptions): Promise<ModelResponse> {
    const modelFamily = this.getModelFamily(options.model || '');
    console.log(`Calling Hugging Face API for model: ${options.model} (Family: ${modelFamily})`);
    
    try {
      const requestBody = this.buildHuggingFaceRequest(options, modelFamily);
      
      const headers = {
        'Authorization': `Bearer ${this.apiKeyService.getCurrentKey()}`,
        'Content-Type': 'application/json'
      };

      const url = `https://api-inference.huggingface.co/models/${options.model}`;

      console.log('--- FINAL REQUEST DETAILS ---');
      console.log('URL:', url);
      console.log('METHOD: POST');
      console.log('HEADERS:', JSON.stringify(headers, null, 2));
      console.log('--- END REQUEST DETAILS ---');

      const response = await axios.post(
        url,
        requestBody,
        { headers }
      );

      // console.log('Raw response from Hugging Face:', JSON.stringify(response.data, null, 2));

      let content = this.parseHuggingFaceResponse(response.data, options, modelFamily);
      // console.log('Parsed response:', content);
      
      content = this.cleanupModelResponse(content, options);
      // console.log('Cleaned response:', content);

      return {
        content,
        provider: ModelProvider.HUGGINGFACE,
        model: options.model || 'unknown'
      };
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        console.error('Hugging Face API error details:', {
          status: error.response?.status,
          data: error.response?.data,
          message: error.message
        });
        
        // If we get a 401, the key is bad. Invalidate it and retry the SAME request.
        if (error.response.status === 401) {
            this.apiKeyService.invalidateCurrentKeyAndGetNext();
            console.log('Retrying request with new key...');
            return this.callHuggingface(options); // Retry with the new key
        }

        if (error.response?.status === 503) {
          console.log('Model is loading, waiting and retrying...');
          throw new Error('MODEL_LOADING');
        }
        throw new Error(`Hugging Face API error: ${error.response?.data?.error || error.message}`);
      }
      throw error;
    }
  }

  private buildHuggingFaceRequest(options: ModelRequestOptions, modelFamily: ModelFamily): any {
    const baseRequest = {
      inputs: options.prompt,
      parameters: {
        max_new_tokens: options.maxTokens || 2048,
        temperature: options.temperature || 0.7,
        return_full_text: false,
        do_sample: true,
        top_p: 0.95,
        top_k: 50
      }
    };

    // Add model-specific parameters
    let finalRequest;
    switch (modelFamily) {
      case ModelFamily.MIXTRAL:
        finalRequest = {
          ...baseRequest,
          parameters: {
            ...baseRequest.parameters,
            temperature: options.temperature || 0.3,
            top_p: 0.98,
            top_k: 50,
            repetition_penalty: 1.15,
            max_new_tokens: options.maxTokens || 4096,
            return_full_text: false,
            stop: ["}"],
            do_sample: true
          }
        };
        break;
      case ModelFamily.LLAMA:
      case ModelFamily.QWEN:
        finalRequest = {
          ...baseRequest,
          parameters: {
            ...baseRequest.parameters,
            do_sample: true,
            top_p: 0.95,
            top_k: 50,
            repetition_penalty: 1.1
          }
        };
        break;
      case ModelFamily.BERT:
        finalRequest = {
          ...baseRequest,
          parameters: {
            ...baseRequest.parameters,
            do_sample: false,
            max_length: 512,
            num_return_sequences: 1,
            truncation: true
          }
        };
        break;
      case ModelFamily.GPT:
        finalRequest = {
          ...baseRequest,
          parameters: {
            ...baseRequest.parameters,
            do_sample: true,
            top_p: 0.92,
            top_k: 50,
            repetition_penalty: 1.1,
            length_penalty: 1.0
          }
        };
        break;
      default:
        finalRequest = baseRequest;
    }
    
    console.log(`Built request for ${modelFamily}:`, JSON.stringify(finalRequest, null, 2));
    return finalRequest;
  }

  private parseHuggingFaceResponse(data: any, options: ModelRequestOptions, modelFamily: ModelFamily): string {
    // console.log('Parsing Hugging Face response. Data type:', typeof data);
    // console.log('Response data:', JSON.stringify(data, null, 2));
    
    try {
      if (Array.isArray(data)) {
        // console.log('Response is an array');
        if (data[0]?.generated_text) {
          let text = data[0].generated_text;
          // console.log('Found generated_text:', text);
          
          // For quiz generation, try to extract JSON content
          const jsonStart = text.indexOf('{');
          const jsonEnd = text.lastIndexOf('}');
          if (jsonStart !== -1 && jsonEnd !== -1) {
            text = text.substring(jsonStart, jsonEnd + 1);
            // console.log('Extracted JSON content:', text);
            try {
              // Validate JSON structure
              const parsed = JSON.parse(text);
              if (parsed.questions || Array.isArray(parsed)) {
                // console.log('Valid quiz format detected');
                return text;
              }
            } catch (e) {
              // console.log('JSON validation failed, using raw text');
            }
          }
          
          // Check for array format
          const arrayStart = text.indexOf('[');
          const arrayEnd = text.lastIndexOf(']');
          if (arrayStart !== -1 && arrayEnd !== -1) {
            text = text.substring(arrayStart, arrayEnd + 1);
            // console.log('Extracted array content:', text);
            try {
              // Validate array structure
              const parsed = JSON.parse(text);
              if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].question) {
                // console.log('Valid quiz array format detected');
                return text;
              }
            } catch (e) {
              // console.log('Array validation failed, using raw text');
            }
          }
          
          return text;
        }
        return data[0] || '';
      }
      
      if (typeof data === 'object') {
        // console.log('Response is an object');
        const content = data.generated_text || data.content || JSON.stringify(data);
        // console.log('Content before processing:', content);
        
        // Try to extract and validate JSON content
        const jsonStart = content.indexOf('{');
        const jsonEnd = content.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
          const extracted = content.substring(jsonStart, jsonEnd + 1);
          // console.log('Extracted JSON from object:', extracted);
          try {
            const parsed = JSON.parse(extracted);
            if (parsed.questions || Array.isArray(parsed)) {
              // console.log('Valid quiz format detected in object');
              return extracted;
            }
          } catch (e) {
            // console.log('JSON validation failed for object, using raw content');
          }
        }
        
        // Check for array format
        const arrayStart = content.indexOf('[');
        const arrayEnd = content.lastIndexOf(']');
        if (arrayStart !== -1 && arrayEnd !== -1) {
          const extracted = content.substring(arrayStart, arrayEnd + 1);
          // console.log('Extracted array from object:', extracted);
          try {
            const parsed = JSON.parse(extracted);
            if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].question) {
              console.log('Valid quiz array format detected in object');
              return extracted;
            }
          } catch (e) {
            console.log('Array validation failed for object, using raw content');
          }
        }
        
        return content;
      }
      
      console.log('Response is neither array nor object, converting to string');
      return String(data);
    } catch (error) {
      console.error('Error parsing Hugging Face response:', error);
      console.error('Original data:', data);
      return String(data);
    }
  }

  private cleanupModelResponse(content: string, options: ModelRequestOptions): string {
    try {
      // Remove common prefixes
      content = content.replace(/^\[ANALYSIS\]\s*/, '')
                       .replace(/^\[RESPONSE\]\s*/, '')
                       .replace(/^\[RESULT\]\s*/, '')
                       .replace(/^\[OUTPUT\]\s*/, '');
  
      // Attempt to parse and clean up JSON-like content
      if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
        try {
          const parsed = JSON.parse(content);
  
          // Nếu là mảng thì chỉ giữ 3 phần tử đầu
          if (Array.isArray(parsed)) {
            const limited = parsed.slice(0, 3);
            return JSON.stringify(limited, null, 2);
          }
  
          return JSON.stringify(parsed, null, 2);
        } catch (e) {
          // Nếu parse JSON thất bại, dùng phương pháp thủ công
          return this.cleanJSONContent(content);
        }
      }
  
      return content.trim();
    } catch (error) {
      console.error('Error cleaning up model response:', error);
      return content;
    }
  }
  

  private async callSerper(options: ModelRequestOptions): Promise<ModelResponse> {
    try {
      const apiKey = process.env.SERPER_API_KEY;
      if (!apiKey) {
        throw new Error('Missing SERPER_API_KEY in .env file');
      }

      const response = await axios.post(
        'https://google.serper.dev/search',
        {
          q: options.prompt,
          gl: 'us',
          hl: 'en',
          num: 5
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey
          }
        }
      );

      const organicResults = response.data.organic || [];
      const content = JSON.stringify(organicResults.map((result: any, index: number) => ({
        content: result.snippet || "",
        source: result.title || "Web Search",
        url: result.link || "",
        relevanceScore: 1 - (index * 0.1)
      })));

      return {
        content,
        provider: ModelProvider.SERPER,
        model: 'serper-search'
      };
    } catch (error) {
      console.error('Error calling Serper:', error);
      throw error;
    }
  }

  /**
   * Parses a JSON string from LLM output, handling common issues
   * @param content The JSON string to parse
   * @returns Parsed JSON object or null if parsing fails
   */
  parseJSON<T>(content: string): T | null {
    try {
      // Xử lý trường hợp content là rỗng
      if (!content || content.trim() === '' || content === '[]') {
        console.warn('Empty content provided to parseJSON');
        return null;
      }

      // Remove common prefixes
      content = content.replace(/^\[ANALYSIS\]\s*/, '')
                     .replace(/^\[RESPONSE\]\s*/, '')
                     .replace(/^\[RESULT\]\s*/, '')
                     .replace(/^\[OUTPUT\]\s*/, '')
                     .replace(/^Content:\s*/i, '');

      // First try direct parsing
      try {
        return JSON.parse(content) as T;
      } catch (e) {
        // Try cleaning the content before parsing
        const cleanedContent = this.cleanJSONContent(content);
        try {
          return JSON.parse(cleanedContent) as T;
        } catch (e2) {
          // Try to extract JSON from text
          return this.extractJsonFromText<T>(content);
        }
      }
    } catch (error) {
      console.error('Failed to parse JSON:', error);
      console.error('Content preview:', content?.substring(0, 200));
      console.error('Full content length:', content?.length || 0);
      if (error instanceof Error) {
        console.error('Error message:', error.message);
      }
      
      // Trả về null thay vì throw exception
      return null;
    }
  }

  /**
   * Cleans JSON content by removing markup and other non-JSON content
   */
  cleanJSONContent(content: string): string {
    if (!content) return '';
    
    // Xóa tất cả các tiền tố phổ biến
    let cleaned = content;
    
    // Xóa các tiền tố lồng nhau (Content: Response: Content: ...) 
    const commonPrefixes = [
      /^Content:\s*/i,
      /^Response:\s*/i, 
      /^Brief overview:\s*/i,
      /^Analysis:\s*/i,
      /^Result:\s*/i,
      /^Output:\s*/i,
      /^Quiz:\s*/i,
      /^Summary:\s*/i,
      /^Here is the JSON:\s*/i,
      /^Content :QuizQuestions:\s*/i
    ];
    
    // Lặp lại việc xóa tiền tố nhiều lần để xử lý các tiền tố lồng nhau
    let previousCleanedLength = -1;
    while (cleaned.length !== previousCleanedLength) {
      previousCleanedLength = cleaned.length;
      
      // Xóa tiền tố từ đầu chuỗi
      for (const prefix of commonPrefixes) {
        cleaned = cleaned.replace(prefix, '');
      }
      
      // Xóa tiền tố ở đầu mỗi dòng
      const lines = cleaned.split('\n');
      const cleanedLines = lines.map(line => {
        let cleanedLine = line;
        for (const prefix of commonPrefixes) {
          cleanedLine = cleanedLine.replace(prefix, '');
        }
        return cleanedLine;
      });
      cleaned = cleanedLines.join('\n');
    }
    
    // Xóa các khối markdown
    cleaned = cleaned
      .replace(/^```json\s*/i, '')  // xóa ```json
      .replace(/```$/i, '')         // xóa ``` kết thúc
      .replace(/^```\s*/i, '')      // xóa ``` đơn thuần ở đầu
      .trim();
    
    // Xóa các chỉ dẫn như "return JSON with:"
    cleaned = cleaned
      .replace(/^(Please )?(return|provide) JSON( (with|in the following format))?(:|\.)\s*/i, '')
      .replace(/^Here is the (requested|required|specified) JSON(:|\.)\s*/i, '')
      .replace(/^[\s\S]*?return json with:\s*/i, '') // xóa tất cả nội dung trước "return json with:"
      .trim();
    
    // Nếu có thể tìm thấy đoạn JSON, trích xuất nó
    const jsonStartIndex = cleaned.indexOf('{');
    const jsonEndIndex = cleaned.lastIndexOf('}');
    
    if (jsonStartIndex !== -1 && jsonEndIndex !== -1 && jsonEndIndex > jsonStartIndex) {
      cleaned = cleaned.substring(jsonStartIndex, jsonEndIndex + 1);
    } else {
      // Thử tìm mảng JSON
      const arrayStartIndex = cleaned.indexOf('[');
      const arrayEndIndex = cleaned.lastIndexOf(']');
      
      if (arrayStartIndex !== -1 && arrayEndIndex !== -1 && arrayEndIndex > arrayStartIndex) {
        cleaned = cleaned.substring(arrayStartIndex, arrayEndIndex + 1);
      }
    }
    
    return cleaned;
  }
  
  /**
   * Tries to extract JSON from text output when model returns natural language instead of JSON
   */
  private extractJsonFromText<T>(text: string): T | null {
    try {
      // 1. Tìm kiếm chuỗi JSON trong dấu ```
      const jsonCodeBlockMatch = text.match(/```(?:json)?([\s\S]*?)```/);
      if (jsonCodeBlockMatch && jsonCodeBlockMatch[1]) {
        const possibleJson = jsonCodeBlockMatch[1].trim();
        try {
          return JSON.parse(possibleJson) as T;
        } catch (e) {
          // Continue to next method if this fails
        }
      }
      
      // 2. Tìm kiếm obj JSON bắt đầu với { và kết thúc với }
      const jsonObjMatch = text.match(/{[\s\S]*?}/);
      if (jsonObjMatch && jsonObjMatch[0]) {
        try {
          return JSON.parse(jsonObjMatch[0]) as T;
        } catch (e) {
          // Continue to next method if this fails
        }
      }
      
      // 3. Tìm kiếm mảng JSON bắt đầu với [ và kết thúc với ]
      const jsonArrayMatch = text.match(/\[[\s\S]*?\]/);
      if (jsonArrayMatch && jsonArrayMatch[0]) {
        try {
          return JSON.parse(jsonArrayMatch[0]) as T;
        } catch (e) {
          // Continue to next method if this fails
        }
      }
      
      // 4. Nếu văn bản có cấu trúc "key: value" thì chuyển thành JSON
      if (text.match(/[\w\s]+:\s*["']?[\w\s]+"'?/)) {
        const lines = text.split('\n')
          .map(line => line.trim())
          .filter(line => line && line.includes(':'));
        
        // Tạo đối tượng từ các dòng có dạng key: value
        const jsonObj: Record<string, any> = {};
        
        for (const line of lines) {
          const colonIndex = line.indexOf(':');
          if (colonIndex > 0) {
            const key = line.substring(0, colonIndex).trim();
            let value = line.substring(colonIndex + 1).trim();
            
            // Làm sạch giá trị nếu có dấu ngoặc kép/đơn
            if ((value.startsWith('"') && value.endsWith('"')) || 
                (value.startsWith("'") && value.endsWith("'"))) {
              value = value.substring(1, value.length - 1);
            }
            
            jsonObj[key] = value;
          }
        }
        
        if (Object.keys(jsonObj).length > 0) {
          return jsonObj as unknown as T;
        }
      }
      
      // Không thể trích xuất JSON
      console.warn('Could not extract JSON from text');
      return null;
    } catch (error) {
      console.error('Error extracting JSON from text:', error);
      return null;
    }
  }
} 