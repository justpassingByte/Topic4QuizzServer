import { Request, Response } from 'express';
import { ContextAnalyzer } from '../../agents/context-analyzer.agent';
import { ModelConfigService, AgentType } from '../../services/model-config.service';
import { ModelAdapterService } from '../../services/model-adapter.service';
import { CONTEXT_ANALYZER_PROMPT } from '../../agents/prompts/context-analyzer.prompt';

export class ContextAnalysisController {
  private contextAnalyzer: ContextAnalyzer;

  constructor() {
    const modelConfigService = new ModelConfigService();
    const modelAdapterService = new ModelAdapterService();
    this.contextAnalyzer = new ContextAnalyzer(modelConfigService, modelAdapterService);
  }

  analyze = async (req: Request, res: Response): Promise<void> => {
    try {
      const { topic, slugs } = req.body;
      if (!topic || typeof topic !== 'string') {
        res.status(400).json({ error: 'Topic must be a non-empty string' });
        return;
      }
      const result = await this.contextAnalyzer.analyze(topic, slugs);
      res.status(200).json(result);
    } catch (error) {
      console.error('Error analyzing context:', error);
      res.status(500).json({ error: 'Failed to analyze context' });
    }
  };

  classifyTopicSlug = async (req: Request, res: Response): Promise<void> => {
    try {
      const { topic, slugs } = req.body;
      if (!topic || typeof topic !== 'string' || !Array.isArray(slugs) || slugs.length === 0) {
        res.status(400).json({ error: 'Topic and slugs are required' });
        return;
      }
      // Prompt cho AI: chọn slug phù hợp nhất
      const prompt = CONTEXT_ANALYZER_PROMPT
        .replace('<user\'s topic input>', topic)
        .replace('<list of available slugs>', slugs.join(', '));
      const modelConfig = this.contextAnalyzer['modelConfigService'].getModelConfigForAgent(AgentType.CONTEXT_ANALYZER);
      const response = await this.contextAnalyzer['modelAdapter'].generateText({
        ...modelConfig,
        prompt,
        maxTokens: 10,
        temperature: 0.1,
      });
      const slug = response.content.trim();
      res.status(200).json({ slug });
    } catch (error) {
      console.error('Error classifying topic slug:', error);
      res.status(500).json({ error: 'Failed to classify topic slug' });
    }
  };
} 