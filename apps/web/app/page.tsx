import { LandingView } from "../src/views/landing";

// Заглавная (презентационная) страница — первое, что видит гость.
// Залогиненного пользователя LandingView сам уводит в кабинет (/news).
export default function HomePage() {
  return <LandingView />;
}
