import { createPageMetadata } from "../../../src/lib/seo";
import { RetailCalculatorView } from "../../../src/views/calculators";

export const metadata = createPageMetadata({
  title: "Калькулятор рейса",
  description: "Расчёт экономики рейса для сбора и перевозки вторсырья.",
  path: "/calculators/retail",
});

export default function RetailCalculatorPage() {
  return <RetailCalculatorView />;
}
