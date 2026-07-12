import type { OnboardingTourKey } from "@ecoplatform/shared";
import type { TourDefinition } from "../tour-types";
import { accountTour } from "./account";
import { calculatorRetailTour } from "./calculator-retail";
import { documentationTour } from "./documentation";
import { educationTour } from "./education";
import { forumTour } from "./forum";
import { indicesTour } from "./indices";
import { knowledgeBaseTour } from "./knowledge-base";
import { platformTour } from "./platform";

// Реестр всех туров. Record по OnboardingTourKey гарантирует типом, что для
// каждого ключа из shared-контракта существует определение.
export const tourDefinitions: Record<OnboardingTourKey, TourDefinition> = {
  platform: platformTour,
  account: accountTour,
  education: educationTour,
  indices: indicesTour,
  "knowledge-base": knowledgeBaseTour,
  documentation: documentationTour,
  forum: forumTour,
  "calculator-retail": calculatorRetailTour,
};
