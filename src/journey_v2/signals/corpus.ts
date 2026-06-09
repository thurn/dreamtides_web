import type { MerchantCorpus, MerchantCluster } from "../../data/merchant-corpus";

/**
 * Returns the corpus quality score [0,1] for the given card UUID.
 * Returns 0 for unknown UUIDs so callers can always do arithmetic safely.
 */
export function qualityOf(corpus: MerchantCorpus, uuid: string): number {
  return corpus.cards.get(uuid)?.quality ?? 0;
}

/**
 * Returns the corpus multiplicity score [0,1] for the given card UUID.
 * Returns 0 for unknown UUIDs.
 */
export function multiplicityOf(corpus: MerchantCorpus, uuid: string): number {
  return corpus.cards.get(uuid)?.multiplicity ?? 0;
}

/**
 * Returns the cluster id the card belongs to, or `undefined` if the card is
 * unclustered or unknown.
 */
export function clusterOf(corpus: MerchantCorpus, uuid: string): number | undefined {
  return corpus.cards.get(uuid)?.cluster;
}

/**
 * Returns all retained clusters from the corpus.
 */
export function clustersOf(corpus: MerchantCorpus): readonly MerchantCluster[] {
  return corpus.clusters;
}
