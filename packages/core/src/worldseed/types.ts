// GALAXIA Worldseed — Phase 11 types.
//
// Option A (validée Phase 0) : Worldseed garde son autonomie sous
// systemd user@1003 et Galaxia l'expose comme capability pour les GMs
// via un pont léger. Worldseed n'a pas d'API réseau aujourd'hui — le
// pont utilise deux fichiers JSONL (requests + responses) que Worldseed
// scrute et auxquels il répond. Tant que l'adapter côté Worldseed n'est
// pas en place, tous les appels tombent sur un timeout gracieux.

export type WorldseedCapability =
  | 'strategy-analysis'       // réflexion stratégique high-level
  | 'data-scoring'            // scoring d'une donnée vidéo (métier propre de Worldseed)
  | 'market-research'         // veille concurrentielle approfondie
  | 'legal-eu-check'          // conformité RGPD/EU AI Act d'une pratique
  | 'free-form';              // requête libre

export interface WorldseedRequest {
  /** client-generated uuid used to correlate response */
  id: string;
  capability: WorldseedCapability;
  /** the actual prompt / question */
  prompt: string;
  /** free-form metadata bag: project name, GM objective id, etc. */
  meta?: Record<string, unknown>;
  /** ms; default 60_000. Adapter throws/returns timeout after this. */
  timeoutMs?: number;
  /** ISO when the request was placed (for Worldseed's own logging). */
  createdAt: string;
}

export interface WorldseedResponse {
  id: string;                     // matches WorldseedRequest.id
  ok: boolean;
  /** Main body — agent-produced text. */
  text?: string;
  /** Agent-reported confidence 0..1, optional. */
  confidence?: number;
  /** Structured sub-scores (data-scoring etc.), optional. */
  scores?: Record<string, number>;
  /** Human-readable error when ok=false. */
  error?: string;
  respondedAt: string;
}

export const WORLDSEED_REQUEST_FILE = '/tmp/worldseed-requests.jsonl';
export const WORLDSEED_RESPONSE_FILE = '/tmp/worldseed-responses.jsonl';
export const WORLDSEED_DEFAULT_TIMEOUT_MS = 60_000;
