#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { QuantumReasoningEngine } from './quantum-reasoning.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SESSIONS_DIR = path.join(__dirname, '../sessions');

interface ThoughtData {
  thought: string;
  thoughtNumber: number;
  totalThoughts: number;
  isRevision?: boolean;
  revisesThought?: number;
  branchFromThought?: number;
  branchId?: string;
  needsMoreThoughts?: boolean;
  nextThoughtNeeded: boolean;
  timestamp?: string;
  confidence?: number;
  tags?: string[];
}

interface AnalysisSession {
  id: string;
  title: string;
  type: string;
  thoughts: ThoughtData[];
  created: string;
  updated: string;
  status: 'active' | 'completed' | 'paused';
  metadata?: Record<string, any>;
}

interface ProblemAnalysis {
  problem: string;
  context?: string;
  framework: 'swot' | 'root-cause' | 'design-thinking' | 'systems' | 'custom';
  stakeholders?: string[];
  constraints?: string[];
  objectives?: string[];
}

interface SolutionPlan {
  problem: string;
  solutions: Array<{
    title: string;
    description: string;
    pros: string[];
    cons: string[];
    effort: 'low' | 'medium' | 'high';
    impact: 'low' | 'medium' | 'high';
    risk: 'low' | 'medium' | 'high';
  }>;
  recommendation?: string;
  nextSteps?: string[];
}

interface OptionEvaluation {
  options: Array<{
    name: string;
    description: string;
    criteria: Record<string, number>;
  }>;
  criteria: Array<{
    name: string;
    weight: number;
    description?: string;
  }>;
  analysis?: string;
}

class SequentialThinkingServer {
  private thoughtHistory: ThoughtData[] = [];
  private branches: Record<string, ThoughtData[]> = {};
  private sessions: Map<string, AnalysisSession> = new Map();
  private currentSession: string | null = null;
  private quantumEngine = new QuantumReasoningEngine();

  constructor() {
    this.ensureSessionsDirectory();
    this.loadSessions();
  }

  private ensureSessionsDirectory(): void {
    if (!fs.existsSync(SESSIONS_DIR)) {
      fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    }
  }

  private loadSessions(): void {
    try {
      if (fs.existsSync(SESSIONS_DIR)) {
        const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'));
        for (const file of files) {
          const sessionData = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, file), 'utf8'));
          this.sessions.set(sessionData.id, sessionData);
        }
      }
    } catch (error) {
      console.error('Error loading sessions:', error);
    }
  }

  private persistSession(session: AnalysisSession): void {
    try {
      const filePath = path.join(SESSIONS_DIR, `${session.id}.json`);
      fs.writeFileSync(filePath, JSON.stringify(session, null, 2));
      this.sessions.set(session.id, session);
    } catch (error) {
      console.error('Error saving session:', error);
    }
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  private validateThoughtData(input: unknown): ThoughtData {
    const data = input as Record<string, unknown>;

    if (!data.thought || typeof data.thought !== 'string') {
      throw new Error('Invalid thought: must be a string');
    }
    if (!data.thoughtNumber || typeof data.thoughtNumber !== 'number') {
      throw new Error('Invalid thoughtNumber: must be a number');
    }
    if (!data.totalThoughts || typeof data.totalThoughts !== 'number') {
      throw new Error('Invalid totalThoughts: must be a number');
    }
    if (typeof data.nextThoughtNeeded !== 'boolean') {
      throw new Error('Invalid nextThoughtNeeded: must be a boolean');
    }

    return {
      thought: data.thought,
      thoughtNumber: data.thoughtNumber,
      totalThoughts: data.totalThoughts,
      nextThoughtNeeded: data.nextThoughtNeeded,
      isRevision: data.isRevision as boolean | undefined,
      revisesThought: data.revisesThought as number | undefined,
      branchFromThought: data.branchFromThought as number | undefined,
      branchId: data.branchId as string | undefined,
      needsMoreThoughts: data.needsMoreThoughts as boolean | undefined,
      timestamp: new Date().toISOString(),
      confidence: data.confidence as number | undefined,
      tags: data.tags as string[] | undefined,
    };
  }

  private formatThought(thoughtData: ThoughtData): string {
    const { thoughtNumber, totalThoughts, thought, isRevision, revisesThought, branchFromThought, branchId } = thoughtData;

    let prefix = '';
    let context = '';

    if (isRevision) {
      prefix = chalk.yellow('🔄 Revision');
      context = ` (revising thought ${revisesThought})`;
    } else if (branchFromThought) {
      prefix = chalk.green('🌿 Branch');
      context = ` (from thought ${branchFromThought}, ID: ${branchId})`;
    } else {
      prefix = chalk.blue('💭 Thought');
      context = '';
    }

    const header = `${prefix} ${thoughtNumber}/${totalThoughts}${context}`;
    const border = '─'.repeat(Math.max(header.length, thought.length) + 4);

    return `
┌${border}┐
│ ${header} │
├${border}┤
│ ${thought.padEnd(border.length - 2)} │
└${border}┘`;
  }

  public analyzeProblem(input: unknown): { content: Array<{ type: string; text: string }>; isError?: boolean } {
    try {
      const data = input as ProblemAnalysis;
      const sessionId = this.generateId();
      
      const session: AnalysisSession = {
        id: sessionId,
        title: `Problem Analysis: ${data.problem.substring(0, 50)}...`,
        type: 'problem-analysis',
        thoughts: [],
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        status: 'active',
        metadata: { framework: data.framework, problem: data.problem }
      };

      this.currentSession = sessionId;
      this.persistSession(session);

      const framework = this.getAnalysisFramework(data.framework);
      const analysis = this.applyFramework(data, framework);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            sessionId,
            analysis,
            framework: data.framework,
            nextSteps: framework.nextSteps,
            status: 'analysis_complete'
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true
      };
    }
  }

  public planSolution(input: unknown): { content: Array<{ type: string; text: string }>; isError?: boolean } {
    try {
      const data = input as SolutionPlan;
      const sessionId = this.generateId();
      
      const session: AnalysisSession = {
        id: sessionId,
        title: `Solution Planning: ${data.problem.substring(0, 50)}...`,
        type: 'solution-planning',
        thoughts: [],
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        status: 'active',
        metadata: { problem: data.problem, solutions: data.solutions }
      };

      this.persistSession(session);
      const analysis = this.evaluateSolutions(data);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            sessionId,
            problem: data.problem,
            solutions: data.solutions,
            analysis,
            recommendation: this.generateRecommendation(data.solutions),
            status: 'planning_complete'
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true
      };
    }
  }

  public evaluateOptions(input: unknown): { content: Array<{ type: string; text: string }>; isError?: boolean } {
    try {
      const data = input as OptionEvaluation;
      const scores = this.calculateOptionScores(data);
      const ranking = this.rankOptions(scores, data.options);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            evaluation: data,
            scores,
            ranking,
            recommendation: ranking[0],
            analysis: this.generateEvaluationAnalysis(ranking, data.criteria),
            status: 'evaluation_complete'
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true
      };
    }
  }

  public saveSessionData(sessionData: unknown): { content: Array<{ type: string; text: string }>; isError?: boolean } {
    try {
      const data = sessionData as { sessionId?: string; title?: string; notes?: string };
      
      if (data.sessionId && this.sessions.has(data.sessionId)) {
        const session = this.sessions.get(data.sessionId)!;
        session.updated = new Date().toISOString();
        if (data.title) session.title = data.title;
        if (data.notes) session.metadata = { ...session.metadata, notes: data.notes };
        this.persistSession(session);
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            message: 'Session saved successfully',
            sessionId: data.sessionId,
            timestamp: new Date().toISOString()
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true
      };
    }
  }

  public exportAnalysis(input: unknown): { content: Array<{ type: string; text: string }>; isError?: boolean } {
    try {
      const data = input as { sessionId: string; format: 'json' | 'markdown' | 'summary' };
      const session = this.sessions.get(data.sessionId);
      
      if (!session) {
        throw new Error('Session not found');
      }

      let exportContent: string;
      switch (data.format) {
        case 'markdown':
          exportContent = this.generateMarkdownReport(session);
          break;
        case 'summary':
          exportContent = this.generateSummaryReport(session);
          break;
        default:
          exportContent = JSON.stringify(session, null, 2);
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            sessionId: data.sessionId,
            format: data.format,
            content: exportContent,
            exported: new Date().toISOString()
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true
      };
    }
  }

  private getAnalysisFramework(type: string) {
    const frameworks = {
      'swot': {
        name: 'SWOT Analysis',
        steps: ['Strengths', 'Weaknesses', 'Opportunities', 'Threats'],
        nextSteps: ['Leverage strengths', 'Address weaknesses', 'Capitalize on opportunities', 'Mitigate threats']
      },
      'root-cause': {
        name: '5-Why Root Cause Analysis',
        steps: ['Problem definition', 'Why 1', 'Why 2', 'Why 3', 'Why 4', 'Why 5', 'Root cause'],
        nextSteps: ['Address root cause', 'Implement preventive measures', 'Monitor results']
      },
      'design-thinking': {
        name: 'Design Thinking Process',
        steps: ['Empathize', 'Define', 'Ideate', 'Prototype', 'Test'],
        nextSteps: ['User research', 'Problem framing', 'Solution brainstorming', 'Rapid prototyping', 'User testing']
      },
      'systems': {
        name: 'Systems Thinking',
        steps: ['System boundaries', 'Stakeholders', 'Relationships', 'Feedback loops', 'Leverage points'],
        nextSteps: ['Map system dynamics', 'Identify intervention points', 'Design system changes']
      }
    };
    return frameworks[type as keyof typeof frameworks] || frameworks.swot;
  }

  private applyFramework(data: ProblemAnalysis, framework: any): string {
    return `Applied ${framework.name} to analyze: ${data.problem}\n\nFramework steps: ${framework.steps.join(' → ')}\n\nContext: ${data.context || 'Not provided'}\nStakeholders: ${data.stakeholders?.join(', ') || 'Not specified'}\nConstraints: ${data.constraints?.join(', ') || 'None specified'}`;
  }

  private evaluateSolutions(data: SolutionPlan): string {
    const analysis = data.solutions.map(sol => {
      const score = this.calculateSolutionScore(sol);
      return `${sol.title}: Score ${score}/10 (Effort: ${sol.effort}, Impact: ${sol.impact}, Risk: ${sol.risk})`;
    }).join('\n');
    return `Solution Analysis:\n${analysis}`;
  }

  private calculateSolutionScore(solution: any): number {
    const effortMap: Record<string, number> = { low: 3, medium: 2, high: 1 };
    const impactMap: Record<string, number> = { low: 1, medium: 2, high: 3 };
    const riskMap: Record<string, number> = { low: 3, medium: 2, high: 1 };
    
    const effortScore = effortMap[solution.effort] || 2;
    const impactScore = impactMap[solution.impact] || 2;
    const riskScore = riskMap[solution.risk] || 2;
    return Math.round((effortScore + impactScore + riskScore) * 10 / 9);
  }

  private generateRecommendation(solutions: any[]): string {
    const scored = solutions.map(sol => ({ ...sol, score: this.calculateSolutionScore(sol) }));
    const best = scored.sort((a, b) => b.score - a.score)[0];
    return `Recommended: ${best.title} (Score: ${best.score}/10)`;
  }

  private calculateOptionScores(data: OptionEvaluation): Record<string, number> {
    const scores: Record<string, number> = {};
    
    for (const option of data.options) {
      let totalScore = 0;
      let totalWeight = 0;
      
      for (const criterion of data.criteria) {
        const score = option.criteria[criterion.name] || 0;
        totalScore += score * criterion.weight;
        totalWeight += criterion.weight;
      }
      
      scores[option.name] = totalWeight > 0 ? totalScore / totalWeight : 0;
    }
    
    return scores;
  }

  private rankOptions(scores: Record<string, number>, options: any[]): any[] {
    return options
      .map(option => ({ ...option, score: scores[option.name] }))
      .sort((a, b) => b.score - a.score);
  }

  private generateEvaluationAnalysis(ranking: any[], criteria: any[]): string {
    const winner = ranking[0];
    const criteriaAnalysis = criteria.map(c => `${c.name} (weight: ${c.weight})`).join(', ');
    return `Top choice: ${winner.name} with score ${winner.score.toFixed(2)}\nEvaluation criteria: ${criteriaAnalysis}\nKey differentiators: ${winner.description}`;
  }

  private generateMarkdownReport(session: AnalysisSession): string {
    return `# ${session.title}\n\n**Created:** ${session.created}\n**Type:** ${session.type}\n**Status:** ${session.status}\n\n## Analysis\n\n${JSON.stringify(session.metadata, null, 2)}\n\n## Thoughts\n\n${session.thoughts.map(t => `### Thought ${t.thoughtNumber}\n${t.thought}`).join('\n\n')}`;
  }

  private generateSummaryReport(session: AnalysisSession): string {
    return `Summary: ${session.title}\nCompleted: ${session.updated}\nKey insights: ${session.thoughts.length} thoughts captured\nRecommendations: See detailed analysis`;
  }

  // 🔥 L337 QUANTUM REASONING - Superhuman parallel thinking
  public quantumReasoning(input: unknown): { content: Array<{ type: string; text: string }>; isError?: boolean } {
    try {
      const data = input as { problem: string; strategies?: string[] };
      const result = this.quantumEngine.quantumReasoning(data.problem, data.strategies);
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            type: 'quantum_reasoning',
            problem: data.problem,
            parallel_insights: result.parallel_insights.map(t => ({
              strategy: t.strategy,
              performance: t.performance,
              thoughts: t.thoughts.length
            })),
            quantum_fusion: result.quantum_fusion,
            breakthroughs: result.breakthroughs,
            superhuman_score: result.superhuman_score,
            next_optimization: result.next_optimization,
            status: 'quantum_complete'
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true
      };
    }
  }

  // 🧠 AI REASONING COACH - Real-time optimization
  public aiCoach(input: unknown): { content: Array<{ type: string; text: string }>; isError?: boolean } {
    try {
      const data = input as { thoughts: any[] };
      const suggestions = this.quantumEngine.aiCoach(data.thoughts);
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            type: 'ai_coach',
            suggestions: suggestions.slice(0, 3), // Top 3 suggestions
            coaching_score: suggestions.length > 0 ? suggestions[0].confidence : 0,
            status: 'coaching_complete'
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true
      };
    }
  }

  // ⚡ FUSION ANALYSIS - Merge reasoning paths
  public fusionAnalysis(input: unknown): { content: Array<{ type: string; text: string }>; isError?: boolean } {
    try {
      const data = input as { threads: any[] };
      const result = this.quantumEngine.fusionAnalysis(data.threads);
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            type: 'fusion_analysis',
            ...result,
            status: 'fusion_complete'
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true
      };
    }
  }

  // 🔮 OUTCOME PREDICTION - Forecast success
  public predictOutcome(input: unknown): { content: Array<{ type: string; text: string }>; isError?: boolean } {
    try {
      const data = input as { solution: any };
      const prediction = this.quantumEngine.predictOutcome(data.solution);
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            type: 'outcome_prediction',
            solution: data.solution,
            ...prediction,
            status: 'prediction_complete'
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true
      };
    }
  }

  // 🎯 OPTIMIZE THINKING - Auto-adjust strategy
  public optimizeThinking(input: unknown): { content: Array<{ type: string; text: string }>; isError?: boolean } {
    try {
      const data = input as { session: any };
      const optimization = this.quantumEngine.optimizeThinking(data.session);
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            type: 'thinking_optimization',
            ...optimization,
            status: 'optimization_complete'
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true
      };
    }
  }

  public processThought(input: unknown): { content: Array<{ type: string; text: string }>; isError?: boolean } {
    try {
      const validatedInput = this.validateThoughtData(input);

      if (validatedInput.thoughtNumber > validatedInput.totalThoughts) {
        validatedInput.totalThoughts = validatedInput.thoughtNumber;
      }

      this.thoughtHistory.push(validatedInput);

      if (validatedInput.branchFromThought && validatedInput.branchId) {
        if (!this.branches[validatedInput.branchId]) {
          this.branches[validatedInput.branchId] = [];
        }
        this.branches[validatedInput.branchId].push(validatedInput);
      }

      // Add to current session if active
      if (this.currentSession && this.sessions.has(this.currentSession)) {
        const session = this.sessions.get(this.currentSession)!;
        session.thoughts.push(validatedInput);
        session.updated = new Date().toISOString();
        this.persistSession(session);
      }

      const formattedThought = this.formatThought(validatedInput);
      console.error(formattedThought);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            thoughtNumber: validatedInput.thoughtNumber,
            totalThoughts: validatedInput.totalThoughts,
            nextThoughtNeeded: validatedInput.nextThoughtNeeded,
            branches: Object.keys(this.branches),
            thoughtHistoryLength: this.thoughtHistory.length
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
            status: 'failed'
          }, null, 2)
        }],
        isError: true
      };
    }
  }
}

const ANALYZE_PROBLEM_TOOL: Tool = {
  name: "analyze_problem",
  description: "Professional problem analysis using proven frameworks (SWOT, Root Cause, Design Thinking, Systems Thinking). Perfect for business strategy, technical troubleshooting, and strategic planning.",
  inputSchema: {
    type: "object",
    properties: {
      problem: { type: "string", description: "The problem to analyze" },
      context: { type: "string", description: "Additional context or background" },
      framework: { 
        type: "string", 
        enum: ["swot", "root-cause", "design-thinking", "systems", "custom"],
        description: "Analysis framework to use" 
      },
      stakeholders: { type: "array", items: { type: "string" }, description: "Key stakeholders" },
      constraints: { type: "array", items: { type: "string" }, description: "Known constraints" },
      objectives: { type: "array", items: { type: "string" }, description: "Desired outcomes" }
    },
    required: ["problem", "framework"]
  }
};

const PLAN_SOLUTION_TOOL: Tool = {
  name: "plan_solution",
  description: "Strategic solution planning with risk assessment, effort estimation, and impact analysis. Generates actionable recommendations with pros/cons analysis.",
  inputSchema: {
    type: "object",
    properties: {
      problem: { type: "string", description: "The problem being solved" },
      solutions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            pros: { type: "array", items: { type: "string" } },
            cons: { type: "array", items: { type: "string" } },
            effort: { type: "string", enum: ["low", "medium", "high"] },
            impact: { type: "string", enum: ["low", "medium", "high"] },
            risk: { type: "string", enum: ["low", "medium", "high"] }
          },
          required: ["title", "description", "effort", "impact", "risk"]
        }
      },
      nextSteps: { type: "array", items: { type: "string" } }
    },
    required: ["problem", "solutions"]
  }
};

const EVALUATE_OPTIONS_TOOL: Tool = {
  name: "evaluate_options",
  description: "Multi-criteria decision analysis with weighted scoring. Perfect for vendor selection, technology choices, and strategic decisions.",
  inputSchema: {
    type: "object",
    properties: {
      options: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            criteria: { type: "object", additionalProperties: { type: "number" } }
          },
          required: ["name", "criteria"]
        }
      },
      criteria: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            weight: { type: "number" },
            description: { type: "string" }
          },
          required: ["name", "weight"]
        }
      }
    },
    required: ["options", "criteria"]
  }
};

const SAVE_SESSION_TOOL: Tool = {
  name: "save_session",
  description: "Save analysis sessions for later review and continuation. Enables persistent problem-solving workflows.",
  inputSchema: {
    type: "object",
    properties: {
      sessionId: { type: "string", description: "Session ID to save" },
      title: { type: "string", description: "Session title" },
      notes: { type: "string", description: "Additional notes" }
    }
  }
};

const EXPORT_ANALYSIS_TOOL: Tool = {
  name: "export_analysis",
  description: "Export analysis results in multiple formats (JSON, Markdown, Summary). Perfect for reports and documentation.",
  inputSchema: {
    type: "object",
    properties: {
      sessionId: { type: "string", description: "Session to export" },
      format: { type: "string", enum: ["json", "markdown", "summary"], description: "Export format" }
    },
    required: ["sessionId", "format"]
  }
};

const QUANTUM_REASONING_TOOL: Tool = {
  name: "quantum_reasoning",
  description: "🔥 L337 QUANTUM REASONING - Think like 5 geniuses simultaneously with AI-enhanced parallel processing. Breakthrough-level problem solving.",
  inputSchema: {
    type: "object",
    properties: {
      problem: { type: "string", description: "Problem to analyze with quantum reasoning" },
      strategies: { 
        type: "array", 
        items: { type: "string", enum: ["aggressive", "creative", "analytical", "intuitive", "conservative"] },
        description: "Reasoning strategies to run in parallel" 
      }
    },
    required: ["problem"]
  }
};

const AI_COACH_TOOL: Tool = {
  name: "ai_coach",
  description: "🧠 AI REASONING COACH - Real-time optimization suggestions and breakthrough detection. Superhuman thinking enhancement.",
  inputSchema: {
    type: "object",
    properties: {
      thoughts: { 
        type: "array", 
        items: { type: "object" },
        description: "Current thoughts to analyze and optimize" 
      }
    },
    required: ["thoughts"]
  }
};

const FUSION_ANALYSIS_TOOL: Tool = {
  name: "fusion_analysis",
  description: "⚡ FUSION ANALYSIS - Merge multiple reasoning paths into superhuman insights. Quantum-level synthesis.",
  inputSchema: {
    type: "object",
    properties: {
      threads: { 
        type: "array", 
        items: { type: "object" },
        description: "Reasoning threads to fuse together" 
      }
    },
    required: ["threads"]
  }
};

const PREDICT_OUTCOME_TOOL: Tool = {
  name: "predict_outcome",
  description: "🔮 OUTCOME PREDICTION - Forecast solution success before implementation. AI-powered future modeling.",
  inputSchema: {
    type: "object",
    properties: {
      solution: { type: "object", description: "Solution to analyze and predict outcomes for" }
    },
    required: ["solution"]
  }
};

const OPTIMIZE_THINKING_TOOL: Tool = {
  name: "optimize_thinking",
  description: "🎯 OPTIMIZE THINKING - Auto-adjust reasoning strategy for maximum efficiency. Real-time performance enhancement.",
  inputSchema: {
    type: "object",
    properties: {
      session: { type: "object", description: "Current reasoning session to optimize" }
    },
    required: ["session"]
  }
};

const SEQUENTIAL_THINKING_TOOL: Tool = {
  name: "sequentialthinking",
  description: `A detailed tool for dynamic and reflective problem-solving through thoughts.
This tool helps analyze problems through a flexible thinking process that can adapt and evolve.
Each thought can build on, question, or revise previous insights as understanding deepens.

When to use this tool:
- Breaking down complex problems into steps
- Planning and design with room for revision
- Analysis that might need course correction
- Problems where the full scope might not be clear initially
- Problems that require a multi-step solution
- Tasks that need to maintain context over multiple steps
- Situations where irrelevant information needs to be filtered out

Key features:
- You can adjust total_thoughts up or down as you progress
- You can question or revise previous thoughts
- You can add more thoughts even after reaching what seemed like the end
- You can express uncertainty and explore alternative approaches
- Not every thought needs to build linearly - you can branch or backtrack
- Generates a solution hypothesis
- Verifies the hypothesis based on the Chain of Thought steps
- Repeats the process until satisfied
- Provides a correct answer

Parameters explained:
- thought: Your current thinking step, which can include:
* Regular analytical steps
* Revisions of previous thoughts
* Questions about previous decisions
* Realizations about needing more analysis
* Changes in approach
* Hypothesis generation
* Hypothesis verification
- next_thought_needed: True if you need more thinking, even if at what seemed like the end
- thought_number: Current number in sequence (can go beyond initial total if needed)
- total_thoughts: Current estimate of thoughts needed (can be adjusted up/down)
- is_revision: A boolean indicating if this thought revises previous thinking
- revises_thought: If is_revision is true, which thought number is being reconsidered
- branch_from_thought: If branching, which thought number is the branching point
- branch_id: Identifier for the current branch (if any)
- needs_more_thoughts: If reaching end but realizing more thoughts needed

You should:
1. Start with an initial estimate of needed thoughts, but be ready to adjust
2. Feel free to question or revise previous thoughts
3. Don't hesitate to add more thoughts if needed, even at the "end"
4. Express uncertainty when present
5. Mark thoughts that revise previous thinking or branch into new paths
6. Ignore information that is irrelevant to the current step
7. Generate a solution hypothesis when appropriate
8. Verify the hypothesis based on the Chain of Thought steps
9. Repeat the process until satisfied with the solution
10. Provide a single, ideally correct answer as the final output
11. Only set next_thought_needed to false when truly done and a satisfactory answer is reached`,
  inputSchema: {
    type: "object",
    properties: {
      thought: {
        type: "string",
        description: "Your current thinking step"
      },
      nextThoughtNeeded: {
        type: "boolean",
        description: "Whether another thought step is needed"
      },
      thoughtNumber: {
        type: "integer",
        description: "Current thought number",
        minimum: 1
      },
      totalThoughts: {
        type: "integer",
        description: "Estimated total thoughts needed",
        minimum: 1
      },
      isRevision: {
        type: "boolean",
        description: "Whether this revises previous thinking"
      },
      revisesThought: {
        type: "integer",
        description: "Which thought is being reconsidered",
        minimum: 1
      },
      branchFromThought: {
        type: "integer",
        description: "Branching point thought number",
        minimum: 1
      },
      branchId: {
        type: "string",
        description: "Branch identifier"
      },
      needsMoreThoughts: {
        type: "boolean",
        description: "If more thoughts are needed"
      }
    },
    required: ["thought", "nextThoughtNeeded", "thoughtNumber", "totalThoughts"]
  }
};

const server = new Server(
  {
    name: "sequential-thinking-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const thinkingServer = new SequentialThinkingServer();

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    QUANTUM_REASONING_TOOL,
    AI_COACH_TOOL,
    FUSION_ANALYSIS_TOOL,
    PREDICT_OUTCOME_TOOL,
    OPTIMIZE_THINKING_TOOL,
    SEQUENTIAL_THINKING_TOOL
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (request.params.name) {
    case "quantum_reasoning":
      return thinkingServer.quantumReasoning(request.params.arguments);
    case "ai_coach":
      return thinkingServer.aiCoach(request.params.arguments);
    case "fusion_analysis":
      return thinkingServer.fusionAnalysis(request.params.arguments);
    case "predict_outcome":
      return thinkingServer.predictOutcome(request.params.arguments);
    case "optimize_thinking":
      return thinkingServer.optimizeThinking(request.params.arguments);
    case "sequentialthinking":
      return thinkingServer.processThought(request.params.arguments);
    default:
      return {
        content: [{
          type: "text",
          text: `Unknown tool: ${request.params.name}`
        }],
        isError: true
      };
  }
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Sequential Thinking MCP Server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});