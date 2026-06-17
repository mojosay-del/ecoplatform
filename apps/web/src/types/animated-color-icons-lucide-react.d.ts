declare module "@animated-color-icons/lucide-react/*" {
  import type { ForwardRefExoticComponent, RefAttributes, SVGProps } from "react";

  export type AnimatedColorLucideIconProps = SVGProps<SVGSVGElement> & {
    color?: string;
    label?: string;
    primaryColor?: string;
    secondaryColor?: string;
    size?: number | string;
    strokeWidth?: number | string;
  };

  const Icon: ForwardRefExoticComponent<AnimatedColorLucideIconProps & RefAttributes<SVGSVGElement>>;

  export default Icon;
}
