import { Module } from '@nestjs/common';

/**
 * DealIntelligence - AI deal analysis of listings through the AIProvider interface (@rein-drop/ai-core).
 *
 * Owns: DealAnalysis
 * Mock/deterministic provider locally; Microsoft Foundry later. Never call an AI SDK directly.
 *
 * Scaffold only: no controllers or services yet. Other modules must use this
 * module's exported providers rather than querying its tables directly.
 */
@Module({})
export class DealIntelligenceModule {}
