import { Request, Response } from 'express';
import { ContextAnalyzer } from '../../agents/context-analyzer.agent';
import { ModelConfigService } from '../../services/model-config.service';
import { ModelAdapterService } from '../../services/model-adapter.service';

export class ContextAnalysisController {
  private contextAnalyzer: ContextAnalyzer;

  constructor() {
    const modelConfigService = new ModelConfigService();
    const modelAdapterService = new ModelAdapterService();
    this.contextAnalyzer = new ContextAnalyzer(modelConfigService, modelAdapterService);
  }

  analyze = async (req: Request, res: Response): Promise<void> => {
    try {
      const { topic } = req.body;
      if (!topic || typeof topic !== 'string') {
        res.status(400).json({ error: 'Topic must be a non-empty string' });
        return;
      }
      const result = await this.contextAnalyzer.analyze(topic);
      res.status(200).json(result);
    } catch (error) {
      console.error('Error analyzing context:', error);
      res.status(500).json({ error: 'Failed to analyze context' });
    }
  };
} 