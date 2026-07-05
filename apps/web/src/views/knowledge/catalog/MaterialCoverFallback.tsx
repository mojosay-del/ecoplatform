"use client";

// «Архивная» обложка-фолбэк: детерминированный тёплый градиент из slug + водяная
// иконка материала. Обложки могут отсутствовать или быть недоступны — фолбэк
// должен выглядеть как дизайнерская обложка, а не заглушка.

import type { KnowledgeNode } from "@ecoplatform/shared";
import { knowledgeDisplayIconForNode } from "../knowledge-icons";
import { knowledgeFallbackCoverVariant } from "../knowledge-utils";

export function MaterialCoverFallback({ depth = 1, node }: { depth?: number; node: KnowledgeNode }) {
  const Icon = knowledgeDisplayIconForNode(node, depth);
  const variant = knowledgeFallbackCoverVariant(node.slug);

  return (
    <div aria-hidden="true" className={`knowledge-cover-fallback is-variant-${variant}`}>
      <Icon className="knowledge-cover-fallback-icon" size={58} strokeWidth={1.4} />
    </div>
  );
}
