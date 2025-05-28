import { Collection } from 'mongodb';
import { DatabaseService } from './database.service';
import { PromptHistory, PromptFeedback } from '../models/quiz.model';

export class PromptService extends DatabaseService {
  private promptCollection!: Collection<PromptHistory>;

  constructor() {
    super();
    this.initialize();
  }

  private async initialize(): Promise<void> {
    await this.ensureConnection();
    const db = this.client.db();
    this.promptCollection = db.collection('prompts');
    
    await this.createIndexes();
  }

  private async createIndexes(): Promise<void> {
    await this.promptCollection.createIndex(
      { topic: 1 },
      { 
        unique: true,
        partialFilterExpression: { topic: { $type: "string" } }
      }
    );
  }

  async savePromptHistory(topic: string, history: PromptHistory): Promise<void> {
    try {
      await this.ensureConnection();
      
      const result = await this.promptCollection.updateOne(
        { topic },
        {
          $set: {
            ...history,
            updatedAt: new Date()
          }
        },
        { upsert: true }
      );
    } catch (error) {
      console.error('Error saving prompt history:', error);
      throw error;
    }
  }

  async getPromptHistory(topic: string): Promise<PromptHistory | null> {
    try {
      await this.ensureConnection();
      
      const history = await this.promptCollection.findOne({ topic });
      
      return history;
    } catch (error) {
      console.error('Error getting prompt history:', error);
      throw error;
    }
  }

  async storePromptFeedback(topic: string, feedbackData: {
    timestamp: Date;
    feedback: {
      score: number;
      issues: string[];
      suggestions: string[];
      successfulElements: string[];
    };
    prompt: string;
  }): Promise<void> {
    try {
      await this.ensureConnection();
      console.log(`=== Evaluation Feedback for Topic: ${topic} ===`);
      console.log('Score:', feedbackData.feedback.score);
      console.log('Issues:', feedbackData.feedback.issues);
      console.log('Successful Elements:', feedbackData.feedback.successfulElements);
      console.log('Suggestions:', feedbackData.feedback.suggestions);
      console.log('Timestamp:', feedbackData.timestamp);
      console.log('=== End of Evaluation Feedback ===\n');

      const history = await this.getPromptHistory(topic);
      const updatedHistory: PromptHistory = history || {
        topic,
        attempts: 0,
        successfulPrompts: [],
        failedPrompts: [],
        averageScore: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const formattedFeedback = {
        strengths: feedbackData.feedback.successfulElements,
        weaknesses: feedbackData.feedback.issues,
        suggestions: feedbackData.feedback.suggestions
      };

      const promptEntry = {
        prompt: feedbackData.prompt,
        score: feedbackData.feedback.score,
        feedback: formattedFeedback,
        timestamp: feedbackData.timestamp
      };

      if (feedbackData.feedback.score >= 0.7) {
        updatedHistory.successfulPrompts.push(promptEntry);
        console.log('✅ Evaluation Result: Successful (Score >= 0.7)');
      } else {
        updatedHistory.failedPrompts.push(promptEntry);
        console.log('❌ Evaluation Result: Failed (Score < 0.7)');
      }

      updatedHistory.attempts += 1;
      const allScores = [
        ...updatedHistory.successfulPrompts.map(p => p.score),
        ...updatedHistory.failedPrompts.map(p => p.score)
      ];
      updatedHistory.averageScore = allScores.reduce((a, b) => a + b, 0) / allScores.length;
      updatedHistory.updatedAt = new Date();

      console.log('📊 Evaluation Statistics:');
      console.log(`Total Attempts: ${updatedHistory.attempts}`);
      console.log(`Average Score: ${updatedHistory.averageScore.toFixed(2)}`);
      console.log(`Success Rate: ${(updatedHistory.successfulPrompts.length / updatedHistory.attempts * 100).toFixed(2)}%`);

      await this.promptCollection.updateOne(
        { topic },
        { $set: updatedHistory },
        { upsert: true }
      );

    } catch (error) {
      console.error('Error storing prompt feedback:', error);
      throw error;
    }
  }

  async getTopPerformingPrompts(topic: string, limit: number = 5): Promise<Array<{
    prompt: any;
    score: number;
    usageCount: number;
  }>> {
    const history = await this.getPromptHistory(topic);
    if (!history) return [];

    const allPrompts = [
      ...history.successfulPrompts,
      ...history.failedPrompts
    ];

    // Group prompts by their structure and calculate average score
    const promptMap = new Map<string, {
      prompt: any;
      totalScore: number;
      count: number;
    }>();

    allPrompts.forEach(p => {
      const key = JSON.stringify(p.prompt);
      const existing = promptMap.get(key) || {
        prompt: p.prompt,
        totalScore: 0,
        count: 0
      };

      existing.totalScore += p.score;
      existing.count += 1;
      promptMap.set(key, existing);
    });

    // Convert to array and sort by average score
    return Array.from(promptMap.values())
      .map(p => ({
        prompt: p.prompt,
        score: p.totalScore / p.count,
        usageCount: p.count
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async analyzePromptPerformance(topic: string): Promise<{
    totalAttempts: number;
    averageScore: number;
    successRate: number;
    commonIssues: Array<{
      issue: string;
      frequency: number;
    }>;
    improvements: Array<{
      type: string;
      impact: number;
    }>;
  }> {
    const history = await this.getPromptHistory(topic);
    if (!history) {
      return {
        totalAttempts: 0,
        averageScore: 0,
        successRate: 0,
        commonIssues: [],
        improvements: []
      };
    }

    const allPrompts = [
      ...history.successfulPrompts,
      ...history.failedPrompts
    ];

    // Calculate metrics
    const totalAttempts = allPrompts.length;
    const averageScore = allPrompts.reduce((acc, p) => acc + p.score, 0) / totalAttempts;
    const successRate = history.successfulPrompts.length / totalAttempts;

    // Analyze common issues
    const issueMap = new Map<string, number>();
    allPrompts.forEach(p => {
      p.feedback.weaknesses.forEach(issue => {
        issueMap.set(issue, (issueMap.get(issue) || 0) + 1);
      });
    });

    const commonIssues = Array.from(issueMap.entries())
      .map(([issue, count]) => ({
        issue,
        frequency: count / totalAttempts
      }))
      .sort((a, b) => b.frequency - a.frequency);

    // Analyze improvements
    const improvements = this.analyzeImprovements(allPrompts);

    return {
      totalAttempts,
      averageScore,
      successRate,
      commonIssues,
      improvements
    };
  }

  private analyzeImprovements(prompts: Array<{
    prompt: any;
    score: number;
    feedback: {
      strengths: string[];
      weaknesses: string[];
      suggestions: string[];
    };
  }>): Array<{
    type: string;
    impact: number;
  }> {
    const improvementMap = new Map<string, {
      totalImpact: number;
      count: number;
    }>();

    // Analyze sequential pairs of prompts to identify improvements
    for (let i = 1; i < prompts.length; i++) {
      const prevPrompt = prompts[i - 1];
      const currPrompt = prompts[i];
      const scoreDiff = currPrompt.score - prevPrompt.score;

      if (scoreDiff > 0) {
        // Identify what changed between prompts
        const changes = this.identifyChanges(prevPrompt.prompt, currPrompt.prompt);
        changes.forEach(change => {
          const existing = improvementMap.get(change) || {
            totalImpact: 0,
            count: 0
          };
          existing.totalImpact += scoreDiff;
          existing.count += 1;
          improvementMap.set(change, existing);
        });
      }
    }

    return Array.from(improvementMap.entries())
      .map(([type, data]) => ({
        type,
        impact: data.totalImpact / data.count
      }))
      .sort((a, b) => b.impact - a.impact);
  }

  private identifyChanges(prevPrompt: any, currPrompt: any): string[] {
    const changes: string[] = [];

    // Compare prompt structures
    if (currPrompt.style !== prevPrompt.style) {
      changes.push('style_change');
    }
    if (currPrompt.includeExamples !== prevPrompt.includeExamples) {
      changes.push('examples_change');
    }
    if (JSON.stringify(currPrompt.focus) !== JSON.stringify(prevPrompt.focus)) {
      changes.push('focus_change');
    }
    if (currPrompt.detail !== prevPrompt.detail) {
      changes.push('detail_level_change');
    }

    return changes;
  }
} 