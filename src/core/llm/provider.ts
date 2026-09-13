/**
 * CoreSwarm LLM Provider Abstraction
 *
 * Agents depend on this abstraction rather than a hardcoded AI provider.
 */

export interface LLMProvider {
  generate(prompt: string, options?: { temperature?: number; maxTokens?: number }): Promise<string>;
  structuredGenerate<T>(
    prompt: string,
    schemaDescription: string,
    options?: { temperature?: number },
  ): Promise<T>;
}
